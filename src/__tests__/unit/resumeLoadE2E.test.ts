/**
 * 端到端复现：--resume 加载中断/压缩后的会话
 *
 * 场景复刻自用户报告：
 *   A. /compact 后 Ctrl+C 再 --resume <id> → 加载不到
 *   B. 正在输出时 Ctrl+C 再 --resume <id> → 加载不到
 *
 * 本测试直接调用生产函数 loadTranscriptFile，用真实 JSONL 布局构造磁盘文件，
 * 断言其返回的 messages Map 是否为空（空 = --resume 报"未找到会话"）。
 *
 * 关键：不复刻生产逻辑，直接调用生产函数。变异测试：删掉最后一条
 * assistant 的 parentUuid 链 → 观察是否仍能加载。
 */
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { loadTranscriptFile } from '../../utils/sessionStorage.js'

const SID = '11111111-2222-3333-4444-555555555555'
const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const A1 = 'aaaaaaaa-0000-0000-0000-000000000002'
const USER2 = 'aaaaaaaa-0000-0000-0000-000000000003'
const PARTIAL = 'aaaaaaaa-0000-0000-0000-000000000004'
const BOUNDARY = 'aaaaaaaa-0000-0000-0000-000000000005'
const SUMMARY = 'aaaaaaaa-0000-0000-0000-000000000006'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

/** 写入 JSONL 并返回路径 */
function writeSession(lines: unknown[]): string {
  dir = mkdtempSync(join(tmpdir(), 'resume-probe-'))
  const p = join(dir, `${SID}.jsonl`)
  writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  return p
}

const base = {
  isSidechain: false,
  userType: 'ant0',
  entrypoint: 'cli',
  cwd: 'D:\\doge-code',
  sessionId: SID,
  version: '999.0.0-DOGE',
  gitBranch: 'main',
}

const t0 = '2026-10-16T08:00:00.000Z'
const t1 = '2026-10-16T08:01:00.000Z'
const t2 = '2026-10-16T08:02:00.000Z'
const t3 = '2026-10-16T08:03:00.000Z'

describe('端到端：--resume 加载中断/压缩会话', () => {
  test('场景 A：/compact 后中断，磁盘含 boundary+summary → 能加载', async () => {
    const p = writeSession([
      { type: 'mode', mode: 'normal', sessionId: SID },
      { ...base, parentUuid: null, type: 'user', message: { role: 'user', content: 'hi' }, uuid: U1, timestamp: t0 },
      { ...base, parentUuid: U1, type: 'assistant', message: { role: 'assistant', content: 'hello' }, uuid: A1, timestamp: t1 },
      // compact boundary：parentUuid 被置为 null（见 sessionStorage:1078）
      { ...base, parentUuid: null, logicalParentUuid: A1, type: 'system', subtype: 'compact_boundary', content: 'compacted', uuid: BOUNDARY, timestamp: t2 },
      { ...base, parentUuid: BOUNDARY, type: 'user', message: { role: 'user', content: 'summary' }, uuid: SUMMARY, timestamp: t2 },
      // 中断产生的 partial assistant
      { ...base, parentUuid: SUMMARY, type: 'assistant', message: { role: 'assistant', content: 'partial...' }, uuid: PARTIAL, timestamp: t3 },
    ])
    const { messages } = await loadTranscriptFile(p)
    expect(messages.size).toBeGreaterThan(0)
  })

  test('场景 B：输出中中断，最后一条是 assistant → 能加载', async () => {
    const p = writeSession([
      { type: 'mode', mode: 'normal', sessionId: SID },
      { ...base, parentUuid: null, type: 'user', message: { role: 'user', content: 'hi' }, uuid: U1, timestamp: t0 },
      { ...base, parentUuid: U1, type: 'assistant', message: { role: 'assistant', content: 'partial out' }, uuid: A1, timestamp: t1 },
    ])
    const { messages } = await loadTranscriptFile(p)
    expect(messages.size).toBe(2)
  })

  test('变异1：最后一行 JSON 被截断（强制终止）→ 前面的消息仍能加载', async () => {
    dir = mkdtempSync(join(tmpdir(), 'resume-probe-'))
    const p = join(dir, `${SID}.jsonl`)
    const full = [
      { type: 'mode', mode: 'normal', sessionId: SID },
      { ...base, parentUuid: null, type: 'user', message: { role: 'user', content: 'hi' }, uuid: U1, timestamp: t0 },
    ]
    // 故意写一个不完整的最后一行（模拟写到一半被 kill）
    writeFileSync(
      p,
      full.map(l => JSON.stringify(l)).join('\n') +
        '\n{"type":"assistant","parentUuid":"' + U1 + '","message":{"role":"assist',
    )
    const { messages } = await loadTranscriptFile(p)
    // 坏行被跳过，前面的 user 消息应保留 → 非空
    expect(messages.size).toBe(1)
  })

  test('变异2：会话只有 metadata 无任何消息 → 加载为空（等价 --resume 报未找到）', async () => {
    const p = writeSession([
      { type: 'mode', mode: 'normal', sessionId: SID },
    ])
    const { messages } = await loadTranscriptFile(p)
    expect(messages.size).toBe(0)
  })
})
