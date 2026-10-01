/**
 * mobileBridge.ts — 移动端桥接客户端与服务器
 *
 * 当 CLAUDE_CODE_MOBILE_BRIDGE=1 时，连接移动端 App 通过 WebSocket
 * 或本地 HTTP 代理进行通信。为移动端 App 提供 Claude Code 的完整
 * 命令和工具访问能力。
 *
 * 架构：
 * - 移动端 App → WebSocket → MobileBridgeServer → MobileBridgeClient → 命令/工具系统
 * - 移动端 App → HTTP POST → MobileHttpBridge → 命令/工具系统
 * - 移动端 App ← WebSocket ← MobileBridgeClient ← 结果推送
 *
 * 协议：
 * - 文本消息：JSON 格式，包含 type、data、requestId 字段
 * - 二进制消息：Base64 编码的工具结果
 * - 心跳：每 30 秒发送 ping
 * - 认证：移动端 App 连接时提供共享密钥（CLAUDE_CODE_MOBILE_SECRET）
 *
 * 移动端会话管理委托给 MobileSessionManager
 * 命令处理委托给 MobileProtocol 处理器
 */

import { randomUUID } from 'crypto'
import { getLocalBridgeUrl } from './bridgeConfig.js'
import { isLocalBridgeMode } from './bridgeConfig.js'
import { getMobileSessionManager } from './mobileSession.js'
import { handleMobileRequest, type MobileRequest, type MobileResponse } from './mobileProtocol.js'
import type { ReplBridgeHandle } from './replBridge.js'
import { enqueue } from '../utils/messageQueueManager.js'
import { logForDebugging } from '../utils/debug.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'

// ─── 类型 ───

export interface MobileBridgeHandle {
  sessionId: string
  connected: boolean
  /** 发送消息到移动端 */
  sendMessage: (type: string, data: Record<string, unknown>) => void
  /** 发送工具结果 */
  sendToolResult: (callId: string, result: unknown) => void
  /** 发送错误 */
  sendError: (callId: string, error: string) => void
  /** 发送进度更新 */
  sendProgress: (callId: string, progress: Record<string, unknown>) => void
  /** 拆除连接 */
  teardown: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
  /** 移动端会话 ID */
  mobileSessionId: string
}

export interface MobileBridgeOptions {
  sessionId: string
  onInboundMessage?: (msg: Record<string, unknown>) => void
  onStateChange?: (state: string, detail?: string) => void
  onPermissionResponse?: (msg: Record<string, unknown>) => void
  onToolRequest?: (msg: Record<string, unknown>) => void
  mobileSecret?: string
  host?: string
  port?: number
}

// ─── WebSocket 协议 ───

interface ProtocolMessage {
  uuid: string
  type: string
  data: Record<string, unknown>
  requestId?: string
  timestamp?: number
}

function createMessage(type: string, data: Record<string, unknown> = {}, requestId?: string): ProtocolMessage {
  return { uuid: randomUUID(), type, data, requestId, timestamp: Date.now() }
}

/** 仅允许 localhost / 127.0.0.1 / [::1] 来源，防止跨域携带认证头。 */
function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    const hostname = url.hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    )
  } catch {
    return false
  }
}

// ─── 移动端桥接客户端 ───

export class MobileBridgeClient {
  private ws: WebSocket | null = null
  private httpServer: any = null
  private sessionId: string
  private connected = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private serverUrl: string
  private onInboundMessage?: (msg: Record<string, unknown>) => void
  private onStateChange?: (state: string, detail?: string) => void
  private onPermissionResponse?: (msg: Record<string, unknown>) => void
  private onToolRequest?: (msg: Record<string, unknown>) => void
  private mobileSecret: string
  private pendingRequests = new Map<string, (result: unknown) => void>()
  private messageHandlers = new Map<string, (data: Record<string, unknown>) => void>()

  constructor(options: MobileBridgeOptions) {
    this.sessionId = options.sessionId
    this.mobileSecret = options.mobileSecret ?? ''
    const host = options.host ?? 'localhost'
    const port = options.port ?? 5678
    this.serverUrl = `ws://${host}:${port}/mobile/session-ingress/${this.sessionId}`
    this.onInboundMessage = options.onInboundMessage
    this.onStateChange = options.onStateChange
    this.onPermissionResponse = options.onPermissionResponse
    this.onToolRequest = options.onToolRequest

    // 注册默认消息处理器
    this.registerDefaultHandlers()
  }

