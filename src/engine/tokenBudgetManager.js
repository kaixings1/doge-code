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
    config;
    calculator = new TokenCalculator();
    usageHistory = [];
    constructor(config = {}) {
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
    estimateAvailableOutput(messages) {
        const used = this.calculator.calculateMessages(messages);
        const remaining = this.config.maxContextTokens - used;
        return Math.max(0, Math.min(remaining, this.config.maxOutputTokens));
    }
    getUsage() {
        const latest = this.usageHistory[this.usageHistory.length - 1];
        return { current: latest ?? { usedTokens: 0, percentage: 0, status: "safe" }, history: [...this.usageHistory] };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}
