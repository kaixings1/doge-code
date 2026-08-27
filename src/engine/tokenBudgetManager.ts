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
  costPer1MIn?: number;
  costPer1MOut?: number;
}

/**
 * Token 使用报告，包含成本估算。
 * 对齐 OpenCode (Go) 的 TokenUsage 概念。
 */
export interface TokenUsageReport {
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Estimated USD cost based on model pricing */
  estimatedCostUSD: number;
  /** Cost per 1M input tokens used for calculation */
  costPer1MIn: number;
  /** Cost per 1M output tokens used for calculation */
  costPer1MOut: number;
  /** Per-iteration breakdown（吸收自 OpenCode TokenUsage 细粒度追踪） */
  iterations?: Array<{ inputTokens: number; outputTokens: number; costUSD: number }>
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
  private inputTokens = 0;
  private outputTokens = 0;
  /** 每次 API 调用的 token 消耗快照（吸收自 OpenCode TokenUsage 细粒度追踪） */
  private iterationSnapshots: Array<{ inputTokens: number; outputTokens: number; costUSD: number }> = [];

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

  /**
   * 记录 API 响应的真实 token 使用量，用于成本追踪。
   * 对齐 OpenCode (Go) 的 TokenUsage 概念。
   */
  recordUsage(inputTokens: number, outputTokens: number): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    // 记录本次迭代的快照（吸收自 OpenCode TokenUsage 细粒度追踪）
    const costIn = inputTokens * (this.config.costPer1MIn ?? 0) / 1_000_000
    const costOut = outputTokens * (this.config.costPer1MOut ?? 0) / 1_000_000
    this.iterationSnapshots.push({ inputTokens, outputTokens, costUSD: costIn + costOut })
  }

  /**
   * 获取增强的 token 使用报告，包含成本估算。
   * 对齐 OpenCode (Go) 的 TokenUsage 结构。
   */
  getUsage(): TokenUsageReport {
    const costIn = this.inputTokens * (this.config.costPer1MIn ?? 0) / 1_000_000;
    const costOut = this.outputTokens * (this.config.costPer1MOut ?? 0) / 1_000_000;
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
  getIterationSnapshots(): Array<{ inputTokens: number; outputTokens: number; costUSD: number }> {
    return [...this.iterationSnapshots]
  }

  /** 重置迭代快照（新任务开始时调用） */
  resetIterationSnapshots(): void {
    this.iterationSnapshots = []
  }

  /** 按模型维度计算成本摘要（吸收自 OpenCode TokenUsage 细粒度追踪 + cost-tracker） */
  getCostBreakdown(modelName: string): { totalCostUSD: number; inputTokens: number; outputTokens: number; iterations: number } {
    let totalCost = 0
    let totalIn = 0
    let totalOut = 0
    for (const snap of this.iterationSnapshots) {
      totalCost += snap.costUSD
      totalIn += snap.inputTokens
      totalOut += snap.outputTokens
    }
    return {
      totalCostUSD: totalCost,
      inputTokens: totalIn,
      outputTokens: totalOut,
      iterations: this.iterationSnapshots.length,
    }
  }

  estimateAvailableOutput(messages: InternalMessage[]): number {
    const used = this.calculator.calculateMessages(messages);
    const remaining = this.config.maxContextTokens - used;
    return Math.max(0, Math.min(remaining, this.config.maxOutputTokens));
  }

  updateConfig(newConfig: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}