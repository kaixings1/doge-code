/**
 * 飞书长连接配对回归测试（一次性配对码 + 持久化绑定）。
 *
 * 变异验证：
 *   - 去掉 PairingSession.consume 里的 `this.code = null`（码可复用）→ 用例 3 失败
 *   - 去掉 TTL 检查 → 用例 4 失败
 *   - 去掉 codeMatches 的长度检查 → 用例 5 失败
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PAIRING_CODE_LENGTH,
  PairingSession,
  codeMatches,
  generatePairingCode,
  parsePairCommand,
  readBindings,
  removeBinding,
  saveBinding,
} from '../../src/services/feishu/pairing.js'

let root: string
let bindPath: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'doge-feishu-bind-'))
  bindPath = join(root, 'feishu-bind.json')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('配对码生成与解析', () => {
  it('生成长度固定的纯数字码', () => {
    const code = generatePairingCode()
    expect(code).toHaveLength(PAIRING_CODE_LENGTH)
    expect(/^\d+$/.test(code)).toBe(true)
  })

  it('解析 /pair 123456、pair 123456、纯数字', () => {
    expect(parsePairCommand('/pair 123456')).toBe('123456')
    expect(parsePairCommand('PAIR 654321')).toBe('654321')
    expect(parsePairCommand(' 123456 ')).toBe('123456')
  })

  it('普通对话不会被误判为配对指令', () => {
    expect(parsePairCommand('你好')).toBeNull()
    expect(parsePairCommand('12345')).toBeNull()
    expect(parsePairCommand('1234567')).toBeNull()
    expect(parsePairCommand('/help 123456')).toBeNull()
  })

  it('codeMatches 长度不同直接判否', () => {
    expect(codeMatches('123456', '123456')).toBe(true)
    expect(codeMatches('123456', '12345')).toBe(false)
    expect(codeMatches('123456', '654321')).toBe(false)
  })
})

describe('PairingSession 生命周期', () => {
  it('issue 在有效期内返回同一个码', () => {
    const s = new PairingSession({ random: () => 0.1 })
    expect(s.issue(1000)).toBe(s.issue(2000))
  })

  it('成功消费后立即失效（不可复用）', () => {
    const s = new PairingSession({ random: () => 0.5 })
    const code = s.issue(0)
    expect(s.consume(code, 100)).toBe(true)
    expect(s.consume(code, 200)).toBe(false)
    expect(s.current(300)).toBeNull()
  })

  it('过期后拒绝', () => {
    const s = new PairingSession({ ttlMs: 1000, random: () => 0.9 })
    const code = s.issue(0)
    expect(s.consume(code, 1001)).toBe(false)
  })

  it('错误码不消耗正确码', () => {
    const s = new PairingSession({ random: () => 0 })
    const code = s.issue(0)
    expect(s.consume('999999', 10)).toBe(false)
    expect(s.current(20)).toBe(code)
  })
})

describe('绑定持久化', () => {
  it('写入后可读回，同 chat 覆盖', async () => {
    saveBinding(
      { chatId: 'c1', chatType: 'p2p', openId: 'u1', boundAt: '2026-10-20T00:00:00.000Z' },
      bindPath,
    )
    saveBinding(
      { chatId: 'c1', chatType: 'group', openId: 'u1', boundAt: '2026-10-20T01:00:00.000Z' },
      bindPath,
    )
    const store = readBindings(bindPath)
    expect(store.bindings).toHaveLength(1)
    expect(store.bindings[0]!.chatType).toBe('group')
  })

  it('解除绑定只删目标 chat', async () => {
    saveBinding(
      { chatId: 'c2', chatType: 'p2p', openId: 'u2', boundAt: '2026-10-20T00:00:00.000Z' },
      bindPath,
    )
    const left = removeBinding('c2', bindPath)
    expect(left.map(b => b.chatId)).not.toContain('c2')
    expect(left.map(b => b.chatId)).toContain('c1')
  })

  it('文件损坏时返回空绑定而不是抛错', async () => {
    const bad = join(root, 'bad.json')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(bad, '{not json', 'utf-8')
    expect(readBindings(bad).bindings).toEqual([])
  })

  it('绑定文件不含密钥字段', async () => {
    const raw = await readFile(bindPath, 'utf-8')
    expect(raw).not.toMatch(/secret|appSecret|FEISHU_APP_SECRET/i)
  })
})