  /**
   * 注册默认消息处理器
   */
  private registerDefaultHandlers(): void {
    this.messageHandlers.set('pong', () => {})

    this.messageHandlers.set('status', (data) => {
      if (data.event === 'mobile_joined') {
        this.onStateChange?.('connected')
      }
    })

    this.messageHandlers.set('disconnect', (data) => {
      this.onStateChange?.('disconnected', data.reason as string)
    })

    this.messageHandlers.set('tool:request', (data) => {
      this.onToolRequest?.(data)
    })

    this.messageHandlers.set('permission_request', (data) => {
      this.onPermissionResponse?.(data)
    })

    this.messageHandlers.set('message', (data) => {
      this.onInboundMessage?.(data)
    })

    this.messageHandlers.set('result', (data) => {
      const requestId = data.requestId as string
      if (requestId && this.pendingRequests.has(requestId)) {
        this.pendingRequests.get(requestId)?.(data)
        this.pendingRequests.delete(requestId)
      }
    })

    this.messageHandlers.set('error', (data) => {
      const requestId = data.requestId as string
      if (requestId && this.pendingRequests.has(requestId)) {
        this.pendingRequests.get(requestId)?.(data)
        this.pendingRequests.delete(requestId)
      }
    })
  }

  /**
   * 连接到移动端桥接服务器
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = this.serverUrl

      try {
        this.ws = new WebSocket(wsUrl)
      } catch {
        this.onStateChange?.('failed', '无法创建 WebSocket 连接')
        resolve(false)
        return
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close()
          this.onStateChange?.('failed', '连接超时')
          resolve(false)
        }
      }, 15000)

      this.ws.onopen = () => {
        this.connected = true
        clearTimeout(timeout)

        // 注册为移动端会话
        this.send('mobile-register', {
          sessionId: this.sessionId,
          secret: this.mobileSecret,
          capabilities: ['tools', 'commands', 'messages', 'files'],
        })

        // 启动心跳
        this.startHeartbeat()

        this.onStateChange?.('ready')
        resolve(true)
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string)
          this.handleMessage(msg)
        } catch {
          // 忽略无效消息
        }
      }

      this.ws.onerror = () => {
        clearTimeout(timeout)
        if (!this.connected) {
          this.onStateChange?.('failed', '❌ 错误: WebSocket 错误')
          resolve(false)
        }
      }

      this.ws.onclose = () => {
        this.connected = false
        this.stopHeartbeat()
        this.onStateChange?.('disconnected')
      }
    })
  }

  /**
   * 处理服务器消息
   */
  private handleMessage(msg: ProtocolMessage): void {
    const handler = this.messageHandlers.get(msg.type)
    if (handler) {
      handler(msg.data)
      return
    }

    // 未处理的消息转发给入站处理
    this.onInboundMessage?.(msg as unknown as Record<string, unknown>)
  }

  /**
   * 发送消息
   */
  send(type: string, data: Record<string, unknown> = {}, requestId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(createMessage(type, data, requestId)))
    }
  }

  /**
   * 发送消息到移动端（别名）
   */
  sendMessage(type: string, data: Record<string, unknown>): void {
    this.send(type, data)
  }

  /**
   * 发送工具结果到移动端
   */
  sendToolResult(callId: string, result: unknown): void {
    this.send('tool:result', { callId, result })
  }

  /**
   * 发送错误到移动端
   */
  sendError(callId: string, error: string): void {
    this.send('tool:error', { callId, error })
  }

  /**
   * 发送进度更新到移动端
   */
  sendProgress(callId: string, progress: Record<string, unknown>): void {
    this.send('tool:progress', { callId, progress })
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send('ping')
      }
    }, 30000)
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  /**
   * 拆除连接
   */
  async teardown(): Promise<void> {
    await this.disconnect()
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 等待请求结果（带超时）
   */
  async waitForResult(requestId: string, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`请求 ${requestId} 超时`))
      }, timeoutMs)

      this.pendingRequests.set(requestId, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  /**
   * 注册自定义消息处理器
   */
  onMessage(type: string, handler: (data: Record<string, unknown>) => void): () => void {
    this.messageHandlers.set(type, handler)
    return () => {
      this.messageHandlers.delete(type)
    }
  }
}

// ─── HTTP 代理服务器（用于移动端 App 无法使用 WebSocket 的场景） ───

