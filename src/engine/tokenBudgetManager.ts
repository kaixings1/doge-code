/**
 * engine/tokenBudgetManager.ts — Token 预算管理器（文档 02 §7.1）
 *
 * 监控 Token 使用量、触发压缩、防止超限。
 */
import type { InternalMessage } from "./messageNormalizer.ts";

export type BudgetStatus = "safe" | "warning" | "danger" | "limit";

export interface BudgetConfig {
  maxContextTokens: number;
  maxOutputTokens: number;
  warningThreshold: number;
  dangerThreshold: number;
  limitThreshold: number;
  outputReservedRatio: number;
  compactTriggerRatio: number;
}

export interface BudgetCheckResult {
  status: BudgetStatus;
  usedTokens: number;
  availableTokens: number;
  percentage: number;
  shouldCompact: boolean;
  shouldReject: boolean;
  tokensToWarning: number;
  tokensToLimit: number;
}

const DEFAULT_CONFIG: BudgetConfig = {
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
  calculateMessages(messages: InternalMessage[]): number {
    let chars = 0;
    for (const m of messages) {
      chars += typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length;
    }
    return Math.ceil(chars / 4);
  }
}

export class TokenBudgetManager {
  private config: BudgetConfig;
  private calculator = new TokenCalculator();
  private usageHistory: { usedTokens: number; percentage: number; status: BudgetStatus }[] = [];

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  checkBudget(messages: InternalMessage[]): BudgetCheckResult {
    const usedTokens = this.calculator.calculateMessages(messages);
    const outputReserved = Math.floor(this.config.maxContextTokens * this.config.outputReservedRatio);
    const effectiveLimit = this.config.maxContextTokens - outputReserved;
    const availableTokens = effectiveLimit - usedTokens;
    const percentage = usedTokens / effectiveLimit;

    let status: BudgetStatus = "safe";
    if (percentage >= this.config.limitThreshold) status = "limit";
    else if (percentage >= this.config.dangerThreshold) status = "danger";
    else if (percentage >= this.config.warningThreshold) status = "warning";

    const result: BudgetCheckResult = {
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

  estimateAvailableOutput(messages: InternalMessage[]): number {
    const used = this.calculator.calculateMessages(messages);
    const remaining = this.config.maxContextTokens - used;
    return Math.max(0, Math.min(remaining, this.config.maxOutputTokens));
  }

  getUsage() {
    const latest = this.usageHistory[this.usageHistory.length - 1];
    return { current: latest ?? { usedTokens: 0, percentage: 0, status: "safe" as BudgetStatus }, history: [...this.usageHistory] };
  }

  updateConfig(newConfig: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}