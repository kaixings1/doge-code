import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getOverloadedRetryMaxDelayMs,
  getOverloadedRetryBaseDelayMs,
} from '../../services/api/withRetry.ts'

/**
 * CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS（官方 v2.1.296）给 529/503
 * 过载退避设定上限。此前该上限硬编码为 32000，本环境变量让其在国内供应商
 * 高峰期可放宽或收紧。非法值必须回落到 32000 以保持既有行为。
 */
describe('getOverloadedRetryMaxDelayMs', () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('未设置时回落到 32000（此前硬编码上限）', () => {
    expect(getOverloadedRetryMaxDelayMs()).toBe(32000)
  })

  it('合法数值按原值返回', () => {
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = '60000'
    expect(getOverloadedRetryMaxDelayMs()).toBe(60000)
  })

  it('非数字值回落到 32000（不返回 NaN）', () => {
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = 'abc'
    const result = getOverloadedRetryMaxDelayMs()
    expect(Number.isNaN(result)).toBe(false)
    expect(result).toBe(32000)
  })

  it('负数 / 0 回落到 32000（上限不可被压到无效值）', () => {
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = '-5'
    expect(getOverloadedRetryMaxDelayMs()).toBe(32000)
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = '0'
    expect(getOverloadedRetryMaxDelayMs()).toBe(32000)
  })

  it('空字符串按未设置处理', () => {
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = ''
    expect(getOverloadedRetryMaxDelayMs()).toBe(32000)
  })

  it('与 base delay 正交：max 不影响 base 的默认 20000', () => {
    process.env.CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS = '90000'
    delete process.env.CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS
    expect(getOverloadedRetryBaseDelayMs()).toBe(20000)
    expect(getOverloadedRetryMaxDelayMs()).toBe(90000)
  })
})
