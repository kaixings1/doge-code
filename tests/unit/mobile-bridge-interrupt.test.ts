/**
 * 中断路径回归测试：验证 handle 是「动态读取」而非「构造时快照」。
 *
 * 背景（真实缺陷）：
 *   autoStartMobileBridge 在 CLI 启动最早期（bootstrap-entry.ts）被调用，
 *   此时 useReplBridge 尚未挂载，getReplBridgeHandle() 返回 null。旧实现把
 *   handle 快照进 this.bridgeHandle，导致手机端「中断」按钮永久静默失效
 *   （`?.` 把 null 吞掉，无任何报错）。
 *
 * 本测试用变异测试验证其有效性：
 *   - 构造 server 时不传 handle（模拟 autoStart 路径）
 *   - 之后再通过 setReplBridgeHandle 设置全局 handle（模拟 REPL 挂载）
 *   - 发 interrupt，断言全局 handle 被调用
 *   若把实现改回「构造时快照」，此测试必然失败（spy 不会被调用）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import WebSocket from 'ws'
import { MobileBridgeServer, getActiveMobileBridgeServer } from '../../src/bridge/mobileBridge.js'
import { setReplBridgeHandle } from '../../src/bridge/replBridgeHandle.js'
import type { ReplBridgeHandle } from '../../src/bridge/replBridge.js'

// 与 server(15690) / multisession(15691) 错开，避免并发跑时的端口与全局注册表竞争
const PORT = 15693

afterEach(async () => {
  setReplBridgeHandle(null)
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
})

async function wsConnect(): Promise<{ frames: any[]; ws: WebSocket }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/mobile/ws?deviceId=t&deviceType=android`)
    const frames: any[] = []
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())))
    const t = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 5000)
    ws.on('open', () => { clearTimeout(t); resolve({ frames, ws }) })
    ws.on('error', (e) => { clearTimeout(t); reject(e) })
  })
}

describe('移动端中断：handle 动态读取（非构造时快照）', () => {
  it('构造时无 handle，事后设置全局 handle，interrupt 仍能触达', async () => {
    // 1. 模拟 autoStart 路径：构造时拿不到 handle
    const server = new MobileBridgeServer({ sessionId: 't-interrupt', port: PORT })
    await server.start()
    expect(server.isServerRunning()).toBe(true)

    // 2. 模拟 REPL 挂载后才出现全局 handle
    const cancelSpy = vi.fn()
    const fakeHandle = {
      bridgeSessionId: 'session_test',
      sendControlCancelRequest: cancelSpy,
    } as unknown as ReplBridgeHandle
    setReplBridgeHandle(fakeHandle)

    // 3. 手机端发中断
    const { ws } = await wsConnect()
    await new Promise((r) => setTimeout(r, 150))  // 等 connection 回调完成
    ws.send(JSON.stringify({
      type: 'control', action: 'interrupt',
      requestId: 'req-interrupt-1', sessionId: 's', timestamp: Date.now(),
    }))
    await new Promise((r) => setTimeout(r, 300))
    ws.close()

    // 4. 关键断言：全局 handle 被调用（快照实现下恒不成立）
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(cancelSpy).toHaveBeenCalledWith('req-interrupt-1')
  })

  it('cancel 与 interrupt 等效（同一分支）', async () => {
    const server = new MobileBridgeServer({ sessionId: 't-cancel', port: PORT })
    await server.start()

    const cancelSpy = vi.fn()
    setReplBridgeHandle({
      bridgeSessionId: 'session_test',
      sendControlCancelRequest: cancelSpy,
    } as unknown as ReplBridgeHandle)

    const { ws } = await wsConnect()
    await new Promise((r) => setTimeout(r, 150))
    ws.send(JSON.stringify({
      type: 'control', action: 'cancel',
      requestId: 'req-cancel-1', sessionId: 's', timestamp: Date.now(),
    }))
    await new Promise((r) => setTimeout(r, 300))
    ws.close()

    expect(cancelSpy).toHaveBeenCalledWith('req-cancel-1')
  })
})
