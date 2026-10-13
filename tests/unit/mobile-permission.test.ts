/**
 * 移动端权限审批链路测试。
 *
 * 背景（本次补的能力）：
 *   在本次改动前，整条远程权限审批链路只对**云端桥接**接线
 *   （useReplBridge 的 !outboundOnly 分支 → AppState.replBridgePermissionCallbacks），
 *   移动桥接走 autoStartMobileBridge → MobileBridgeServer，不经该分支，
 *   因此手机端永远收不到权限请求。
 *
 *   后果：AI 一旦要执行需授权的操作（写文件、跑命令），请求只在电脑终端
 *   弹出，手机端完全无感 —— 远程使用时无法完成任何实际工作。
 *
 * 本文件覆盖服务端侧的三段契约：
 *   1. requestMobilePermission 在有手机在线时推出请求并返回 pending Promise
 *   2. 手机端回传 permissionResponse → waiter 被 resolve
 *   3. 无手机在线时返回 undefined（调用方据此跳过，不构造永不 resolve 的 Promise）
 *
 * 变异验证：
 *   - 把 handlePermissionResponse 里的 waiter 查找去掉 → 用例 2 失败
 *   - 把 requestMobilePermission 的客户端数检查去掉 → 用例 3 失败
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import WebSocket from 'ws'
import {
  MobileBridgeServer,
  getActiveMobileBridgeServer,
  requestMobilePermission,
  cancelMobilePermission,
  hasMobileClients,
} from '../../src/bridge/mobileBridge.js'

const PORT = 15695
const SECRET = 'perm-secret'

afterEach(async () => {
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
  // 等注册表真正清空：stop() 的 close 回调与下一个用例的 start() 若交错，
  // 会出现「上一个 server 的 connectedClients 被清空后，新 server 已被
  // hasMobileClients() 读到」的窗口，表现为用例间互相干扰。
  for (let i = 0; i < 20 && getActiveMobileBridgeServer() !== null; i++) {
    await new Promise((r) => setTimeout(r, 25))
  }
})

async function startServer(): Promise<MobileBridgeServer> {
  const server = new MobileBridgeServer({ sessionId: 'perm-test', port: PORT, secret: SECRET })
  await server.start()
  return server
}

async function wsConnect(): Promise<{ frames: any[]; ws: WebSocket }> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${PORT}/mobile/ws?deviceId=t&deviceType=android&secret=${encodeURIComponent(SECRET)}`
    const ws = new WebSocket(url)
    const frames: any[] = []
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())))
    const t = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 5000)
    ws.on('open', () => { clearTimeout(t); resolve({ frames, ws }) })
    ws.on('error', (e) => { clearTimeout(t); reject(e) })
  })
}

const sendPermissionResponse = (ws: WebSocket, requestId: string, behavior: string, extra: Record<string, unknown> = {}) => {
  ws.send(JSON.stringify({
    type: 'control',
    action: 'permissionResponse',
    requestId: 'resp-1',
    params: { requestId, behavior, ...extra },
    sessionId: 's',
    timestamp: Date.now(),
  }))
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 等待连接真正从服务端移除。
 *
 * 不能只调 ws.close() 就走 —— close 是异步的，服务端 onclose 回调
 * 可能在本用例结束、下一个用例开始之后才执行，届时它会去操作新的
 * server 的 connectedClients，造成用例间互相干扰
 * （表现为「单独跑通过、一起跑失败」）。
 */
async function closeAndWait(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return
  await new Promise<void>((resolve) => {
    ws.once('close', () => resolve())
    ws.close()
    // 不设兜底超时：兜底会让 close 回调延迟最多 1 秒到达，正好落进
    // 下一个用例的时间窗口里，反而制造污染。close 事件本身可靠。
  })
}

