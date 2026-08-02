/**
 * remoteSignaling.ts — WebSocket 信令服务器 + 远程控制协议
 *
 * 使用 Node.js 内置模块实现，无需外部依赖。
 * - HTTP 服务器处理 WebSocket 升级
 * - 帧协议遵循 RFC 6455（简化版，支持文本帧）
 * - 远程控制消息协议（鼠标/键盘/剪贴板事件序列化）
 *
 * 架构：
 * ┌──────────────┐      WebSocket       ┌──────────────┐
 * │  Controller  │ ◄──────────────────► │    Host       │
 * │  (远程用户)   │    SDP/ICE 交换      │  (本机用户)    │
 * └──────┬───────┘                      └──────┬───────┘
 *        │   WebRTC DataChannel (P2P)          │
 *        │   鼠标/键盘/剪贴板事件               │
 *        └─────────────────────────────────────┘
 */

import { createServer, type Server, type IncomingMessage } from 'http'
import { createHash, randomBytes } from 'crypto'
import { type Socket } from 'net'

// ─── 远程控制消息协议 ───

export type RemoteMessageType =
  | 'pointer-move'    // 鼠标移动
  | 'pointer-down'    // 鼠标按下
  | 'pointer-up'      // 鼠标释放
  | 'pointer-wheel'   // 鼠标滚轮
  | 'key-down'        // 键盘按下
  | 'key-up'          // 键盘释放
  | 'clipboard-set'   // 剪贴板同步
  | 'scroll'          // 滚动事件
  | 'zoom'            // 缩放
  | 'quality'         // 视频质量调整
  | 'ping'            // 心跳
  | 'pong'            // 心跳响应
  | 'connect'         // 连接请求
  | 'disconnect'      // 断开连接
  | 'status'          // 状态报告
  | 'sdp-offer'       // WebRTC SDP Offer
  | 'sdp-answer'      // WebRTC SDP Answer
  | 'ice-candidate'   // WebRTC ICE Candidate
  | 'register-host'   // 注册为 Host
  | 'register-controller' // 注册为 Controller

export interface RemoteMessage {
  type: RemoteMessageType
  timestamp: number
  sessionId: string
  payload: Record<string, unknown>
}

// ─── WebSocket 帧协议常量 ───

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const OPCODE_TEXT = 0x1
const OPCODE_CLOSE = 0x8
const OPCODE_PING = 0x9
const OPCODE_PONG = 0xA

// ─── 对端连接 ───

interface PeerConnection {
  id: string
  socket: Socket
  role: 'host' | 'controller' | 'unknown'
  sessionId: string
  connected: boolean
  lastHeartbeat: number
  buffer: Buffer  // 帧重组缓冲
}

// ─── 会话状态 ───

interface Session {
  host: string | null
  controllers: Set<string>
  createdAt: number
}

// ─── 信令服务器 ───

export class RemoteSignalingServer {
  private httpServer: Server | null = null
  private peers = new Map<string, PeerConnection>()
  private sessions = new Map<string, Session>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _port = 0
  private onMessageCallback: ((msg: RemoteMessage) => void) | null = null

  get port(): number {
    return this._port
  }

  get isRunning(): boolean {
    return this.httpServer?.listening ?? false
  }

  /**
   * 设置消息回调（用于主进程事件分发）
   */
  onMessage(callback: (msg: RemoteMessage) => void): void {
    this.onMessageCallback = callback
  }

