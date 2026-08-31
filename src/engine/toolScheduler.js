/** 预处理工具参数：stringified JSON 解包 + null 值剥离（吸收自 n8n-mcp CallTool 管道） */
export function normalizeToolInput(input) {
    if (!input || typeof input !== 'object')
        return {};
    let raw = input;
    if (typeof raw.params === 'string') {
        try {
            raw = { ...raw, ...JSON.parse(raw.params) };
        }
        catch { /* not json */ }
    }
    const str = JSON.stringify(raw);
    try {
        return JSON.parse(str);
    }
    catch {
        return raw;
    }
}
export class ToolScheduler {
    constructor(registry, permissionManager, executor, errorRecovery) {
        this.registry = registry;
        this.permissionManager = permissionManager;
        this.executor = executor;
        this.errorRecovery = errorRecovery;
    }
    async execute(toolCalls) {
        const authorized = await this.checkPermissions(toolCalls);
        const { parallel, serial } = this.categorize(authorized);
        const parallelResults = await this.executeParallel(parallel);
        const serialResults = await this.executeSerial(serial);
        return this.merge(toolCalls, [...parallelResults, ...serialResults]);
    }
    async checkPermissions(calls) {
        const out = [];
        for (const call of calls) {
            const tool = this.registry.get(call.name);
            if (!tool) {
                out.push(call);
                continue;
            }
            const has = await this.permissionManager.check(tool, call.input);
            if (has) {
                out.push(call);
                continue;
            }
            // 尝试自动授权（工具自身规则）
            const autoAuth = await this.permissionManager.requestAuthorization(tool, call.input);
            if (autoAuth) {
                out.push(call);
                continue;
            }
            // 异步权限请求：通过事件通道等待 UI 响应（对齐 OpenCode Request()）
            if (this.permissionManager.requestPermission) {
                const granted = await this.permissionManager.requestPermission(tool, call.input);
                if (granted) {
                    out.push(call);
                    continue;
                }
            }
            // 三选项权限请求：Allow once / Allow always / Reject（吸收自 Cline）
            if (this.permissionManager.requestPermissionWithOptions) {
                const { granted, remember } = await this.permissionManager.requestPermissionWithOptions(tool, call.input);
                if (granted && remember) {
                    // remember=true: 持久化授权，下次 check() 应返回 true（由外部实现）
                }
                if (granted) {
                    out.push(call);
                    continue;
                }
            }
            // 拒绝：不加入 out，merge 会标记为失败
        }
        return out;
    }
    categorize(calls) {
        const parallel = [];
        const serial = [];
        for (const call of calls) {
            const tool = this.registry.get(call.name);
            if (tool && tool.canRunInParallel)
                parallel.push(call);
            else
                serial.push(call);
        }
        return { parallel, serial };
    }
    async executeParallel(calls) {
        if (calls.length === 0)
            return [];
        const results = await Promise.allSettled(calls.map((c) => this.executeSingle(c)));
        return results.map((r, i) => r.status === "fulfilled"
            ? r.value
            : { success: false, error: r.reason?.message ?? "Unknown error", toolUseId: calls[i].id });
    }
    async executeSerial(calls) {
        const out = [];
        for (const call of calls)
            out.push(await this.executeSingle(call));
        return out;
    }
    async executeSingle(call) {
        const tool = this.registry.get(call.name);
        if (!tool) {
            console.warn(`[TOOL] Tool not found: ${call.name}. Available tools: ${Array.from(this.registry.keys()).join(', ')}`);
            return { success: false, error: `工具未找到: ${call.name}`, toolUseId: call.id };
        }
        // 熔断器检查（吸收自 error-coordinator）：熔断器打开时跳过工具执行
        if (this.errorRecovery?.isCircuitOpen(call.name)) {
            return { success: false, error: `工具 ${call.name} 的熔断器已打开，跳过执行`, toolUseId: call.id };
        }
        // 参数预处理管道（吸收自 n8n-mcp CallTool）
        const normalizedInput = normalizeToolInput(call.input);
        const validation = tool.validate(normalizedInput);
        if (!validation.valid) {
            return { success: false, error: `无效的: ${validation.errors.join(", ")}`, toolUseId: call.id };
        }
        try {
            const output = await this.executor.execute(tool, normalizedInput, {
                timeout: tool.timeout ?? 600000,
            });
            // 记录成功到熔断器
            this.errorRecovery?.recordToolSuccess(call.name);
            return { success: true, output, toolUseId: call.id };
        }
        catch (e) {
            // 记录失败到熔断器
            this.errorRecovery?.recordToolFailure(call.name);
            return { success: false, error: e instanceof Error ? e.message : String(e), toolUseId: call.id };
        }
    }
    merge(original, results) {
        const map = new Map(results.map((r) => [r.toolUseId, r]));
        return original.map((c) => map.get(c.id) ?? { success: false, error: "未找到结果", toolUseId: c.id });
    }
}
/**
 * 异步工具执行器：处理 create → poll → complete 两阶段模式（吸收自 agentscope）。
 * 当工具实现 AsyncTool 接口时，使用异步流程；否则回退到同步执行。
 */
export class AsyncToolExecutor {
    constructor() {
        this.defaultPollInterval = 2000;
        this.defaultMaxPolls = 60;
    }
    async executeAsync(tool, input, opts) {
        const asyncTool = tool;
        // Phase 1: 创建异步操作
        let operationId;
        if (asyncTool.create) {
            const createResult = await asyncTool.create(input);
            operationId = createResult.operationId;
        }
        else {
            // 不支持异步的工具回退到同步执行
            return { content: await this.executeSync(tool, input, opts) };
        }
        // Phase 2: 轮询直到完成
        const pollFn = asyncTool.poll ?? (async () => ({ status: 'completed', output: '' }));
        const maxPolls = opts.timeout > 0 ? Math.min(this.defaultMaxPolls, Math.floor(opts.timeout / this.defaultPollInterval)) : this.defaultMaxPolls;
        let polls = 0;
        while (polls < maxPolls) {
            const result = await pollFn(operationId);
            if (result.status === 'completed' || result.status === 'failed') {
                const output = result.output ?? (result.status === 'failed' ? `操作失败: ${operationId}` : '');
                return {
                    content: output,
                    metadata: { operationId, status: result.status, polls },
                };
            }
            opts.onProgress?.(result.progress ?? { operationId, status: result.status });
            await new Promise(r => setTimeout(r, this.defaultPollInterval));
            polls++;
        }
        // 超时
        return { content: `异步操作超时: ${operationId}`, metadata: { operationId, status: 'timeout' } };
    }
    async executeSync(tool, input, opts) {
        const executor = tool.execute;
        const result = await executor(input, { timeout: opts.timeout });
        if (typeof result.content === 'string')
            return result.content;
        if (Array.isArray(result.content)) {
            return result.content
                .filter((p) => p.type === 'text' && p.text)
                .map((p) => p.text)
                .join('\n') || '';
        }
        return String(result.content ?? '');
    }
}