interface MobileHttpMessage {
  type: string
  data: Record<string, unknown>
  requestId?: string
}

/**
 * 创建移动端 HTTP 代理服务器
 * 移动端 App 可以通过 HTTP POST 发送命令，通过 SSE 或轮询获取结果
 */
export function createMobileHttpBridge(options: {
  sessionId: string
  port?: number
  onMessage?: (msg: MobileHttpMessage) => void
}): { start: () => Promise<void>; stop: () => Promise<void> } {
  const port = options.port ?? 5679
  let server: any = null

  async function start(): Promise<void> {
    try {
      const http = await import('http')
      server = http.createServer((req, res) => {
        const origin = req.headers.origin
        const allowedOrigin = origin && isLocalOrigin(origin) ? origin : 'null'
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.setHeader('Vary', 'Origin')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        if (req.method === 'POST' && req.url?.startsWith('/mobile/command')) {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const msg = JSON.parse(body) as MobileHttpMessage
              options.onMessage?.(msg)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, requestId: msg.requestId }))
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        if (req.method === 'GET' && req.url?.startsWith('/mobile/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            connected: true,
            sessionId: options.sessionId,
            timestamp: Date.now(),
          }))
          return
        }

        res.writeHead(404)
        res.end('Not Found')
      })

      await new Promise<void>((resolve, reject) => {
        server.listen(port, 'localhost', () => resolve())
        server.on('error', reject)
      })
    } catch (e) {
      // HTTP 服务器创建失败，静默降级
    }
  }

  async function stop(): Promise<void> {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
      server = null
    }
  }

  return { start, stop }
}

// ─── 工厂函数 ───

/**
 * 初始化移动端桥接连接
 */
export async function initMobileBridge(options: MobileBridgeOptions): Promise<MobileBridgeHandle | null> {
  const client = new MobileBridgeClient(options)

  const connected = await client.connect()
  if (!connected) {
    return null
  }

  return {
    sessionId: options.sessionId,
    connected: true,
    mobileSessionId: options.sessionId,

    sendMessage(type: string, data: Record<string, unknown>) {
      client.sendMessage(type, data)
    },

    sendToolResult(callId: string, result: unknown) {
      client.sendToolResult(callId, result)
    },

    sendError(callId: string, error: string) {
      client.sendError(callId, error)
    },

    sendProgress(callId: string, progress: Record<string, unknown>) {
      client.sendProgress(callId, progress)
    },

    async teardown() {
      await client.teardown()
    },

    isConnected() {
      return client.isConnected()
    },
  }
}

/**
 * 检查移动端桥接是否可用
 */
export function isMobileBridgeAvailable(): boolean {
  return isLocalBridgeMode() || process.env.CLAUDE_CODE_MOBILE_BRIDGE === '1'
}

// ─── 移动端桥接服务器 ───

/**
 * 移动端桥接服务器 — 接受来自移动端 App 的 WebSocket 连接
 * 运行在本地端口上，桥接移动端 App 与本地 CLI 会话
 */
export class MobileBridgeServer {
  private httpServer: any = null
  private wss: any = null
  private port: number
  private sessionId: string
  private bridgeHandle: ReplBridgeHandle | null = null
  private sessionManager = getMobileSessionManager()
  private connectedClients = new Set<WebSocket>()
  private isRunning = false
  /** 共享密钥；空字符串表示未启用认证（仅限可信局域网，会在启动时警告） */
  private secret: string

  constructor(options: {
    sessionId: string
    port?: number
    bridgeHandle?: ReplBridgeHandle
    secret?: string
  }) {
    this.sessionId = options.sessionId
    this.port = options.port ?? 5680
    this.bridgeHandle = options.bridgeHandle ?? null
    this.secret = options.secret ?? process.env.CLAUDE_CODE_MOBILE_SECRET ?? ''
  }

