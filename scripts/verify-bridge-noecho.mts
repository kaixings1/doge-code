/**
 * 端到端验证：本地桥接服务器不再把消息回灌给发送者。
 *
 * 复现死循环的最小场景 —— 两个 host 连到同一 session，
 * A 发一条 message，断言：
 *   - A 自己【收不到】该消息（修复前会收到，导致 enqueue 自我触发 query）
 *   - B 【能收到】该消息（正常转发功能未被误伤）
 *
 * 用法（服务器未运行时自动跳过）：
 *
 *   1) 对正在运行的服务器验证（默认 5678，可能是旧代码进程）：
 *        bun run scripts/verify-bridge-noecho.mts
 *      —— 若输出「失败：发送者仍收到自己的消息」，说明该服务器是修复前的旧进程，
 *         需重启（重跑 d.bat）后再验。
 *
 *   2) 对自建的修复版实例验证（不干扰 5678）：
 *        set PORT=5679 && bun run scripts/bridge.ts   （另开一个窗口）
 *        set PORT=5679 && bun run scripts/verify-bridge-noecho.mts
 *
 * 副作用：在目标服务器上临时创建一个 noecho-verify 会话，脚本结束前会 DELETE 清理。
 */

import { WebSocket } from 'ws'

// 端口可配：用 PORT 指向自建的修复版实例，避免干扰正在运行的开发服务器
const PORT = process.env.PORT || '5678'
const BASE = `http://localhost:${PORT}`
const WS_BASE = `ws://localhost:${PORT}`

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

async function registerSession(name: string): Promise<string | null> {
  const res = await fetch(`${BASE}/v1/code/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { role: 'host', name } }),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { id?: string }
  return typeof body.id === 'string' ? body.id : null
}

function connect(sessionId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/session-ingress/${sessionId}`)
    const t = setTimeout(() => reject(new Error('连接超时')), 5000)
    ws.on('open', () => {
      clearTimeout(t)
      resolve(ws)
    })
    ws.on('error', reject)
  })
}

async function main() {
  if (!(await serverUp())) {
    console.warn('[skip] 桥接服务器未运行 (localhost:5678)，跳过端到端验证')
    process.exit(0)
  }

  const sessionId = await registerSession('noecho-verify')
  if (!sessionId) {
    console.error('✗ 会话注册失败')
    process.exit(1)
  }

  // 同一 session 上开两个连接：真实场景是 host（CLI）+ controller（手机）
  const a = await connect(sessionId)
  const b = await connect(sessionId)

  const aGot: string[] = []
  const bGot: string[] = []
  a.on('message', d => {
    const m = JSON.parse(d.toString())
    if (m.type === 'message') aGot.push(JSON.stringify(m.data))
  })
  b.on('message', d => {
    const m = JSON.parse(d.toString())
    if (m.type === 'message') bGot.push(JSON.stringify(m.data))
  })

  await new Promise(r => setTimeout(r, 200))

  // A 发一条带 direction:'outbound' 的消息（模拟 writeMessages 的外发格式）
  const payload = { type: 'user', message: { role: 'user', content: 'hi' }, direction: 'outbound' }
  a.send(JSON.stringify({ uuid: 'verify-uuid-1', type: 'message', data: payload }))

  await new Promise(r => setTimeout(r, 500))

  const aEchoed = aGot.length > 0
  const bReceived = bGot.length > 0

  console.log(`A 收到的回声数: ${aGot.length}（期望 0）`)
  console.log(`B 收到的转发数: ${bGot.length}（期望 ≥1）`)

  a.close()
  b.close()

  // 清理本脚本创建的会话，避免在开发服务器上留痕（失败不影响验证结论）
  try {
    await fetch(`${BASE}/v1/code/sessions/${sessionId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(1000),
    })
  } catch {
    /* 清理失败不视为验证失败 */
  }

  if (aEchoed) {
    console.error('✗ 失败：发送者仍收到自己的消息 —— 回灌未修复')
    process.exit(1)
  }
  if (!bReceived) {
    console.error('✗ 失败：其他订阅者未收到转发 —— 误伤正常转发')
    process.exit(1)
  }
  console.log('✓ 通过：发送者无回声，其他订阅者正常收到')
}

main().catch(e => {
  console.error('✗ 验证异常:', e)
  process.exit(1)
})
