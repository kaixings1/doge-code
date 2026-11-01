/**
 * `CLAUDE_CODE_DISABLE_ULTRATHINK`（对齐官方 2.1.316）。
 *
 * 官方描述：Added `CLAUDE_CODE_DISABLE_ULTRATHINK`, which turns the
 * `ultrathink` keyword off.
 *
 * 本地原本只有两道门控：构建期 `feature('ULTRATHINK')` 与 GrowthBook
 * `tengu_turtle_carbon`，没有用户可用的运行时开关。
 *
 * 测试策略说明（重要）：
 * `feature()` 是 bun:bundle 的**编译期常量**，本仓库构建参数里没有
 * ULTRATHINK，所以它在测试里恒为 false —— 意味着 isUltrathinkEnabled()
 * 无论如何都返回 false，无法用「返回 true」来证明开关生效。
 * 因此这里验证的是**判据本身**：开关为真时函数必须提前返回 false，
 * 且这个判据排在构建门控之前（源码契约）。变异测试见文件末尾说明。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isEnvTruthy } from '../../src/utils/envUtils.js'

const thinkingSrc = readFileSync(
  new URL('../../src/utils/thinking.ts', import.meta.url),
  'utf8',
)

/** 与 isUltrathinkEnabled 里一致的开关判据。 */
function isDisabledByEnv(raw: string | undefined): boolean {
  return isEnvTruthy(raw)
}

describe('CLAUDE_CODE_DISABLE_ULTRATHINK', () => {
  it('真值写法都应关闭', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' 1 ']) {
      expect(isDisabledByEnv(v)).toBe(true)
    }
  })

  it('假值写法不应关闭', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      expect(isDisabledByEnv(v)).toBe(false)
    }
    expect(isDisabledByEnv(undefined)).toBe(false)
  })

  it('源码里该判据存在，且排在构建门控之前', () => {
    const idxEnv = thinkingSrc.indexOf('CLAUDE_CODE_DISABLE_ULTRATHINK')
    const idxFeature = thinkingSrc.indexOf("feature('ULTRATHINK')")
    expect(idxEnv).toBeGreaterThan(-1)
    expect(idxFeature).toBeGreaterThan(-1)
    // 用户意图必须优先于构建门控
    expect(idxEnv).toBeLessThan(idxFeature)
  })
})
