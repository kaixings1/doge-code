import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

/**
 * /dataviz 技能（对齐官方 v2.1.198）
 *
 * 技能由提示词 + 一个可运行的配色验证器组成。验证器是**可执行代码**，
 * 因此这里不只是断言字符串存在，而是真的把它落盘、用 node 跑，
 * 检查合格/不合格两种输入的输出与退出码。
 */

const SRC = 'D:/doge-code/src/skills/bundled/dataviz.ts'

function extractScript(): string {
  const src = readFileSync(SRC, 'utf8')
  const m = src.match(/const VALIDATE_PALETTE = `([\s\S]*?)`\n/)
  if (!m) throw new Error('未找到 VALIDATE_PALETTE')
  // 模板字符串里的 \\n 是源码转义，运行时段应还原为 \n
  return m[1]!.replace(/\\\\n/g, '\\n').replace(/\\`/g, '`')
}

function runScript(script: string, colors: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'dataviz-'))
  const file = join(dir, 'validate_palette.mjs')
  writeFileSync(file, script)
  try {
    const out = execFileSync(process.execPath, [file, ...colors], { encoding: 'utf8' })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    return { code: err.status ?? -1, out: err.stdout ?? '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('dataviz 技能定义', () => {
  it('注册了 dataviz 技能且可被用户调用', async () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).toContain("name: 'dataviz'")
    expect(src).toContain('userInvocable: true')
    expect(src).toContain('registerDatavizSkill')
  })

  it('已在 bundled/index.ts 中注册', () => {
    const idx = readFileSync('D:/doge-code/src/skills/bundled/index.ts', 'utf8')
    expect(idx).toContain("from './dataviz.js'")
    expect(idx).toContain('registerDatavizSkill()')
  })

  it('提示词覆盖选图、配色、可读性、仪表盘、运行验证器五部分', () => {
    const src = readFileSync(SRC, 'utf8')
    for (const kw of ['先选图形', '颜色', '可读性底线', '仪表盘', '配色验证器']) {
      expect(src, kw).toContain(kw)
    }
  })

  it('技能声明了 validate_palette.mjs 参考文件', () => {
    expect(readFileSync(SRC, 'utf8')).toContain("'validate_palette.mjs': VALIDATE_PALETTE")
  })
})

describe('配色验证器实际运行', () => {
  it('合格色板退出码 0', () => {
    const r = runScript(extractScript(), ['#1f77b4', '#d62728', '#2ca02c'])
    expect(r.out).toContain('全部通过')
    expect(r.code).toBe(0)
  })

  it('白底上太浅的色被判不合格且退出码 1', () => {
    // #ffffee 白底对比度约 1.01:1
    const r = runScript(extractScript(), ['#ffffee'])
    expect(r.out).toContain('不合格')
    expect(r.code).toBe(1)
  })

  it('近似色被判为难以区分', () => {
    const r = runScript(extractScript(), ['#ffffff', '#fffffe'])
    expect(r.out).toContain('过近')
    expect(r.code).toBe(1)
  })

  it('非法颜色给出错误而不是崩溃', () => {
    const r = runScript(extractScript(), ['#zzz'])
    expect(r.out + '').toBeTruthy()
    expect(r.code).toBeGreaterThan(0)
  })

  it('无参数时提示用法', () => {
    const r = runScript(extractScript(), [])
    expect(r.code).toBe(2)
  })
})