  /**
   * 启动移动端桥接服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    try {
      const http = await import('http')
      const httpModule = await import('http')

      this.httpServer = httpModule.createServer((req, res) => {
        const origin = req.headers.origin
        const allowedOrigin = origin && isLocalOrigin(origin) ? origin : 'null'
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mobile-Secret')
        res.setHeader('Vary', 'Origin')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        // 移动端状态查询
        if (req.method === 'GET' && req.url?.startsWith('/mobile/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            connected: this.isRunning,
            sessionId: this.sessionId,
            clients: this.connectedClients.size,
            timestamp: Date.now(),
          }))
          return
        }

        // 手机端对话页面 — 扫码后在浏览器打开，无需安装 App
        if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?') || req.url?.startsWith('/index'))) {
          const port = this.port
          const secret = this.secret ?? ''
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderMobileChatPage(this.sessionId, port, secret))
          return
        }

        // 移动端命令 HTTP 接口
        if (req.method === 'POST' && req.url?.startsWith('/mobile/command')) {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const request = JSON.parse(body) as MobileRequest
              const response = await handleMobileRequest(request)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(response))
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
            }
          })
          return
        }

        res.writeHead(404)
        res.end('Not Found')
      })

      // WebSocket 服务器
      const wsModule = await import('ws')
      const WebSocketServer = wsModule.WebSocketServer
      this.wss = new WebSocketServer({ server: this.httpServer, path: '/mobile/ws' })

      this.wss.on('connection', (ws: WebSocket, req: any) => {
        // 认证检查
        const url = new URL(req.url ?? '', `http://${req.headers.host}`)
        const secret = url.searchParams.get('secret')
        const deviceId = url.searchParams.get('deviceId') ?? 'unknown'
        const deviceType = (url.searchParams.get('deviceType') ?? 'unknown') as 'ios' | 'android' | 'unknown'

        // 验证密钥：服务端配置了密钥时必须匹配，否则拒绝连接。
        // 原实现在 isDeviceAllowed 为真时才校验（等于放行所有未授权设备），逻辑是反的。
        if (this.secret && secret !== this.secret) {
          ws.close(4001, '认证失败')
          return
        }

        // 创建移动端会话。
        // createSession 在会话数达上限时会 throw；若不捕获，异常会从
        // connection 回调逸出并终止进程（手机端断线自动重连必然触发）。
        let session: { sessionId: string }
        try {
          session = (this.sessionManager as any).createSession(deviceId, deviceType)
          ;(this.sessionManager as any).updateSessionState(session.sessionId, 'connected')
        } catch (e) {
          logForDebugging(
            `[MobileBridgeServer] 创建会话失败，拒绝连接：${e instanceof Error ? e.message : String(e)}`,
          )
          ws.close(4002, '会话数已达上限')
          return
        }

        (ws as any).on('message', (data: string | Buffer) => {
          try {
            const msg = JSON.parse(data.toString()) as MobileRequest
            this.handleMobileMessage(msg, session.sessionId, ws)
          } catch {
            // 忽略无效消息
          }
        })

        (ws as any).on('close', () => {
          this.sessionManager.endSession(session.sessionId)
          this.connectedClients.delete(ws)
          this.broadcast('client_disconnected', { sessionId: session.sessionId, deviceId })
        })

        this.connectedClients.add(ws)
        this.broadcast('client_connected', { sessionId: session.sessionId, deviceId, deviceType })
        logForDebugging(`[MobileBridgeServer] 客户端连接: ${deviceId}`)
      })

      await new Promise<void>((resolve, reject) => {
        // 绑定 0.0.0.0 而非 localhost，否则手机（不同设备）无法连接。
        // 安全由 MobileBridgeServer 的密钥校验与局域网边界共同保证。
        this.httpServer.listen(this.port, '0.0.0.0', resolve)
        this.httpServer.on('error', reject)
      })

      this.isRunning = true
      activeMobileServer = this
      logForDebugging(`[MobileBridgeServer] 服务器启动在 ${getMobileBridgeUrl(this.port)}（监听 0.0.0.0:${this.port}）`)
    } catch (e) {
      logForDebugging(`[MobileBridgeServer] 启动失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * 处理移动端消息
   */
  private async handleMobileMessage(msg: MobileRequest, sessionId: string, ws: WebSocket): Promise<void> {
    try {
      // 更新活动时间
      this.sessionManager.updateSessionMetadata(sessionId, { lastActivity: Date.now() })

      // 控制类消息（对话/中断）走入站注入路径，由对话引擎处理，
      // 不走 handleMobileRequest —— 后者的 handler 只负责工具类请求。
      if (msg.type === 'control') {
        this.forwardToBridge(msg, sessionId)
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'result',
            requestId: msg.requestId,
            data: { status: 'queued', message: '已提交' },
            success: true,
            timestamp: Date.now(),
          }))
        }
        return
      }

      // 处理工具类请求
      const response = await handleMobileRequest(msg)

      // 发送响应回移动端
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(response))
      }
    } catch (e) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          requestId: msg.requestId,
          data: { error: e instanceof Error ? e.message : String(e) },
          success: false,
          timestamp: Date.now(),
        }))
      }
    }
  }

  /**
   * 将移动端消息转发到桥接
   *
   * 注意方向：bridgeHandle.writeMessages() 是「出站」——把本地对话镜像到
   * 远端服务器（见 remoteBridgeCore.writeMessages 的 transport 调用），
   * 用它无法把外部消息注入本地对话。
   *
   * 正确的「入站」入口是 messageQueueManager.enqueue()：REPL 的输入队列，
   * 模块级单例，与 useReplBridge.tsx 的 handleInboundMessage 用的是同一条
   * 路径（enqueue + mode:'prompt'）。故此处不依赖 bridgeHandle。
   */
  private forwardToBridge(msg: MobileRequest, sessionId: string): void {
    const { action, params } = msg

    switch (action) {
      case 'sendMessage': {
        const { message } = params as { message: string }
        if (!message || typeof message !== 'string') return
        // 与 handleInboundMessage 保持一致：mode 'prompt' + 跳过斜杠命令解析。
        // 手机端输入不应被当作 CLI 斜杠命令执行。
        try {
          enqueue({
            value: message,
            mode: 'prompt',
            skipSlashCommands: true,
            bridgeOrigin: true,
          })
          logForDebugging(
            `[mobile-push] 入站注入成功 enqueue("${message.slice(0, 40)}", ${message.length} 字符)`,
          )
        } catch (e) {
          logForDebugging(
            `[mobile-push] 入站注入失败：${e instanceof Error ? e.message : String(e)}`,
            { level: 'error' },
          )
        }
        break
      }
      case 'interrupt': {
        this.bridgeHandle?.sendControlCancelRequest(msg.requestId)
        break
      }
      case 'cancel': {
        this.bridgeHandle?.sendControlCancelRequest(msg.requestId)
        break
      }
    }
  }

  /**
   * 广播消息到所有连接的移动端
   */
  private broadcast(type: string, data: Record<string, unknown>): void {
    const msg = JSON.stringify({ type, data, timestamp: Date.now() })
    for (const ws of this.connectedClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg)
      }
    }
  }

  /**
   * 发送结果到所有移动端
   */
  sendToAll(type: string, data: Record<string, unknown>): void {
    this.broadcast(type, data)
  }

  /**
   * 发送消息到指定会话
   */
  sendToSession(sessionId: string, type: string, data: Record<string, unknown>): void {
    // 目前广播到所有客户端，未来可以按 sessionId 过滤
    this.broadcast(type, data)
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => resolve())
      })
      this.httpServer = null
    }
    this.isRunning = false
    this.connectedClients.clear()
    this.sessionManager.stopCleanup()
    // 仅当注册的仍是本实例时才清除，避免旧实例的 stop 摘掉新实例
    if (activeMobileServer === this) {
      activeMobileServer = null
    }
  }

  /**
   * 是否正在运行
   */
  isServerRunning(): boolean {
    return this.isRunning
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.connectedClients.size
  }
}

