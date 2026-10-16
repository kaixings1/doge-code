/**
 * 契约测试：会话 JSONL 写入 → 读取 全链路必须无损
 *
 * 这是修复 slowOperations.jsonStringify 的回归保护：
 * 写入端（jsonStringify）与读取端（parseJSONL 用原生 JSON.parse）
 * 必须就"转义约定"达成一致。曾经写入端多做了一次 unescapeUnicode，
 * 把 JSON 语法必需的控制字符转义还原成裸字节，导致读取端整行丢弃。
 *
 * 覆盖面（对应真实会话内容）：
 *  - ANSI 转义（工具输出/终端日志，含 ESC 0x1b）
 *  - Windows 路径反斜杠（cwd 字段）
 *  - 中文 / emoji（slug、消息正文）
 *  - NUL / 其他 C0 控制字符（二进制工具输出）
 *  - 嵌套工具调用参数
 */
import { describe, expect, test } from 'vitest'
import { jsonStringify } from '../../utils/slowOperations.js'
import { parseJSONL } from '../../utils/json.js'

describe('会话 JSONL 写入/读取 roundtrip', () => {
  /** 模拟 sessionStorage 的写入：逐条 stringify + \n */
  function writeJsonl(entries: unknown[]): string {
    return entries.map(e => jsonStringify(e) + '\n').join('')
  }

  test('ANSI 转义 + 中文 + Windows 路径 全链路无损', () => {
    const entries = [
      { uuid: 'u1', type: 'user', cwd: 'D:\\doge-code', text: '你好' },
      {
        uuid: 'u2',
        type: 'assistant',
        text: '\u001b[31m红色错误\u001b[0m 与 \u001b[1m粗体\u001b[0m',
      },
    ]
    const buf = Buffer.from(writeJsonl(entries), 'utf-8')
    const parsed = parseJSONL<{ uuid: string; text?: string }>(buf)
    // 关键：坏行会被静默丢弃，因此数量必须精确匹配
    expect(parsed).toHaveLength(2)
    expect(parsed[1]!.text).toBe('\u001b[31m红色错误\u001b[0m 与 \u001b[1m粗体\u001b[0m')
  })

  test('C0 控制字符（NUL/BEL/BS）不破坏后续行', () => {
    const entries = [
      { uuid: 'a', bin: 'a\u0000b\u0007c\bd' },
      { uuid: 'b', ok: true },
    ]
    const buf = Buffer.from(writeJsonl(entries), 'utf-8')
    const parsed = parseJSONL<{ uuid: string; bin?: string; ok?: boolean }>(buf)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.bin).toBe('a\u0000b\u0007c\bd')
    expect(parsed[1]!.ok).toBe(true)
  })

  test('嵌套 tool_use 参数含反斜杠与换行', () => {
    const entries = [
      {
        uuid: 'x',
        message: {
          content: [
            {
              type: 'tool_use',
              input: { cmd: 'echo "line1\\nline2"', path: 'C:\\Users\\a' },
            },
          ],
        },
      },
    ]
    const buf = Buffer.from(writeJsonl(entries), 'utf-8')
    const parsed = parseJSONL<{ uuid: string }>(buf)
    expect(parsed).toHaveLength(1)
  })

  test('大批量写入不产生任何被丢弃的行（模拟长会话）', () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({
      uuid: `uuid-${i}`,
      type: i % 2 ? 'assistant' : 'user',
      text: i % 7 === 0 ? `\u001b[3${i % 8}m着色${i}\u001b[0m` : `普通文本 ${i}`,
      cwd: 'D:\\doge-code',
    }))
    const buf = Buffer.from(writeJsonl(entries), 'utf-8')
    const parsed = parseJSONL<{ uuid: string }>(buf)
    expect(parsed).toHaveLength(500)
    expect(parsed[499]!.uuid).toBe('uuid-499')
  })
})
