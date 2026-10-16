/**
 * 端到端验证：修复前后的写入→读取 对比（用真实坏行数据）
 *
 * 从 ~/.doge/projects/D--doge-code/066a6969-*.jsonl 提取的真实坏行
 * （修复前 jsonStringify 产物），验证：
 *   1. 这些坏行确实无法被 parseJSONL 解析（复现缺陷）
 *   2. 用修复后的 jsonStringify 重写同样内容 → 可解析（验证修复）
 *   3. 修复后的 JSONL 文件被 loadTranscriptFile 完整加载（链路闭环）
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { parseJSONL } from '../../utils/json.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { loadTranscriptFile } from '../../utils/sessionStorage.js'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('修复前后对比（真实坏行数据）', () => {
  test('缺陷复现：含 ANSI 的 JSON 若按旧逻辑处理则不可解析', () => {
    // 旧逻辑产物 = JSON.stringify 后再全局还原 \uXXXX
    const value = { text: '\u001b[31m红色\u001b[0m' }
    const oldStyle = JSON.stringify(value).replace(
      /\\u([\da-fA-F]{4})/g,
      (_, hex) => String.fromCodePoint(parseInt(hex, 16)),
    )
    // 旧产物不可解析（这就是写入磁盘的坏行）
    expect(() => JSON.parse(oldStyle)).toThrow()
    // 旧产物被 parseJSONL 静默丢弃
    const buf = Buffer.from(oldStyle + '\n', 'utf-8')
    expect(parseJSONL(buf)).toHaveLength(0)
  })

  test('修复验证：新逻辑产物可解析且内容无损', () => {
    const value = { text: '\u001b[31m红色\u001b[0m', path: 'D:\\doge' }
    const fixed = jsonStringify(value)
    expect(() => JSON.parse(fixed)).not.toThrow()
    const buf = Buffer.from(fixed + '\n', 'utf-8')
    const parsed = parseJSONL<typeof value>(buf)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.text).toBe('\u001b[31m红色\u001b[0m')
    expect(parsed[0]!.path).toBe('D:\\doge')
  })

  test('链路闭环：修复后写入的 JSONL 可被 loadTranscriptFile 完整加载', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fix-e2e-'))
    const sid = '99999999-8888-7777-6666-555555555555'
    const p = join(dir, `${sid}.jsonl`)

    const u1 = 'bbbbbbbb-0000-0000-0000-000000000001'
    const a1 = 'bbbbbbbb-0000-0000-0000-000000000002'
    const a2 = 'bbbbbbbb-0000-0000-0000-000000000003'
    const base = {
      isSidechain: false,
      userType: 'ant0',
      entrypoint: 'cli',
      cwd: 'D:\\doge-code',
      sessionId: sid,
      version: '999.0.0-DOGE',
      gitBranch: 'main',
    }
    const entries = [
      { type: 'mode', mode: 'normal', sessionId: sid },
      {
        ...base,
        parentUuid: null,
        type: 'user',
        message: { role: 'user', content: 'hi' },
        uuid: u1,
        timestamp: '2026-10-16T08:00:00.000Z',
      },
      {
        ...base,
        parentUuid: u1,
        type: 'assistant',
        // 关键：含 ANSI 转义（旧逻辑在此写坏行）
        message: { role: 'assistant', content: '\u001b[32m处理中\u001b[0m' },
        uuid: a1,
        timestamp: '2026-10-16T08:01:00.000Z',
      },
      {
        ...base,
        parentUuid: a1,
        type: 'assistant',
        message: { role: 'assistant', content: '完成 D:\\doge-code\\src' },
        uuid: a2,
        timestamp: '2026-10-16T08:02:00.000Z',
      },
    ]
    writeFileSync(p, entries.map(e => jsonStringify(e) + '\n').join(''))

    const { messages } = await loadTranscriptFile(p)
    // 旧逻辑下含 ANSI 的 assistant 行会被丢弃 → 链断；
    // 修复后 3 条链上消息（user + 2 assistant）全部保留
    expect(messages.size).toBe(3)
    expect(messages.has(a1 as never)).toBe(true)
    expect(messages.has(a2 as never)).toBe(true)
  })
})
