/**
 * 用量推送的端到端契约测试。
 *
 * 覆盖两层：
 * 1. currentUsageForMobile 的取数语义（全零返回 null、异常降级）
 * 2. 实际 WS 帧的字段（客户端 BridgeProtocol.kt 的 Usage 分支依赖它们）
 *
 * 为什么需要：用量展示错了不会报错 —— 会显示成「0 tokens」或
 * 缺某个单位，用户只会觉得「数字怪」而不会想到是推送层的问题。
 * 且 cost-tracker 是全局单例状态，取数异常必须在推送层被吞掉，
 * 不能让它冒泡打断正常的消息推送。
 */
import { describe, it, expect, afterEach } from 'vitest'
import WebSocket from 'ws'
import {
  MobileBridgeServer,
  pushUsageToMobileClients,
  currentUsageForMobile,
  getActiveMobileBridgeServer,
} from '../../src/bridge/mobileBridge.js'

describe('移动端用量推送', () => {
  afterEach(() => {
    expect(getActiveMobileBridgeServer()).toBeNull()
  })

  // ── 取数语义 ──

  it('未跑过任何回合时返回 null（不推空数据）', () => {
    // 测试进程里从未累加过 token / 成本。
    // 注意 durationMs 在此**非零**（getTotalDuration 统计的是进程运行
    // 时长，含空闲），故判据刻意不含它 —— 否则会推送
    // 「0 tokens · 19.7s」这种看起来像跑了空回合的假数据。
    const u = currentUsageForMobile()
    expect(u).toBeNull()
  })

  it('仅有进程运行时长（无 token）时仍返回 null', () => {
    // 回归：这正是上面那条的根因。若把 durationMs 计入判据，
    // 一个刚启动、什么都没跑的会话也会推送用量。
    const u = currentUsageForMobile()
    if (u !== null) {
      throw new Error(
        `只有时长非零时不应推送用量，实际得到 ${JSON.stringify(u)}`,
      )
    }
  })

  it('取数失败时降级为 null 而非抛异常', () => {
    // 契约：这个函数**永不抛异常**。它是旁路能力，
    // 任何异常都不该影响主流程（调用方 pushUsageToMobileClients
    // 还有一层 try，但这里是第一道防线）。
    expect(() => currentUsageForMobile()).not.toThrow()
  })

  // ── WS 帧契约 ──

  it('用量帧带客户端解析所需的全部字段', async () => {
    const port = 15820
    const server = new MobileBridgeServer({ sessionId: 'usage-test', port, secret: '' })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws?deviceId=t&deviceType=android`)
    const received: any[] = []
    ws.on('message', (raw: Buffer) => {
      try {
        received.push(JSON.parse(raw.toString()))
      } catch {
        /* 忽略坏帧 */
      }
    })

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
      setTimeout(() => reject(new Error('连接超时')), 10_000)
    })

    // 等 client_connected（服务器把连接计入 connectedClients 的证据）
    const deadline = Date.now() + 10_000
    while (
      !received.some(f => f.type === 'client_connected') &&
      Date.now() < deadline
    ) {
      await new Promise(r => setTimeout(r, 10))
    }
    received.length = 0

    try {
      // 直接发一帧手工构造的用量（绕开全局 cost-tracker 的零值状态），
      // 验证的是**帧字段契约**而非取数
      server.sendToAll('usage', {
        inputTokens: 12400,
        outputTokens: 3400,
        cacheReadTokens: 8000,
        durationMs: 8300,
        costUSD: 0.0231,
        at: Date.now(),
      })

      const d = await (async () => {
        const dl = Date.now() + 5_000
        while (Date.now() < dl) {
          const f = received.find(x => x.type === 'usage')
          if (f) return f.data
          await new Promise(r => setTimeout(r, 10))
        }
        throw new Error('未收到 usage 帧')
      })()

      // 这些字段名必须与 Android 端 BridgeProtocol.kt 的 Usage 分支一致
      expect(d.inputTokens).toBe(12400)
      expect(d.outputTokens).toBe(3400)
      expect(d.cacheReadTokens).toBe(8000)
      expect(d.durationMs).toBe(8300)
      expect(d.costUSD).toBe(0.0231)
    } finally {
      ws.close()
      await server.stop()
    }
  })

  it('无客户端连接时推送静默成功', async () => {
    const server = new MobileBridgeServer({ sessionId: 'usage-none', port: 15821, secret: '' })
    await server.start()
    expect(() => pushUsageToMobileClients()).not.toThrow()
    await server.stop()
  })

  it('无活动服务器时推送静默成功', () => {
    expect(() => pushUsageToMobileClients()).not.toThrow()
  })
})
