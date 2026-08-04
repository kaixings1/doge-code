import type { SessionInfo, SessionState } from './types.js'
import type { BackendSession } from './backends/dangerousBackend.js'

interface SessionManagerConfig {
  idleTimeoutMs?: number
  maxSessions?: number
}

export interface CreateSessionOptions {
  cwd?: string
  sessionKey?: string
  permissionMode?: string
}

/**
 * 服务器会话管理器。
 *
 * 负责会话的创建、查询、销毁，并委托给底层后端（如 DangerousBackend）
 * 管理实际子进程。支持最大会话数限制与空闲超时清理。
 */
export class SessionManager {
  private backend: any
  private config: SessionManagerConfig
  private sessions = new Map<string, SessionInfo>()
  private idleTimer: ReturnType<typeof setInterval> | null = null

  constructor(backend?: any, config?: SessionManagerConfig) {
    this.backend = backend
    this.config = config || {}
    this.startIdleSweeper()
  }

  /** 创建会话（受 maxSessions 限制） */
  async createSession(options?: CreateSessionOptions): Promise<SessionInfo> {
    if (this.config.maxSessions && this.sessions.size >= this.config.maxSessions) {
      throw new Error(`达到最大会话数限制: ${this.config.maxSessions}`)
    }

    let created: BackendSession | { id: string; cwd?: string; process?: unknown } | null = null
    if (this.backend && typeof this.backend.createSession === 'function') {
      created = await this.backend.createSession(options)
    }
    const id = created?.id || options?.sessionKey || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const info: SessionInfo = {
      id,
      status: 'running',
      createdAt: Date.now(),
      workDir: options?.cwd || created?.cwd || process.cwd(),
      process: (created as any)?.process || null,
    }
    this.sessions.set(id, info)
    return info
  }

  /** 获取会话信息 */
  getSession(id: string): SessionInfo | null {
    const s = this.sessions.get(id)
    return s ? { ...s, process: null } : null
  }

  /** 列出全部会话 */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s, process: null }))
  }

  /** 标记会话状态 */
  setStatus(id: string, status: SessionState): void {
    const s = this.sessions.get(id)
    if (s) s.status = status
  }

  /** 销毁单个会话 */
  async destroySession(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    if (this.backend && typeof this.backend.destroy === 'function') {
      await this.backend.destroy(id)
    }
    this.sessions.delete(id)
  }

  /** 销毁全部会话 */
  async destroyAll(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
    if (this.backend && typeof this.backend.destroyAll === 'function') {
      await this.backend.destroyAll()
    }
    this.sessions.clear()
  }

  /** 会话总数 */
  size(): number {
    return this.sessions.size
  }

  /** 启动空闲超时清理（配置了 idleTimeoutMs 时） */
  private startIdleSweeper(): void {
    if (!this.config.idleTimeoutMs || this.config.idleTimeoutMs <= 0) return
    this.idleTimer = setInterval(() => {
      const cutoff = Date.now() - (this.config.idleTimeoutMs || 0)
      for (const [id, s] of Array.from(this.sessions.entries())) {
        if (s.createdAt < cutoff && s.status === 'detached') {
          void this.destroySession(id)
        }
      }
    }, 60000)
    // 不阻止进程退出
    this.idleTimer.unref?.()
  }
}
