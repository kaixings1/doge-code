import { describe, it, expect } from 'vitest'
import { Cursor } from '../../src/utils/Cursor.js'
import { resolveMotion } from '../../src/vim/motions.js'
import { SIMPLE_MOTIONS } from '../../src/vim/types.js'

/**
 * vim `%` motion —— 跳转到匹配的括号（对齐官方 v2.1.301）
 *
 * 直接测生产函数 resolveMotion，不复制匹配算法。
 */
function at(text: string, offset: number): Cursor {
  return new Cursor(Cursor.fromText(text, 80).measuredText, offset)
}

function pos(text: string, offset: number): number {
  return resolveMotion('%', at(text, offset), 1).offset
}

describe('vim % motion', () => {
  it('% 已注册为简单 motion', () => {
    expect(SIMPLE_MOTIONS.has('%')).toBe(true)
  })

  it('光标在 ( 上 → 跳到匹配的 )', () => {
    const t = 'foo(bar)'
    expect(pos(t, 3)).toBe(7)
  })

  it('光标在 ) 上 → 跳到匹配的 (', () => {
    const t = 'foo(bar)'
    expect(pos(t, 7)).toBe(3)
  })

  it('支持嵌套括号', () => {
    // 索引：a=0 (=1 b=2 (=3 c=4 )=5 d=6 )=7 e=8
    const t = 'a(b(c)d)e'
    // 外层 '(' (1) → 外层 ')' (7)
    expect(pos(t, 1)).toBe(7)
    // 内层 '(' (3) → 内层 ')' (5)
    expect(pos(t, 3)).toBe(5)
    // 从内层 ')' 回到内层 '('
    expect(pos(t, 5)).toBe(3)
  })

  it('支持 {} 与 []', () => {
    expect(pos('x{a}b', 1)).toBe(3)
    expect(pos('x[a]b', 1)).toBe(3)
  })

  it('光标不在括号上 → 本行内向后找第一个括号', () => {
    const t = 'abc(def)'
    // 位置 0 的 'a' 不是括号，向后找到位置 3 的 '(' → 匹配位置 7
    expect(pos(t, 0)).toBe(7)
  })

  it('本行没有括号 → 光标不动', () => {
    const t = 'abc\ndef(g)'
    expect(pos(t, 1)).toBe(1)
  })

  it('不匹配的括号 → 光标不动', () => {
    const t = 'a(b'
    expect(pos(t, 1)).toBe(1)
  })

  it('跨行匹配（括号对跨越换行）', () => {
    const t = 'f(\n  x\n)'
    // 位置 1 的 '(' 匹配最后一行的 ')'
    expect(pos(t, 1)).toBe(t.length - 1)
  })

  it('多处括号时从最近的一个开始计数', () => {
    const t = '(a)(b)'
    // 位置 0 的 '(' → 位置 2
    expect(pos(t, 0)).toBe(2)
    // 位置 3 的 '(' → 位置 5
    expect(pos(t, 3)).toBe(5)
  })
})
