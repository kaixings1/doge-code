import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { readFileSync } from 'fs'

/**
 * B1: CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS（官方 v2.1.292）
 * B2: CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES（官方 v2.1.285）
 *
 * withRetry.ts 依赖 claude.ts / analytics 等重模块，vitest 下整体 import 代价高，
 * 因此：取值语义直接测真实导出函数；「是否真的接进重试循环」用源码契约断言。
 */

const SRC = 'D:/doge-code/src/services/api/withRetry.ts'
const CLAUDE_SRC = 'D:/doge-code/src/services/api/claude.ts'

// withRetry 首次 import 在 vitest 下要 10s+（claude.ts / analytics 等重依赖），
// 预热一次后所有用例共享同一模块实例。
type RetryMod = typeof import('../../src/services/api/withRetry.js')
let retryMod: RetryMod

beforeAll(async () => {
  retryMod = await import('../../src/services/api/withRetry.js')
}, 60_000)

describe('B1 getOverloadedRetryBaseDelayMs', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS
  })

  it('未设置时回落到 BASE_DELAY_MS（行为不变）', async () => {
    const m = retryMod
    expect(m.getOverloadedRetryBaseDelayMs()).toBe(m.BASE_DELAY_MS)
    expect(m.BASE_DELAY_MS).toBe(20_000)
  })

  it('合法毫秒值生效', async () => {
    const m = retryMod
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS = '60000'
    expect(m.getOverloadedRetryBaseDelayMs()).toBe(60_000)
  })

  it('非法值回落到默认（NaN / 0 / 负数 / 空串）', async () => {
    const m = retryMod
    for (const bad of ['abc', '0', '-5', '', 'Infinity']) {
      process.env.CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS = bad
      expect(m.getOverloadedRetryBaseDelayMs(), 'value=' + bad).toBe(m.BASE_DELAY_MS)
    }
  })
})

describe('B2 getNonStreamingTimeoutRetries', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES
  })

  it('未设置时返回 null（不额外限制，行为不变）', async () => {
    const m = retryMod
    expect(m.getNonStreamingTimeoutRetries()).toBe(null)
  })

  it('合法值生效', async () => {
    const m = retryMod
    process.env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES = '3'
    expect(m.getNonStreamingTimeoutRetries()).toBe(3)
  })

  it('允许 0（显式表示超时后不再重发）', async () => {
    const m = retryMod
    process.env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES = '0'
    expect(m.getNonStreamingTimeoutRetries()).toBe(0)
  })

  it('非法值回落到 null（不额外限制）', async () => {
    const m = retryMod
    for (const bad of ['abc', '-1', '', '  ']) {
      process.env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES = bad
      expect(m.getNonStreamingTimeoutRetries(), 'value=' + JSON.stringify(bad)).toBe(null)
    }
  })
})

describe('接入完整性（源码契约）', () => {
  it('B1：529 分支使用可配置基数，非 529 仍用 BASE_DELAY_MS', () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).toContain('is529Error(error)')
    expect(src).toContain('? getOverloadedRetryBaseDelayMs()')
    expect(src).toContain(': BASE_DELAY_MS')
  })

  it('B2：超时分支检查上限并在超限时放弃', () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).toContain('nonStreamingTimeoutCap !== null')
    expect(src).toContain('nonStreamingTimeoutCount >= nonStreamingTimeoutCap')
    expect(src).toContain('nonStreamingTimeoutCount++')
  })

  it('B2：只有在 isNonStreamingFallback 时才启用上限', () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).toContain('options.isNonStreamingFallback')
  })

  it('B2：非流式回退调用点传入了 isNonStreamingFallback', () => {
    const src = readFileSync(CLAUDE_SRC, 'utf8')
    expect(src).toContain('isNonStreamingFallback: true')
  })
})
