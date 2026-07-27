export class ToolScheduler {
    registry;
    permissionManager;
    executor;
    constructor(registry, permissionManager, executor) {
        this.registry = registry;
        this.permissionManager = permissionManager;
        this.executor = executor;
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
                out.push({ ...call });
                continue;
            }
            const has = await this.permissionManager.check(tool, call.input);
            if (has || (await this.permissionManager.requestAuthorization(tool, call.input))) {
                out.push(call);
            }
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
        if (!tool)
            return { success: false, error: `Tool not found: ${call.name}`, toolUseId: call.id };
        const validation = tool.validate(call.input);
        if (!validation.valid) {
            return { success: false, error: `Invalid: ${validation.errors.join(", ")}`, toolUseId: call.id };
        }
        try {
            const output = await this.executor.execute(tool, call.input, {
                timeout: tool.timeout ?? 600000,
            });
            return { success: true, output, toolUseId: call.id };
        }
        catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e), toolUseId: call.id };
        }
    }
    merge(original, results) {
        const map = new Map(results.map((r) => [r.toolUseId, r]));
        return original.map((c) => map.get(c.id) ?? { success: false, error: "未找到结果", toolUseId: c.id });
    }
    onProgress;
}
//# sourceMappingURL=toolScheduler.js.map