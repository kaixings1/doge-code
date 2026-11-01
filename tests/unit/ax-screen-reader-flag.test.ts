/**
 * `--ax-screen-reader` 无障碍模式入口（对应 diff_with_claude.md §2.1）。
 *
 * 官方 2.1.303 提供该 CLI 参数；本地原本只有内部的 CLAUDE_CODE_ACCESSIBILITY
 * 环境变量（Ink 层据此保留原生光标），缺一个用户可用的 CLI 入口。
 *
 * 这里用源码契约测试而非行为测试，原因：涉及 Commander 的参数注册与
 * 进程启动期的一次性 env 赋值，无法在不启动整个 CLI 的前提下调用。
 * 契约测试锁住三件事，任一件被改掉都会失败：
 *   1. 参数已注册
 *   2. 注册后真的把值映射到环境变量（不是只注册个空壳）
 *   3. 该环境变量确实仍被 Ink 层消费（映射才有意义）
 *
 * 变异验证（必须做，否则是复刻型假测试）：
 *   - 删掉 `if (options.axScreenReader) { ... }` 三段 → 用例 2 失败
 *   实测已确认失败。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const mainSrc = readFileSync(
  new URL('../../src/main.tsx', import.meta.url),
  'utf8',
)
const appSrc = readFileSync(
  new URL('../../src/ink/components/App.tsx', import.meta.url),
  'utf8',
)

describe('--ax-screen-reader', () => {
  it('注册了该 CLI 参数', () => {
    expect(mainSrc).toContain("'--ax-screen-reader'")
  })

  it('把参数映射到 CLAUDE_CODE_ACCESSIBILITY=1', () => {
    // 必须是「条件成立才赋值」的形式，不能是无条件赋值（那会让
    // 无障碍模式永远开启）。
    const re =
      /if \(options\.axScreenReader\)\s*\{\s*process\.env\.CLAUDE_CODE_ACCESSIBILITY = '1';?\s*\}/
    expect(re.test(mainSrc)).toBe(true)
  })

  it('该环境变量仍被 Ink 层消费（映射不是死代码）', () => {
    const hits = appSrc.match(/CLAUDE_CODE_ACCESSIBILITY/g) ?? []
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })
})
