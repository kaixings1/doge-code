import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { EventEmitter } from 'events'

// 共享状态（vitest v3 移除 vi.hoisted，改用 module-level 变量）
const mockState = {
  socketEmitters: new Map<string, EventEmitter>(),
  sentMessages: [] as Array<{ msg: string; port: number; host: string }>,
}

vi.mock('dgram', () => {
  return {
    createSocket: vi.fn((_type: string) => {
      const emitter = new EventEmitter() as any
      emitter.setBroadcast = vi.fn()
      emitter.close = vi.fn()
      emitter.send = vi.fn((msg: string, _off: number, _len: number, port: number, host: string, cb?: () => void) => {
        mockState.sentMessages.push({ msg: msg.toString(), port, host })
        if (cb) cb()
      })
      mockState.socketEmitters.set('last', emitter)
      emitter.bind = vi.fn((cb?: () => void) => {
        if (cb) cb()
      })
      return emitter
    }),
  }
})

let ListPeersTool: any
let tmpDir: string

async function getTool() {
  if (!ListPeersTool) {
    const mod = await import('../../tools/ListPeersTool/ListPeersTool.ts')
    ListPeersTool = mod.ListPeersTool
  }
  return new ListPeersTool()
}

function triggerPeerMessage(addr: string, name: string, data: Record<string, unknown> = {}) {
  const emitter = mockState.socketEmitters.get('last')
  const msg = JSON.stringify({ type: 'doge-peer', name, id: 'peer-x', port: 45678, version: '1.0.0', ...data })
  emitter?.emit('message', Buffer.from(msg), { address: addr, port: 45678 })
}

describe('ListPeersTool', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peers-test-'))
    mockState.sentMessages.length = 0
    mockState.socketEmitters.clear()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('list 无 peers 时返回提示', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'list' }, {})
    const text = result.content[0].text
    expect(text).toContain('No peer connections found')
    expect(text).toContain('action=discover')
  })

  it('add 添加 peer 后 list 能列出', async () => {
    const tool = await getTool()
    const addResult = await tool.execute({ action: 'add', host: '192.168.1.50', name: 'dev-box', port: 45678 }, {})
    expect(addResult.content[0].text).toContain('Added peer: dev-box')

    const listResult = await tool.execute({ action: 'list' }, {})
    expect(listResult.content[0].text).toContain('dev-box')
    expect(listResult.content[0].text).toContain('192.168.1.50')
  })

  it('add 缺 host 时返回错误', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'add', name: 'nohost' }, {})
    expect(result.content[0].text).toContain('Error: host is required')
  })

  it('remove 删除 peer', async () => {
    const tool = await getTool()
    await tool.execute({ action: 'add', host: '10.0.0.5', name: 'to-remove' }, {})
    const rem = await tool.execute({ action: 'remove', name: 'to-remove' }, {})
    expect(rem.content[0].text).toContain('Removed peer: to-remove')

    const listResult = await tool.execute({ action: 'list' }, {})
    expect(listResult.content[0].text).toContain('No peer connections')
  })

  it('remove 不存在的 peer 返回未找到', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'remove', name: 'ghost' }, {})
    expect(result.content[0].text).toContain('Peer not found')
  })

  it('discover 收到 UDP 响应后合并到注册表', async () => {
    const tool = await getTool()
    const promise = tool.execute({ action: 'discover', timeout: 50 }, {})
    setTimeout(() => triggerPeerMessage('192.168.1.88', 'found-peer'), 5)
    const result = await promise
    expect(result.content[0].text).toContain('found-peer')
    expect(result.content[0].text).toContain('192.168.1.88')

    // 已合并到注册表
    const listResult = await tool.execute({ action: 'list' }, {})
    expect(listResult.content[0].text).toContain('found-peer')
  })

  it('discover 无响应时提示未发现', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'discover', timeout: 30 }, {})
    expect(result.content[0].text).toContain('no peers responded')
  })

  it('ping 无响应时返回超时', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'ping', host: '192.168.1.99', timeout: 30 }, {})
    expect(result.content[0].text).toContain('timeout')
  })

  it('ping 收到响应时返回耗时', async () => {
    const tool = await getTool()
    const promise = tool.execute({ action: 'ping', host: '192.168.1.99', timeout: 100 }, {})
    setTimeout(() => {
      const emitter = mockState.socketEmitters.get('last')
      emitter?.emit('message', Buffer.from(JSON.stringify({ type: 'doge-pong' })), { address: '192.168.1.99', port: 45678 })
    }, 5)
    const result = await promise
    expect(result.content[0].text).toMatch(/✅/)
  })

  it('ping 缺 host 时返回错误', async () => {
    const tool = await getTool()
    const result = await tool.execute({ action: 'ping' }, {})
    expect(result.content[0].text).toContain('Error: host is required')
  })
})
