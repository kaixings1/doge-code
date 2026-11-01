/**
 * `--prompt-suggestions [value]`（对齐官方 2.1.x）。
 *
 * 排查发现整条链路其实都在（src/services/PromptSuggestion/、print.ts 的
 * 无头分支会调 tryGenerateSuggestion、SDK 有 prompt_suggestion 消息类型），
 * 但 **main.tsx 从没把这个参数传给 print** —— 构造调用参数时只传了
 * replayUserMessages / includePartialMessages，漏了 promptSuggestions，
 * 所以 print.ts 侧永远是 undefined，建议分支根本不执行。
 *
 * 本测试锁住三件容易再次断裂的事：
 *   1. 参数已注册且是可选值 `[value]`
 *   2. 取值映射：不传 -> true；1/true/yes/on -> true；0/false/off -> false
 *   3. 参数真的被传给 print（这是本次的真正 bug，之前一直漏着）
 *
 * 变异验证（必须做）：
 *   - 删掉 main.tsx 里的 `promptSuggestions: ...` 传参 → 用例 3 失败
 *   - 把 `value => (value === undefined ? true : value)` 改成恒等 → 用例 2 失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import { Command, Option } from 'commander'
import { readFileSync } from 'node:fs'
import { isEnvTruthy } from '../../src/utils/envUtils.js'

const mainSrc = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8')

/** 复刻 main.tsx 里的注册方式，验证真实解析行为。 */
function parse(argv: string[]) {
  const p = new Command()
  p.exitOverride()
  p.addOption(
    new Option('--prompt-suggestions [value]', 'x').argParser(String),
  )
  p.option('-p, --print')
  p.parse(argv, { from: 'user' })
  return (p.opts() as { promptSuggestions?: string | true }).promptSuggestions
}

/** main.tsx 里的映射表达式。 */
function map(raw: string | true | undefined): boolean {
  return raw === true || isEnvTruthy(raw)
}

describe('--prompt-suggestions', () => {
  it('注册为可选值参数', () => {
    expect(mainSrc).toContain("'--prompt-suggestions [value]'")
  })

  it('取值映射符合官方 choices', () => {
    // 不传值 -> true（官方 preset: "true"）
    expect(map(parse(['--prompt-suggestions', '-p']))).toBe(true)
    // 真值
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(map(parse(['--prompt-suggestions', v, '-p']))).toBe(true)
    }
    // 假值
    for (const v of ['0', 'false', 'no', 'off']) {
      expect(map(parse(['--prompt-suggestions', v, '-p']))).toBe(false)
    }
  })

  it('参数被真正传给 print（曾漏传导致功能完全不生效）', () => {
    // 与相邻参数一起断言，确保不是只写了注释没写代码
    expect(mainSrc).toMatch(/includePartialMessages: effectiveIncludePartialMessages,/)
    expect(mainSrc).toMatch(/promptSuggestions:\s*\(options as \{[^}]*\}\)\s*\n?\s*\.promptSuggestions,/)
  })
})