// ─── 全局服务器注册表 ───

/**
 * 进程内活动的移动端桥接服务器。
 *
 * 用途：CLI 侧产生新消息时（assistant 回复 / 工具结果）需要推送到手机，
 * 但消息流回调（useReplBridge 的转发 effect）不在服务器对象的闭包里，
 * 需要一条模块级通路找到当前服务器实例。同 replBridgeHandle 的思路：
 * 单进程单实例。
 */
let activeMobileServer: MobileBridgeServer | null = null

export function getActiveMobileBridgeServer(): MobileBridgeServer | null {
  return activeMobileServer
}

/**
 * 把一条已生成的消息推送到所有已连接的手机端。
 * 由 CLI 消息流转发 effect 调用；无活动服务器时静默返回。
 */
export function pushToMobileClients(message: {
  role: 'user' | 'assistant' | 'system'
  text: string
}): void {
  if (!activeMobileServer || !message.text) return
  activeMobileServer.sendToAll(message.role, { text: message.text })
}

/**
 * 初始化移动端桥接服务器
 * 将服务器与现有的 ReplBridgeHandle 集成
 */
export async function initMobileBridgeServer(
  sessionId: string,
  bridgeHandle: ReplBridgeHandle,
  port?: number,
): Promise<MobileBridgeServer | null> {
  const server = new MobileBridgeServer({
    sessionId,
    port,
    bridgeHandle,
  })

  await server.start()
  return server.isServerRunning() ? server : null
}

