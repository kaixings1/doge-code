/**
 * 移动端「重连历史回放」（catch-up）契约测试。
 *
 * 背景（用户报告的缺口）：App 断网 / 切后台期间，电脑端产生的消息实时
 * 广播送不到；重连后服务端若不回放，这段历史在手机上是**永久缺失**的。
 * 修复：设备连上后，服务端把当前会话历史定向回放给**这台**设备，
 * 每条带 `replay: true`，手机端据此去重并免打扰。
 *
 * 本测试钉死三条不变量（任一失效都意味着回放机制坏了）：
 * 1. 注册 provider 后，新连接能收到全部历史帧，且都带 replay 标记
 * 2. 未注册 provider（如非 REPL 模式）时不回放、不崩
 * 3. 回放是**定向**的：不影响已连接的其他设备（不广播）
 */
import { describe, it, expect, afterEach } from 'vitest'
import WebSocket from 'ws'
import {
  MobileBridgeServer,
  registerMobileHistoryProvider,
  getActiveMobileBridgeServer,
} from '../../src/bridge/mobileBridge.js'

type Frame = { type: string; data?: Record<string, unknown> }

/** 连上并等到 client_connected，返回收到的全部帧数组。 */
async function connectAndCollect(port: number, deviceId: string): Promise<{ ws: WebSocket; frames: Frame[] }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws?deviceId=${deviceId}&deviceType=android`)
  const frames: Frame[] = []
  ws.on('message', (raw: Buffer) => {
    try {
      frames.push(JSON.parse(raw.toString()) as Frame)
    } catch {
      /* 忽略坏帧 */
    }
  })
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve())
    ws.on('error', reject)
    setTimeout(() => reject(new Error('连接超时')), 10_000)
  })
  return { ws, frames }
}

async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return true
    await new Promise(r => setTimeout(r, 10))
  }
  return false
}

describe('移动端重连历史回放', () => {
  let server: MobileBridgeServer | null = null
  const sockets: WebSocket[] = []

  afterEach(() => {
    for (const ws of sockets) {
      try { ws.close() } catch { /* ignore */ }
    }
    sockets.length = 0
    registerMobileHistoryProvider(null)
    server?.stop()
    server = null
  })

  it('注册 provider 后，新连接收到全部历史且都带 replay 标记', async () => {
    const port = 15830
    registerMobileHistoryProvider(() => [
      { role: 'user', text: '第一个问题' },
      { role: 'assistant', text: '第一个回答' },
      { role: 'user', text: '第二个问题' },
    ])
    server = new MobileBridgeServer({ sessionId: 'replay-test', port, secret: '' })
    await server.start()

    const { ws, frames } = await connectAndCollect(port, 'dev-replay')
    sockets.push(ws)

    const ok = await waitFor(() =>
      frames.filter(f => f.type === 'user' || f.type === 'assistant').length >= 3,
    )
    expect(ok).toBe(true)

    const replays = frames.filter(
      f => (f.type === 'user' || f.type === 'assistant') && f.data?.replay === true,
    )
    expect(replays.length).toBe(3)
    expect(replays.map(f => f.data?.text)).toEqual([
      '第一个问题', '第一个回答', '第二个问题',
    ])
    // 回放必须抑制通知：补历史不是新事件
    for (const f of replays) expect(f.data?.suppressNotify).toBe(true)
  })

  it('思考与工具活动也回放为 tool_activity 帧', async () => {
    const port = 15834
    registerMobileHistoryProvider(() => [
      { role: 'thinking', text: '先读文件再改' },
      { role: 'tool', name: 'Read', detail: '{"file_path":"a.ts"}', result: '内容', toolUseId: 't1' },
      { role: 'assistant', text: '改好了' },
    ])
    server = new MobileBridgeServer({ sessionId: 'replay-tool', port, secret: '' })
    await server.start()

    const { ws, frames } = await connectAndCollect(port, 'dev-tool')
    sockets.push(ws)
    const got = await waitFor(() =>
      frames.filter(f => f.type === 'tool_activity').length >= 2,
    )
    expect(got).toBe(true)

    const acts = frames.filter(f => f.type === 'tool_activity')
    expect(acts[0].data?.kind).toBe('thinking')
    expect(acts[0].data?.detail).toBe('先读文件再改')
    expect(acts[0].data?.replay).toBe(true)
    expect(acts[1].data?.kind).toBe('tool')
    expect(acts[1].data?.name).toBe('Read')
    expect(acts[1].data?.toolUseId).toBe('t1')
    expect(acts[1].data?.result).toBe('内容')
    // 回放的活动一律 done，避免被当成「运行中」
    for (const a of acts) expect(a.data?.state).toBe('done')
  })

  it('未注册 provider 时不回放、不崩', async () => {
    const port = 15831
    registerMobileHistoryProvider(null)
    server = new MobileBridgeServer({ sessionId: 'replay-none', port, secret: '' })
    await server.start()

    const { ws, frames } = await connectAndCollect(port, 'dev-none')
    sockets.push(ws)

    const connected = await waitFor(() => frames.some(f => f.type === 'client_connected'))
    expect(connected).toBe(true)
    // 除握手外不该有 user/assistant 帧
    expect(frames.filter(f => f.type === 'user' || f.type === 'assistant').length).toBe(0)
  })

  it('回放是定向的：后连设备不回放给先连设备', async () => {
    const port = 15832
    registerMobileHistoryProvider(() => [{ role: 'assistant', text: '历史一条' }])
    server = new MobileBridgeServer({ sessionId: 'replay-directed', port, secret: '' })
    await server.start()

    const first = await connectAndCollect(port, 'dev-first')
    sockets.push(first.ws)
    await waitFor(() => first.frames.some(f => f.type === 'client_connected'))
    await waitFor(() => first.frames.some(f => f.type === 'assistant'))
    const firstBefore = first.frames.filter(f => f.type === 'assistant').length

    // 第二台设备连上 → 它应收到回放
    const second = await connectAndCollect(port, 'dev-second')
    sockets.push(second.ws)
    const secondGot = await waitFor(() =>
      second.frames.some(f => f.type === 'assistant' && f.data?.replay === true),
    )
    expect(secondGot).toBe(true)

    // 第一台设备不应因第二台连接而再收一遍
    await new Promise(r => setTimeout(r, 300))
    const firstAfter = first.frames.filter(f => f.type === 'assistant').length
    expect(firstAfter).toBe(firstBefore)
  })

  it('provider 抛异常时静默降级，连接仍成功', async () => {
    const port = 15833
    registerMobileHistoryProvider(() => {
      throw new Error('历史源炸了')
    })
    server = new MobileBridgeServer({ sessionId: 'replay-throw', port, secret: '' })
    await server.start()

    const { ws, frames } = await connectAndCollect(port, 'dev-throw')
    sockets.push(ws)
    const connected = await waitFor(() => frames.some(f => f.type === 'client_connected'))
    expect(connected).toBe(true)
    // 未崩溃：连接仍然可收后续广播
    server.sendToAll('assistant', { text: '仍在工作' })
    const alive = await waitFor(() =>
      frames.some(f => f.type === 'assistant' && f.data?.text === '仍在工作'),
    )
    expect(alive).toBe(true)
  })
})
