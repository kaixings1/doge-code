// 模拟手机：连服务端 → 发一条带 requestId 的 user 消息 → 观察回推帧是否带 sourceUuid
import WebSocket from 'ws'

const rid = 'PROBE-REQ-' + Date.now()
const url = `ws://127.0.0.1:6000/mobile/ws?deviceId=echo-probe&deviceType=android`
const ws = new WebSocket(url)

ws.on('open', () => {
  console.log('OPEN, 发送 requestId =', rid)
  ws.send(JSON.stringify({
    type: 'control', action: 'chat', requestId: rid,
    params: { text: 'echo-probe-test' }, timestamp: Date.now(),
  }))
})

ws.on('message', (d) => {
  const s = d.toString()
  // 只看与本条消息相关的帧
  if (s.includes('echo-probe-test') || s.includes(rid) || s.includes('sourceUuid') || s.includes('client_connected')) {
    console.log('RECV:', s.slice(0, 260))
  }
})
ws.on('error', (e) => console.log('ERR', e.message))
setTimeout(() => { console.log('--- 结束 ---'); process.exit(0) }, 12000)
