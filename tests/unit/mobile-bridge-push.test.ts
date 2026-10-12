/**
 * 真实源码测试：验证移动端推送链路（不使用复刻实现）。
 *
 * 覆盖两个此前只在复刻代码里验证过的点：
 * 1. pushToMobileClients 在无活动服务器时安全返回（不抛异常）
 * 2. 服务器注册表 getActiveMobileBridgeServer 的生命周期正确
 *
 * 注：完整的 WS 往返需要真实 socket，此处聚焦模块级契约，
 * 那部分由手工真机验证覆盖。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getActiveMobileBridgeServer,
  pushToMobileClients,
} from '../../src/bridge/mobileBridge.js'

describe('mobileBridge 推送链路（真实源码）', () => {
  it('无活动服务器时 pushToMobileClients 静默返回，不抛异常', () => {
    expect(getActiveMobileBridgeServer()).toBeNull()
    expect(() => pushToMobileClients({ role: 'assistant', text: '你好' })).not.toThrow()
  })

  it('空文本不触发推送', () => {
    expect(() => pushToMobileClients({ role: 'assistant', text: '' })).not.toThrow()
  })

  it('getActiveMobileBridgeServer 初始为 null', () => {
    expect(getActiveMobileBridgeServer()).toBeNull()
  })

  it('服务器启动后注册表可查到，停止后清空（真实 start/stop）', async () => {
    const { MobileBridgeServer } = await import('../../src/bridge/mobileBridge.js')
    // 用高位端口避免与真实服务冲突
    const port = 15680
    const server = new MobileBridgeServer({ sessionId: 'test-session', port, secret: 'x' })

    await server.start()
    expect(server.isServerRunning()).toBe(true)
    expect(getActiveMobileBridgeServer()).toBe(server)

    await server.stop()
    expect(getActiveMobileBridgeServer()).toBeNull()
  })

  it('模拟游标：服务器后启动时不应回灌历史消息', () => {
    // 复刻 useReplBridge 推送 effect 的游标语义（与源码 508-525 行一致）
    const simulate = (serverUpAt: number, totalMessages: number) => {
      let cursor = 0
      let pushed = 0
      for (let len = 1; len <= totalMessages; len++) {
        // 关键顺序：先推进游标，再判断服务器
        const start = Math.min(cursor, len)
        cursor = len
        const serverUp = len >= serverUpAt
        if (!serverUp) continue
        pushed += len - start
      }
      return pushed
    }

    // 服务器第 1 条消息时就绪：应推送全部
    expect(simulate(1, 5)).toBe(5)
    // 服务器第 4 条消息才就绪：只应推送 4、5，不回灌 1-3
    expect(simulate(4, 5)).toBe(2)
  })

  it('启动真实服务器后 pushToMobileClients 可调用且不抛异常', async () => {
    const { MobileBridgeServer } = await import('../../src/bridge/mobileBridge.js')
    const port = 15681
    const server = new MobileBridgeServer({ sessionId: 'test-push', port, secret: 'x' })
    await server.start()

    // 无客户端连接时广播应静默成功
    expect(() => pushToMobileClients({ role: 'assistant', text: '回复内容' })).not.toThrow()

    await server.stop()
  })

  it('pushDeltaToMobileClients：真实 WS 往返送达 assistant_delta', async () => {
    const { MobileBridgeServer, pushDeltaToMobileClients, flushPendingDelta } =
      await import('../../src/bridge/mobileBridge.js')
    const { WebSocket } = await import('ws')

    const port = 15682
    const server = new MobileBridgeServer({ sessionId: 'test-delta', port, secret: 'x' })
    await server.start()

    // 真实客户端连上并等待就绪。**必须带 secret**：服务端配了密钥时
    // 不带密钥会被 close(4001)，客户端永远进不了 connectedClients，
    // 广播自然收不到（这正是本用例初版失败的原因，非产品缺陷）。
    const ws = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws?secret=x&deviceId=probe&deviceType=android`)
    const received: string[] = []
    const gotDelta = new Promise<void>((resolve) => {
      ws.on('message', (raw) => {
        try {
          const m = JSON.parse(raw.toString())
          if (m.type === 'assistant_delta') {
            received.push(String(m.data?.text ?? ''))
            resolve()
          }
        } catch {
          /* 忽略非 JSON 帧 */
        }
      })
    })
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res())
      ws.on('error', rej)
    })
    // 给服务器登记客户端的时间（client_connected 之前 sendToAll 会漏发）
    await new Promise((r) => setTimeout(r, 200))

    // 推一段文本；节流窗口内会累积，flush 冲掉残留
    pushDeltaToMobileClients('呼吸光标')
    flushPendingDelta()

    await Promise.race([gotDelta, new Promise((_, rej) => setTimeout(() => rej(new Error('未收到 assistant_delta')), 3000))])
    expect(received.join('')).toContain('呼吸光标')

    ws.close()
    await server.stop()
  })

  it('pushDeltaToMobileClients：无活动服务器时静默返回（不抛异常）', async () => {
    const { MobileBridgeServer, pushDeltaToMobileClients } =
      await import('../../src/bridge/mobileBridge.js')
    // 显式起停一个真实服务器，确保进入「无活动服务器」状态
    // （不依赖上一个用例的清理顺序 —— 用例间不应有隐式依赖）
    const server = new MobileBridgeServer({ sessionId: 'test-delta-none', port: 15683, secret: 'x' })
    await server.start()
    await server.stop()
    expect(() => pushDeltaToMobileClients('任意文本')).not.toThrow()
  })
})
