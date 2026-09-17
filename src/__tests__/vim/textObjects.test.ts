import { describe, it, expect } from 'vitest'
import { findTextObject } from '../../vim/textObjects.ts'

/**
 * findTextObject 是纯函数（text, offset, objectType, isInner），
 * 此前覆盖率为 0。本文件按 vim 真实语义验证边界。
 */
const slice = (text: string, r: { start: number; end: number } | null) =>
  r === null ? null : text.slice(r.start, r.end)

describe('findTextObject - 空格与空文本边界', () => {
  it('空文本不应抛异常（iw）', () => {
    expect(() => findTextObject('', 0, 'w', true)).not.toThrow()
  })

  it('空文本不应抛异常（aw）', () => {
    expect(() => findTextObject('', 0, 'w', false)).not.toThrow()
  })

  it('空文本不应抛异常（iW / aW）', () => {
    expect(() => findTextObject('', 0, 'W', true)).not.toThrow()
    expect(() => findTextObject('', 0, 'W', false)).not.toThrow()
  })

  it('全空白文本不应抛异常', () => {
    expect(() => findTextObject('   ', 1, 'w', true)).not.toThrow()
  })
})

describe('findTextObject - 单词对象', () => {
  it('iw 选中当前单词', () => {
    expect(slice('foo bar', findTextObject('foo bar', 1, 'w', true))).toBe('foo')
  })

  it('aw 选中单词及后随空格', () => {
    expect(slice('foo bar', findTextObject('foo bar', 1, 'w', false))).toBe('foo ')
  })

  it('iw 在单词尾部仍选中整个单词', () => {
    expect(slice('foo bar', findTextObject('foo bar', 2, 'w', true))).toBe('foo')
  })

  it('iw 在第二单词上正确', () => {
    expect(slice('foo bar', findTextObject('foo bar', 5, 'w', true))).toBe('bar')
  })

  it('aw 在行尾单词（无后随空格）时吞前导空格', () => {
    expect(slice('foo bar', findTextObject('foo bar', 5, 'w', false))).toBe(' bar')
  })

  it('iw 在标点上选中连续标点', () => {
    expect(slice('a...b', findTextObject('a...b', 2, 'w', true))).toBe('...')
  })

  it('iw 在空白上选中空白', () => {
    expect(slice('a   b', findTextObject('a   b', 2, 'w', true))).toBe('   ')
  })

  it('aW 选中非空白串（WORD）', () => {
    expect(slice('a...b c', findTextObject('a...b c', 2, 'W', true))).toBe('a...b')
  })
})

describe('findTextObject - 引号对象', () => {
  const text = 'say "hi" now'

  it('i" 选中引号内容', () => {
    expect(slice(text, findTextObject(text, 5, '"', true))).toBe('hi')
  })

  it('a" 选中引号本身', () => {
    expect(slice(text, findTextObject(text, 5, '"', false))).toBe('"hi"')
  })

  it('i" 在开引号上仍有效', () => {
    expect(slice(text, findTextObject(text, 4, '"', true))).toBe('hi')
  })

  it("i' 使用单引号", () => {
    const t = "say 'hi' now"
    expect(slice(t, findTextObject(t, 6, "'", true))).toBe('hi')
  })

  it('i` 使用反引号', () => {
    const t = 'say `hi` now'
    expect(slice(t, findTextObject(t, 5, '`', true))).toBe('hi')
  })

  it('无引号时返回 null', () => {
    expect(findTextObject('no quotes here', 3, '"', true)).toBeNull()
  })

  it('引号只在本行内配对（跨行时另起配对）', () => {
    const t = '"a\nb"'
    // 第 0 行的 " 未配对（每行独立配对）
    expect(findTextObject(t, 1, '"', true)).toBeNull()
  })
})

describe('findTextObject - 括号对象', () => {
  const text = 'a(b)c'

  it('i( 选中括号内容', () => {
    expect(slice(text, findTextObject(text, 2, '(', true))).toBe('b')
  })

  it('a( 选中括号本身', () => {
    expect(slice(text, findTextObject(text, 2, '(', false))).toBe('(b)')
  })

  it('ib 等价于 i(', () => {
    expect(slice(text, findTextObject(text, 2, 'b', true))).toBe('b')
  })

  it('i) 等价于 i(', () => {
    expect(slice(text, findTextObject(text, 2, ')', true))).toBe('b')
  })

  it('嵌套括号取最近一层', () => {
    const t = 'f(g(h)i)j'
    expect(slice(t, findTextObject(t, 4, '(', true))).toBe('h')
  })

  it('光标在外层括号上取外层', () => {
    const t = 'f(g(h)i)j'
    expect(slice(t, findTextObject(t, 1, '(', true))).toBe('g(h)i')
  })

  it('i{ 与 iB 使用花括号', () => {
    const t = 'x{y}z'
    expect(slice(t, findTextObject(t, 2, '{', true))).toBe('y')
    expect(slice(t, findTextObject(t, 2, 'B', true))).toBe('y')
  })

  it('i[ 使用方括号', () => {
    const t = 'x[y]z'
    expect(slice(t, findTextObject(t, 2, '[', true))).toBe('y')
    expect(slice(t, findTextObject(t, 2, ']', true))).toBe('y')
  })

  it('i< 使用尖括号', () => {
    const t = 'x<y>z'
    expect(slice(t, findTextObject(t, 2, '<', true))).toBe('y')
    expect(slice(t, findTextObject(t, 2, '>', true))).toBe('y')
  })

  it('括号不配对时返回 null', () => {
    expect(findTextObject('a(b', 2, '(', true)).toBeNull()
  })

  it('未知对象类型返回 null', () => {
    expect(findTextObject('abc', 1, 'z', true)).toBeNull()
  })
})
