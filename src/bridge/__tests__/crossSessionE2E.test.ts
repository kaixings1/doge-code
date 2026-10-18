import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { deliverMessageToSession, discoverSessions } from '../sessionDiscovery.js'

// W32 微提交4：端到端变异测试。
// 起一个仿本地桥的内存 HTTP 服务器，验证投递路径与防回灌边界。
// 真实双 WS 回灌场景（两终端）按设计文档手测，这里覆盖 REST 层闭环。

function startMockBridge(): Promise<{ server: Server; baseUrl: string; deliveries: any[] }> {
  const deliveries: any[] = []
  const sessions = [
    { id: 'sid-alice', metadata: { name: 'alice' } },
    { id: 'sid-bob', metadata: { name: 'bob' } },
  ]
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'GET' && url.pathname === '/v1/code/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ sessions, total: sessions.length }))
      return
    }
    const m = url.pathname.match(/^\/v1\/code\/sessions\/([^/]+)\/message$/)
    if (req.method === 'POST' && m) {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}')
        deliveries.push({ target: m[1], ...parsed })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, deliveries })
    })
  })
}

// 让 sessionDiscovery 走 mock 服务器而非 localhost:5678。
function withBaseUrl(baseUrl: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
  process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = baseUrl
  return fn().finally(() => {
    if (prev === undefined) delete process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
    else process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = prev
  })
}

describe('跨会话投递端到端（REST 层）', () => {
  let ctx: { server: Server; baseUrl: string; deliveries: any[] }

  beforeAll(async () => {
    ctx = await startMockBridge()
  })
  afterAll(() => {
    ctx.server.close()
  })

  it('会话发现解析出 alice/bob 的 name→id', async () => {
    await withBaseUrl(ctx.baseUrl, async () => {
      const map = await discoverSessions('sid-alice')
      expect(map.get('bob')).toBe('sid-bob')
      expect(map.has('alice')).toBe(false) // 排除自身
    })
  })

  it('A 投递给 B：POST 到 B 的 /message，带 content/fromSessionId', async () => {
    await withBaseUrl(ctx.baseUrl, async () => {
      const ok = await deliverMessageToSession(
        'sid-bob',
        'hi bob',
        'sid-alice',
      )
      expect(ok).toBe(true)
      expect(ctx.deliveries).toContainEqual({
        target: 'sid-bob',
        content: 'hi bob',
        fromSessionId: 'sid-alice',
      })
    })
  })

  it('防回灌：投递只发一次，不抄送投递方自己', async () => {
    // 变异测试核心：若 deliverMessageToSession 误把消息也 POST 给自己
    // （复制一份 target=sid-alice），则 deliveries 会出现 sid-alice 记录。
    await withBaseUrl(ctx.baseUrl, async () => {
      ctx.deliveries.length = 0
      await deliverMessageToSession('sid-bob', 'x', 'sid-alice')
      // 只有一条投递，目标为 sid-bob，绝不含 sid-alice 作为目标
      expect(ctx.deliveries).toHaveLength(1)
      expect(ctx.deliveries[0].target).toBe('sid-bob')
      expect(ctx.deliveries[0].target).not.toBe('sid-alice')
    })
  })
})
