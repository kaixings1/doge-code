import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { WebSocket } from 'ws'
import { discoverSessions, deliverMessageToSession } from '../sessionDiscovery.js'

// W32 WS 层端到端防回灌复现（对齐 .dogerules 广播回灌环路守则）。
// 起真实本地桥服务器（bun run scripts/bridge.ts），注册 A/B 两个 session，
// 各自以裸 WS 客户端订阅自己的 ingress；A 经 REST 投递给 B，断言：
//   B 收到 type:'user' 消息；A 的连接绝不收到自己的回声（服务器端 broadcast
//   只发给目标订阅者 + 客户端 isOutboundEcho 双保险）。
//
// 固定端口 5679，避免与开发中的 5678 冲突；单机串行运行。
const BRIDGE_PORT = 5679
const BASE_URL = `http://127.0.0.1:${BRIDGE_PORT}`
const WS_BASE = `ws://127.0.0.1:${BRIDGE_PORT}`

let bridge: ChildProcess

async function waitForBridge(timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return
    } catch {
      // 尚未就绪
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('bridge server did not start in time')
}

async function registerSession(name: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/code/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { role: 'host', name } }),
  })
  const body = (await res.json()) as { id?: string }
  if (!body.id) throw new Error(`register failed: ${JSON.stringify(body)}`)
  return body.id
}

function connectWs(sessionId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/session-ingress/${sessionId}`)
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5000)
    ws.on('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

function collectMessages(ws: WebSocket, timeoutMs = 3000): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs: any[] = []
    const timer = setTimeout(() => resolve(msgs), timeoutMs)
    ws.on('message', (data) => {
      try {
        msgs.push(JSON.parse(data.toString()))
      } catch {
        // 忽略非 JSON
      }
    })
  })
}

describe('跨会话 WS 端到端防回灌', () => {
  beforeAll(async () => {
    bridge = spawn('bun', ['run', 'scripts/bridge.ts'], {
      env: { ...process.env, PORT: String(BRIDGE_PORT) },
      stdio: 'ignore',
    })
    await waitForBridge()
  }, 20000)

  afterAll(() => {
    bridge?.kill()
  })

  it('A 投递给 B：B 收到 type:user，A 收不到自己回声', async () => {
    const prev = process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
    process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = BASE_URL
    try {
      const aId = await registerSession('alice')
      const bId = await registerSession('bob')

      // 串行创建两个连接（避免并发 upgrade 在服务端的竞态）
      const wsA = await connectWs(aId)
      const wsB = await connectWs(bId)

      // 给订阅传播一点时间，确保两个连接都进入订阅集合
      await new Promise((r) => setTimeout(r, 300))

      // 关键：必须在投递前注册消息监听，否则投递瞬间发出的广播会被错过
      const aCollect = collectMessages(wsA)
      const bCollect = collectMessages(wsB)

      const ok = await deliverMessageToSession(bId, 'hi bob', aId)
      expect(ok).toBe(true)

      const [aMsgs, bMsgs] = await Promise.all([aCollect, bCollect])

      // 双保险核心断言：A 绝不收到 type:'user' 回声
      expect(aMsgs.filter((m) => m.type === 'user')).toHaveLength(0)

      // B 收到投递内容
      const userMsgs = bMsgs.filter((m) => m.type === 'user')
      expect(userMsgs.length).toBeGreaterThanOrEqual(1)
      expect(userMsgs[0].message.content).toBe('hi bob')
      expect(userMsgs[0].message.from_session_id).toBe(aId)

      wsA.close()
      wsB.close()
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
      else process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = prev
    }
  })

  it('discoverSessions 经真实服务器返回 name→id', async () => {
    const prev = process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
    process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = BASE_URL
    try {
      const map = await discoverSessions()
      expect(map.get('alice')).toBeDefined()
      expect(map.get('bob')).toBeDefined()
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL
      else process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL = prev
    }
  })
})
