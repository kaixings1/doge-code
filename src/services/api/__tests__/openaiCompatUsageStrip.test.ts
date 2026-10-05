import { describe, it, expect } from 'vitest'
import { stripUsageFromPreview } from '../openaiCompat.js'

// 回归：日志瘦身用的 usage 剥离。真实事故中每个 SSE chunk 都带完整 usage
// （含嵌套的 prompt_tokens_details），使日志膨胀 20~40 倍，淹没正文差异。
// 关键难点：usage 值含嵌套对象，简单正则 `\{[^{}]*\}` 会失配（本次踩过）。
describe('stripUsageFromPreview（日志预览瘦身）', () => {
  it('剥离含嵌套对象的 usage（真实日志形态）', () => {
    const line =
      'data: {"id":"x","choices":[{"index":0,"delta":{"content":"正文"}}],' +
      '"usage":{"prompt_tokens":53521,"completion_tokens":483,' +
      '"prompt_tokens_details":{"cached_tokens":0}},"agent":""}'
    const out = stripUsageFromPreview(line)
    expect(out).not.toContain('53521')
    expect(out).not.toContain('cached_tokens')
    expect(out).toContain('"usage":<omitted>')
    // usage 之后的字段必须保留（裸正则常在这里截断）
    expect(out).toContain('"agent":""')
    // 正文必须完整保留
    expect(out).toContain('"content":"正文"')
  })

  it('usage 值内混有含花括号的字符串时不误判', () => {
    const line = '{"a":1,"usage":{"note":"}","n":2},"tail":true}'
    const out = stripUsageFromPreview(line)
    expect(out).toContain('"usage":<omitted>')
    expect(out).toContain('"tail":true')
  })

  it('不含 usage 时原样返回', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hi"}}]}'
    expect(stripUsageFromPreview(line)).toBe(line)
  })

  it('usage 非对象（null/数值）时不吞后续内容', () => {
    expect(stripUsageFromPreview('{"usage":null,"x":1}')).toContain('"x":1')
    expect(stripUsageFromPreview('{"usage":0,"x":1}')).toContain('"x":1')
  })

  it('多个 usage 全部剥离', () => {
    const line = '{"usage":{"a":1}}mid{"usage":{"b":{"c":2}},"z":3}'
    const out = stripUsageFromPreview(line)
    expect((out.match(/<omitted>/g) ?? []).length).toBe(2)
    expect(out).toContain('"z":3')
  })
})
