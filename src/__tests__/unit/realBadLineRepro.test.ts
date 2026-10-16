/**
 * 用真实会话中采集的坏行特征复现修复效果。
 *
 * 采集自 ~/.doge/projects/D--doge-code/066a6969-*.jsonl 的失败行特征：
 *   - 行 58:  Invalid \escape at char 136669（含 Windows 路径反斜杠 + 长文本）
 *   - 行 101: Invalid control character at char 308（含 ESC 等控制字符）
 *   - 行 131: Invalid control character at char 1212
 *
 * 这些行由修复前的 jsonStringify 写入（unescapeUnicode 产物）。
 * 断言：用修复后的 jsonStringify 重新序列化同样内容，必须可解析。
 */
import { describe, expect, test } from 'vitest'
import { jsonStringify } from '../../utils/slowOperations.js'

describe('真实坏行特征复现', () => {
  test('Invalid \\escape 特征：转义文案 + 反斜杠路径', () => {
    // 原坏行头部：{"parentUuid":"...","isSidechain":false,"promptId":"..."}
    // 内容体中既有 \\ 又有 \\u 字面量（模型讨论转义序列时的典型输出）
    const entry = {
      parentUuid: 'b6296652-9307-492d-beac-6b3f910999d6',
      isSidechain: false,
      promptId: '5f1c6972-414c-4acf-8088-d',
      message: {
        role: 'assistant',
        content:
          '在 JS 中用 "\\\\u001b" 表示 ESC，路径写 D:\\\\doge-code\\\\src。' +
          '正则 /\\\\d+/ 匹配数字。',
      },
      sessionId: '066a6969-64a7-4d76-928c-7a0214c4fc59',
      slug: 'peaceful-中转-duckling',
    }
    const s = jsonStringify(entry)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s).parentUuid).toBe(entry.parentUuid)
  })

  test('Invalid control character 特征：ANSI 着色输出', () => {
    const entry = {
      parentUuid: 'a3ac8c80-912c-4090-ba6c-03175d832b0f',
      isSidechain: false,
      message: {
        // 真实场景：测试输出、npm 日志、gradle 日志都带 ANSI
        content: '\u001b[32mPASS\u001b[0m \u001b[31mFAIL\u001b[0m \u001b[1m\x1b[0m',
      },
      slug: 'peaceful-中转-duckling',
    }
    const s = jsonStringify(entry)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s).message.content).toBe(entry.message.content)
  })

  test('长行（>200KB）不因转义处理而损坏', () => {
    // 真实坏行长度 266764 字节
    const big = '\u001b[33m告警\u001b[0m '.repeat(12000)
    const entry = { parentUuid: 'x', content: big }
    const s = jsonStringify(entry)
    expect(s.length).toBeGreaterThan(200000)
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s).content).toBe(big)
  })
})
