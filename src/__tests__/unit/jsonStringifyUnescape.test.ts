/**
 * 复现 unescapeUnicode 破坏 JSON 可解析性
 *
 * 根因：slowOperations.ts:330 `return unescapeUnicode(raw)` 把 JSON.stringify
 * 产出的合法 JSON 中所有 \uXXXX 转义还原为原始字符，导致：
 *   1. 控制字符（ESC \u001b、\u0000 等）变成裸字节 → JSON.parse 报
 *      "Invalid control character"
 *   2. 反斜杠序列被误还原 → "Invalid \escape"
 *
 * 后果：sessionStorage 写入的 JSONL 行不可解析 → parseJSONL 丢弃该行 →
 * parentUuid 链断裂 → --resume 加载不到会话。
 *
 * 本测试直接调用生产函数 jsonStringify，断言其输出必须能被 JSON.parse 还原。
 */
import { describe, expect, test } from 'vitest'
import { jsonStringify } from '../../utils/slowOperations.js'

describe('jsonStringify 必须产出可解析的 JSON', () => {
  test('含 ESC 控制字符（ANSI 转义，日志/终端输出常见）', () => {
    const value = { text: 'hello \u001b[31mred\u001b[0m world' }
    const s = jsonStringify(value)
    // 必须可解析——这是写入 JSONL 的硬要求
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('含反斜杠（Windows 路径、正则）', () => {
    const value = { path: 'D:\\doge-code\\src', re: '\\d+\\w' }
    const s = jsonStringify(value)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('含 ' + '\\u' + 'XXXX 字面文本（用户真的写了转义序列字样）', () => {
    const value = { instruction: 'use \\u001b to reset' }
    const s = jsonStringify(value)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('含中文与 emoji（非 ASCII 不应被破坏）', () => {
    const value = { slug: 'peaceful-中转-duckling', emoji: '🦆' }
    const s = jsonStringify(value)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('含换行/制表/回退等控制字符', () => {
    const value = { text: 'line1\nline2\ttab\r\bbackspace\f\v' }
    const s = jsonStringify(value)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('嵌套结构 + 数组（真实消息体形状）', () => {
    const value = {
      parentUuid: 'aaaa-bbbb',
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking... \u001b[1mbold\u001b[0m' },
          { type: 'tool_use', input: { cmd: 'echo "a\\nb"' } },
        ],
      },
    }
    const s = jsonStringify(value)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s)).toEqual(value)
  })

  test('JSONL 行级写入契约：每行必须以 \\n 结尾且单行可解析', () => {
    const entries = [
      { uuid: '1', text: 'a\u001b b' },
      { uuid: '2', text: 'c\\d' },
    ]
    const payload = entries.map(e => jsonStringify(e) + '\n').join('')
    const lines = payload.split('\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})