/**
 * 探测本机局域网 IPv4 地址（手机需要通过该地址访问电脑）。
 *
 * 选择顺序很重要：机器上常有多个网卡（VMware/VirtualBox/Docker/WSL 虚拟网卡、
 * 未连网的 APIPA 169.254.x.x 地址）。若随便取第一个非回环地址，很可能选中
 * 虚拟网卡或 169.254 链路本地地址，手机根本连不上。
 *
 * 判定依据是「默认路由」：能上外网的那个网卡才是手机真正连着的网络。
 * 仅靠网卡名或私有网段猜测不可靠——实测中"以太网 5"(192.168.26.152) 与
 * WLAN(192.168.0.106) 都是 192.168 段，但只有后者走默认路由。
 *
 * 策略：
 * 1. 解析 `route print` 找出默认网关对应的本机 IP（最可靠）
 * 2. 回退：排除回环 / APIPA(169.254) / 常见虚拟网卡名，优先 192.168 段
 * 3. 都失败时回退 localhost
 */
export function getLanIp(): string {
  // 优先：从路由表取默认网关对应的本机地址。
  // `route print` 是 Windows 专有命令，其他平台直接走回退策略，
  // 避免无谓的 execSync 失败开销。
  try {
    if (process.platform !== 'win32') throw new Error('non-win32')
    const { execSync } = require('child_process') as typeof import('child_process')
    const out = execSync('route print -4', { encoding: 'utf8', timeout: 3000, windowsHide: true })
    for (const raw of out.split(/\r?\n/)) {
      const line = raw.trim()
      // 目标为 0.0.0.0 的默认路由行，末列为接口本机 IP
      if (!line.startsWith('0.0.0.0')) continue
      const parts = line.split(/\s+/)
      if (parts.length < 5) continue
      const gateway = parts[2]
      const ifaceIp = parts[3]
      if (gateway === '0.0.0.0' || !ifaceIp) continue
      if (ifaceIp.startsWith('169.254.') || ifaceIp === '127.0.0.1') continue
      return ifaceIp
    }
  } catch {
    // 忽略：进入回退策略
  }

  // 回退：网卡名 + 私有网段启发式
  try {
    const os = require('os') as typeof import('os')
    const ifaces = os.networkInterfaces()
    const VIRTUAL = /vmware|virtualbox|vethernet|hyper-v|docker|wsl|loopback|virtual|tap|tun|bluetooth|km-test|host-only/i
    const candidates: string[] = []

    for (const name of Object.keys(ifaces)) {
      if (VIRTUAL.test(name)) continue
      for (const info of ifaces[name] ?? []) {
        if (info.family !== 'IPv4' || info.internal) continue
        const addr = info.address
        if (addr.startsWith('169.254.')) continue
        candidates.push(addr)
      }
    }

    if (candidates.length === 0) return 'localhost'
    return candidates.find(a => a.startsWith('192.168.'))
      ?? candidates.find(a => a.startsWith('10.'))
      ?? candidates.find(a => /^172\.(1[6-9]|2\d|3[01])\./.test(a))
      ?? candidates[0]
  } catch {
    // 忽略：回退到 localhost
  }
  return 'localhost'
}

/**
 * 获取移动端桥接 URL（用于二维码生成）
 *
 * 手机与电脑不在同一台机器上，必须返回局域网地址而非 localhost，
 * 否则手机扫码后无法建立连接。
 */
export function getMobileBridgeUrl(port?: number): string {
  const p = port ?? 5680
  return `http://${getLanIp()}:${p}`
}

/**
 * 渲染手机端对话页面。
 *
 * 为什么不写原生 App：手机浏览器原生支持 WebSocket，扫码即用、零安装，
 * 不必引入 JDK / Android SDK / Flutter 工具链。页面通过 /mobile/ws 与
 * CLI 会话收发消息：发消息经 enqueue() 进入 REPL 输入队列（入站），
 * 回复由 useReplBridge 的消息流转发 effect 经 pushToMobileClients() 推回。
 */
