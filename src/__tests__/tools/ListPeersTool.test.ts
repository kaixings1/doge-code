import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import { ListPeersTool } from '../../tools/ListPeersTool/ListPeersTool.ts'

const mockState = {
  sentMessages: [] as Array<{ msg: string; port: number; host: string }>,
}

let socketInstance: any = null

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
      emitter.bind = vi.fn((cb?: () => void) => {
        if (cb) cb()
      })
      socketInstance = emitter
      return emitter
    }),
  }
})

describe('ListPeersTool', () => {
  let tmpDir: string
  let tool: ListPeersTool

  beforeEach(() => {
    mockState.sentMessages.length = 0
    socketInstance = null
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'peers-test-'))
    tool = new ListPeersTool()
    ;(tool as any).peersDir = () => tmpDir
  })

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    vi.restoreAllMocks()
  })

  it('list 无 peers 时返回提示', async () => {
    const result = await tool.execute({ action: 'list' }, {})
    expect(result.content[0].text).toContain('No peer connections found')
    expect(result.content[0].text).toContain('action=discover')
  })

  it('add 添加 peer 后 list 能列出', async () => {
    const addResult = await tool.execute({ action: 'add', host: '192.168.1.50', name: 'dev-box', port: 45678 }, {})
    expect(addResult.content[0].text).toContain('Added peer: dev-box')

    const listResult = await tool.execute({ action: 'list' }, {})
    expect(listResult.content[0].text).toContain('dev-box')
    expect(listResult.content[0].text).toContain('192.168.1.50')
  })

  it('add 缺 host 时返回错误', async () => {
    const result = await tool.execute({ action: 'add', name: 'nohost' }, {})
    expect(result.content[0].text).toContain('Error: host is required')
  })

  it('remove 删除 peer', async () => {
    await tool.execute({ action: 'add', host: '10.0.0.5', name: 'to-remove' }, {})
    const rem = await tool.execute({ action: 'remove', name: 'to-remove' }, {})
    expect(rem.content[0].text).toContain('Removed peer: to-remove')

    const listResult = await tool.execute({ action: 'list' }, {})
    expect(listResult.content[0].text).toContain('No peer connections')
  })

  it('remove 不存在的 peer 返回未找到', async () => {
    const result = await tool.execute({ action: 'remove', name: 'ghost' }, {})
    expect(result.content[0].text).toContain('Peer not found')
  })

  it('discover 收到 UDP 响应后合并到注册表', async () => {
    // 先添加一个 peer
    await tool.execute({ action: 'add', host: '1.2.3.4', name: 'manual-peer' }, {})

    // 模拟 UDP 响应：在 discover 发送广播后触发
    const discoverPromise = tool.execute({ action: 'discover', timeout: 500 }, {})

    // 让事件循环跑一轮后触发响应
    await new Promise(r => setTimeout(r, 50))
    socketInstance?.emit('message',
      Buffer.from(JSON.stringify({ type: 'doge-peer', name: 'found-peer', port: 45678, id: 'peer-abc' })),
      { address: '192.168.1.100', port: 45678 }
    )

    const result = await discoverPromise
    // 验证发现的 peer 被列出
    expect(result.content[0].text).toContain('found-peer')
  })

  it('discover 无响应时提示未发现', async () => {
    const result = await tool.execute({ action: 'discover', timeout: 50 }, {})
    expect(result.content[0].text).toContain('no peers responded')
  })

  it('ping 无响应时返回超时', async () => {
    const result = await tool.execute({ action: 'ping', host: '192.168.1.99', timeout: 50 }, {})
    expect(result.content[0].text).toContain('timeout')
  })

  it('ping 收到响应时返回耗时', async () => {
    const promise = tool.execute({ action: 'ping', host: '192.168.1.99', timeout: 200 }, {})
    setTimeout(() => {
      socketInstance?.emit('message', Buffer.from(JSON.stringify({ type: 'doge-pong' })), { address: '192.168.1.99', port: 45678 })
    }, 5)
    const result = await promise
    expect(result.content[0].text).toMatch(/✅/)
  })

  it('ping 缺 host 时返回错误', async () => {
    const result = await tool.execute({ action: 'ping' }, {})
    expect(result.content[0].text).toContain('Error: host is required')
  })
})
