/**
 * localBridge.ts — 本地桥接客户端
 *
 * 当 CLAUDE_CODE_LOCAL_BRIDGE=1 时，替代 initReplBridge 连接本地桥接服务器。
 * 协议与 scripts/bridge.ts 服务器兼容。
 *
 * 功能：
 * - WebSocket 连接本地桥接服务器
 * - 注册为 host 或 controller
 * - 心跳保活
 * - 消息收发
 * - 工具调用（本地执行）
 */

import { randomUUID } from 'crypto'
import { getLocalBridgeUrl } from './bridgeConfig.js'

// ─── 类型 ───

export interface LocalBridgeHandle {
  sessionId: string
  role: 'host' | 'controller'
  connected: boolean
  /** 发送消息到桥接 */
  writeMessages: (messages: Array<Record<string, unknown>>) => void
  /** 发送 SDK 消息 */
  writeSdkMessages: (messages: Array<Record<string, unknown>>) => void
  /** 发送控制请求 */
  sendControlRequest: (msg: Record<string, unknown>) => void
  /** 发送控制响应 */
  sendControlResponse: (msg: Record<string, unknown>) => void
  /** 发送控制取消 */
  sendControlCancelRequest: (requestId: string) => void
  /** 发送结果 */
  sendResult: () => void
  /** 拆除连接 */
  teardown: () => Promise<void>
  /** 环境 ID（本地模式始终为空） */
  environmentId: string
  /** 桥接会话 ID */
  bridgeSessionId: string
  /** 会话入口 URL */
  sessionIngressUrl: string
}

interface LocalBridgeOptions {
  sessionId: string
  role?: 'host' | 'controller'
  onInboundMessage?: (msg: Record<string, unknown>) => void
  onStateChange?: (state: string, detail?: string) => void
  onPermissionResponse?: (msg: Record<string, unknown>) => void
  initialMessages?: Array<Record<string, unknown>>
  initialName?: string
}

// ─── WebSocket 协议 ───

interface ProtocolMessage {
  uuid: string
  type: string
  data: Record<string, unknown>
  timestamp?: number
}

function createMessage(type: string, data: Record<string, unknown> = {}): ProtocolMessage {
  return { uuid: randomUUID(), type, data, timestamp: Date.now() }
}

// ─── 本地桥接客户端 ───

export class LocalBridgeClient {
  private ws: WebSocket | null = null
  private sessionId: string
  private role: 'host' | 'controller'
  private connected = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private serverUrl: string
  private onInboundMessage?: (msg: Record<string, unknown>) => void
  private onStateChange?: (state: string, detail?: string) => void
  private onPermissionResponse?: (msg: Record<string, unknown>) => void

  constructor(options: LocalBridgeOptions) {
    this.sessionId = options.sessionId
    this.role = options.role || 'host'
    this.serverUrl = getLocalBridgeUrl().replace(/^http/, 'ws')
    this.onInboundMessage = options.onInboundMessage
    this.onStateChange = options.onStateChange
    this.onPermissionResponse = options.onPermissionResponse
  }

  /**
   * 连接到本地桥接服务器
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = `${this.serverUrl}/session-ingress/${this.sessionId}`

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
      }, 10000)

      this.ws.onopen = () => {
        this.connected = true
        clearTimeout(timeout)

        // 注册角色
        this.send(createMessage(`register-${this.role}`, { sessionId: this.sessionId }))

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
    switch (msg.type) {
      case 'pong':
        // 心跳响应
        break

      case 'status':
        if (msg.data.event === 'controller_joined') {
          this.onStateChange?.('connected')
        }
        break

      case 'disconnect':
        this.onStateChange?.('disconnected', msg.data.reason as string)
        break

      case 'tool:request':
        // 收到工具请求，本地执行
        this.handleToolRequest(msg)
        break

      case 'message':
        this.onInboundMessage?.(msg.data)
        break

      case 'control_response':
        this.onPermissionResponse?.(msg)
        break

      default:
        // 其他消息转发给入站处理
        if (msg.type.startsWith('pointer-') || msg.type.startsWith('key-') || msg.type === 'clipboard-set') {
          this.onInboundMessage?.(msg)
        }
        break
    }
  }

  /**
   * 处理工具请求（本地执行）
   */
  private async handleToolRequest(msg: ProtocolMessage): Promise<void> {
    const { tool, params, callId } = msg.data as { tool: string; params: Record<string, unknown>; callId?: string }

    // 发送开始事件
    this.send(createMessage('tool:start', { tool, callId }))

    try {
      // 本地执行工具（简化版）
      const result = await this.executeLocalTool(tool, params)

      // 发送完成事件
      this.send(createMessage('tool:complete', { tool, result, callId }))

      // 发送响应
      this.send(createMessage('tool:response', {
        success: true,
        result,
        call_id: callId,
      }))
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.send(createMessage('tool:error', { tool, error: errorMsg, callId }))
      this.send(createMessage('tool:response', {
        success: false,
        error: errorMsg,
        call_id: callId,
      }))
    }
  }

  /**
   * 本地执行工具
   */
  private async executeLocalTool(tool: string, params: Record<string, unknown>): Promise<unknown> {
    switch (tool) {
      case 'terminal': {
        const { command } = params as { command: string }
        // 注意：实际执行需要导入 BashTool
        return { stdout: `Local exec: ${command}`, stderr: '', exitCode: 0 }
      }
      case 'filesystem': {
        const { operation, path } = params as { operation: string; path: string }
        return { success: true, path, operation }
      }
      case 'search': {
        const { pattern } = params as { pattern: string }
        return { matches: [], count: 0, pattern }
      }
      case 'code': {
        const { action } = params as { action: string }
        return { result: `Code ${action} complete` }
      }
      default:
        throw new Error(`Unknown local tool: ${tool}`)
    }
  }

  /**
   * 发送消息
   */
  send(msg: ProtocolMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send(createMessage('ping'))
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

  isConnected(): boolean {
    return this.connected
  }
}

// ─── 工厂函数 ───

/**
 * 初始化本地桥接连接（替代 initReplBridge）
 */
export async function initLocalBridge(options: LocalBridgeOptions): Promise<LocalBridgeHandle | null> {
  const client = new LocalBridgeClient(options)

  const connected = await client.connect()
  if (!connected) {
    return null
  }

  return {
    sessionId: options.sessionId,
    role: options.role || 'host',
    connected: true,
    environmentId: '',
    bridgeSessionId: options.sessionId,
    sessionIngressUrl: getLocalBridgeUrl(),

    writeMessages(messages: Array<Record<string, unknown>>) {
      for (const msg of messages) {
        client.send(createMessage('message', { ...msg, direction: 'outbound' }))
      }
    },

    writeSdkMessages(messages: Array<Record<string, unknown>>) {
      for (const msg of messages) {
        client.send(createMessage('sdk_message', msg))
      }
    },

    sendControlRequest(msg: Record<string, unknown>) {
      client.send(createMessage('control_request', msg))
    },

    sendControlResponse(msg: Record<string, unknown>) {
      client.send(createMessage('control_response', msg))
    },

    sendControlCancelRequest(requestId: string) {
      client.send(createMessage('control_cancel', { request_id: requestId }))
    },

    sendResult() {
      client.send(createMessage('result', { status: 'completed' }))
    },

    async teardown() {
      await client.disconnect()
    },
  }
}
