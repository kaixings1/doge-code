/**
 * `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS`（官方 2.1.305）。
 *
 * 官方描述：so unattended retry mode (`CLAUDE_CODE_RETRY_WATCHDOG`) notices
 * a usage limit that was lifted **before its reset**.
 *
 * 解决的问题：429 的 reset 头可能是 5 小时窗口边界，配额却可能提前解除。
 * 原实现傻等到 reset；该变量让等待变成「最多等这么久就重新探一次」。
 *
 * 三条语义边界，逐一覆盖：
 * 1. 未设置/非法值 → 完全保持原行为（等到 reset），不能误伤既有逻辑
 * 2. 配置后取 min(reset, recheck) —— 只缩短不延长
 * 3. 没有 reset 头（null）时不做任何事
 *
 * 变异验证（必须做）：
 *   - capUsageLimitWait 改成直接返回 recheckMs → 用例 2（不延长）失败
 *   - 非法值不回落到 0 而是直接用 NaN → 用例 1 失败
 *   - null 分支返回 recheckMs → 用例 3 失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_USAGE_LIMIT_RECHECK_MS,
  capUsageLimitWait,
  getUsageLimitRecheckMs,
} from '../../src/utils/usageLimitRecheck.js'

const env = (v?: string) =>
  (v === undefined ? {} : { CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS: v }) as never

describe('getUsageLimitRecheckMs', () => {
  it('未设置时返回 0（不启用，保持原行为）', () => {
    expect(getUsageLimitRecheckMs(env())).toBe(DEFAULT_USAGE_LIMIT_RECHECK_MS)
    expect(DEFAULT_USAGE_LIMIT_RECHECK_MS).toBe(0)
  })

  it('空串 / 非法值 / 非正数一律回落 0', () => {
    for (const v of ['', '   ', 'abc', 'NaN', 'Infinity', '0', '-100']) {
      expect(getUsageLimitRecheckMs(env(v))).toBe(0)
    }
  })

  it('合法值被解析（并向下取整）', () => {
    expect(getUsageLimitRecheckMs(env('60000'))).toBe(60000)
    expect(getUsageLimitRecheckMs(env(' 1500 '))).toBe(1500)
    expect(getUsageLimitRecheckMs(env('1500.9'))).toBe(1500)
  })
})

describe('capUsageLimitWait', () => {
  it('未启用（recheck=0）时原样返回 reset 延迟', () => {
    expect(capUsageLimitWait(5 * 3600_000, 0)).toBe(5 * 3600_000)
  })

  it('启用时取较小值', () => {
    expect(capUsageLimitWait(5 * 3600_000, 60_000)).toBe(60_000)
  })

  it('配置值比 reset 还大时，不延长等待', () => {
    // 只缩短不延长：仍按 reset 等
    expect(capUsageLimitWait(60_000, 3600_000)).toBe(60_000)
  })

  it('没有 reset 头时返回 null（交给调用方的退避逻辑）', () => {
    expect(capUsageLimitWait(null, 60_000)).toBeNull()
    expect(capUsageLimitWait(null, 0)).toBeNull()
  })
})
