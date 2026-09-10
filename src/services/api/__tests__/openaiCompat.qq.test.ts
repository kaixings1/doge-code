import { describe, it, expect, beforeAll, afterAll } from 'vitest'

/**
 * 测试 CLAUDE_CODE_QQ 环境变量兼容逻辑。
 * openaiCompat.ts 依赖 @anthropic-ai/sdk 等重型模块无法直接 import，
 * 因此这里把核心 regex 逻辑抽出来独立测试。
 *
 * 逻辑来源：src/services/api/openaiCompat.ts
 *   const qqMode = process.env.CLAUDE_CODE_QQ === '1'
 *   const outText = qqMode ? text.replace(/\r\n|\r|\n/g, '') : text
 */

function processText(text: string, qqMode: boolean): string {
  return qqMode ? text.replace(/\r\n|\r|\n/g, '') : text
}

describe('CLAUDE_CODE_QQ 兼容模式', () => {
  const original = process.env.CLAUDE_CODE_QQ

  afterAll(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_QQ
    else process.env.CLAUDE_CODE_QQ = original
  })

  it('默认模式（未设置 CLAUDE_CODE_QQ）保留换行', () => {
    delete process.env.CLAUDE_CODE_QQ
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(qqMode).toBe(false)
    expect(processText('hello\nworld\n', qqMode)).toBe('hello\nworld\n')
  })

  it('CLAUDE_CODE_QQ=1 去掉所有换行', () => {
    process.env.CLAUDE_CODE_QQ = '1'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(qqMode).toBe(true)
    expect(processText('你好\n我是 Claude\n', qqMode)).toBe('你好我是 Claude')
  })

  it('CLAUDE_CODE_QQ=1 多个换行全部去掉', () => {
    process.env.CLAUDE_CODE_QQ = '1'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(processText('a\n\nb\n\nc\n', qqMode)).toBe('abc')
  })

  it('CLAUDE_CODE_QQ=1 去掉 CRLF 换行（Windows 回车）', () => {
    process.env.CLAUDE_CODE_QQ = '1'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(processText('你好\r\n世界\r\n', qqMode)).toBe('你好世界')
  })

  it('CLAUDE_CODE_QQ=1 去掉裸 CR（旧 Mac 回车）', () => {
    process.env.CLAUDE_CODE_QQ = '1'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(processText('hello\rworld\r', qqMode)).toBe('helloworld')
  })

  it('CLAUDE_CODE_QQ=1 空字符串不崩溃', () => {
    process.env.CLAUDE_CODE_QQ = '1'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(processText('', qqMode)).toBe('')
  })

  it('CLAUDE_CODE_QQ=0 不启用（非 1 字符串）', () => {
    process.env.CLAUDE_CODE_QQ = '0'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(qqMode).toBe(false)
    expect(processText('hello\nworld\n', qqMode)).toBe('hello\nworld\n')
  })

  it('CLAUDE_CODE_QQ=2 不启用', () => {
    process.env.CLAUDE_CODE_QQ = '2'
    const qqMode = process.env.CLAUDE_CODE_QQ === '1'
    expect(qqMode).toBe(false)
  })
})