function renderMobileChatPage(sessionId: string, port: number, secret: string): string {
  // JSON.stringify 只保证 JSON 语法合法，不保证可安全嵌入 <script>：
  // 值中的 "</script>" 仍会闭合标签（可用于注入任意 JS）。
  // 额外转义 < > & 为 \uXXXX，切断标签闭合路径。
  const cfg = JSON.stringify({ sessionId, port, secret })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>doge-code 对话</title>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
       background:#1a1a1a;color:#e8e8e8;display:flex;flex-direction:column;height:100dvh}
  header{padding:10px 14px;background:#232323;border-bottom:1px solid #333;display:flex;align-items:center;gap:8px;
         padding-top:calc(10px + env(safe-area-inset-top))}
  .dot{width:8px;height:8px;border-radius:50%;background:#888;flex:none}
  .dot.on{background:#4ade80}.dot.off{background:#f87171}
  header b{font-weight:600;font-size:14px}
  header span{font-size:12px;color:#999;margin-left:auto}
  #log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
  .m{max-width:86%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word}
  .u{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}
  .a{align-self:flex-start;background:#2d2d2d;border-bottom-left-radius:4px}
  .s{align-self:center;background:transparent;color:#888;font-size:12px;padding:2px}
  footer{padding:8px 10px;padding-bottom:calc(8px + env(safe-area-inset-bottom));background:#232323;
         border-top:1px solid #333;display:flex;gap:8px;align-items:flex-end}
  textarea{flex:1;resize:none;background:#1a1a1a;color:#e8e8e8;border:1px solid #444;border-radius:10px;
           padding:9px 11px;font:inherit;max-height:110px;min-height:40px}
  button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:0 16px;height:40px;font:inherit;font-weight:600}
  button:disabled{background:#444;color:#888}
</style>
</head>
<body>
<header><i class="dot" id="dot"></i><b>doge-code</b><span id="st">连接中…</span></header>
<div id="log"></div>
<footer>
  <textarea id="in" rows="1" placeholder="输入消息…"></textarea>
  <button id="send" disabled>发送</button>
</footer>
<script>
var CFG = ${cfg};
var log = document.getElementById('log'), inp = document.getElementById('in'),
    btn = document.getElementById('send'), dot = document.getElementById('dot'), st = document.getElementById('st');
var ws = null, ready = false;

function bubble(text, cls){
  var d = document.createElement('div');
  d.className = 'm ' + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
function status(on, label){
  ready = on;
  dot.className = 'dot ' + (on ? 'on' : 'off');
  st.textContent = label;
  btn.disabled = !on;
}
function connect(){
  var url = 'ws://' + location.host + '/mobile/ws?deviceId=mobile-web&deviceType=android'
          + (CFG.secret ? '&secret=' + encodeURIComponent(CFG.secret) : '');
  try { ws = new WebSocket(url); } catch(e){ status(false,'无法创建连接'); return; }

  ws.onopen = function(){ status(true, '已连接'); };
  ws.onclose = function(){ status(false, '已断开，重连中…'); setTimeout(connect, 2000); };
  ws.onerror = function(){ status(false, '连接错误'); };
  ws.onmessage = function(ev){
    var msg;
    try { msg = JSON.parse(ev.data); } catch(e){ return; }
    if (msg.type === 'assistant' || msg.type === 'message') {
      var data = msg.data || {};
      var text = data.text || data.message || data.content;
      if (typeof text === 'string' && text) bubble(text, 'a');
    } else if (msg.type === 'result') {
      var d = msg.data || {};
      if (d.message) bubble(String(d.message), 'a');
      else if (d.status === 'queued') bubble('（已提交）', 'a');
    } else if (msg.type === 'error') {
      bubble('错误：' + ((msg.data && msg.data.error) || '未知'), 's');
    } else if (msg.type === 'system') {
      bubble(String((msg.data && msg.data.message) || ''), 's');
    }
  };
}
function send(){
  var text = inp.value.trim();
  if (!text || !ready) return;
  bubble(text, 'u');
  inp.value = ''; inp.style.height = 'auto';
  ws.send(JSON.stringify({
    type: 'control', action: 'sendMessage', params: { message: text },
    requestId: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
    sessionId: CFG.sessionId, timestamp: Date.now()
  }));
}
btn.onclick = send;
inp.addEventListener('input', function(){
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
});
inp.addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
connect();
</script>
</body>
</html>`
}