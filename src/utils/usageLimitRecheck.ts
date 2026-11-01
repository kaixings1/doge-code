/**
 * `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS`（官方 2.1.305）。
 *
 * changelog 原文：so unattended retry mode (`CLAUDE_CODE_RETRY_WATCHDOG`)
 * notices a usage limit that was lifted **before its reset**.
 *
 * 问题背景：429 的 `anthropic-ratelimit-unified-reset` 头给出的是「配额重置
 * 时间」（可能是 5 小时窗口的边界）。无人值守模式下现有实现会**一直等到那一刻**。
 * 但配额可能提前解除（运营侧放宽、退款、窗口提前滚动），此时傻等 5 小时
 * 是纯浪费。本变量让等待变成「最多等这么久就重新探一次」。
 *
 * 语义边界（实现要点）：
 *  1. 只影响 usage-limit（429 带 reset 头）这一条路径，不影响普通退避。
 *  2. 取值必须是正有限数；非法/未设置时**完全保持原行为**（等到 reset）。
 *  3. 只缩短等待，绝不延长 —— 若配置值比 resetDelay 还大，仍按 resetDelay。
 */

/** 默认不启用重检（保持既有行为）。 */
export const DEFAULT_USAGE_LIMIT_RECHECK_MS = 0

/**
 * 读取重检间隔。未设置、空串、非法值、<=0 一律返回 0（表示不启用）。
 */
export function getUsageLimitRecheckMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS
  if (raw == null || raw.trim() === '') return DEFAULT_USAGE_LIMIT_RECHECK_MS
  const parsed = Number(raw.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_USAGE_LIMIT_RECHECK_MS
  }
  return Math.floor(parsed)
}

/**
 * 计算 usage-limit 路径实际要等多久。
 *
 * @param resetDelayMs 从 reset 头算出的剩余毫秒数（null 表示没有该头）
 * @param recheckMs    重检间隔（0 = 不启用）
 *
 * 不启用时原样返回 resetDelayMs（含 null），保证行为不变。
 * 启用时取二者较小值 —— 只缩短不延长。
 */
export function capUsageLimitWait(
  resetDelayMs: number | null,
  recheckMs: number,
): number | null {
  if (resetDelayMs == null) return null
  if (recheckMs <= 0) return resetDelayMs
  return Math.min(resetDelayMs, recheckMs)
}
