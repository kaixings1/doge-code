/**
 * /goal — 目标自治运行时的类型定义
 *
 * 状态模型分两级：
 * - GoalState：目标的持久化定义（objective / status / budget / usage / history）
 * - GoalRunTask：Goal 之下的轻量任务列表（复杂任务可选）
 *
 * 设计依据见 goal.md §2.1。
 */

export type GoalStatus =
  | 'active' // 正在执行
  | 'paused' // 用户暂停
  | 'budget_limited' // 预算耗尽，等待用户决策
  | 'complete' // 裁判判定完成
  | 'impossible' // 裁判判定不可能
  | 'error'

export interface GoalBudget {
  /** 最大迭代次数，默认 50 */
  maxIterations: number
  /** token 预算，0 = 不限制 */
  tokenBudget: number
  /** 墙钟预算（毫秒），0 = 不限制，默认 4 小时 */
  wallClockMs: number
}

export interface GoalUsage {
  iterations: number
  tokenUsed: number
  startedAt: number
  lastIterationAt: number
}

export type GoalEventType =
  | 'set'
  | 'pause'
  | 'resume'
  | 'clear'
  | 'iteration_end'
  | 'judge_ok'
  | 'judge_not_ok'
  | 'judge_impossible'
  | 'budget_exceeded'
  | 'circuit_break'
  | 'error'

export interface GoalEvent {
  type: GoalEventType
  timestamp: number
  detail: string
  tokensThisTurn?: number
}

/** GoalRun 层：复杂任务时 Goal 之下的轻量任务列表 */
export interface GoalRunTask {
  taskId: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  evidence?: string
}

export interface GoalState {
  id: string
  objective: string
  criteria: string[]
  status: GoalStatus
  budget: GoalBudget
  usage: GoalUsage
  /** 最近一次裁判结果 */
  lastJudge?: {
    ok: boolean
    impossible: boolean
    reason: string
    at: number
  }
  history: GoalEvent[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/** 默认预算：保守配置，见 goal.md §6 */
export const DEFAULT_BUDGET: GoalBudget = {
  maxIterations: 50,
  tokenBudget: 0,
  wallClockMs: 4 * 60 * 60 * 1000,
}

/** 裁判三态：从 reason 前缀解析（schema 仅支持 ok + reason，见 goal.md §0.1） */
export const JUDGE_EVIDENCE_PREFIX = 'EVIDENCE:'
export const JUDGE_MISSING_PREFIX = 'MISSING:'
export const JUDGE_IMPOSSIBLE_PREFIX = 'IMPOSSIBLE:'

export interface JudgeVerdict {
  ok: boolean
  impossible: boolean
  reason: string
}

/**
 * 从裁判返回的 { ok, reason } 解析三态。
 * 前缀约定：EVIDENCE / MISSING / IMPOSSIBLE。
 */
export function parseJudgeVerdict(raw: {
  ok: boolean
  reason?: string
}): JudgeVerdict {
  const reason = (raw.reason ?? '').trim()
  const impossible = !raw.ok && reason
    .toUpperCase()
    .startsWith(JUDGE_IMPOSSIBLE_PREFIX)
  return { ok: raw.ok, impossible, reason }
}
