export class SummaryStrategy {
    name = "summary";
    async compact(messages, options) {
        const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
        const nonSys = messages.filter((m) => m.role !== "system");
        const recent = nonSys.slice(-options.preserveRecentCount);
        const old = nonSys.slice(0, -options.preserveRecentCount);
        if (old.length === 0)
            return [...system, ...recent];
        const summary = await this.generateSummary(old);
        return [...system, { role: "system", content: `[会话摘要]\n${summary}` }, ...recent];
    }
    async generateSummary(messages) {
        return messages
            .map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
            .join("\n");
    }
}
export class TruncateStrategy {
    name = "truncate";
    async compact(messages, options) {
        const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
        const nonSys = messages.filter((m) => m.role !== "system");
        return [...system, ...nonSys.slice(-options.preserveRecentCount)];
    }
}
export class SelectiveStrategy {
    name = "selective";
    async compact(messages, options) {
        const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
        const nonSys = messages.filter((m) => m.role !== "system");
        const recent = nonSys.slice(-options.preserveRecentCount);
        const old = nonSys.slice(0, -options.preserveRecentCount);
        const important = old.filter((msg) => {
            if (options.preserveToolResults && msg.role === "tool")
                return true;
            const c = typeof msg.content === "string" ? msg.content : "";
            if (c.includes("```"))
                return true;
            if (/重要|关键|决定|决策|结论|important|key|decision/.test(c))
                return true;
            return false;
        });
        return [...system, ...important, ...recent];
    }
}
export class AutoCompactor {
    strategies = new Map();
    defaultStrategy = "summary";
    constructor() {
        this.registerStrategy(new SummaryStrategy());
        this.registerStrategy(new TruncateStrategy());
        this.registerStrategy(new SelectiveStrategy());
    }
    registerStrategy(s) {
        this.strategies.set(s.name, s);
    }
    setDefaultStrategy(name) {
        if (!this.strategies.has(name))
            throw new Error(`Strategy not found: ${name}`);
        this.defaultStrategy = name;
    }
    async compact(messages, options = {}) {
        const strategy = this.strategies.get(this.defaultStrategy);
        if (!strategy)
            return messages;
        return strategy.compact(messages, {
            preserveRecentCount: options.preserveRecentCount ?? 10,
            preserveSystemMessages: options.preserveSystemMessages ?? true,
            preserveToolResults: options.preserveToolResults ?? true,
        });
    }
    /** 供 recovery.ts 调用的轻量占位的压缩（§9.4） */
    async compactPlaceholder() {
        // 由外部持有 conversation 引用时替换真实消息
    }
}
//# sourceMappingURL=autoCompactor.js.map