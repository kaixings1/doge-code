const DEFAULT_CONFIG = {
    maxContextTokens: 128000,
    maxOutputTokens: 40000,
    warningThreshold: 0.75,
    dangerThreshold: 0.85,
    limitThreshold: 0.95,
    outputReservedRatio: 0.25,
    compactTriggerRatio: 0.8,
};
/** 简易估算：1 token ≈ 4 字符（中文约 1.5 字符/token，取保守值） */
export class TokenCalculator {
    calculateMessages(messages) {
        let chars = 0;
        for (const m of messages) {
            chars += typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length;
        }
        return Math.ceil(chars / 4);
    }
}
export class TokenBudgetManager {
    constructor(config = {}) {
        this.calculator = new TokenCalculator();
        this.usageHistory = [];
        this.inputTokens = 0;
        this.outputTokens = 0;
        /** 每次 API 调用的 token 消耗快照（吸收自 OpenCode TokenUsage 细粒度追踪） */
        this.iterationSnapshots = [];
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    checkBudget(messages) {
        const usedTokens = this.calculator.calculateMessages(messages);
        const outputReserved = Math.floor(this.config.maxContextTokens * this.config.outputReservedRatio);
        const effectiveLimit = this.config.maxContextTokens - outputReserved;
        const availableTokens = effectiveLimit - usedTokens;
        const percentage = usedTokens / effectiveLimit;
        let status = "safe";
        if (percentage >= this.config.limitThreshold)
            status = "limit";
        else if (percentage >= this.config.dangerThreshold)
            status = "danger";
        else if (percentage >= this.config.warningThreshold)
            status = "warning";
        const result = {
            status,
            usedTokens,
            availableTokens,
            percentage,
            shouldCompact: percentage >= this.config.compactTriggerRatio,
            shouldReject: percentage >= this.config.limitThreshold,
            tokensToWarning: Math.max(0, Math.floor(effectiveLimit * this.config.warningThreshold) - usedTokens),
            tokensToLimit: Math.max(0, Math.floor(effectiveLimit * this.config.limitThreshold) - usedTokens),
        };
        this.usageHistory.push({ usedTokens, percentage, status });
        return result;
    }
    /**
     * 记录 API 响应的真实 token 使用量，用于成本追踪。
     * 对齐 OpenCode (Go) 的 TokenUsage 概念。
     */
    recordUsage(inputTokens, outputTokens) {
        this.inputTokens += inputTokens;
        this.outputTokens += outputTokens;
        // 记录本次迭代的快照（吸收自 OpenCode TokenUsage 细粒度追踪）
        const costIn = inputTokens * (this.config.costPer1MIn ?? 0) / 1000000;
        const costOut = outputTokens * (this.config.costPer1MOut ?? 0) / 1000000;
        this.iterationSnapshots.push({ inputTokens, outputTokens, costUSD: costIn + costOut });
    }
    /**
     * 获取增强的 token 使用报告，包含成本估算。
     * 对齐 OpenCode (Go) 的 TokenUsage 结构。
     */
    getUsage() {
        const costIn = this.inputTokens * (this.config.costPer1MIn ?? 0) / 1000000;
        const costOut = this.outputTokens * (this.config.costPer1MOut ?? 0) / 1000000;
        return {
            totalInputTokens: this.inputTokens,
            totalOutputTokens: this.outputTokens,
            estimatedCostUSD: costIn + costOut,
            costPer1MIn: this.config.costPer1MIn ?? 0,
            costPer1MOut: this.config.costPer1MOut ?? 0,
            iterations: [...this.iterationSnapshots],
        };
    }
    /** 获取每次迭代的 token 消耗快照 */
    getIterationSnapshots() {
        return [...this.iterationSnapshots];
    }
    /** 重置迭代快照（新任务开始时调用） */
    resetIterationSnapshots() {
        this.iterationSnapshots = [];
    }
    /** 按模型维度计算成本摘要（吸收自 OpenCode TokenUsage 细粒度追踪 + cost-tracker） */
    getCostBreakdown(modelName) {
        let totalCost = 0;
        let totalIn = 0;
        let totalOut = 0;
        for (const snap of this.iterationSnapshots) {
            totalCost += snap.costUSD;
            totalIn += snap.inputTokens;
            totalOut += snap.outputTokens;
        }
        return {
            totalCostUSD: totalCost,
            inputTokens: totalIn,
            outputTokens: totalOut,
            iterations: this.iterationSnapshots.length,
        };
    }
    estimateAvailableOutput(messages) {
        const used = this.calculator.calculateMessages(messages);
        const remaining = this.config.maxContextTokens - used;
        return Math.max(0, Math.min(remaining, this.config.maxOutputTokens));
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}
