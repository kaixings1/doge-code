import { describe, it, expect } from 'vitest'
import {
  computeRateLimitDelayMs,
  nextRateLimitRound,
  parseRetryAfterMs,
  RATE_LIMIT_RETRY_ROUNDS,
  shouldResumeRateLimit,
} from '../../query/rateLimitResume.ts'

/**
 * 429（含 tpm_exceeded 等容量 429）在 withRetry 预算耗尽后，
 * query 层要继续指数退避等待，而不是结束对话。
 */
describe('rateLimitResume', () => {
  it('轮次从 0 递增，上限内继续、超限后停止', () => {
    expect(nextRateLimitRound(0)).toBe(1)
    expect(shouldResumeRateLimit(nextRateLimitRound(0))).toBe(true)
    expect(shouldResumeRateLimit(RATE_LIMIT_RETRY_ROUNDS)).toBe(true)
    // 变异检查：上限 +1 必须停止，否则会无限等待
    expect(shouldResumeRateLimit(RATE_LIMIT_RETRY_ROUNDS + 1)).toBe(false)
  })

  it('无 Retry-After 时按指数退避递增并封顶', () => {
    const r1 = computeRateLimitDelayMs(1)
    const r2 = computeRateLimitDelayMs(2)
    const r9 = computeRateLimitDelayMs(9)
    // 起步 20s（含最多 25% 抖动）
    expect(r1).toBeGreaterThanOrEqual(20_000)
    expect(r1).toBeLessThanOrEqual(25_000)
    expect(r2).toBeGreaterThan(r1)
    // 封顶 32s * 1.25
    expect(r9).toBeLessThanOrEqual(40_000)
  })

  it('Retry-After 优先于指数退避', () => {
    expect(computeRateLimitDelayMs(5, '90')).toBe(90_000)
  })

  it('Retry-After 解析支持秒与 HTTP 日期，非法值返回 null', () => {
    expect(parseRetryAfterMs('30', 0)).toBe(30_000)
    expect(parseRetryAfterMs(null)).toBeNull()
    expect(parseRetryAfterMs('not-a-date')).toBeNull()
    expect(parseRetryAfterMs('0')).toBeNull()
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:10 GMT', 0)).toBe(10_000)
  })
})
