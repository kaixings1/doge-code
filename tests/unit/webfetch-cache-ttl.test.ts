import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEBFETCH_CACHE_TTL_MS,
  resolveWebFetchCacheTtlMs,
} from '../../src/tools/WebFetchTool/cacheTtl.js'

/**
 * CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS（对齐官方 v2.1.233）
 *
 * 测的是真实的生产解析函数 resolveWebFetchCacheTtlMs——utils.ts 用它给
 * URL_CACHE 设 ttl。这里不复制解析条件，只按不同输入调用它。
 */
const DEFAULT_TTL = 15 * 60 * 1000

describe('resolveWebFetchCacheTtlMs', () => {
  it('默认值为 15 分钟', () => {
    expect(DEFAULT_WEBFETCH_CACHE_TTL_MS).toBe(DEFAULT_TTL)
  })

  it('未设置时使用默认 15 分钟', () => {
    expect(resolveWebFetchCacheTtlMs(undefined)).toBe(DEFAULT_TTL)
  })

  it('合法毫秒值生效', () => {
    expect(resolveWebFetchCacheTtlMs('60000')).toBe(60_000)
    expect(resolveWebFetchCacheTtlMs('300000')).toBe(300_000)
  })

  it('非法值回落到默认值（NaN / 负数 / 0 / 空串 / Infinity）', () => {
    for (const bad of ['abc', '-1', '0', '', 'Infinity']) {
      expect(resolveWebFetchCacheTtlMs(bad), 'value=' + bad).toBe(DEFAULT_TTL)
    }
  })

  it('小数毫秒值原样接受（Number 语义，非 parseInt 截断）', () => {
    expect(resolveWebFetchCacheTtlMs('1500.5')).toBe(1500.5)
  })

  it('确实从 process.env 读取（不传参时的默认行为）', () => {
    process.env.CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS = '90000'
    try {
      expect(resolveWebFetchCacheTtlMs()).toBe(90_000)
    } finally {
      delete process.env.CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS
    }
  })
})
