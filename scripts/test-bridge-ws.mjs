import { WebSocket } from 'ws'

const ws = new WebSocket('ws://localhost:3000/session-ingress/2e65511d-12aa-45c7-8d24-a4c391ce4b7d')

ws.on('open', () => {
  console.log('[WS] Connected!')

  // 发送 ping
  ws.send(JSON.stringify({
    uuid: 'test-ping-1',
    type: 'ping',
    data: {},
    timestamp: Date.now(),
  }))

  // 发送工具请求
  setTimeout(() => {
    ws.send(JSON.stringify({
      uuid: 'test-tool-1',
      type: 'tool:request',
      data: {
        tool: 'filesystem',
        params: { operation: 'list', path: '.' },
        call_id: 'call-1',
      },
      timestamp: Date.now(),
    }))
  }, 500)

  // 发送消息
  setTimeout(() => {
    ws.send(JSON.stringify({
      uuid: 'test-msg-1',
      type: 'message',
      data: { text: 'Hello from test client' },
      timestamp: Date.now(),
    }))
  }, 1000)
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log(`[WS] ${msg.type}:`, JSON.stringify(msg.data || msg).slice(0, 200))
})

ws.on('error', (err) => {
  console.error('[WS] Error:', err.message)
})

ws.on('close', (code, reason) => {
  console.log(`[WS] Closed: ${code} ${reason}`)
  process.exit(0)
})

setTimeout(() => ws.close(), 5000)
