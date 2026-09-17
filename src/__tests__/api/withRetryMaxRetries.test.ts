import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDefaultMaxRetries } from '../../services/api/withRetry.ts'

/**
 * CLAUDE_CODE_MAX_RETRIES 非法值曾导致：getMaxRetries() 返回 NaN
 * → 重试循环 `attempt <= NaN + 1` 恒为 false → 循环体一次都不执行
 * → 不发任何请求，lastError 保持未赋值，直接抛 CannotRetryError。
 * 即一个手误的环境变量会让所有 API 调用静默失败。
 */
describe('getDefaultMaxRetries', () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.CLAUDE_CODE_MAX_RETRIES
    delete process.env.CLAUDE_CODE_RETRY_WATCHDOG
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('未设置时返回默认值 15', () => {
    expect(getDefaultMaxRetries()).toBe(15)
  })

  it('合法数值按原值返回', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '3'
    expect(getDefaultMaxRetries()).toBe(3)
  })

  it('0 是合法值（表示不重试）', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '0'
    expect(getDefaultMaxRetries()).toBe(0)
    // 必须有限，否则重试循环不会执行
    expect(Number.isFinite(getDefaultMaxRetries())).toBe(true)
  })

  it('超过上限时截断为 15', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '100'
    expect(getDefaultMaxRetries()).toBe(15)
  })

  it('非数字值回落到默认值（不返回 NaN）', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = 'abc'
    const result = getDefaultMaxRetries()
    expect(Number.isNaN(result)).toBe(false)
    expect(result).toBe(15)
  })

  it('负数回落到默认值（负数会让循环不执行）', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '-5'
    expect(getDefaultMaxRetries()).toBe(15)
  })

  it('空字符串按未设置处理', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = ''
    expect(getDefaultMaxRetries()).toBe(15)
  })

  it('返回值始终可用于驱动重试循环（attempt <= n + 1 至少执行一次）', () => {
    for (const raw of ['abc', '-5', '0', '3', '', '999']) {
      process.env.CLAUDE_CODE_MAX_RETRIES = raw
      const n = getDefaultMaxRetries()
      expect(Number.isFinite(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      // 循环至少跑一次的前提
      expect(1 <= n + 1).toBe(true)
    }
  })

  it('watchdog 模式下为无限重试', () => {
    process.env.CLAUDE_CODE_RETRY_WATCHDOG = '1'
    process.env.CLAUDE_CODE_MAX_RETRIES = 'abc'
    expect(getDefaultMaxRetries()).toBe(Number.POSITIVE_INFINITY)
  })
})
