import { describe, it, expect } from 'vitest'

/**
 * 这个测试直接验证 useTextInput.ts 中的 \r 处理逻辑。
 * useTextInput.ts 有大量依赖（React hooks、Cursor、env 等）无法直接 import，
 * 因此这里把核心 regex 逻辑抽出来独立测试，确保 CRLF 兼容性。
 *
 * 逻辑来源：src/hooks/useTextInput.ts 第 399-403 行
 *   const text = stripAnsi(input)
 *     .replace(/\r\n/g, '\n')          // 修复：先规范化 CRLF
 *     .replace(/(?<=[^\\\r\n])\r$/, '')
 *     .replace(/\r/g, '\n')
 */

// 模拟 stripAnsi：去掉 ANSI 转义序列（这里用简单的正则）
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

function processInput(input: string): string {
  return stripAnsi(input)
    .replace(/\r\n/g, '\n')
    .replace(/(?<=[^\\\r\n])\r$/, '')
    .replace(/\r/g, '\n')
}

describe('useTextInput CRLF 处理', () => {
  it('CRLF (\\r\\n) 应该被规范化为单个 \\n，不产生双换行', () => {
    // Windows cmd/PowerShell 默认回车发送 \r\n
    expect(processInput('hello\r\n')).toBe('hello\n')
    expect(processInput('hello\r\nworld\r\n')).toBe('hello\nworld\n')
  })

  it('多行 CRLF 粘贴应该保持行数不变', () => {
    const input = 'line1\r\nline2\r\nline3\r\n'
    expect(processInput(input)).toBe('line1\nline2\nline3\n')
  })

  it('LF only (\\n) 不受影响', () => {
    expect(processInput('hello\n')).toBe('hello\n')
    expect(processInput('hello\nworld\n')).toBe('hello\nworld\n')
  })

  it('裸 CR (\\r) 仍然转换为 \\n', () => {
    // 尾随 \r 被当作 SSH 合并回车剥离
    expect(processInput('hello\r')).toBe('hello')
    // 注意：'a\rb\rc\r' 中最后一个 \r 是尾随的，被剥离 → 'a\nb\nc'
    expect(processInput('a\rb\rc\r')).toBe('a\nb\nc')
    // 嵌入的 \r（不在尾部）会转换为 \n
    expect(processInput('a\rb\rc')).toBe('a\nb\nc')
  })

  it('反斜杠+回车 (Shift+Enter 过期绑定) 保留 \\r', () => {
    // Backslash+\r 是过期的 VS Code Shift+Enter 绑定
    expect(processInput('hello\\\r')).toBe('hello\\\n')
  })

  it('尾随 \\r 在 SSH 合并场景被剥离', () => {
    // SSH 合并的回车 "o\r" — 尾随 \r 被剥离
    expect(processInput('o\r')).toBe('o')
  })

  it('ANSI 转义序列被剥离后再处理 \\r', () => {
    const input = '\x1b[31mhello\x1b[0m\r\n'
    expect(processInput(input)).toBe('hello\n')
  })

  it('混合 CRLF 和裸 CR', () => {
    // a\r\n → a\n, b\rc → b\nc, \r\n → \n, d\r → d (尾随 \r 被剥离)
    expect(processInput('a\r\nb\rc\r\nd\r')).toBe('a\nb\nc\nd')
  })

  it('空字符串不崩溃', () => {
    expect(processInput('')).toBe('')
  })
})