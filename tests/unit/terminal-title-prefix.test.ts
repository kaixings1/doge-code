/**
 * 锁定终端标题前缀的契约——防止 emoji 前缀回归。
 *
 * 真实事故：提交 6d46c2b9f 把原本能显示的 ✳ / ⠂ 换成 emoji 🟩，
 * 此后 Windows Terminal 渲染标签页标题时直接丢弃该 emoji（实测窗口
 * 标题前缀位置只剩一个空格），「结束回答时显示标记」的功能静默失效。
 * 这类失效没有任何报错，只能靠人工看标题栏才能发现，因此用测试锁死。
 *
 * 规则：前缀必须是纯 ASCII 可打印字符，不得含 emoji / 代理对字符。
 * 依据来自实测——同一次抓到的窗口标题里中文能正常渲染，说明 OSC 0
 * 与终端编码都没问题，唯一的变量就是那枚 emoji。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// 直接从源码读取，避免为了可测性改动生产代码的导出结构
const SRC = 'src/screens/REPL.tsx'

function extractPrefix(): string {
  const src = readFileSync(SRC, 'utf8')
  const m = src.match(/const TITLE_IDLE_PREFIX\s*=\s*(['"`])(.*?)\1/)
  if (!m) throw new Error(`未能在 ${SRC} 中找到 TITLE_IDLE_PREFIX`)
  return m[2]!
}

describe('终端标题前缀', () => {
  const prefix = extractPrefix()

  it('存在且非空', () => {
    expect(prefix.length).toBeGreaterThan(0)
  })

  it('不含 emoji / 代理对字符（防 6d46c2b9f 回归）', () => {
    // 代理对区间 U+D800–U+DFFF；emoji 大多落在 U+1F300+ 的补充平面
    // eslint-disable-next-line no-misleading-character-class -- 刻意检测代理对
    const hasSurrogate = /[\uD800-\uDFFF]/.test(prefix)
    expect(hasSurrogate).toBe(false)
  })

  it('不含控制字符，且不落在补充平面（emoji 所在区）', () => {
    // 注意：不要求纯 ASCII。实测窗口标题里中文能正常渲染
    // （[ Claude Code cb62cb02-...] 中的中文），说明 OSC 0 与终端
    // 编码都没问题——当初唯一的变量就是那枚 emoji。故放行 BMP 内的
    // 所有字符（含中文），只禁控制字符与补充平面（U+10000+）。
    for (const ch of prefix) {
      const code = ch.codePointAt(0)!
      expect(code).toBeGreaterThanOrEqual(0x20)
      expect(code).toBeLessThan(0x10000)
    }
  })

  it('拼进标题后仍是合法 OSC 0 序列', async () => {
    const { osc, OSC, ST } = await import('../../src/ink/termio/osc.js')
    const seq = osc(OSC.SET_TITLE_AND_ICON, `${prefix} 分析 adb 设备连接状态 sid`)

    expect(seq.startsWith('\x1b]0;')).toBe(true)
    expect(seq).toContain(prefix)

    // 终止符取决于 env.terminal：kitty 用 ST（ESC \），其余用 BEL。
    // 不能硬编码 BEL —— 其他测试若改动了 TERM_PROGRAM/env.terminal 就会误判。
    expect(seq.endsWith('\x07') || seq.endsWith(ST)).toBe(true)
  })
})
