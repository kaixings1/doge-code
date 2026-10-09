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
import path from 'path'
import type { UUID } from 'crypto'
import { getLocalBridgeUrl } from './bridgeConfig.js'
import { getMobileSessionManager } from './mobileSession.js'
import { handleMobileRequest, type MobileRequest, type MobileResponse } from './mobileProtocol.js'
import type { ReplBridgeHandle } from './replBridge.js'
import { enqueue } from '../utils/messageQueueManager.js'
import { getReplBridgeHandle } from './replBridgeHandle.js'
import { logForDebugging } from '../utils/debug.js'
import { getTerminalFocusState } from '../ink/terminal-focus-state.js'
import { validateMobileConfig } from './mobileConfig.js'
import { PORT_SCAN_LIMIT, allPortsBusyMessage, candidatePorts } from './mobilePortScan.js'
import { MobileBeaconSender } from './mobileBeaconSender.js'
import { buildDiffPreviewForMobile } from './mobileDiffPreview.js'
import { getMainLoopModel } from '../utils/model/model.js'
import { getSessionId } from '../bootstrap/state.js'
import {
  getTotalCacheReadInputTokens,
  getTotalCostUSD,
  getTotalDuration,
  getTotalInputTokens,
  getTotalOutputTokens,
} from '../cost-tracker.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

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
              res.end(JSON.stringify({ error: '无效的 JSON' }))
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
        res.end('未找到')
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
  // 只认 CLAUDE_CODE_MOBILE_BRIDGE。CLAUDE_CODE_LOCAL_BRIDGE（5678 骨架桥接）
  // 与移动桥接（5680 真桥接）语义不同：前者只回显消息、永不产生 AI 回复。
  // 曾经用 isLocalBridgeMode() 兜底，导致 d.bat 起的普通 CLI 实例被误判为
  // 「移动桥接可用」，进而在 5680 上反复尝试启动并静默失败。
  return process.env.CLAUDE_CODE_MOBILE_BRIDGE === '1'
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
  private sessionManager = getMobileSessionManager()
  private connectedClients = new Set<WebSocket>()
  private isRunning = false
  /** 共享密钥；空字符串表示未启用认证（仅限可信局域网，会在启动时警告） */
  private secret: string

  /**
   * 端口段全部被占用时的错误提示（null 表示未发生）。
   *
   * 供调用方（autoStartMobileBridge）打印：那里才知道该用
   * console.error 提示用户（本类只写 debug 日志，不打扰终端）。
   */
  private lastPortError: string | null = null

  /**
   * UDP 多播广播发送器（让手机被动发现本会话）。
   *
   * 每次广播**动态取当前信息**（端口/客户端数/标签）而非构造时快照 ——
   * 客户端数在变、端口可能顺延、标签可被重命名，用旧值会让手机
   * 看到过时信息。
   */
  private readonly beacon = new MobileBeaconSender(() => ({
    sessionId: this.sessionId,
    resumeSessionId: (() => {
      try {
        return getSessionId()
      } catch {
        return null
      }
    })(),
    port: this.port,
    cwd: process.cwd(),
    label: resolveSessionLabel(),
    interactive: process.stdin.isTTY === true,
    clients: this.connectedClients.size,
  }))

  constructor(options: {
    sessionId: string
    port?: number
    /**
     * 保留为对外接口签名。实际不在构造时快照——autoStartMobileBridge 在
     * CLI 启动最早期调用，此处必然拿不到 handle；中断等操作改用
     * getReplBridgeHandle() 动态读取（见 forwardToBridge）。
     */
    bridgeHandle?: ReplBridgeHandle
    secret?: string
  }) {
    this.sessionId = options.sessionId
    this.port = options.port ?? resolveMobilePort()
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

        // 会话元信息 — 供手机端「多会话列表」发现本实例（多会话方案 A）
        // 手机并发探测端口段后，用本端点拿到每个会话的标签与状态。
        if (req.method === 'GET' && req.url?.startsWith('/mobile/session-info')) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            // 手机端跨源探测需要；此端点在可信局域网内使用
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({
            sessionId: this.sessionId,
            /**
             * **真实**的 doge 会话 ID，供 `doge.exe --resume <id>` 使用。
             *
             * 与上面的 sessionId 是**两个不同的东西**：上面那个是移动桥接
             * 自造的 `mobile-<时间戳>`，与 CLI 的会话体系无关。
             * 若拿它去 --resume 必然失败 —— 故单独回传这一个。
             *
             * 取不到时（如尚未初始化会话存储）为 null，客户端据此
             * 不显示恢复命令，而不是显示一个错的。
             */
            resumeSessionId: (() => {
              try {
                return getSessionId()
              } catch {
                return null
              }
            })(),
            port: this.port,
            cwd: process.cwd(),
            label: resolveSessionLabel(),
            // 非交互终端下消息不会被消费，客户端据此提示（与 client_connected 一致）
            interactive: process.stdin.isTTY === true,
            clients: this.connectedClients.size,
            lastActivity: Date.now(),
            // 当前生效的配置，供手机端设置页显示「现在是什么」。
            // 没有它，设置页只能让你「选」，选完就不知道当前值 ——
            // 用户无法判断刚才那次修改是否生效了。
            config: currentMobileConfig(),
          }))
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
        res.end('未找到')
      })

      // 先 listen，成功后才绑定 WebSocketServer。
      //
      // 顺序很关键：ws 库的 WebSocketServer({ server }) 会在 http server 上
      // 注册自己的 error/upgrade 处理。若先建 wss 再 listen，EADDRINUSE 时
      // ws 会把 http server 的 error 事件转投到 wss 上；此时 wss 的 error 若
      // 无人监听，Node 就抛 unhandled 'error' 事件直接终止进程
      // （表现为 "Failed to start server. Is port in use?" 崩掉整个 CLI）。
      //
      // ## 端口自动递增（替代原先的「占用即放弃」）
      //
      // 端口冲突（EADDRINUSE）在多窗口并发下是常态：每个 cmd 窗口一个
      // doge 实例都想要 5680。原实现遇到冲突就**静默放弃** —— 结果 N 个
      // 实例里只有 1 个的桥接真正起来，其余的手机根本连不上，而用户
      // 只看到一句「端口被占用」，不知如何是好。
      //
      // 现改为从起始端口起**依次试 10 个**，命中第一个可用端口即用；
      // 10 个全满才报错。顺序递增（而非随机）是为了让手机端的端口段
      // 扫描范围保持连续可预期（见 SessionScanner）。
      //
      // 仍然必须**绝不抛 unhandled error**：任何一次 listen 失败都只记日志
      // 并试下一个，到最后也只 return（由调用方给出提示），不影响 CLI 主流程。
      const startPort = this.port
      let bound = false
      const busyPorts: number[] = []

      for (const port of candidatePorts(startPort)) {
        const free = await new Promise<boolean>(resolve => {
          const onError = (e: unknown) => {
            const code = (e as { code?: string })?.code
            if (code === 'EADDRINUSE' || code === 'EACCES') {
              logForDebugging(
                `[MobileBridgeServer] 端口 ${port} 不可用（${code}），尝试下一个`,
              )
              resolve(false)
              return
            }
            // 其他错误（如 socket 创建失败）：也当作不可用继续试，
            // 不 reject —— 本函数是启动路径，抛出会让整个 CLI 崩
            logForDebugging(
              `[MobileBridgeServer] 端口 ${port} 监听异常：${e instanceof Error ? e.message : String(e)}`,
              { level: 'error' },
            )
            resolve(false)
          }
          // listen 可能在同 tick 内同步 emit error，必须先注册监听。
          this.httpServer!.once('error', onError)
          this.httpServer!.listen(port, '0.0.0.0', () => {
            this.httpServer!.off('error', onError)
            resolve(true)
          })
        })

        if (free) {
          // 记录实际绑定到的端口：所有对外暴露的 URL（状态页、扫码链接、
          // session-info 的 port 字段）都必须用它，而非构造时的 this.port，
          // 否则手机端会拿到一个连不上的端口号。
          this.port = port
          bound = true
          if (port !== startPort) {
            logForDebugging(
              `[MobileBridgeServer] 起始端口 ${startPort} 被占用，已自动改用 ${port}`,
            )
          }
          break
        }
        busyPorts.push(port)
      }

      if (!bound) {
        this.lastPortError = allPortsBusyMessage(startPort, busyPorts)
        logForDebugging(`[MobileBridgeServer] ${this.lastPortError}`, { level: 'error' })
        return
      }

      // WebSocket 服务器（仅在 http server 成功监听后创建）
      const wsModule = await import('ws')
      const WebSocketServer = wsModule.WebSocketServer
      this.wss = new WebSocketServer({ server: this.httpServer, path: '/mobile/ws' })
      // 兜底：wss 自身也必须始终有 error 监听，否则任何转发到它的事件
      // 都会变成 unhandled error。
      this.wss.on('error', (e: unknown) => {
        logForDebugging(
          `[MobileBridgeServer] wss 错误（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
        )
      })

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

        // 事件绑定必须兼容两种 WebSocket 实现：
        // - Node/ws 库的 WebSocket 有 .on()
        // - bun 会把 ws 库的实例替换为 BunWebSocketMocked（暴露 addEventListener）
        // 实测在 bun 下经 vitest/bun 引入本模块时 .on 不可用，只认 addEventListener。
        // 两者都试，取存在的一方，避免 "ws.on is not a function" 导致连接处理整体失效。
        const onMessage = (data: string | Buffer | { data?: unknown }) => {
          try {
            const raw = typeof data === 'string' || Buffer.isBuffer(data)
              ? data.toString()
              : String((data as { data?: unknown })?.data ?? data)
            const msg = JSON.parse(raw) as MobileRequest
            this.handleMobileMessage(msg, session.sessionId, ws)
          } catch {
            // 忽略无效消息
          }
        }
        const onClose = () => {
          this.sessionManager.endSession(session.sessionId)
          this.connectedClients.delete(ws)
          this.broadcast('client_disconnected', { sessionId: session.sessionId, deviceId })
        }

        if (typeof (ws as any).on === 'function') {
          ;(ws as any).on('message', onMessage)
          ;(ws as any).on('close', onClose)
        } else if (typeof (ws as any).addEventListener === 'function') {
          ;(ws as any).addEventListener('message', (ev: any) => onMessage(ev))
          ;(ws as any).addEventListener('close', onClose)
        } else {
          logForDebugging('[MobileBridgeServer] 无法为连接绑定事件（WebSocket 实现不兼容）', { level: 'error' })
        }

        this.connectedClients.add(ws)
        this.broadcast('client_connected', {
          sessionId: session.sessionId,
          deviceId,
          deviceType,
          // 队列消费由 useQueueProcessor（随 REPL 挂载）负责，而非交互终端下
          // REPL 不挂载：消息能入队、能收到 queued 回执，但永远不会被处理。
          // 把该状态告诉客户端，让手机端给出明确提示，而不是让用户对着
          // 「已提交」苦等回复（这正是之前最难排查的一种静默失败）。
          interactive: process.stdin.isTTY === true,
        })
        logForDebugging(`[MobileBridgeServer] 客户端连接: ${deviceId}`)
      })

      this.isRunning = true
      activeMobileServer = this
      logForDebugging(`[MobileBridgeServer] 服务器启动在 ${getMobileBridgeUrl(this.port)}（监听 0.0.0.0:${this.port}）`)

      // 启动 UDP 多播广播：让手机**被动**发现本会话，而不必主动扫全网段。
      // 广播是旁路能力，失败不影响 HTTP/WS 服务（见 MobileBeaconSender）。
      // 传 this.port 而非起始端口 —— 自动顺延后两者不同，
      // 广播错的端口会让手机连不上。
      this.beacon.start()
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

      // 控制类消息（对话/中断/权限响应）走入站注入路径，由对话引擎处理，
      // 不走 handleMobileRequest —— 后者的 handler 只负责工具类请求。
      if (msg.type === 'control') {
        // 权限响应不进对话，直接交给等待中的权限处理器。
        // 必须在这里分流而不是 forwardToBridge：它是对一次已发出的
        // permission_request 的应答，不产生新的用户消息。
        if (msg.action === 'permissionResponse') {
          this.handlePermissionResponse(msg)
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'result',
              requestId: msg.requestId,
              data: { status: 'ok', message: '权限响应已处理' },
              success: true,
              timestamp: Date.now(),
            }))
          }
          return
        }

        // 编辑最后一条用户消息（撤回 + 重发）。
        if (msg.action === 'editMessage') {
          const r = editLastUserMessage((msg.params as { text?: unknown })?.text)
          if (ws.readyState === 1) {
            // 用三元 + 显式断言：该联合类型下 `if (r.ok)` 的窄化在
            // else 分支上不稳定（实测读 r.error 报 TS2339），
            // 显式断言更可靠且意图明确
            const data: Record<string, unknown> = r.ok
              ? { status: 'ok', oldText: r.oldText, message: '已替换并重新提交' }
              : { status: 'error', message: (r as { error: string }).error }
            ws.send(JSON.stringify({
              type: 'result',
              requestId: msg.requestId,
              data,
              success: r.ok,
              timestamp: Date.now(),
            }))
          }
          return
        }

        // 远程改配置（模型/强度/权限模式）。
        // 值校验与白名单在 applyMobileConfig 内完成 —— 手机端是网络可达的
        // 控制面，服务端必须自己守边界，不能信任客户端传来的枚举值。
        if (msg.action === 'setConfig') {
          const p = msg.params as { key?: unknown; value?: unknown }
          const result = applyMobileConfig(p?.key, p?.value)
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'result',
              requestId: msg.requestId,
              data: {
                status: result.ok ? 'ok' : 'error',
                message: result.ok ? '配置已更新' : (result.error ?? '配置更新失败'),
              },
              success: result.ok,
              timestamp: Date.now(),
            }))
          }
          return
        }

        // 会话重命名：不产生用户消息，直接改进程内标签并回执新值。
        // 必须走 control 而非 handleMobileRequest —— 后者只处理工具类请求。
        if (msg.action === 'renameSession') {
          const next = renameSession((msg.params as { label?: unknown })?.label)
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'result',
              requestId: msg.requestId,
              data: { status: 'ok', label: next },
              success: true,
              timestamp: Date.now(),
            }))
          }
          return
        }
        this.forwardToBridge(msg, sessionId)
        // OPEN 恒为 1；不用 ws.OPEN，bun 的 BunWebSocketMocked 实例上该常量可能缺失
        if (ws.readyState === 1) {
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
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(response))
      }
    } catch (e) {
      if (ws.readyState === 1) {
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
        const { message, content } = params as {
          message?: string
          /** 带附件时用内容块数组（图片等）；见 android 侧 sendMessage 的重载 */
          content?: unknown
        }

        // 两条入站路径，二者择一：
        // 1. message（纯文本）—— 绝大多数情况
        // 2. content（ContentBlockParam[]）—— 带图片附件时
        //
        // 为什么图片要走 content 而不是塞进 message 字符串：图片是 base64
        // 内容块，塞进字符串后模型只会把它当普通文本读，完全看不到图。
        // 必须走 enqueue 的 ContentBlockParam[] 形式，让上游按多模态处理。
        const value = Array.isArray(content)
          ? (content as Parameters<typeof enqueue>[0]['value'])
          : typeof message === 'string' && message
            ? message
            : null
        if (value === null) return

        // 与 handleInboundMessage 保持一致：mode 'prompt' + 跳过斜杠命令解析。
        // 手机端输入不应被当作 CLI 斜杠命令执行。
        try {
          // 透传手机端原始 requestId 作为该 user 消息的 uuid。
          // 后续该消息经 useReplBridge 推送回所有手机时带同样 uuid，
          // 手机端据此精确去重自己刚发、被服务端回推的那条（不再依赖
          // SENDING 状态窗口 —— queued 回执往往先于回推到达，窗口已失效）。
          // 缺 requestId 时退化为随机 uuid：历史来源（非手机发送）不应
          // 被错配到任何 pending 去重集合。
          // 透传手机端原始 requestId 作为该 user 消息的 uuid。
          // 手机端 ChatMessage.newId() 用 java.util.UUID.randomUUID()，
          // 与仓库 UUID 模板字面量格式一致，故断言为 UUID 安全。
          // 后续该消息经 useReplBridge 推送回所有手机时带同样 uuid，
          // 手机端据此精确去重自己刚发、被服务端回推的那条（不再依赖
          // SENDING 状态窗口 —— queued 回执往往先于回推到达，窗口已失效）。
          enqueue({
            value,
            mode: 'prompt',
            skipSlashCommands: true,
            bridgeOrigin: true,
            // 透传手机端原始 requestId 作为该 user 消息的 uuid。
            // 手机端 ChatMessage.newId() 用 java.util.UUID.randomUUID()，
            // 与仓库 UUID 模板字面量格式一致，故断言为 UUID 安全。
            // 后续该消息经 useReplBridge 推送回所有手机时带同样 uuid，
            // 手机端据此精确去重自己刚发、被服务端回推的那条（不再依赖
            // SENDING 状态窗口 —— queued 回执往往先于回推到达，窗口已失效）。
            uuid: (typeof msg.requestId === 'string' && msg.requestId
              ? msg.requestId
              : randomUUID()) as UUID,
          })
          const desc = typeof value === 'string'
            ? `"${value.slice(0, 40)}", ${value.length} 字符`
            : `${value.length} 个内容块`
          logForDebugging(`[mobile-push] 入站注入成功 enqueue(${desc})`)
        } catch (e) {
          logForDebugging(
            `[mobile-push] 入站注入失败：${e instanceof Error ? e.message : String(e)}`,
            { level: 'error' },
          )
        }
        break
      }
      case 'interrupt':
      case 'cancel': {
        // 必须动态取 handle，不能用构造时快照的 this.bridgeHandle。
        // autoStartMobileBridge 在 CLI 启动最早期（bootstrap-entry.ts）被调用，
        // 此时 useReplBridge 尚未挂载，构造参数里的 handle 恒为 null——
        // 手机端「中断」按钮会永久静默失效（?. 把 null 吞掉，无任何报错）。
        // getReplBridgeHandle() 读的是模块级单例，REPL 挂载后即有值。
        getReplBridgeHandle()?.sendControlCancelRequest(msg.requestId)
        break
      }
    }
  }

  /**
   * 处理手机端回传的权限决定。
   *
   * 与 interrupt 同理：等待中的处理器注册在模块级 map（见
   * registerMobilePermissionWaiter），不是 this 的字段 —— 因为发出请求的是
   * interactiveHandler（权限路径），而不是本 server 对象。
   *
   * params 形状：
   *   { requestId: string, behavior: 'allow' | 'deny',
   *     updatedInput?: object, updatedPermissions?: array, message?: string }
   *
   * 校验必须严：behavior 只接受 'allow' / 'deny'。收到别的值若当作 deny
   * 处理是安全的（保守），但不能当作 allow —— 那等于允许任意字符串提权。
   */
  private handlePermissionResponse(msg: MobileRequest): void {
    const p = msg.params as {
      requestId?: string
      behavior?: string
      updatedInput?: Record<string, unknown>
      updatedPermissions?: unknown
      message?: string
    }
    const requestId = p?.requestId
    if (!requestId) {
      logForDebugging('[mobile-perm] 权限响应缺 requestId，忽略', { level: 'error' })
      return
    }
    const waiter = mobilePermissionWaiters.get(requestId)
    if (!waiter) {
      // 常见且无害：本地用户已在终端先批准/拒绝了，那条 waiter 已被
      // resolve 并清理。手机端的响应到此为止。
      logForDebugging(
        `[mobile-perm] 无等待中的处理器 requestId=${requestId}（可能已在终端处理）`,
      )
      return
    }
    const behavior = p.behavior === 'allow' ? 'allow' : 'deny'
    mobilePermissionWaiters.delete(requestId)
    logForDebugging(`[mobile-perm] 手机端决定: ${behavior} requestId=${requestId}`)
    waiter({
      behavior,
      ...(p.updatedInput ? { updatedInput: p.updatedInput } : {}),
      ...(p.message ? { message: p.message } : {}),
    } as never)
  }

  /**
   * 广播消息到所有连接的移动端
   */
  private broadcast(type: string, data: Record<string, unknown>): void {
    const msg = JSON.stringify({ type, data, timestamp: Date.now() })
    for (const ws of this.connectedClients) {
      if (ws.readyState === 1) {
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
   *
   * 当前实现即广播。这不是缺陷：单实例下连多台设备属于「同一 CLI 会话被
   * 多设备观察」，assistant 回复本就应让所有设备看到——隔离它们反而会
   * 破坏多设备同步。真正需要点对点的消息（result 回执 / error）由
   * handleMobileMessage 直接用发起者的 ws.send() 发送，不经此处。
   */
  sendToSession(_sessionId: string, type: string, data: Record<string, unknown>): void {
    this.broadcast(type, data)
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // 先停广播：停止后再发出的广播会让手机发现一个已死的会话，
    // 点了连不上。顺序在这里有意义。
    this.beacon.stop()
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
   * 实际绑定的端口。
   *
   * **必须用这个而非构造时的入参**：启用自动递增后两者可能不同
   *（起始端口被占用时会顺延）。所有对外暴露的 URL 都得用它，
   * 否则手机端拿到一个连不上的端口号。
   */
  getBoundPort(): number {
    return this.port
  }

  /** 端口段全部被占用时的可读提示；未发生该类失败时为 null。 */
  getPortError(): string | null {
    return this.lastPortError
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
 * 等待手机端决定的权限请求：requestId → resolve 回调。
 *
 * 为什么放模块级而不是 server 字段：发出请求的是 interactiveHandler
 * （CLI 的权限路径），它拿不到 server 实例；而收到响应的是 server。
 * 两者需要一个共享的通路 —— 与 replBridgeHandle / activeMobileServer 同一思路。
 *
 * 一个请求只应存在一份。若同一 requestId 被重复注册（理论上不该发生），
 * 后者覆盖前者，前者会一直挂着 —— 由 interactiveHandler 的 abort signal
 * 兜底（工具被中止时会取消订阅）。
 */
/**
 * 手机端可远程修改配置的回调。由 REPL 挂载时注册。
 *
 * 与 replBridgeHandle / activeMobileServer 同一思路：桥接启动在 CLI
 * 最早期的 bootstrap，那时 REPL 还没挂载、拿不到 setMainLoopModelOverride
 * 等函数，只能等挂载后回调进来。
 *
 * 未注册时 setConfig 一律失败并明确报错 —— 静默成功会让用户以为
 * 「改了但没生效」，是最难排查的一类问题。
 */
export interface MobileConfigHandlers {
  setModel: (model: string | null) => void
  setThinkingTokens: (tokens: number) => void
  setPermissionMode: (mode: string) => { ok: boolean; error?: string }
  /**
   * 切换详细模式（显示压缩边界之前的完整历史）。
   *
   * 无返回值：它是纯显示状态，不存在「上游拒绝」的情形
   *（对比 setPermissionMode 可能因安全限制被拒）。
   * 签名不带 { ok } 让调用点不必处理永不发生的失败分支。
   */
  setVerbose: (on: boolean) => void
}

/**
 * 编辑最后一条用户消息的能力，由 REPL 注册。
 *
 * 为什么需要注册：撤回要用到消息的 **uuid**，而 uuid 只存在于
 * REPL 的 messages 数组里，桥接层拿不到。与权限审批同一模式
 *（模块级注册表，REPL 挂载时注入）。
 *
 * 未注册时该功能明确不可用 —— 不静默失败。
 */
export interface MobileEditHandlers {
  /**
   * 编辑最后一条用户消息。
   *
   * @returns 成功时返回被替换的原文本（供客户端更新气泡）；
   *   失败时返回错误原因（如「当前没有可编辑的消息」）。
   */
  editLastUserMessage: (newText: string) => { ok: true; oldText: string } | { ok: false; error: string }
}

let mobileEditHandlers: MobileEditHandlers | null = null

export function setMobileEditHandlers(h: MobileEditHandlers | null): void {
  mobileEditHandlers = h
}

export function hasMobileEditHandlers(): boolean {
  return mobileEditHandlers !== null
}

/**
 * 执行「编辑最后一条用户消息」。
 *
 * 校验放在这里而非只靠客户端：客户端可能是不受控实现，
 * 且空文本会让 AI 收到一个空的 prompt。
 */
export function editLastUserMessage(
  newText: unknown,
): { ok: true; oldText: string } | { ok: false; error: string } {
  if (typeof newText !== 'string') {
    return { ok: false, error: '新文本必须是字符串' }
  }
  const trimmed = newText.trim()
  if (!trimmed) {
    return { ok: false, error: '内容不能为空' }
  }
  if (!mobileEditHandlers) {
    return { ok: false, error: '当前会话未挂载交互界面，无法编辑消息' }
  }
  try {
    return mobileEditHandlers.editLastUserMessage(trimmed)
  } catch (e) {
    return {
      ok: false,
      error: `编辑失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

let mobileConfigHandlers: MobileConfigHandlers | null = null

export function setMobileConfigHandlers(h: MobileConfigHandlers | null): void {
  mobileConfigHandlers = h
}

export function hasMobileConfigHandlers(): boolean {
  return mobileConfigHandlers !== null
}

/**
 * 应用一次手机端发来的配置变更。
 *
 * @returns 面向用户的结果（成功或失败原因）；失败原因需可读，
 *   用户据此判断是「不支持」还是「参数错」
 */
export function applyMobileConfig(
  key: unknown,
  value: unknown,
): { ok: boolean; error?: string } {
  const v = validateMobileConfig(key, value)
  if (!v.ok) return v

  const h = mobileConfigHandlers
  if (!h) {
    return {
      ok: false,
      error: '当前会话尚未就绪（CLI 未挂载交互界面），配置暂不可改',
    }
  }

  try {
    switch (key as string) {
      case 'model': {
        const model = value === 'default' ? null : (value as string | null)
        h.setModel(model)
        // 记下服务端**实际生效**的值（而非客户端传来的原始值），
        // 供 session-info 回传「当前是什么」。两者在 'default' 这类
        // 归一化上有差异，记原始值会让设置页显示与实际不符。
        recordMobileOverride('model', model)
        return { ok: true }
      }
      case 'thinkingTokens': {
        const tokens = value as number
        h.setThinkingTokens(tokens)
        recordMobileOverride('thinkingTokens', tokens)
        return { ok: true }
      }
      case 'permissionMode': {
        const r = h.setPermissionMode(value as string)
        // 只在成功时记录：失败还记下来会让设置页显示一个并未生效的值
        if (r.ok) recordMobileOverride('permissionMode', value as string)
        return r
      }
      case 'verbose': {
        const on = value as boolean
        h.setVerbose(on)
        recordMobileOverride('verbose', on)
        return { ok: true }
      }
      default:
        return { ok: false, error: `不支持的配置项：${String(key)}` }
    }
  } catch (e) {
    // 上游配置写入可能抛（如 settings 文件只读）——
    // 转成可读错误返回给手机端，而不是让 WS 层崩掉
    return {
      ok: false,
      error: `应用配置失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

const mobilePermissionWaiters = new Map<
  string,
  (response: {
    behavior: 'allow' | 'deny'
    updatedInput?: Record<string, unknown>
    message?: string
  }) => void
>()

/** 是否有手机端在线可处理权限请求。 */
export function hasMobileClients(): boolean {
  return (activeMobileServer?.getClientCount() ?? 0) > 0
}

/** 手机端对一次权限请求的决定。 */
export interface MobilePermissionDecision {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  message?: string
}

/**
 * 向手机端发起一次权限请求，返回 Promise 等待其决定。
 *
 * 用途：移动桥接启用时，把 CLI 的权限对话框同步到手机，让用户能远程批准。
 * 在此之前手机端只能看不能批 —— AI 一旦要写文件/跑命令，请求只在电脑
 * 终端弹出，手机完全无感（远程使用等于不可用）。
 *
 * 关键设计：**不与本地对话框互斥**。手机与终端是同一用户的两个屏幕，
 * 谁先响应都算数（interactiveHandler 用 claim() 保证只采纳第一个）。
 * 因此这里不做「本地已弹窗就不发手机」的判断 —— 那会让用户盯着手机干等，
 * 而终端其实已经在问了。
 *
 * @returns 无手机在线时返回 undefined，调用方据此跳过（不要构造永远不 resolve 的 Promise）
 */
export function requestMobilePermission(
  requestId: string,
  payload: {
    toolName: string
    input: Record<string, unknown>
    toolUseId: string
    description: string
    blockedPath?: string
  },
): Promise<MobilePermissionDecision> | undefined {
  if (!activeMobileServer || activeMobileServer.getClientCount() === 0) {
    return undefined
  }
  const promise = new Promise<MobilePermissionDecision>(resolve => {
    mobilePermissionWaiters.set(requestId, resolve)
  })
  // diff 预览：让用户在批准前能看到**具体改什么**。
  // 只有文件修改类工具才有 diff —— 命令类工具的入参本身就是完整信息。
  const diff = buildDiffPreviewForMobile(payload.toolName, payload.input)
  activeMobileServer.sendToAll('permission_request', {
    requestId,
    ...payload,
    ...(diff ? { diff } : {}),
  })
  logForDebugging(
    `[mobile-perm] 已向手机端发起权限请求 tool=${payload.toolName} requestId=${requestId}`,
  )
  return promise
}

/** 撤销一次待处理的权限请求（本地已决定 / 工具被中止时调用）。 */
export function cancelMobilePermission(requestId: string): void {
  if (!mobilePermissionWaiters.delete(requestId)) return
  activeMobileServer?.sendToAll('permission_cancel', { requestId })
  logForDebugging(`[mobile-perm] 已撤销权限请求 requestId=${requestId}`)
}

/**
 * 一条工具活动（手机端渲染用）。
 *
 * 与早期版本的区别：现在**同时**带上原文（detail）与结果（result）。
 *
 * 为什么改：此前只推压扁的一行摘要（target），手机端看不到实际执行的
 * 命令全文，也看不到任何输出 —— 用户只能看到「在跑某命令」，跑出什么
 * 完全不可见，只能回电脑看。这使手机端在「AI 跑命令」这一最高频场景下
 * 几乎没有可用信息。
 *
 * 上限的处理：detail / result 各截断到常量上限，而不是无限制透传。
 * 单个 tool_result 可能是几 MB 的文件内容，直接塞进 WS 帧会导致：
 * ① 帧过大被部分实现拒绝 ② 手机端 JSON 解析卡顿 ③ 流量暴涨。
 * 截断后仍保留「够看清在做什么、结果对不对」的量，并显式标注已截断与
 * 原始长度，让用户知道自己没看到全部（而不是以为就这么多）。
 */
export interface MobileToolActivity {
  kind: 'tool' | 'agent' | 'thinking'
  name: string
  target?: string
  state: 'running' | 'done' | 'error'
  agentId?: string
  /** 完整原文（命令全文 / 文件路径 / 格式化 JSON 参数），按 DETAIL_MAX 截断。 */
  detail?: string
  /** 工具执行结果文本，按 RESULT_MAX 截断。state 为 done/error 时才有。 */
  result?: string
  /** 原文或结果是否被截断（客户端据此显示「已截断」提示）。 */
  truncated?: boolean
  /** 截断前的原始长度，客户端可显示「共 N 字符」。 */
  fullLength?: number
  /** 工具调用 id，用于把 running 与 done 事件配对成同一条气泡。 */
  toolUseId?: string
}

/** 原文详情的上限。命令/路径通常远小于它；JSON 参数可能超。 */
const TOOL_DETAIL_MAX = 4000

/**
 * 工具结果的上限。
 *
 * 取 20000 而非更小：实测 grep/find 的输出规模多在几千到一万字符，
 * 20000 能覆盖绝大多数「我要看清结果」的场景；再大就是读文件全文之类，
 * 那种内容在手机上本来也不适合阅读。超过即截断并标注。
 */
const TOOL_RESULT_MAX = 20000

/** 从工具 input 里取最能说明「这次在做什么」的一个字段。 */
function summarizeToolTarget(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  for (const k of ['command', 'file_path', 'path', 'pattern', 'url', 'description', 'prompt']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.slice(0, 200)
  }
  return undefined
}

/**
 * JSON.stringify 不抛异常的包装（循环引用、BigInt 等）。
 *
 * 必须包：工具参数是任意对象，序列化抛异常会让整条推送失败 ——
 * 而推送是旁路能力，不该因一个奇怪参数丢掉整次活动。
 */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v)
  } catch {
    return String(v)
  }
}

/**
 * 截断并如实报告：返回文本、是否截断、截断前的长度。
 *
 * 为什么带 fullLength：只说「已截断」用户不知道丢了多少；显示
 * 「共 83214 字符，显示前 20000」才能判断要不要回电脑看全文。
 */
function clampText(s: string, max: number): { text: string; truncated: boolean; full: number } {
  if (s.length <= max) return { text: s, truncated: false, full: s.length }
  return { text: s.slice(0, max), truncated: true, full: s.length }
}

/**
 * 把工具 input 序列化成可读原文（给手机端看「到底执行了什么」）。
 *
 * 优先用 command / file_path 这类单值字段的**完整**内容 —— 那才是用户
 * 要看的。没有这类字段时退化为缩进 JSON（缩进 2 空格，适配手机窄屏），
 * 而不是紧凑一行的 JSON（在手机上无法阅读）。
 *
 * 单值字段之外还有别的参数（如 timeout、description）时一并附上：
 * 只有命令没有参数，用户仍无法判断这次调用的确切语义。
 */
function formatToolDetail(
  input: unknown,
): { text: string; truncated: boolean; full: number } | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string') return clampText(input, TOOL_DETAIL_MAX)
  if (typeof input !== 'object') return clampText(String(input), TOOL_DETAIL_MAX)

  const o = input as Record<string, unknown>
  for (const k of ['command', 'file_path', 'path', 'pattern', 'url']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) {
      const rest: Record<string, unknown> = {}
      for (const [rk, rv] of Object.entries(o)) {
        if (rk !== k) rest[rk] = rv
      }
      const head = clampText(v, TOOL_DETAIL_MAX)
      if (Object.keys(rest).length === 0) return head
      const tail = safeStringify(rest)
      const budget = Math.max(0, TOOL_DETAIL_MAX - head.text.length - 1)
      const tailClamped = clampText(tail, budget)
      return {
        text: head.text + '\n' + tailClamped.text,
        truncated: head.truncated || tailClamped.truncated,
        // tail 是字符串，它的**完整长度**在 tailClamped.full 里。
        // （写成 tail.full 是类型错误，也和上一行的 tailClamped 自相矛盾。）
        full: head.full + tailClamped.full,
      }
    }
  }
  return clampText(safeStringify(o), TOOL_DETAIL_MAX)
}

/**
 * 从 tool_result 的内容块里抽出可读文本。
 *
 * tool_result 的 content 形状多样：字符串、块数组（每块可能是 text /
 * image / 其它）。只取 text 块的文本；遇到图片块用占位符表示 ——
 * 手机上显示「[图片]」比什么都不显示诚实，用户知道这里有内容没看到。
 */
function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) {
    if (content === null || content === undefined) return ''
    return safeStringify(content)
  }
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text)
    } else if (b.type === 'image') {
      parts.push('[图片]')
    }
  }
  return parts.join('\n')
}

/**
 * 把 REPL 的消息对象转成手机端的工具活动摘要；不该推送时返回 null。
 *
 * 覆盖两种来源：
 * 1. assistant 消息中的 tool_use 块 —— 工具刚被调用（running）
 * 2. type:'progress' 消息 —— 子代理/长任务的进度（agent_progress 等）
 *
 * 之所以要覆盖第 2 种：一次重构可能起多个子代理，用户需要看到
 * 「有几个在跑、跑到哪了」，否则长时间空白无法判断是否卡住。
 */
export function describeToolActivityForMobile(
  msg: unknown,
): MobileToolActivity | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, any>

  // ── 来源 1：assistant 的 tool_use 块 ──
  if (m.type === 'assistant') {
    const content = m.message?.content
    if (!Array.isArray(content)) return null
    const toolUse = content.find((b: any) => b && b.type === 'tool_use')
    if (!toolUse) return null
    // 原文（完整命令/路径/参数）与压扁的 target（一行摘要）都带上：
    // target 供列表紧凑展示，detail 供展开后看全文。
    const detail = formatToolDetail(toolUse.input)
    return {
      kind: 'tool',
      name: typeof toolUse.name === 'string' ? toolUse.name : '工具',
      target: summarizeToolTarget(toolUse.input),
      state: 'running',
      ...(detail
        ? { detail: detail.text, truncated: detail.truncated, fullLength: detail.full }
        : {}),
      ...(typeof toolUse.id === 'string' ? { toolUseId: toolUse.id } : {}),
    }
  }

  // ── 来源 2：progress 消息（子代理 / 长任务） ──
  if (m.type === 'progress') {
    const data = m.data
    if (!data || typeof data !== 'object') return null
    const dtype = typeof (data as any).type === 'string' ? (data as any).type : ''
    // hook_progress 是内部钩子执行，对用户无意义，不推
    if (dtype === 'hook_progress') return null

    const isAgent = dtype === 'agent_progress'
    // progress 消息都是「进行中」的快照；完成状态由随后的定稿消息体现
    // （客户端看到 assistant 定稿即认为该轮工具活动结束）
    return {
      kind: isAgent ? 'agent' : 'tool',
      name: isAgent ? '子代理' : (dtype.replace(/_progress$/, '') || '任务'),
      target:
        typeof (data as any).description === 'string'
          ? (data as any).description.slice(0, 200)
          : undefined,
      state: 'running',
      ...(typeof m.parentToolUseID === 'string' && isAgent
        ? { agentId: m.parentToolUseID }
        : {}),
    }
  }

  return null
}

/**
 * 从 user 消息里的 tool_result 块提取「工具执行结果」。
 *
 * 为什么从 user 消息取：Anthropic 的消息格式里，工具结果是由**用户侧**
 * 发回的（role: 'user'，content 里是 tool_result 块）。这不是笔误 ——
 * 服务端把结果当作输入回灌给模型，所以它出现在 user 消息里。
 *
 * 返回 null 表示这条消息里没有 tool_result（绝大多数 user 消息如此）。
 */
export function describeToolResultForMobile(msg: unknown): MobileToolActivity | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, any>
  if (m.type !== 'user') return null
  const content = m.message?.content
  if (!Array.isArray(content)) return null

  const resultBlock = content.find((b: any) => b && b.type === 'tool_result')
  if (!resultBlock) return null

  const raw = extractToolResultText(resultBlock.content)
  const isError = resultBlock.is_error === true
  const clamped = clampText(raw, TOOL_RESULT_MAX)
  return {
    kind: 'tool',
    // 名称在结果块里没有（Anthropic 只回 tool_use_id），留空让客户端沿用
    // 同 toolUseId 的 running 事件里的名字 —— 客户端按 toolUseId 配对。
    name: '',
    state: isError ? 'error' : 'done',
    result: clamped.text,
    truncated: clamped.truncated,
    fullLength: clamped.full,
    ...(typeof resultBlock.tool_use_id === 'string'
      ? { toolUseId: resultBlock.tool_use_id }
      : {}),
  }
}

/** 思考内容的上限。比工具结果小：思考是过程性内容，看个大概即可。 */
const THINKING_MAX = 8000

/**
 * 从 assistant 消息里提取 thinking 块，供手机端展示「AI 在想什么」。
 *
 * 为什么值得推：用户在手机上看不到任何推理过程时，长任务期间只能
 * 盯着空白等待，无法判断 AI 是在思考、卡住、还是跑偏了。
 *
 * 为什么截断到 8000：思考内容可能很长，而手机屏幕一次只看得到几百字；
 * 截断并标注原始长度，既保留「能看出思路」的信息量，又不让单条帧过大。
 */
export function describeThinkingForMobile(msg: unknown): MobileToolActivity | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, any>
  if (m.type !== 'assistant') return null
  const content = m.message?.content
  if (!Array.isArray(content)) return null

  const block = content.find((b: any) => b && b.type === 'thinking')
  if (!block) return null
  const text = typeof block.thinking === 'string' ? block.thinking : ''
  if (!text.trim()) return null

  const clamped = clampText(text, THINKING_MAX)
  return {
    kind: 'thinking',
    name: '思考',
    state: 'running',
    detail: clamped.text,
    truncated: clamped.truncated,
    fullLength: clamped.full,
  }
}

/**
 * 判断此刻是否应当抑制手机端通知。
 *
 * 依据终端焦点状态（DECSET 1004）：
 * - 'focused'  → 用户正看着电脑终端，手机端不必再震一下
 * - 'blurred'  → 用户切走了（可能在用手机），应当推送
 * - 'unknown'  → **不抑制**。不支持焦点上报的终端恒为此值，
 *   若当作 blurred 的相反面（抑制），这些用户的手机将收不到任何通知。
 *   用「收不到」换「不打扰」是明显错误的取舍。
 *
 * 注意这是「抑制**通知**」而非「抑制推送」：消息内容仍要送达并渲染在
 * 界面上，只是不额外弹系统通知打断用户。用户切回手机时能看到完整历史。
 */
export function shouldSuppressMobileNotification(): boolean {
  return getTerminalFocusState() === 'focused'
}

/**
 * 把一条已生成的消息推送到所有已连接的手机端。
 * 由 CLI 消息流转发 effect 调用；无活动服务器时静默返回。
 */
export function pushToMobileClients(message: {
  role: 'user' | 'assistant' | 'system'
  text: string
  /**
   * 来源消息的 uuid。手机端发送的消息会带上它自己当初的 requestId
   * （见 forwardToBridge 的 enqueue uuid），推送回手机时再透传这个 uuid，
   * 手机端据此精确去重「自己发出、被服务端回推」的那条，而非依赖
   * 文本+SENDING 状态的脆弱竞态窗口。
   * 缺省时无值：服务端本地产生的消息（终端键入、系统提示等）
   * 没有对应的手机 pending，不去重。
   */
  sourceUuid?: string
}): void {
  if (!message.text) {
    logForDebugging(
      `[mobile-push] 跳过空文本推送 role=${message.role}（无内容可推送）`,
    )
    return
  }
  if (!activeMobileServer) {
    logForDebugging('[mobile-push] 跳过推送：无活动 MobileBridgeServer')
    return
  }
  activeMobileServer.sendToAll(message.role, {
    text: message.text,
    // 通知抑制标志：客户端据此决定是否弹系统通知。
    // 消息本身照常渲染 —— 只是不打断用户。
    suppressNotify: shouldSuppressMobileNotification(),
    // 来源 uuid：手机端用它匹配 pending 去重。无来源时省略字段，
    // 老客户端（不读该字段）也能正常解析。
    ...(message.sourceUuid ? { sourceUuid: message.sourceUuid } : {}),
  })
  // 定稿是权威版本，已包含此前所有增量内容；残留的流式增量缓冲在此
  // 一并清空，避免「上一轮的残片」串到下一轮开头的打字机预览里。
  flushPendingDelta()
}

// ─── 流式增量推送 ───

/**
 * 增量推送的递增序号。
 *
 * 为什么需要：增量是「追加」语义，丢包或乱序会让手机端拼出错乱的文本。
 * 客户端按 seq 单调递增校验，跳号即认为丢失并请求/等待下一条完整消息
 * （定稿的 pushToMobileClients 始终是权威版本，会覆盖任何拼错的内容）。
 *
 * 不用时间戳：同一毫秒内可产生多条增量，时间戳无法区分顺序。
 */
let mobileDeltaSeq = 0

/**
 * 流式增量推送：AI 正文边生成边推给手机。
 *
 * 与 pushToMobileClients 的区别：
 * - pushToMobileClients 推**定稿**的完整消息（权威，覆盖）
 * - 本函数推**增量片段**（尽力而为，可丢，用于打字机效果）
 *
 * 因此客户端必须把两者分开处理：增量只用于「预览区」的即时显示，
 * 定稿消息到达时必须用它替换掉预览内容 —— 否则一旦有增量丢失，
 * 手机端会永久停留在残缺文本上。
 *
 * 节流在本函数内部做：一次 API 流每秒可产生几十个 delta，
 * 逐条 WebSocket 发送会显著增加手机端渲染压力且无视觉收益。
 *
 * @param text 本次要追加的片段（不是累积全文）
 * @param blockId 内容块标识，用于客户端区分「同一块内的追加」与「新块开始」
 */
export function pushDeltaToMobileClients(text: string, blockId?: string): void {
  if (!text) return
  if (!activeMobileServer) return
  if (activeMobileServer.getClientCount() === 0) return

  // 节流：距上次推送不足阈值则累积到下次
  const now = Date.now()
  pendingDeltaText += text
  pendingDeltaBlockId = blockId ?? pendingDeltaBlockId
  if (now - lastDeltaFlushAt < DELTA_THROTTLE_MS) {
    return
  }
  lastDeltaFlushAt = now
  const payload = pendingDeltaText
  pendingDeltaText = ''
  mobileDeltaSeq += 1
  activeMobileServer.sendToAll('assistant_delta', {
    text: payload,
    seq: mobileDeltaSeq,
    blockId: pendingDeltaBlockId,
  })
}

/** 丢弃未推送的增量缓冲（回合结束/中断时调用，避免残片串到下一轮）。 */
export function flushPendingDelta(): void {
  pendingDeltaText = ''
  pendingDeltaBlockId = undefined
}

const DELTA_THROTTLE_MS = 80
let pendingDeltaText = ''
let pendingDeltaBlockId: string | undefined
let lastDeltaFlushAt = 0

/**
 * 工具活动推送：手机端显示「正在读文件 / 正在跑命令 / 子代理进度」。
 *
 * 为什么要单独一条通道而不是塞进聊天消息：工具调用是**过程**，
 * 不是对话内容。塞进气泡会淹没正文（一次重构可能产生几十条工具调用），
 * 客户端应渲染在独立的紧凑活动区。
 *
 * 推摘要 + 原文 + 结果。原文与结果各自有上限（TOOL_DETAIL_MAX /
 * TOOL_RESULT_MAX），不是无限制透传 —— 单个 tool_result 可能是几 MB，
 * 塞进 WS 帧会让手机端解析卡顿。超限时截断并带 truncated/fullLength，
 * 由客户端如实告知用户「还有多少没显示」。
 *
 * @param kind  activity 的种类：tool（工具调用）/ agent（子代理）
 * @param state running | done | error
 */
export function pushToolActivityToMobileClients(activity: MobileToolActivity): void {
  if (!activeMobileServer) return
  if (activeMobileServer.getClientCount() === 0) return
  activeMobileServer.sendToAll('tool_activity', {
    kind: activity.kind,
    name: activity.name,
    target: activity.target?.slice(0, 200) ?? '',
    state: activity.state,
    ...(activity.agentId ? { agentId: activity.agentId } : {}),
    ...(activity.detail ? { detail: activity.detail } : {}),
    ...(activity.result ? { result: activity.result } : {}),
    ...(activity.truncated ? { truncated: true } : {}),
    ...(typeof activity.fullLength === 'number' ? { fullLength: activity.fullLength } : {}),
    ...(activity.toolUseId ? { toolUseId: activity.toolUseId } : {}),
    at: Date.now(),
  })
}

/**
 * 回合用量推送：一轮 AI 干完后把 token / 耗时 / 成本发给手机。
 *
 * 为什么值得推：用户在手机上最常问的两件事是「这次花了多少」和
 * 「怎么跑了这么久」。此前这两项在手机端完全不可见 —— 必须回电脑
 * 看状态栏。推送后手机可在回复气泡下方显示「12.4k tokens · 8.3s」。
 *
 * 全部字段均为**累计值**（会话开始至今），与 CLI 状态栏口径一致：
 * 单轮差值需要客户端前后相减，而 CLI 本身显示的就是累计 ——
 * 口径一致才不会出现「手机和电脑对不上」的困惑。
 *
 * 取不到用量时静默跳过（如 cost-tracker 尚未初始化）：
 * 用量是锦上添花，不该因它抛异常影响正常消息推送。
 */
export function pushUsageToMobileClients(): void {
  if (!activeMobileServer) return
  if (activeMobileServer.getClientCount() === 0) return
  try {
    const payload = currentUsageForMobile()
    if (!payload) return
    activeMobileServer.sendToAll('usage', { ...payload, at: Date.now() })
  } catch (e) {
    logForDebugging(
      `[mobile-push] 用量推送失败（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

/**
 * 组装给手机端的用量快照。
 *
 * 与 pushUsageToMobileClients 分开是为了可单测 —— 取数涉及多个
 * cost-tracker 导出，任何一个抛异常都应整体降级为 null（不推送），
 * 而不是让部分字段缺失地发出去（客户端数值字段缺失会读成 0，
 * 显示成「0 tokens」比不显示更误导）。
 */
export function currentUsageForMobile(): {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  durationMs: number
  costUSD: number
} | null {
  try {
    const inputTokens = getTotalInputTokens()
    const outputTokens = getTotalOutputTokens()
    const cacheReadTokens = getTotalCacheReadInputTokens()
    const durationMs = getTotalDuration()
    const costUSD = getTotalCostUSD()
    // 判据只用 **token 与成本**，刻意不含 durationMs：
    // getTotalDuration 统计的是**进程运行时长**（含空闲），刚启动的
    // 进程就已非零。若把它算进「有没有用量」的判据，会导致
    // 一个从未跑过任何回合的会话也推送用量 —— 客户端显示
    // 「0 tokens · 19.7s」，看起来像跑了个空回合，比不显示更误导。
    if (inputTokens === 0 && outputTokens === 0 && costUSD === 0) {
      return null
    }
    return { inputTokens, outputTokens, cacheReadTokens, durationMs, costUSD }
  } catch {
    return null
  }
}

/**
 * 初始化移动端桥接服务器
 * 将服务器与现有的 ReplBridgeHandle 集成
 */
export async function initMobileBridgeServer(
  sessionId: string,
  bridgeHandle?: ReplBridgeHandle | null,
  port?: number,
  secret?: string,
): Promise<MobileBridgeServer | null> {
  const opts: {
    sessionId: string
    port?: number
    bridgeHandle?: ReplBridgeHandle
    secret?: string
  } = { sessionId, port }
  if (bridgeHandle) opts.bridgeHandle = bridgeHandle
  if (secret) opts.secret = secret

  const server = new MobileBridgeServer(opts)
  await server.start()
  if (server.isServerRunning()) return server
  // 未起来时把具体原因（如「端口段全满」）留在模块级，
  // 供调用方提示 —— 返回值只能是 null，带不回错误详情。
  ;(globalThis as Record<string, unknown>).__mobileBridgeLastError = server.getPortError()
  return null
}

/**
 * 取出并清空上一次启动失败的原因。
 *
 * 用「取出即清空」而非单纯读：一次失败只该被提示一次，
 * 否则后续启动成功的分支也可能读到陈旧错误。
 */
export function takeMobileBridgeStartError(): string | null {
  const g = globalThis as Record<string, unknown>
  const e = g.__mobileBridgeLastError
  g.__mobileBridgeLastError = null
  return typeof e === 'string' && e ? e : null
}

/**
 * CLI 启动时自动开启移动端桥接（无需手动执行 /mobile-connect）。
 *
 * 触发条件：CLAUDE_CODE_MOBILE_BRIDGE=1（或本地桥接模式）。
 * 静默失败：端口被占、无网络等情况只记日志，绝不影响 CLI 正常使用。
 *
 * 存在的理由：/mobile-connect 是 local-jsx 命令，只能在交互界面里手动输入；
 * 自动化脚本、非交互场景无法触发，而手机端又需要在 CLI 启动时就就绪。
 */
export async function autoStartMobileBridge(port?: number): Promise<MobileBridgeServer | null> {
  if (!isMobileBridgeAvailable()) {
    // 未启用移动桥接（CLAUDE_CODE_MOBILE_BRIDGE 未设为 1）。
    // 这是 d.bat 起普通 CLI 的常态，安静跳过即可 —— 但要留下可发现的线索，
    // 否则用户会以为手机连不上是"桥接坏了"，实际是根本没启用。
    logForDebugging(
      '[MobileBridge] 未启用（CLAUDE_CODE_MOBILE_BRIDGE≠1）。如需手机访问，用 mobile.bat 启动或在 CLI 执行 /mobile-connect',
    )
    return null
  }
  try {
    // 起始端口必须在这里求值一次：调用方多为无参调用（见 bootstrap-entry.ts），
    // 缺省时构造函数内部才用 resolveMobilePort() 兜底 —— 若拿原始缺省值
    // 去比较/打印，会把 changed 判成 true，并输出「起始端口 未定义 被占用」
    // 这种自相矛盾的话。
    const startPort = port ?? resolveMobilePort()
    const server = await initMobileBridgeServer(`mobile-${Date.now()}`, getReplBridgeHandle(), startPort)
    if (server) {
      // 用**实际绑定**的端口，而非起始端口 —— 自动递增后两者可能不同，
      // 显示起始端口会让用户照着连一个连不上的地址。
      const boundPort = server.getBoundPort()
      logForDebugging(`[MobileBridge] 自动启动成功: ${getMobileBridgeUrl(boundPort)}`)
      // 启动成功必须向终端露一行 —— 否则用户完全不知道桥接是否起来，
      // 只能靠 netstat 自己猜（此前"服务没起但毫无提示"的排查噩梦）。
      const changed = boundPort !== startPort
      console.error(
        `[MobileBridge] 移动桥接已启动: ${getMobileBridgeUrl(boundPort)}（监听 0.0.0.0:${boundPort}）` +
          (changed ? `（起始端口 ${startPort} 被占用，已自动顺延）` : ''),
      )
      // 非交互终端（stdin 被重定向、或跑在脚本里）不会挂载 REPL，
      // 而消息消费由 useQueueProcessor（随 REPL 挂载）负责。此时手机能连、
      // 能收到 queued 回执，但消息永远不会进入对话 —— 极易误判为 bug，
      // 故显式提示。
      if (!process.stdin.isTTY) {
        console.error(
          '[MobileBridge] 当前非交互终端：手机消息会入队但不会被消费（需真实终端运行 doge.exe）',
        )
      }
    } else {
      // 端口段全满（自动递增已试过 10 个）或其他启动失败。
      // 给出**试过的端口范围**与可执行建议 —— 只说「5680 被占用」会
      // 让用户以为换个端口就行，而实际是整个段都满了。
      const reason = takeMobileBridgeStartError()
      console.error(
        `[MobileBridge] ${reason ?? `移动桥接未启动：起始端口 ${startPort} 起 ${PORT_SCAN_LIMIT} 个端口均不可用。`}`,
      )
    }
    return server
  } catch (e) {
    logForDebugging(
      `[MobileBridge] 自动启动失败（已忽略）: ${e instanceof Error ? e.message : String(e)}`,
      { level: 'error' },
    )
    return null
  }
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
  const p = port ?? resolveMobilePort()
  return `http://${getLanIp()}:${p}`
}

/**
 * 运行时会话标签覆盖（手机端重命名用）。
 *
 * 为什么用进程内变量而不是写 DOGE_SESSION_LABEL 环境变量：
 * 本项目的「会话」= 一个活着的 CLI 进程，进程退出标签就无意义了。
 * 写环境变量或配置文件会让用户以为改名被持久化了，下次启动发现
 * 变回目录名 —— 反而更困惑。所以明确只作用于当前进程的生命周期。
 */
let runtimeSessionLabel: string | null = null

/**
 * 手机端改过的配置（会话内覆盖）。
 *
 * 为什么不直接读 getMainLoopModel()：那个函数读的是**用户配置文件**，
 * 而手机端改的是**会话内覆盖**（setMainLoopModelOverride）。
 * 两者可能不同 —— 若显示进程配置，用户手机上改成 sonnet、
 * 界面还显示 opus，会以为「改了没生效」。这正是要避免的困惑。
 *
 * null 表示「手机端没改过」，此时回落到进程配置。
 */
let mobileOverrides: {
  model?: string | null
  thinkingTokens?: number
  permissionMode?: string
  verbose?: boolean
} = {}

/** 记录一次手机端的配置修改（由 applyMobileConfig 调用）。 */
export function recordMobileOverride(
  key: 'model' | 'thinkingTokens' | 'permissionMode' | 'verbose',
  value: string | number | boolean | null,
): void {
  if (key === 'model') mobileOverrides.model = value as string | null
  else if (key === 'thinkingTokens') mobileOverrides.thinkingTokens = value as number
  else if (key === 'verbose') mobileOverrides.verbose = value as boolean
  else mobileOverrides.permissionMode = value as string
}

/** 测试用：清除覆盖记录。 */
export function resetMobileOverrides(): void {
  mobileOverrides = {}
}

/**
 * 当前生效的配置，供手机端设置页显示。
 *
 * 每一项都遵循「手机端改过就用改的，否则回落进程配置」。
 * 回落失败也要有值 —— 设置页显示空白比显示一个稍旧的默认值更糟，
 * 用户会以为功能坏了。
 */
export function currentMobileConfig(): {
  model: string
  thinkingTokens: number
  permissionMode: string
  /** 详细模式：显示压缩边界之前的完整历史（纯显示行为）。 */
  verbose: boolean
  /**
   * 每项值的来源。
   *
   * 为什么需要：用户「改不成」时（如设了模型但没生效），原界面完全
   * 无法解释原因。最常见的是环境变量覆盖 —— 例如
   * CLAUDE_CODE_EFFORT_LEVEL 会覆盖 effort 设置，而用户看不出来。
   *
   * 取值：
   * · 'mobile'   手机端本次会话改的
   * · 'env'      环境变量
   * · 'settings' 用户配置文件
   * · 'default'  内置默认
   */
  sources: {
    model: 'mobile' | 'env' | 'settings' | 'default'
    thinkingTokens: 'mobile' | 'env' | 'settings' | 'default'
    permissionMode: 'mobile' | 'env' | 'settings' | 'default'
    verbose: 'mobile' | 'env' | 'settings' | 'default'
  }
} {
  let model: string
  let modelSource: 'mobile' | 'env' | 'settings' | 'default'
  if ('model' in mobileOverrides) {
    model = mobileOverrides.model ?? 'default'
    modelSource = 'mobile'
  } else if (process.env.ANTHROPIC_MODEL || process.env.CLAUDE_CODE_MODEL) {
    // 环境变量优先级最高 —— 用户设了环境变量却改手机端设置时会困惑，
    // 界面据此提示「被环境变量覆盖」
    modelSource = 'env'
    try {
      model = getMainLoopModel()
    } catch {
      model = 'unknown'
    }
  } else {
    modelSource = 'settings'
    try {
      model = getMainLoopModel()
    } catch {
      model = 'unknown'
    }
  }

  // 思考强度：手机端用 token 数表达，此处同样以 token 数回传。
  // 未改过时回落到 0（关闭）—— 服务端拿不到具体 token 数（那是动态决定的）
  const thinkingTokens = mobileOverrides.thinkingTokens ?? 0
  const thinkingSource: 'mobile' | 'env' | 'settings' | 'default' =
    'thinkingTokens' in mobileOverrides
      ? 'mobile'
      : process.env.CLAUDE_CODE_EFFORT_LEVEL
        ? 'env'
        : 'default'

  return {
    model,
    thinkingTokens,
    // 权限模式同理：手机端没改过时，从 REPL 注册的回调读不到当前值
    //（那是 React 状态），故回落为 'default' 并标注来源为 default
    permissionMode: mobileOverrides.permissionMode ?? 'default',
    // 详细模式：未改过时回落 false，与 AppState 的初始值一致
    //（见 AppStateStore.ts 的 `verbose: false`）。同样读不到实时 React 状态，
    // 故只反映「手机端改过的值」，来源标注为 default 让界面能说明这一点。
    verbose: mobileOverrides.verbose ?? false,
    sources: {
      model: modelSource,
      thinkingTokens: thinkingSource,
      permissionMode: 'permissionMode' in mobileOverrides ? 'mobile' : 'default',
      verbose: 'verbose' in mobileOverrides ? 'mobile' : 'default',
    },
  }
}

/**
 * 会话标签，供手机端多会话列表展示。
 *
 * 优先级：运行时重命名 > DOGE_SESSION_LABEL > 当前工作目录名。
 * 运行时最高 —— 用户在手机上刚改的名字应当立刻生效。
 */
export function resolveSessionLabel(): string {
  if (runtimeSessionLabel) return runtimeSessionLabel
  const explicit = process.env.DOGE_SESSION_LABEL?.trim()
  if (explicit) return explicit
  return path.basename(process.cwd()) || process.cwd()
}

/** 标签长度上限。过长会在手机端列表里被截断，也失去辨识作用。 */
const MAX_SESSION_LABEL_LEN = 40

/**
 * 重命名当前会话（手机端调用）。
 *
 * @returns 生效后的标签；输入非法时返回当前标签（不报错）
 *
 * 校验放在这里而不是仅靠客户端：客户端可能是不受控的实现，
 * 服务端必须自己守卫边界（空串、超长、控制字符）。
 */
export function renameSession(rawLabel: unknown): string {
  if (typeof rawLabel !== 'string') return resolveSessionLabel()
  // 去掉控制字符：它们会让手机端列表渲染错乱，且可能被用于注入
  const cleaned = rawLabel.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned) return resolveSessionLabel()
  runtimeSessionLabel = cleaned.slice(0, MAX_SESSION_LABEL_LEN)
  logForDebugging(`[mobile] 会话已重命名为「${runtimeSessionLabel}」`)
  return runtimeSessionLabel
}

/** 测试用：清除运行时覆盖。 */
export function resetRuntimeSessionLabel(): void {
  runtimeSessionLabel = null
}

/**
 * 解析移动端桥接监听端口。
 *
 * CLAUDE_CODE_MOBILE_PORT 让多个 CLI 实例各占一个端口，手机端即可同时
 * 看到多个会话（多会话方案 A，见 android/MULTI-SESSION-PLAN.md）。
 *
 * 取不到或非法时回落到 5680 —— 端口配置错误不应导致桥接起不来。
 */
export function resolveMobilePort(): number {
  const raw = process.env.CLAUDE_CODE_MOBILE_PORT
  if (!raw) return 5680
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    logForDebugging(
      `[MobileBridge] CLAUDE_CODE_MOBILE_PORT 非法（${raw}），回落 5680`,
      { level: 'error' },
    )
    return 5680
  }
  return n
}

/**
 * 渲染手机端对话页面。
 *
 * 为什么不写原生 App：手机浏览器原生支持 WebSocket，扫码即用、零安装，
 * 不必引入 JDK / Android SDK / Flutter 工具链。页面通过 /mobile/ws 与
 * CLI 会话收发消息：发消息经 enqueue() 进入 REPL 输入队列（入站），
 * 回复由 useReplBridge 的消息流转发 effect 经 pushToMobileClients() 推回。
 */
/**
 * 渲染浏览器版聊天页。
 *
 * 导出以便测试 —— 它返回的是一段**内嵌 JS 的 HTML 字符串**，
 * 类型检查完全看不出其中的语法错误或未定义函数（整个 JS 部分对 TS
 * 而言只是一坨文本）。必须真的执行那段脚本才能验证。
 *
 * ⚠ 模板字符串里的转义陷阱（本项目实际踩中并导致线上页面完全不可用）：
 * 这个模板正文会被当作**代码**输出到浏览器执行，所以其中的 JS 字符串
 * 字面量必须写成 `\\n`（双反斜杠），否则 `\n` 会在**转译时**被解释成
 * 真实换行符，使输出的 JS 字符串跨行 → SyntaxError → 整页脚本不执行
 * （表现：页面只有骨架，按钮点了没反应、连不上）。
 *
 * 最阴险的一点：**tsc 与 esbuild 对模板里的 `\n` 处理不同** ——
 * 实测 `tsc` 会把它当字面 `\n` 保留（产物正常），而 vitest/构建实际
 * 使用的 **esbuild 会解释成真换行**（产物坏掉）。故「用 tsc 检查通过」
 * 完全不能作为「页面能跑」的依据。
 *
 * 唯一可靠的防线是 `tests/unit/mobile-web-page.test.ts` —— 它把这段
 * <script> 抽出来真的执行一遍，任何转义/语法问题都会立刻暴露。
 * 改动本模板后务必跑它。
 */
export function renderMobileChatPage(sessionId: string, port: number, secret: string): string {
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
  /* 流式预览：半透明以示「还在增长」，定稿到达后被替换 */
  .preview{opacity:.75;font-style:italic}
  /* 工具活动：折叠成一行，点开看命令与结果 */
  .tool{align-self:stretch;max-width:100%;background:#262626;border:1px solid #3a4a63;border-radius:10px;
        padding:6px 10px;font-size:13px}
  .tool summary{cursor:pointer;color:#8ab4f8;font-family:ui-monospace,Menlo,Consolas,monospace;
                list-style:none;outline:none}
  .tool summary::-webkit-details-marker{display:none}
  .tool summary::before{content:'▸ ';font-size:11px}
  .tool[open] summary::before{content:'▾ '}
  .tool summary.err{color:#ef5350}
  .tool summary.ok{color:#4ade80}
  .tool pre{margin:6px 0 0;padding:8px;background:#1e1e1e;border-radius:6px;overflow-x:auto;
            font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow-y:auto}
  .tdet{color:#b8c7e0}.tres{color:#9ca3af}
  .usage{align-self:center;color:#666;font-size:11px;padding:2px 0}
  /* 权限批准卡片：必须醒目 —— AI 此刻正阻塞等待 */
  .perm{align-self:stretch;max-width:100%;background:#2a2020;border:2px solid #c62828;border-radius:12px;
        padding:10px 12px;display:flex;flex-direction:column;gap:6px}
  .ptitle{color:#ef5350;font-weight:600;font-size:14px}
  .pdesc{color:#ccc;font-size:13px}
  .pdiff{margin:0;padding:8px;background:#1a1a1a;border-radius:6px;overflow-x:auto;font-size:12px;
         white-space:pre;max-height:280px;overflow-y:auto}
  .dl{display:block}.dl.add{color:#4ade80}.dl.del{color:#f87171}.dl.ctx{color:#888}
  .prow{display:flex;gap:8px}
  .prow button{flex:1}
  .prow button.deny{background:#7f1d1d}
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
    if (msg.type === 'client_connected') {
      // 服务端告知队列是否会被消费。CLI 跑在非交互终端时 REPL 不挂载，
      // 消息能入队但不会被处理 —— 必须显式告知，否则用户会对着
      //「已提交」一直等不到回复（这正是最难排查的一类静默失败）。
      if (msg.data && msg.data.interactive === false) {
        status(true, '已连接（但 CLI 非交互）');
        bubble('⚠ 电脑上的 CLI 运行在非交互模式，消息只会入队、不会被处理。\\n'
             + '请在真实终端里运行 doge.exe（或 node scripts/start-mobile-bridge.mjs），'
             + '不要用 -p 或重定向 stdin 的方式启动。', 's');
      } else {
        status(true, '已连接');
      }
      return;
    }
    if (msg.type === 'assistant' || msg.type === 'message') {
      var data = msg.data || {};
      var text = data.text || data.message || data.content;
      // 定稿到达：先清掉流式预览（定稿是权威版本，会替换预览内容），
      // 再追加正式气泡。顺序不能反 —— 反了会把刚追加的定稿一起清掉。
      finishPreview();
      if (typeof text === 'string' && text) bubble(text, 'a');
    } else if (msg.type === 'user') {
      // 多设备同步：服务端会把其它设备（或 CLI 终端）键入的消息广播过来。
      // 自己刚发的那条本地已 bubble 过（m 类名 u），服务端再推同一文本会
      // 造成重复气泡 —— 比对最后一条自己发出的消息去重。
      var d2 = msg.data || {};
      var t2 = d2.text || d2.message || d2.content;
      if (typeof t2 === 'string' && t2 && !isOwnEcho(t2)) bubble(t2, 'u');
    } else if (msg.type === 'result') {
      var d = msg.data || {};
      if (d.message) bubble(String(d.message), 'a');
      else if (d.status === 'queued') bubble('（已提交）', 'a');
    } else if (msg.type === 'error') {
      bubble('错误：' + ((msg.data && msg.data.error) || '未知'), 's');
    } else if (msg.type === 'system') {
      bubble(String((msg.data && msg.data.message) || ''), 's');
    } else if (msg.type === 'assistant_delta') {
      // 流式增量：累积到一个预览气泡里，而非每条增量各建一个气泡 ——
      // 后者会让界面瞬间被几十个碎片撑爆（打字机效果的常见错误做法）。
      appendDelta((msg.data && msg.data.text) || '');
    } else if (msg.type === 'tool_activity') {
      toolActivity(msg.data || {});
    } else if (msg.type === 'usage') {
      showUsage(msg.data || {});
    } else if (msg.type === 'permission_request') {
      showPermission(msg.data || {});
    } else if (msg.type === 'permission_cancel') {
      dropPermission((msg.data && msg.data.requestId) || '');
    }
  };
}

// ── 流式预览 ──
// 累积到单个气泡。定稿（assistant）到达时移除预览并由定稿气泡接管。
var previewEl = null, previewText = '';
function appendDelta(chunk){
  if (!chunk) return;
  previewText += chunk;
  if (!previewEl) { previewEl = bubble('', 'a preview'); }
  previewEl.textContent = previewText;
  log.scrollTop = log.scrollHeight;
}
function finishPreview(){
  if (!previewEl) return false;
  previewEl.remove();
  previewEl = null; previewText = '';
  return true;
}

// ── 工具活动 ──
// 用可折叠的 <details>：一次重构可能产生几十条工具调用，
// 全部铺开会淹没正文；折叠后只占一行摘要，点开看命令与结果。
var toolMap = {};   // toolUseId → <details> 元素
function toolActivity(d){
  var isResult = d.state === 'done' || d.state === 'error';
  var id = d.toolUseId || '';
  var el = id ? toolMap[id] : null;
  if (isResult && el) {
    // 结果合并进同一条（按 toolUseId 配对），不再新建气泡
    el.dataset.state = d.state;
    var pre = el.querySelector('.tres');
    if (pre && typeof d.result === 'string' && d.result) {
      pre.textContent = d.result;
      pre.style.display = 'block';
    }
    var sum = el.querySelector('summary');
    if (sum) sum.className = 'tsum ' + (d.state === 'error' ? 'err' : 'ok');
    el.open = true;   // 结果到了自动展开 —— 用户正想看它
    return;
  }
  var box = document.createElement('details');
  box.className = 'tool';
  box.open = false;
  var summary = document.createElement('summary');
  summary.className = 'tsum';
  var name = d.name || '工具';
  var target = d.target ? '  ' + d.target : '';
  summary.textContent = (d.kind === 'thinking' ? '🧠 思考' : '▸ ' + name) + target;
  box.appendChild(summary);
  if (typeof d.detail === 'string' && d.detail) {
    var pre = document.createElement('pre');
    pre.className = 'tdet';
    pre.textContent = d.detail;
    box.appendChild(pre);
  }
  var res = document.createElement('pre');
  res.className = 'tres';
  res.style.display = 'none';
  if (typeof d.result === 'string' && d.result) {
    res.textContent = d.result;
    res.style.display = 'block';
  }
  box.appendChild(res);
  log.appendChild(box);
  if (id) toolMap[id] = box;
  log.scrollTop = log.scrollHeight;
}

// ── 用量 ──
// 累计值，只保留最新一条（多行堆叠会让人以为「用量在乱跳」）
function showUsage(d){
  var parts = [];
  var total = (d.inputTokens || 0) + (d.outputTokens || 0);
  if (total > 0) parts.push(fmtK(total) + ' tokens');
  if (d.durationMs > 0) parts.push(fmtDur(d.durationMs));
  if (d.costUSD > 0) parts.push('$' + d.costUSD.toFixed(3));
  if (!parts.length) return;
  var el = document.getElementById('usage');
  if (!el) {
    el = document.createElement('div');
    el.id = 'usage';
    el.className = 'usage';
    log.appendChild(el);
  }
  el.textContent = 'Σ ' + parts.join(' · ');
  log.scrollTop = log.scrollHeight;
}
function fmtK(n){
  if (n < 1000) return String(n);
  if (n < 1000000) { var k = n / 1000; return (k % 1 === 0 ? k : k.toFixed(1)) + 'k'; }
  var m = n / 1000000; return (m % 1 === 0 ? m : m.toFixed(1)) + 'M';
}
function fmtDur(ms){
  var s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm' + Math.floor(s % 60) + 's';
}

// ── 权限批准 ──
// 浏览器版此前**完全没有**这条通道，后果是：AI 请求批准时，只开浏览器
// 的用户看不到任何提示，AI 永久卡在等待里 —— 这是比「体验差」严重得多的
// 功能缺失。故这里必须实现批准/拒绝的完整回路。
var permMap = {};
function showPermission(d){
  var requestId = d.requestId || '';
  if (!requestId) return;
  if (permMap[requestId]) return;   // 去重：同一请求可能被重复推送
  var box = document.createElement('div');
  box.className = 'perm';
  var title = document.createElement('div');
  title.className = 'ptitle';
  title.textContent = '⚠ 需要批准：' + (d.toolName || '工具');
  box.appendChild(title);
  if (d.description) {
    var desc = document.createElement('div');
    desc.className = 'pdesc';
    desc.textContent = d.description;
    box.appendChild(desc);
  }
  // diff 预览：只给 input 摘要就让人批准是安全上的实质缺口 ——
  // 盲签比不签更糟，因为它让人以为自己在把关。
  var lines = d.diff && d.diff.lines;
  if (lines && lines.length) {
    var pre = document.createElement('pre');
    pre.className = 'pdiff';
    for (var i = 0; i < lines.length; i++) {
      var ln = document.createElement('span');
      ln.className = 'dl ' + (lines[i][0] === '+' ? 'add' : lines[i][0] === '-' ? 'del' : 'ctx');
      ln.textContent = lines[i] + '\\n';
      pre.appendChild(ln);
    }
    box.appendChild(pre);
  } else if (d.input) {
    var ip = document.createElement('pre');
    ip.className = 'pdiff';
    ip.textContent = typeof d.input === 'string' ? d.input : JSON.stringify(d.input, null, 2);
    box.appendChild(ip);
  }
  var row = document.createElement('div');
  row.className = 'prow';
  var allow = document.createElement('button');
  allow.textContent = '批准';
  allow.onclick = function(){ decide(requestId, 'allow', box); };
  var deny = document.createElement('button');
  deny.className = 'deny';
  deny.textContent = '拒绝';
  deny.onclick = function(){ decide(requestId, 'deny', box); };
  row.appendChild(allow); row.appendChild(deny);
  box.appendChild(row);
  log.appendChild(box);
  permMap[requestId] = box;
  log.scrollTop = log.scrollHeight;
}
function decide(requestId, behavior, box){
  box.dataset.done = '1';
  var row = box.querySelector('.prow');
  if (row) row.remove();
  var tag = document.createElement('div');
  tag.className = 'ptitle';
  tag.textContent = behavior === 'allow' ? '✓ 已批准' : '✗ 已拒绝';
  box.appendChild(tag);
  ws.send(JSON.stringify({
    type: 'control', action: 'permissionResponse',
    params: { requestId: requestId, behavior: behavior },
    requestId: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
    sessionId: CFG.sessionId, timestamp: Date.now()
  }));
}
// 服务端撤销（本地终端已先决定）→ 移除卡片，避免留下点了没反应的无效按钮
function dropPermission(requestId){
  var box = permMap[requestId];
  if (!box) return;
  var row = box.querySelector('.prow');
  if (row) row.remove();
  var tag = document.createElement('div');
  tag.className = 'ptitle';
  tag.textContent = '该请求已在电脑终端处理';
  box.appendChild(tag);
  delete permMap[requestId];
}
// 自己已发出、尚未收到 queued 回执的消息文本。用于把服务端回推的
// 同文本 type:"user" 消息识别为自己发的，避免重复气泡（多设备同步下
// 服务端会向所有设备广播 user 消息）。收到回执即移除。
var sentPending = [];
function isOwnEcho(text){
  var i = sentPending.indexOf(text);
  if (i < 0) return false;
  sentPending.splice(i, 1);
  return true;
}
function send(){
  var text = inp.value.trim();
  if (!text || !ready) return;
  bubble(text, 'u');
  sentPending.push(text);
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