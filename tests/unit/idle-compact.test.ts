/**
 * idle compaction 判定逻辑的单元测试。
 *
 * 重点测 shouldIdleCompact 的边界条件（纯函数，便于穷举）：
 * - 闲置时长不足 → 不触发
 * - token 不足 → 不触发
 * - minTokens=0（关闭）→ 不触发
 * - 全部满足 → 触发
 *
 * 变异验证：把 shouldIdleCompact 里的某个条件反转或删除，对应用例
 * 应失败，证明守卫真的起作用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  shouldIdleCompact,
  getIdleCompactMinTokens,
  getIdleCompactRemainingMs,
  IDLE_COMPACT_DELAY_MS,
  IDLE_COMPACT_MIN_TOKENS_DEFAULT,
} from '../../src/services/compact/idleCompact.js'

// 这些测试绕过 isIdleCompactionEnabled（它依赖 getGlobalConfig + autoCompact），
// 直接测 shouldIdleCompact 的纯逻辑判定。
describe('shouldIdleCompact 判定边界', () => {
  const DELAY = IDLE_COMPACT_DELAY_MS // 54 分钟
  const MIN = IDLE_COMPACT_MIN_TOKENS_DEFAULT // 200K

  it('闲置时长不足时不触发', () => {
    // isIdleCompactionEnabled 短路在外部 mock；用大 token + 短 idle
    // 强制让 shouldIdleCompact 内部的 idleMs < delayMs 命中
    const result = shouldIdleCompact(DELAY - 1, MIN + 1, MIN, DELAY)
    // 注意：shouldIdleCompact 第一行调 isIdleCompactionEnabled()，
    // 它依赖 getGlobalConfig。在测试环境 getGlobalConfig 可能返回不同状态，
    // 所以这里只断言「idleMs < delayMs 时返回 false」这一条逻辑路径。
    // 如果 isIdleCompactionEnabled 返回 false，result 也是 false——同一期望。
    expect(result).toBe(false)
  })

  it('token 不足时不触发', () => {
    const result = shouldIdleCompact(DELAY + 1, MIN - 1, MIN, DELAY)
    expect(result).toBe(false)
  })

  it('minTokens=0（用户关闭）时不触发', () => {
    const result = shouldIdleCompact(DELAY + 1, MIN + 1, 0, DELAY)
    expect(result).toBe(false)
  })

  it('全部满足时触发', () => {
    const result = shouldIdleCompact(DELAY + 1, MIN + 1, MIN, DELAY)
    expect(result).toBe(true)
  })

  it('闲置时长恰好等于阈值时触发（>=）', () => {
    const result = shouldIdleCompact(DELAY, MIN + 1, MIN, DELAY)
    expect(result).toBe(true)
  })

  it('token 恰好等于阈值时触发（>=）', () => {
    const result = shouldIdleCompact(DELAY + 1, MIN, MIN, DELAY)
    expect(result).toBe(true)
  })
})

describe('getIdleCompactMinTokens 环境变量解析', () => {
  const orig = process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS

  afterEach(() => {
    if (orig === undefined) delete process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS
    else process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS = orig
  })

  it('未设置时返回默认 200K', () => {
    delete process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS
    expect(getIdleCompactMinTokens()).toBe(200_000)
  })

  it('合法数字时返回该数字', () => {
    process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS = '150000'
    expect(getIdleCompactMinTokens()).toBe(150_000)
  })

  it('设为 0 时返回 0（用于关闭）', () => {
    process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS = '0'
    expect(getIdleCompactMinTokens()).toBe(0)
  })

  it('非法值回退默认', () => {
    process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS = 'abc'
    expect(getIdleCompactMinTokens()).toBe(200_000)
  })

  it('负值回退默认', () => {
    process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS = '-100'
    expect(getIdleCompactMinTokens()).toBe(200_000)
  })
})

describe('getIdleCompactRemainingMs 剩余毫秒', () => {
  it('未到阈值返回正数', () => {
    const now = 1_000_000
    const lqct = now - 10 * 60_000 // 10 分钟前完成
    const remaining = getIdleCompactRemainingMs(lqct, now)
    // 54 - 10 = 44 分钟
    expect(remaining).toBeGreaterThan(40 * 60_000)
    expect(remaining).toBeLessThan(50 * 60_000)
  })

  it('已过阈值返回 0', () => {
    const now = 1_000_000
    const lqct = now - 60 * 60_000 // 60 分钟前完成（超过 54 分钟）
    expect(getIdleCompactRemainingMs(lqct, now)).toBe(0)
  })

  it('恰好到阈值返回 0', () => {
    const now = 1_000_000
    const lqct = now - IDLE_COMPACT_DELAY_MS
    expect(getIdleCompactRemainingMs(lqct, now)).toBe(0)
  })
})