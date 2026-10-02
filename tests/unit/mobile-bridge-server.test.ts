/**
 * 真实 MobileBridgeServer 端到端测试（不使用复刻实现）
 *
 * 设计为单 test（所有子断言在一个 test 内顺序执行），避免并行端口竞争。
 * 覆盖：启动、GET / 页面、WebSocket 鉴权、消息往返、停止、注册表。
 */
import { describe, it, expect, afterEach } from 'vitest'
import http from 'http'
import WebSocket from 'ws'
import {
  MobileBridgeServer,
  getActiveMobileBridgeServer,
  getMobileBridgeUrl,
  getLanIp,
} from '../../src/bridge/mobileBridge.js'

const PORT = 15690
const SECRET = 'test-secret'

afterEach(async () => {
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
})

async function httpGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 4000 }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(b))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function wsConnect(secret?: string): Promise<{ frames: any[]; ws: any }> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${PORT}/mobile/ws?deviceId=t&deviceType=android`
      + (secret ? `&secret=${encodeURIComponent(secret)}` : '')
    const ws = new WebSocket(url)
    const frames: any[] = []
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())))
    const t = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 5000)
    ws.on('open', () => { clearTimeout(t); resolve({ frames, ws }) })
    ws.on('error', (e) => { clearTimeout(t); reject(e) })
  })
}

describe('MobileBridgeServer 真实端到端', () => {
  it('联网 IP / URL / 启动 / 页面 / 鉴权 / 消息 / 注册表 / 停止 全链路', async () => {
    // 1. IP 与 URL 基础契约
    const ip = getLanIp()
    expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    expect(ip).not.toMatch(/^169\.254\./)
    expect(ip).not.toBe('127.0.0.1')
    expect(getMobileBridgeUrl(PORT)).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/)

    // 2. 启动
    const server = new MobileBridgeServer({ sessionId: 't1', port: PORT, secret: SECRET })
    await server.start()
    expect(server.isServerRunning()).toBe(true)
    expect(getActiveMobileBridgeServer()).toBe(server)

    // 3. GET / 返回可用对话页
    const body = await httpGet('/')
    expect(body.length).toBeGreaterThan(1000)
    expect(body).toContain('/mobile/ws')

    // 4. 带密钥可连
    const { frames, ws } = await wsConnect(SECRET)
    // 等待服务端 connection 回调完成（add 到 connectedClients）
    await new Promise((r) => setTimeout(r, 150))
    expect(server.getClientCount()).toBeGreaterThan(0)
    ws.close()
    await new Promise((r) => setTimeout(r, 100))

    // 5. 无密钥被拒：握手会先触发 open，服务端随后 close(4001)。
    //    因此不能只等 open —— 必须等 close，并确认客户端未计入。
    const before = server.getClientCount()
    const rejected = await new Promise<string>((resolve) => {
      const w = new WebSocket(`ws://127.0.0.1:${PORT}/mobile/ws?deviceId=x&deviceType=android`)
      const t = setTimeout(() => resolve('timeout'), 4000)
      w.on('close', (code) => { clearTimeout(t); resolve('closed:' + code) })
      w.on('open', () => {})
      w.on('error', () => {})
    })
    expect(rejected).toBe('closed:4001')
    // 未授权连接不得计入客户端
    expect(server.getClientCount()).toBe(before)

    // 6. 发消息收到回执
    const { frames: frames2, ws: ws2 } = await wsConnect(SECRET)
    ws2.send(JSON.stringify({
      type: 'control', action: 'sendMessage', params: { message: 'hello' },
      requestId: 'req-1', sessionId: 's', timestamp: Date.now(),
    }))
    await new Promise((r) => setTimeout(r, 400))
    const result = frames2.find((f) => f.type === 'result')
    expect(result).toBeTruthy()
    expect(result.requestId).toBe('req-1')
    ws2.close()

    // 7. 停止后注册表清空
    await server.stop()
    expect(getActiveMobileBridgeServer()).toBeNull()
  })

  it('端口被占用时不抛异常、不标记为 running、不覆盖注册表', async () => {
    // 先用一个普通 http server 占住端口，模拟"另一个 doge 实例已抢到 5680"
    const blocker = http.createServer(() => {})
    await new Promise<void>((r) => blocker.listen(PORT, '0.0.0.0', () => r()))

    try {
      const server = new MobileBridgeServer({ sessionId: 'blocked', port: PORT, secret: SECRET })
      // 关键断言：start() 必须 resolve 而非 reject（reject 会变 Bun unhandled error 崩掉 CLI）
      await expect(server.start()).resolves.toBeUndefined()
      expect(server.isServerRunning()).toBe(false)
      // 未启动的实例不得接管全局注册表
      expect(getActiveMobileBridgeServer()).not.toBe(server)
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()))
    }
  })
})
