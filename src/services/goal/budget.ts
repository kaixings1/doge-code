/**
 * /goal 预算与熔断 — 三级预算 + 两级熔断（goal.md §3.3）
 *
 * 三级预算：
 *   - 迭代次数：usage.iterations >= budget.maxIterations
 *   - Token 用量：budget.tokenBudget > 0 且 usage.tokenUsed >= tokenBudget
 *   - 墙钟时间：budget.wallClockMs > 0 且 now - usage.startedAt >= wallClockMs
 *
 * 两级熔断：
 *   - 一级（快速循环）：窗口内触发次数超限 且 单轮 token 极低 → 空转
 *   - 二级（进度停滞）：连续多轮裁判 reason 高度相似 → 停滞
 */

import type { GoalState } from './types.js'

export interface BudgetCheck {
  /** 是否超预算 */
  exceeded: boolean
  /** 触发原因（超预算时） */
  reason?: string
}

/** 三级预算检查（不含熔断） */
export function checkBudget(state: GoalState, now: number = Date.now()): BudgetCheck {
  const { budget, usage } = state

  if (budget.maxIterations > 0 && usage.iterations >= budget.maxIterations) {
    return { exceeded: true, reason: `已达迭代上限（${usage.iterations}/${budget.maxIterations}）` }
  }

  if (budget.tokenBudget > 0 && usage.tokenUsed >= budget.tokenBudget) {
    return {
      exceeded: true,
      reason: `已达 token 预算（${usage.tokenUsed}/${budget.tokenBudget}）`,
    }
  }

  if (budget.wallClockMs > 0 && now - usage.startedAt >= budget.wallClockMs) {
    const mins = Math.round((now - usage.startedAt) / 60000)
    const limitMins = Math.round(budget.wallClockMs / 60000)
    return { exceeded: true, reason: `已达时间预算（${mins}/${limitMins} 分钟）` }
  }

  return { exceeded: false }
}

// ─── 一级熔断：快速循环检测 ───────────────────────────────────

/** 最近一轮的事件时间戳记录（供一级熔断使用，由调用方维护） */
export interface LoopHeartbeat {
  /** 最近若干轮的触发时间戳（毫秒） */
  timestamps: number[]
  /** 最近若干轮的 token 增量 */
  tokens: number[]
}

export const FAST_LOOP_WINDOW_MS = 60_000
export const FAST_LOOP_MAX_TRIGGERS = 3
export const FAST_LOOP_TOKEN_FLOOR = 1000

/**
 * 一级熔断：窗口内触发次数超限，且每轮 token 消耗极低 → 判定空转。
 * @param hb 心跳记录（应只保留窗口内的样本，由调用方裁剪）
 */
export function detectFastLoop(hb: LoopHeartbeat, now: number = Date.now()): boolean {
  const recent = hb.timestamps.filter(t => now - t <= FAST_LOOP_WINDOW_MS)
  if (recent.length <= FAST_LOOP_MAX_TRIGGERS) return false
  const recentTokens = hb.tokens.slice(-recent.length)
  if (recentTokens.length === 0) return false
  const allLow = recentTokens.every(t => t < FAST_LOOP_TOKEN_FLOOR)
  return allLow
}

// ─── 二级熔断：进度停滞检测 ───────────────────────────────────

export const STAGNATION_THRESHOLD = 3

/**
 * 判断两段裁判 reason 是否高度相似。
 * 采用简单的词集合 Jaccard 相似度，阈值 0.8。
 */
export function reasonsSimilar(a: string, b: string, threshold = 0.8): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  const setA = new Set(norm(a))
  const setB = new Set(norm(b))
  if (setA.size === 0 || setB.size === 0) return a.trim() === b.trim()
  let inter = 0
  for (const w of setA) if (setB.has(w)) inter++
  const union = setA.size + setB.size - inter
  return inter / union >= threshold
}

/**
 * 二级熔断：最近连续 threshold 条 reason 高度相似 → 判定停滞。
 * @param recentReasons 由旧到新的裁判 reason 列表（建议只传最近 threshold+1 条）
 */
export function detectStagnation(
  recentReasons: string[],
  threshold: number = STAGNATION_THRESHOLD,
): boolean {
  if (recentReasons.length < threshold) return false
  const tail = recentReasons.slice(-threshold)
  for (let i = 1; i < tail.length; i++) {
    if (!reasonsSimilar(tail[i - 1]!, tail[i]!)) return false
  }
  return true
}

/**
 * 汇总评估：一次调用返回预算与熔断的综合决策。
 * 供 Stop hook 闸门使用——超限则阻止续跑。
 */
export interface GateDecision {
  /** true 表示允许继续，false 表示应停止（阻止续跑） */
  allow: boolean
  /** 停止原因（allow=false 时） */
  reason?: string
  /** 停止类型 */
  kind?: 'budget' | 'fast_loop' | 'stagnation'
}

export function evaluateGate(
  state: GoalState,
  hb: LoopHeartbeat,
  recentReasons: string[],
  now: number = Date.now(),
): GateDecision {
  const budget = checkBudget(state, now)
  if (budget.exceeded) {
    return { allow: false, reason: budget.reason, kind: 'budget' }
  }
  if (detectFastLoop(hb, now)) {
    return {
      allow: false,
      reason: `检测到空转循环（${FAST_LOOP_WINDOW_MS / 1000}s 内触发超过 ${FAST_LOOP_MAX_TRIGGERS} 次且每轮 token 极低）`,
      kind: 'fast_loop',
    }
  }
  if (detectStagnation(recentReasons)) {
    return {
      allow: false,
      reason: `检测到进度停滞（连续 ${STAGNATION_THRESHOLD} 轮裁判理由高度相似）`,
      kind: 'stagnation',
    }
  }
  return { allow: true }
}
