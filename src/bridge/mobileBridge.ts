/**
 * mobileBridge.ts — 移动端桥接客户端
 *
 * 当 CLAUDE_CODE_MOBILE_BRIDGE=1 时，连接移动端 App 通过 WebSocket
 * 或本地 HTTP 代理进行通信。为移动端 App 提供 Claude Code 的完整
 * 命令和工具访问能力。
 *
 * 架构：
 * - 移动端 App → WebSocket → MobileBridgeClient → 命令/工具系统
 * - 移动端 App → HTTP POST → MobileBridgeClient → 命令/工具系统
 * - 移动端 App ← WebSocket ← MobileBridgeClient ← 结果推送
 *
 * 协议：
 * - 文本消息：JSON 格式，包含 type、data、requestId 字段
 * - 二进制消息：Base64 编码的工具结果
 * - 心跳：每 30 秒发送 ping
 * - 认证：移动端 App 连接时提供共享密钥（CLAUDE_CODE_MOBILE_SECRET）
 */

import { randomUUID } from 'crypto'
import { getLocalBridgeUrl } from './bridgeConfig.js'
import { isLocalBridgeMode } from './bridgeConfig.js'

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
        this.send(createMessage('mobile-register', {
          sessionId: this.sessionId,
          secret: this.mobileSecret,
          capabilities: ['tools', 'commands', 'messages', 'files'],
        }))

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
          this.onStateChange?.('failed', 'WebSocket 错误')
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
    this.onInboundMessage?.(msg)
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
        // CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

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