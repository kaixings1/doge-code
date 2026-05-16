import { getBudgetContinuationMessage } from '../utils/tokenBudget.js'

// 完成阈值（90%）
const COMPLETION_THRESHOLD = 0.9
// 收益递减阈值
const DIMINISHING_THRESHOLD = 500

/** 预算追踪器 */
export type BudgetTracker = {
  /** 连续续传次数 */
  continuationCount: number
  /** 上次增量 Token 数 */
  lastDeltaTokens: number
  /** 上次全局回合 Token 数 */
  lastGlobalTurnTokens: number
  /** 开始时间戳 */
  startedAt: number
}

/** 创建预算追踪器 */
export function createBudgetTracker(): BudgetTracker {
  return {
    continuationCount: 0,
    lastDeltaTokens: 0,
    lastGlobalTurnTokens: 0,
    startedAt: Date.now(),
  }
}

/** 继续决策 */
type ContinueDecision = {
  action: 'continue'
  /** 提示消息 */
  nudgeMessage: string
  /** 连续续传次数 */
  continuationCount: number
  /** 已用百分比 */
  pct: number
  /** 当前回合 Token 数 */
  turnTokens: number
  /** 预算上限 */
  budget: number
}

/** 停止决策 */
type StopDecision = {
  action: 'stop'
  /** 完成事件数据 */
  completionEvent: {
    continuationCount: number
    pct: number
    turnTokens: number
    budget: number
    diminishingReturns: boolean
    durationMs: number
  } | null
}

/** Token 预算决策结果 */
export type TokenBudgetDecision = ContinueDecision | StopDecision

export function checkTokenBudget(
  tracker: BudgetTracker,
  agentId: string | undefined,
  budget: number | null,
  globalTurnTokens: number,
): TokenBudgetDecision {
  if (agentId || budget === null || budget <= 0) {
    return { action: 'stop', completionEvent: null }
  }

  const turnTokens = globalTurnTokens
  const pct = Math.round((turnTokens / budget) * 100)
  const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens

  const isDiminishing =
    tracker.continuationCount >= 3 &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD

  if (!isDiminishing && turnTokens < budget * COMPLETION_THRESHOLD) {
    tracker.continuationCount++
    tracker.lastDeltaTokens = deltaSinceLastCheck
    tracker.lastGlobalTurnTokens = globalTurnTokens
    return {
      action: 'continue',
      nudgeMessage: getBudgetContinuationMessage(pct, turnTokens, budget),
      continuationCount: tracker.continuationCount,
      pct,
      turnTokens,
      budget,
    }
  }

  if (isDiminishing || tracker.continuationCount > 0) {
    return {
      action: 'stop',
      completionEvent: {
        continuationCount: tracker.continuationCount,
        pct,
        turnTokens,
        budget,
        diminishingReturns: isDiminishing,
        durationMs: Date.now() - tracker.startedAt,
      },
    }
  }

  return { action: 'stop', completionEvent: null }
}
