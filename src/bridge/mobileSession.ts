/**
 * mobileSession.ts — 移动端会话管理模块
 *
 * 管理移动端连接的生命周期、认证和状态。
 * 每个移动端会话对应一个唯一的 sessionId，
 * 支持多设备同时连接。
 */

import { randomUUID } from 'crypto'

// ─── 会话状态 ───

export type MobileSessionState =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'active'
  | 'idle'
  | 'disconnected'
  | 'expired'

// ─── 会话信息 ───

export interface MobileSessionInfo {
  sessionId: string
  deviceName: string
  deviceType: 'ios' | 'android' | 'unknown'
  state: MobileSessionState
  connectedAt: number
  lastActivityAt: number
  authenticated: boolean
  capabilities: string[]
  metadata: Record<string, unknown>
}

// ─── 认证信息 ───

export interface MobileAuthInfo {
  secret: string
  expiresAt: number
  maxConnections: number
  allowedDevices: string[]
}

// ─── 会话管理器 ───

export class MobileSessionManager {
  private sessions = new Map<string, MobileSessionInfo>()
  private authInfo: MobileAuthInfo
  private maxSessions: number
  private sessionTimeoutMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: {
    secret?: string
    maxSessions?: number
    sessionTimeoutMs?: number
  } = {}) {
    this.authInfo = {
      secret: options.secret ?? process.env.CLAUDE_CODE_MOBILE_SECRET ?? '',
      expiresAt: 0, // 永不过期（除非设置了过期时间）
      maxConnections: options.maxSessions ?? 5,
      allowedDevices: [], // 空表示允许所有设备
    }
    this.maxSessions = options.maxSessions ?? 5
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? 30 * 60 * 1000 // 30 分钟超时
  }

  /**
   * 创建新会话
   */
  createSession(deviceName = 'Unknown Device', deviceType: 'ios' | 'android' | 'unknown' = 'unknown'): MobileSessionInfo {
    // 检查最大会话数
    if (this.sessions.size >= this.maxSessions) {
      // 清理过期会话
      this.cleanupExpiredSessions()
      if (this.sessions.size >= this.maxSessions) {
        throw new Error(`移动端会话数已达上限（${this.maxSessions}）`)
      }
    }

    const sessionId = `mobile-${randomUUID()}`
    const now = Date.now()

    const session: MobileSessionInfo = {
      sessionId,
      deviceName,
      deviceType,
      state: 'connecting',
      connectedAt: now,
      lastActivityAt: now,
      authenticated: false,
      capabilities: [],
      metadata: {},
    }

    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): MobileSessionInfo | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 更新会话状态
   */
  updateSessionState(sessionId: string, state: MobileSessionState): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.state = state
    session.lastActivityAt = Date.now()

    if (state === 'authenticated') {
      session.authenticated = true
    }

    return true
  }

  /**
   * 更新会话能力
   */
  updateSessionCapabilities(sessionId: string, capabilities: string[]): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.capabilities = capabilities
    session.lastActivityAt = Date.now()
    return true
  }

  /**
   * 更新会话元数据
   */
  updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.metadata = { ...session.metadata, ...metadata }
    session.lastActivityAt = Date.now()
    return true
  }

  /**
   * 认证会话
   */
  authenticateSession(sessionId: string, secret: string): boolean {
    if (!this.authInfo.secret || secret === this.authInfo.secret) {
      return this.updateSessionState(sessionId, 'authenticated')
    }
    return false
  }

  /**
   * 结束会话
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.state = 'disconnected'
    session.lastActivityAt = Date.now()
    return true
  }

  /**
   * 移除会话
   */
  removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): MobileSessionInfo[] {
    this.cleanupExpiredSessions()
    return Array.from(this.sessions.values()).filter(
      s => s.state !== 'disconnected' && s.state !== 'expired',
    )
  }

  /**
   * 获取已认证会话数
   */
  getAuthenticatedSessionCount(): number {
    return this.getActiveSessions().filter(s => s.authenticated).length
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt > this.sessionTimeoutMs) {
        session.state = 'expired'
        this.sessions.delete(sessionId)
      }
    }
  }

  /**
   * 启动定期清理
   */
  startCleanup(intervalMs = 60000): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions()
    }, intervalMs)
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      authenticatedSessions: this.getAuthenticatedSessionCount(),
      maxSessions: this.maxSessions,
      sessionTimeoutMs: this.sessionTimeoutMs,
    }
  }

  /**
   * 设置认证密钥
   */
  setSecret(secret: string): void {
    this.authInfo.secret = secret
  }

  /**
   * 设置允许的设备列表
   */
  setAllowedDevices(devices: string[]): void {
    this.authInfo.allowedDevices = devices
  }

  /**
   * 检查设备是否允许连接
   */
  isDeviceAllowed(deviceName: string): boolean {
    if (this.authInfo.allowedDevices.length === 0) return true
    return this.authInfo.allowedDevices.includes(deviceName)
  }
}

// ─── 全局单例 ───

let globalSessionManager: MobileSessionManager | null = null

export function getMobileSessionManager(): MobileSessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new MobileSessionManager()
  }
  return globalSessionManager
}

export function setMobileSessionManager(manager: MobileSessionManager): void {
  globalSessionManager = manager
}