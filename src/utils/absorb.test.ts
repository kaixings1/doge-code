import { describe, it, expect } from 'vitest'
import { absorb, absorbLines, getSessionCompressor } from './absorb.ts'

describe('absorb', () => {
  it('重复段落应吸收为一段', () => {
    expect(absorb('hello world\n\nhello world\n\nhello world')).toBe('hello world')
  })

  it('重复代码块应吸收为一个', () => {
    expect(absorb('function foo() {}\n\nfunction foo() {}\n\nfunction foo() {}')).toBe('function foo() {}')
  })

  it('非重复内容应保留', () => {
    expect(absorb('foo\n\nbar\n\nbaz')).toBe('foo\n\nbar\n\nbaz')
  })

  it('空字符串应返回空', () => {
    expect(absorb('')).toBe('')
  })
})

describe('absorbLines', () => {
  it('应进行行级吸收', () => {
    expect(absorbLines('line1\nline1\nline1\nline2\nline2\nline2', 3)).toBe('line1\nline1\nline2\nline2')
  })
})

describe('SessionCompressor', () => {
  it('连续重复应被压缩', () => {
    const compressor = getSessionCompressor()
    const text = 'tool definition with parameters\n\ntool definition with parameters\n\ntool definition with parameters\n\ntool definition with parameters'
    const result = compressor.feed(text)
    expect(result.length).toBeLessThan(text.length)
  })

  it('超长文本应跳过', () => {
    const longText = 'x'.repeat(600_000)
    const result = absorb(longText)
    expect(result).toBe(longText)
  })
})