  /**
   * 启动信令服务器
   */
  start(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer()

        this.httpServer.on('upgrade', (req: IncomingMessage, socket: Socket) => {
          this.handleUpgrade(req, socket)
        })

        this.httpServer.on('error', (err) => {
          reject(err)
        })

        this.httpServer.listen(port, '0.0.0.0', () => {
          const addr = this.httpServer!.address()
          this._port = typeof addr === 'object' && addr ? addr.port : port
          this.startHeartbeat()
          resolve(this._port)
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * 停止信令服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
      }

      for (const peer of this.peers.values()) {
        this.sendClose(peer.socket)
      }

      this.peers.clear()
      this.sessions.clear()

      this.httpServer?.close(() => resolve())
      setTimeout(resolve, 2000)
    })
  }

  // ─── WebSocket 握手 ───

  private handleUpgrade(req: IncomingMessage, socket: Socket): void {
    const key = req.headers['sec-websocket-key']
    if (!key) {
      socket.destroy()
      return
    }

    const acceptKey = createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64')

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ]

    socket.write(responseHeaders.join('\r\n'))

    const peerId = `peer-${Date.now()}-${randomBytes(4).toString('hex')}`
    const peer: PeerConnection = {
      id: peerId,
      socket,
      role: 'unknown',
      sessionId: '',
      connected: true,
      lastHeartbeat: Date.now(),
      buffer: Buffer.alloc(0),
    }

    this.peers.set(peerId, peer)

    socket.on('data', (data: Buffer) => {
      this.handleSocketData(peer, data)
    })

    socket.on('close', () => {
      this.handleDisconnect(peer)
    })

    socket.on('error', () => {
      this.handleDisconnect(peer)
    })

    // 发送连接确认
    this.sendTo(peer, {
      type: 'connect',
      timestamp: Date.now(),
      sessionId: '',
      payload: { peerId, message: 'Connected to DogeCode signaling server' },
    })
  }

  // ─── 帧解析 ───

  private handleSocketData(peer: PeerConnection, data: Buffer): void {
    peer.buffer = Buffer.concat([peer.buffer, data])

    // 尝试解析完整帧
    while (peer.buffer.length >= 2) {
      const firstByte = peer.buffer[0]
      const secondByte = peer.buffer[1]

      const fin = (firstByte & 0x80) !== 0
      const opcode = firstByte & 0x0F
      let payloadLen = secondByte & 0x7F
      let offset = 2

      // 处理扩展payload长度
      if (payloadLen === 126) {
        if (peer.buffer.length < 4) return
        payloadLen = peer.buffer.readUInt16BE(2)
        offset = 4
      } else if (payloadLen === 127) {
        if (peer.buffer.length < 10) return
        payloadLen = Number(peer.buffer.readBigUInt64BE(2))
        offset = 10
      }

      // 处理掩码（客户端必须掩码）
      let payload: Buffer
      if ((secondByte & 0x80) !== 0) {
        if (peer.buffer.length < offset + 4 + payloadLen) return
        const mask = peer.buffer.slice(offset, offset + 4)
        payload = Buffer.alloc(payloadLen)
        const encrypted = peer.buffer.slice(offset + 4, offset + 4 + payloadLen)
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = encrypted[i] ^ mask[i % 4]
        }
        offset += 4
      } else {
        if (peer.buffer.length < offset + payloadLen) return
        payload = peer.buffer.slice(offset, offset + payloadLen)
      }

      // 消费已处理的字节
      peer.buffer = peer.buffer.slice(offset + payloadLen)

      // 处理帧
      if (opcode === OPCODE_TEXT) {
        try {
          const text = payload.toString('utf-8')
          const msg = JSON.parse(text) as { type: string; sessionId?: string; payload?: Record<string, unknown> }
          this.handleMessage(peer, msg)
        } catch {
          // 忽略无效消息
        }
      } else if (opcode === OPCODE_CLOSE) {
        this.handleDisconnect(peer)
        return
      } else if (opcode === OPCODE_PING) {
        this.sendPong(peer)
      } else if (opcode === OPCODE_PONG) {
        peer.lastHeartbeat = Date.now()
      }
    }
  }

  // ─── 消息处理 ───

  private handleMessage(peer: PeerConnection, msg: { type: string; sessionId?: string; payload?: Record<string, unknown> }): void {
    const { type, sessionId = '', payload = {} } = msg

    switch (type) {
      case 'register-host': {
        peer.role = 'host'
        peer.sessionId = sessionId

        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, { host: peer.id, controllers: new Set(), createdAt: Date.now() })
        } else {
          this.sessions.get(sessionId)!.host = peer.id
        }

        this.sendTo(peer, {
          type: 'status',
          timestamp: Date.now(),
          sessionId,
          payload: { role: 'host', message: 'Registered as host', signalingPort: this._port },
        })
        break
      }

      case 'register-controller': {
        peer.role = 'controller'
        peer.sessionId = sessionId

        const session = this.sessions.get(sessionId)
        if (session) {
          session.controllers.add(peer.id)
          const hostPeer = session.host ? this.peers.get(session.host) : null
          if (hostPeer) {
            this.sendTo(hostPeer, {
              type: 'status',
              timestamp: Date.now(),
              sessionId,
              payload: { event: 'controller_joined', controllerId: peer.id },
            })
          }
        } else {
          // 会话不存在，自动创建等待 host
          this.sessions.set(sessionId, { host: null, controllers: new Set([peer.id]), createdAt: Date.now() })
        }

        this.sendTo(peer, {
          type: 'status',
          timestamp: Date.now(),
          sessionId,
          payload: { role: 'controller', message: 'Registered as controller' },
        })
        break
      }

      case 'ping': {
        peer.lastHeartbeat = Date.now()
        this.sendTo(peer, { type: 'pong', timestamp: Date.now(), sessionId, payload: {} })
        break
      }

      default: {
        // 转发所有其他消息（SDP/ICE/远程控制事件）
        this.forwardSignal(peer, type, sessionId, payload)
        break
      }
    }

    // 触发回调
    if (this.onMessageCallback) {
      this.onMessageCallback({ type: type as RemoteMessageType, timestamp: Date.now(), sessionId, payload })
    }
  }

  /**
   * 转发信令/控制消息到目标
   */
  private forwardSignal(from: PeerConnection, type: string, sessionId: string, payload: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const msg = {
      type,
      timestamp: Date.now(),
      sessionId,
      payload: { ...payload, fromPeerId: from.id, fromRole: from.role },
    }

    if (from.role === 'host') {
      for (const controllerId of session.controllers) {
        const controller = this.peers.get(controllerId)
        if (controller) this.sendTo(controller, msg)
      }
    } else if (from.role === 'controller') {
      const hostPeer = session.host ? this.peers.get(session.host) : null
      if (hostPeer) this.sendTo(hostPeer, msg)
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(peer: PeerConnection): void {
    if (peer.sessionId) {
      const session = this.sessions.get(peer.sessionId)
      if (session) {
        if (peer.role === 'host') {
          for (const controllerId of session.controllers) {
            const controller = this.peers.get(controllerId)
            if (controller) {
              this.sendTo(controller, {
                type: 'disconnect',
                timestamp: Date.now(),
                sessionId: peer.sessionId,
                payload: { reason: 'host_disconnected' },
              })
            }
          }
          session.host = null
          // 清理空会话
          if (session.controllers.size === 0) {
            this.sessions.delete(peer.sessionId)
          }
        } else if (peer.role === 'controller') {
          session.controllers.delete(peer.id)
          const hostPeer = session.host ? this.peers.get(session.host) : null
          if (hostPeer) {
            this.sendTo(hostPeer, {
              type: 'status',
              timestamp: Date.now(),
              sessionId: peer.sessionId,
              payload: { event: 'controller_left', controllerId: peer.id },
            })
          }
          if (session.controllers.size === 0 && !session.host) {
            this.sessions.delete(peer.sessionId)
          }
        }
      }
    }

    peer.socket.destroy()
    this.peers.delete(peer.id)
  }

  // ─── WebSocket 帧发送 ───

  private sendTo(peer: PeerConnection, msg: Record<string, unknown>): void {
    try {
      const text = JSON.stringify(msg)
      const payload = Buffer.from(text, 'utf-8')
      const len = payload.length

      let header: Buffer
      if (len < 126) {
        header = Buffer.alloc(2)
        header[1] = len
      } else if (len < 65536) {
        header = Buffer.alloc(4)
        header[1] = 126
        header.writeUInt16BE(len, 2)
      } else {
        header = Buffer.alloc(10)
        header[1] = 127
        header.writeBigUInt64BE(BigInt(len), 2)
      }

      // FIN + TEXT opcode
      header[0] = 0x80 | OPCODE_TEXT

      peer.socket.write(Buffer.concat([header, payload]))
    } catch {
      // 写入失败，忽略
    }
  }

  private sendPong(peer: PeerConnection): void {
    try {
      const header = Buffer.from([0x80 | OPCODE_PONG, 0])
      peer.socket.write(header)
    } catch {
      // ignore
    }
  }

  private sendClose(socket: Socket): void {
    try {
      const header = Buffer.from([0x80 | OPCODE_CLOSE, 0])
      socket.write(header)
    } catch {
      // ignore
    }
  }

  // ─── 心跳检测 ───

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const timeout = 90000 // 90 秒超时

      for (const peer of this.peers.values()) {
        if (now - peer.lastHeartbeat > timeout) {
          peer.socket.destroy()
          this.handleDisconnect(peer)
        }
      }
    }, 30000)
  }

  // ─── 统计信息 ───

  getStats(): { peers: number; sessions: number; port: number } {
    let activeSessions = 0
    for (const s of this.sessions.values()) {
      if (s.host || s.controllers.size > 0) activeSessions++
    }
    return {
      peers: this.peers.size,
      sessions: activeSessions,
      port: this._port,
    }
  }
}