describe('移动端权限审批（服务端契约）', () => {
  it('无手机在线时 requestMobilePermission 返回空，调用方不等待', async () => {
    await startServer()
    expect(hasMobileClients()).toBe(false)
    // 关键：返回空而非一个永不 resolve 的 Promise —— 否则权限对话框会永久挂起
    expect(
      requestMobilePermission('req-none', {
        toolName: 'Bash',
        input: { command: 'ls' },
        toolUseId: 'tu-1',
        description: 'run ls',
      }),
    ).toBeUndefined()
  })

  it('手机端批准 → waiter 收到 allow', async () => {
    await startServer()
    const { frames, ws } = await wsConnect()
    await wait(150)
    expect(hasMobileClients()).toBe(true)

    const p = requestMobilePermission('req-allow', {
      toolName: 'Write',
      input: { file_path: 'a.txt' },
      toolUseId: 'tu-2',
      description: '写入 a.txt',
    })
    expect(p).toBeDefined()

    // 服务端应把请求推给手机
    await wait(150)
    const req = frames.find((f) => f.type === 'permission_request')
    expect(req, '服务端应向手机推送 permission_request').toBeTruthy()
    expect(req.data.requestId).toBe('req-allow')
    expect(req.data.toolName).toBe('Write')

    // 手机批准
    sendPermissionResponse(ws, 'req-allow', 'allow')
    const decision = await p
    expect(decision.behavior).toBe('allow')
    await closeAndWait(ws)
  })

  it('手机端拒绝 → waiter 收到 deny', async () => {
    await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    const p = requestMobilePermission('req-deny', {
      toolName: 'Bash',
      input: { command: 'rm -rf /' },
      toolUseId: 'tu-3',
      description: '危险命令',
    })
    sendPermissionResponse(ws, 'req-deny', 'deny', { message: '不允许' })
    const decision = await p
    expect(decision.behavior).toBe('deny')
    expect(decision.message).toBe('不允许')
    await closeAndWait(ws)
  })

  it('behavior 取值非法时按 deny 处理（不可作为提权通道）', async () => {
    await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    const p = requestMobilePermission('req-bad', {
      toolName: 'Bash',
      input: {},
      toolUseId: 'tu-4',
      description: 'x',
    })
    // 任意非 'allow' 的字符串都必须落到 deny —— 否则一个拼错的
    // behavior 会被当成批准，等于任意字符串提权
    sendPermissionResponse(ws, 'req-bad', 'ALLOW')
    const decision = await p
    expect(decision.behavior, '仅精确的 "allow" 才算批准').toBe('deny')
    await closeAndWait(ws)
  })

  it('重复响应只采纳第一个（第二个因 waiter 已清理而丢弃）', async () => {
    await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    const p = requestMobilePermission('req-dup', {
      toolName: 'Bash',
      input: {},
      toolUseId: 'tu-5',
      description: 'x',
    })
    sendPermissionResponse(ws, 'req-dup', 'allow')
    const first = await p
    expect(first.behavior).toBe('allow')

    // 再发一次不应抛异常，也不应改变已决定的结论
    sendPermissionResponse(ws, 'req-dup', 'deny')
    await wait(150)
    expect(hasMobileClients()).toBe(true) // 连接仍在，未被误伤
    await closeAndWait(ws)
  })

  it('cancelMobilePermission 撤销后，手机端的晚到响应被安全丢弃', async () => {
    await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    const p = requestMobilePermission('req-cancel', {
      toolName: 'Bash',
      input: {},
      toolUseId: 'tu-6',
      description: 'x',
    })
    expect(p).toBeDefined()

    // 模拟本地用户先在终端批准 → 撤销手机端请求
    cancelMobilePermission('req-cancel')
    // 手机端此时才回传（竞态），不应导致崩溃
    sendPermissionResponse(ws, 'req-cancel', 'deny')
    await wait(200)
    // 连接健康、未抛异常即为通过（该 Promise 已被丢弃，不 await 它）
    expect(hasMobileClients()).toBe(true)
    await closeAndWait(ws)
  })

  it('缺 requestId 的响应被忽略且不崩', async () => {
    const server = await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    ws.send(JSON.stringify({
      type: 'control',
      action: 'permissionResponse',
      requestId: 'resp-x',
      params: { behavior: 'allow' }, // 无 requestId
      sessionId: 's',
      timestamp: Date.now(),
    }))
    await wait(200)

    // 探针：打印实际状态，确认失败到底出在哪一层
    const { appendFileSync } = await import('fs')
    appendFileSync(
      'D:/doge-code/.tmp/fail-probe.txt',
      [
        `server.getClientCount()=${server.getClientCount()}`,
        `registry===server? ${getActiveMobileBridgeServer() === server}`,
        `registry?.getClientCount()=${getActiveMobileBridgeServer()?.getClientCount()}`,
        `ws.readyState=${ws.readyState}`,
        `hasMobileClients()=${hasMobileClients()}`,
      ].join(' | ') + '\n',
    )

    expect(server.getClientCount(), '服务端自己应看到 1 个连接').toBe(1)
    await closeAndWait(ws)
  })

  it('权限响应走 control 但不会污染对话队列', async () => {
    await startServer()
    const { ws } = await wsConnect()
    await wait(150)

    const p = requestMobilePermission('req-noqueue', {
      toolName: 'Bash',
      input: {},
      toolUseId: 'tu-7',
      description: 'x',
    })
    sendPermissionResponse(ws, 'req-noqueue', 'allow')
    await p

    // 权限响应是对既有请求的应答，绝不能被当成用户消息入队 ——
    // 否则对话里会凭空多出一条「{behavior: allow}」
    const { getCommandQueue, clearCommandQueue } = await import('../../src/utils/messageQueueManager.js')
    expect(getCommandQueue().length, '权限响应不应进入对话队列').toBe(0)
    clearCommandQueue()
    await closeAndWait(ws)
  })
})
