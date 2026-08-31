/**
 * engine/index.ts — 核心引擎装配入口
 *
 * 聚合：状态机 + 消息循环 + 消息规范化 + 请求构建 + 响应处理 +
 * 工具调度 + Token 预算 + 自动压缩 + 错误处理/恢复 + 流式 + 子代理。
 */
import { QueryStateMachine } from "./stateMachine.ts";
import { MessageLoop } from "./messageLoop.ts";
import { MessageNormalizer } from "./messageNormalizer.ts";
import { RequestBuilder } from "./requestBuilder.ts";
import { ResponseHandler } from "./responseHandler.ts";
import { ToolScheduler } from "./toolScheduler.ts";
import { TokenBudgetManager } from "./tokenBudgetManager.ts";
import { AutoCompactor } from "./autoCompactor.ts";
import { ErrorClassifier } from "./errors/classifier.ts";
import { RetryHandler } from "./errors/retryHandler.ts";
import { ErrorRecovery } from "./errors/recovery.ts";
import { SubAgentManager } from "./subagent/subAgentManager.ts";
import { createSandboxedExecutor, getDefaultSandboxPolicy, createDefaultSandboxConfig } from "./sandbox/index.ts";
// 导入确定性编辑锚点（吸收自 oh-my-pi Hash-anchored edits）
import { verifyEditAnchor } from '../utils/fileHash.js';
// 导入 ToolRegistry 桥接器（吸收 OpenManus 精华：统一工具注册/发现/执行）
import { buildToolRegistry } from '../tools/ToolCollectionTool/buildRegistry.js';
// 导入工具注册表（复用 src/tools.ts 中 buildTool() 构建的完整工具实例）
import { getAllBaseTools } from "../tools.js";
// 导入新功能模块
import { getEndConversationManager } from "../features/endConversation.js";
import { getSubAgentManager } from "../features/featureFlags.js";
import { getAutoModeManager } from "../features/additionalFeatures.js";
export class QueryEngine {
    constructor(opts) {
        this.stateMachine = new QueryStateMachine();
        this.tokenBudget = new TokenBudgetManager();
        this.autoCompactor = new AutoCompactor();
        this.normalizer = new MessageNormalizer();
        this.requestBuilder = new RequestBuilder();
        this.responseHandler = new ResponseHandler();
        this.retryHandler = new RetryHandler();
        this.subAgentManager = new SubAgentManager();
        this.abortController = new AbortController();
        this._toolDefinitions = [];
        this.pendingRequests = new Map();
        this._conversation = {
            messages: [],
            addToolResults: (results) => {
                for (const r of results) {
                    const resultRecord = r;
                    const toolUseId = typeof resultRecord.toolUseId === 'string' ? resultRecord.toolUseId : null;
                    const contentVal = typeof resultRecord.output === 'string' ? resultRecord.output : JSON.stringify(resultRecord.output ?? resultRecord.error ?? '');
                    this._conversation.messages.push({
                        role: "tool",
                        ...(toolUseId ? { toolUseId } : {}),
                        content: contentVal,
                    });
                }
            },
        };
        const permissionManager = {
            async check() {
                return true;
            },
            async requestAuthorization() {
                return true;
            },
            async requestPermission(tool, input) {
                // 检查是否已有 auto-approve 规则
                if (opts.onEvent) {
                    const requestId = `${tool.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const request = {
                        id: requestId,
                        toolName: tool.name,
                        input,
                        description: tool.description,
                    };
                    // 发射权限请求事件，等待 UI 响应
                    opts.onEvent({
                        type: 'permission_request',
                        id: requestId,
                        toolName: tool.name,
                        input,
                        description: tool.description,
                    });
                    // 返回一个 pending promise，由 grantPermission/denyPermission 解析
                    return new Promise((resolve) => {
                        this.pendingRequests.set(requestId, { resolve });
                    });
                }
                // 无事件回调时默认拒绝
                return false;
            },
        };
        const rawExecutor = {
            async execute(tool, input, _o) {
                const r = await tool.execute(input);
                if (typeof r.content === "string")
                    return r.content;
                if (Array.isArray(r.content)) {
                    return r.content
                        .filter((p) => p.type === "text" && p.text)
                        .map((p) => p.text)
                        .join("\n") || "";
                }
                return String(r.content ?? "");
            },
        };
        // Self-healing 执行器包装链（吸收自 Browser-Use self-healing harness）
        const selfHealingExecutor = {
            async execute(tool, input, _o) {
                const MAX_RETRIES = 2;
                const RETRYABLE = /stale|concurrent|modified|changed|race|enoent/i;
                let lastError = '';
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        return await rawExecutor.execute(tool, input, _o);
                    }
                    catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        lastError = msg;
                        if (attempt < MAX_RETRIES && RETRYABLE.test(msg)) {
                            const fp = input?.file_path;
                            if (fp) {
                                const os = input?.old_string;
                                if (os && !verifyEditAnchor(fp, os)) {
                                    throw new Error(`编辑锚点失效（文件已被外部修改）：${fp}`);
                                }
                            }
                            continue;
                        }
                        throw e;
                    }
                }
                throw new Error(`Self-healing 重试耗尽（${MAX_RETRIES} 次）：${lastError}`);
            },
        };
        // 沙箱执行器包装链：createSandboxedExecutor 包装原始 executor（吸收自 open-interpreter sandboxing）
        const sandboxConfig = opts.sandbox
            ? {
                enabled: opts.sandbox.enabled ?? true,
                policy: opts.sandbox.policy ?? getDefaultSandboxPolicy(),
                onDeny: opts.sandbox.onDeny ?? 'warn',
            }
            : createDefaultSandboxConfig(false);
        // 链式包装：rawExecutor → self-healing → sandbox
        const sandboxExecutor = createSandboxedExecutor(selfHealingExecutor, sandboxConfig);
        const executor = sandboxExecutor;
        const registry = opts.tools ?? this.buildRegistry();
        // 先创建 ErrorRecovery，以便注入到 ToolScheduler 的熔断器集成
        this.recovery = new ErrorRecovery(this.stateMachine, this.retryHandler, this.autoCompactor, opts.circuitBreaker);
        const toolScheduler = new ToolScheduler(registry, permissionManager, executor, this.recovery);
        // 初始化统一工具注册表（吸收 OpenManus 精华）
        this.toolRegistry = buildToolRegistry(registry);
        this.conversation = this._conversation;
        this._preAnalysis = opts.preAnalysis;
        const autoFixLoopConfig = opts.autoFixLoop;
        // 初始化新功能管理器
        const endConvManager = getEndConversationManager();
        const subAgentMgr = getSubAgentManager();
        const autoModeMgr = getAutoModeManager();
        // 将内部工具注册表转换为请求构建器所需的 ToolDefinition 格式
        this._toolDefinitions = Array.from(registry.values()).map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
        }));
        const acceptanceGate = opts.acceptanceCriteria
            ? new (await import("./stateMachine.ts")).AcceptanceGate()
            : null;
        if (acceptanceGate && opts.acceptanceCriteria) {
            acceptanceGate.addMany(opts.acceptanceCriteria);
        }
        const deps = {
            stateMachine: this.stateMachine,
            tokenBudget: this.tokenBudget,
            requestBuilder: this.requestBuilder,
            responseHandler: this.responseHandler,
            toolScheduler,
            apiClient: {
                async sendMessage() {
                    return [Promise.resolve({ type: "message_stop" })];
                },
            },
            conversation: this._conversation,
            systemPrompt: opts.systemPrompt ?? "你是 Doge Code，一个专业的 AI 编程助手。请始终使用中文回复用户，除非用户明确要求使用其他语言。所有工具执行结果、代码注释和解释都应为中文。",
            model: opts.model,
            maxOutputTokens: opts.maxOutputTokens ?? 40000,
            toolDefinitions: this._toolDefinitions,
            provider: opts.provider ?? "openai",
            onEvent: opts.onEvent,
            autoCompactor: this.autoCompactor,
            preAnalysis: this._preAnalysis,
            autoFixLoop: {
                enabled: autoFixLoopConfig?.enabled ?? true,
                maxIterations: autoFixLoopConfig?.maxIterations ?? 3,
                onEvent: (event) => {
                    engineLog('AUTOFIX', event.type);
                },
            },
            gitContext: opts.gitContext,
            imageBudget: opts.imageBudget,
            harness: opts.harness,
            acceptanceGate,
            hookManager: opts.hookManager,
        };
        this.messageLoop = new MessageLoop(deps);
        // 注入 API client 到 AutoCompactor，使 SummaryStrategy 能通过 LLM 生成真实摘要
        this.autoCompactor.setApiClient({
            sendMessage: deps.apiClient.sendMessage.bind(deps.apiClient),
        });
    }
    /**
     * 构建最小化的 ToolUseContext，用于工具内部的 validateInput/call 调用。
     * 不依赖 UI 层，所有权限检查由引擎外部的 PermissionManager 处理。
     */
    static buildMinimalContext() {
        const abortController = new AbortController();
        return {
            options: {
                commands: [],
                debug: false,
                mainLoopModel: '',
                tools: [],
                verbose: false,
                thinkingConfig: { type: 'none' },
                mcpClients: [],
                mcpResources: {},
                isNonInteractiveSession: true,
                agentDefinitions: [],
            },
            abortController,
            getAppState: () => ({ toolPermissionContext: {} }),
            setAppState: () => { },
            setInProgressToolUseIDs: () => { },
            setResponseLength: () => 0,
            updateFileHistoryState: (f) => f,
            updateAttributionState: (f) => f,
            readFileState: { get: () => null, set: () => { }, has: () => false },
        };
    }
    buildRegistry() {
        const map = new Map();
        const baseTools = getAllBaseTools();
        // 复用最小上下文和始终允许的 canUseTool
        const ctx = QueryEngine.buildMinimalContext();
        const canUseTool = (async (_tool, _input, _ctx, _msg, _id) => ({ behavior: 'allow', updatedInput: {} }));
        const parentMessage = { role: 'user', content: '' };
        for (const tool of baseTools) {
            if (!tool || !tool.name)
                continue;
            const info = tool.info();
            map.set(tool.name, {
                name: info.name,
                description: info.description,
                parameters: info.parameters,
                validate() {
                    return { valid: true };
                },
                async execute(params) {
                    try {
                        // 调用真实工具的 call() 方法获取完整执行结果
                        const result = await tool.call(params, ctx, canUseTool, parentMessage);
                        // 解包 { data: ... } 包装，提取输出内容
                        const raw = result?.data ?? result;
                        if (typeof raw === 'string')
                            return { content: raw };
                        if (typeof raw === 'object' && raw !== null) {
                            const obj = raw;
                            const content = obj.stdout ?? obj.content ?? JSON.stringify(raw);
                            return { content: String(content) };
                        }
                        return { content: String(raw ?? '') };
                    }
                    catch (e) {
                        const message = e instanceof Error ? e.message : '未知错误';
                        return { content: `错误: ${message}` };
                    }
                },
            });
        }
        return map;
    }
    async query(userMessage) {
        // EndConversation 安全检查
        const endConvManager = getEndConversationManager();
        const check = endConvManager.checkInput(userMessage);
        if (check.shouldEnd) {
            return {
                type: 'ended',
                output: endConvManager.getEndMessage(),
                reason: check.reason,
            };
        }
        if (check.shouldWarn) {
            // 将警告注入对话
            this._conversation.messages.push({
                role: 'assistant',
                content: endConvManager.getWarningMessage(),
            });
        }
        return this.messageLoop.run(userMessage);
    }
    /**
     * 在循环结束后继续发送消息并重启迭代。
     * 如果状态机处于终止状态（done/crashed/aborted），先 reset 再继续。
     * 供��部在对话意外终止时主动续命使用。
     */
    async sendMessage(userMessage) {
        if (this.stateMachine.isTerminal()) {
            this.stateMachine.reset();
            this._conversation.messages = [];
        }
        return this.messageLoop.run(userMessage);
    }
    async abort() {
        this.abortController.abort();
        await this.stateMachine.transition("aborted_by_user");
    }
    /** UI 层调用：授予权限，解析 pending permission request promise */
    grantPermission(requestId) {
        const entry = this.pendingRequests.get(requestId);
        if (entry) {
            entry.resolve(true);
            this.pendingRequests.delete(requestId);
        }
    }
    /** UI 层调用：拒绝权限，解析 pending permission request promise */
    denyPermission(requestId) {
        const entry = this.pendingRequests.get(requestId);
        if (entry) {
            entry.resolve(false);
            this.pendingRequests.delete(requestId);
        }
    }
    getState() {
        return this.stateMachine.state;
    }
    /** Human-in-the-loop：暂停引擎执行，等待用户干预后恢复（吸收自 CrewAI Human-in-the-loop） */
    pause(reason) {
        this.messageLoop.pause(reason);
    }
    /** Human-in-the-loop：从暂停恢复执行 */
    resume(input) {
        this.messageLoop.resume(input);
    }
    /** 检查引擎是否处于暂停状态 */
    isPaused() {
        return this.messageLoop.isPaused();
    }
    /** 检查指定工具的熔断器是否打开（吸收自 error-coordinator 熔断器模式） */
    isCircuitOpen(toolName) {
        return this.recovery.isCircuitOpen(toolName);
    }
    /** 获取指定工具的熔断器状态 */
    getCircuitState(toolName) {
        return this.recovery.getCircuitState(toolName);
    }
    /** 重置指定工具的熔断器 */
    resetCircuit(toolName) {
        this.recovery.resetCircuit(toolName);
    }
    /** 重置所有熔断器 */
    resetAllCircuits() {
        this.recovery.resetAllCircuits();
    }
    getTools() {
        return this._toolDefinitions;
    }
    /**
     * 注入预测性 AI 助手的静态分析结果
     * 由主进程在发送消息前设置，注入到 system prompt
     */
    setPreAnalysis(preAnalysis) {
        this._preAnalysis = preAnalysis;
    }
    /**
     * 注入 API 客户端（用于自定义 HTTP 请求实现）
     * 允许外部提供自定义的 API 实现，避免直接访问内部 messageLoop
     */
    setApiClient(apiClient) {
        // 通过内部引用更新 apiClient（MessageLoop 依赖注入模式）
        const loop = this.messageLoop;
        if (loop) {
            loop.deps.apiClient = apiClient;
        }
    }
}
export { ErrorClassifier };
export * from "./stateMachine.ts";
export * from "./messageNormalizer.ts";
export * from "./requestBuilder.ts";
export * from "./responseHandler.ts";
export * from "./toolScheduler.ts";
export * from "./harnessAdapter.ts";
export * from "./sandbox/index.ts";
export * from "./tokenBudgetManager.ts";
export * from "./autoCompactor.ts";
export * from "./errors/index.ts";
export * from "./errors/classifier.ts";
export * from "./errors/retryHandler.ts";
export * from "./errors/recovery.ts";
export * from "./repoMap.ts";
export * from "./coders/index.ts";
