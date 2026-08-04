import { spawn, type ChildProcess } from 'child_process'

export interface BackendSession {
  id: string
  process: ChildProcess
  cwd: string
  createdAt: number
  lastActiveAt: number
}

export interface BackendCreateOptions {
  cwd?: string
  sessionKey?: string
  permissionMode?: string
}

/**
 * Dangerous 模式后端。
 *
 * 为每个会话派生一个子进程（默认当前 CLI 入口，dangerous 模式跳过权限提示），
 * 通过 stdin/stdout JSON 行协议交互。会话生命周期由 SessionManager 管理。
 */
export class DangerousBackend {
  private config: any
  private sessions = new Map<string, BackendSession>()

  constructor(config?: any) {
    this.config = config || {}
  }

  async createSession(options?: BackendCreateOptions): Promise<BackendSession> {
    const id = options?.sessionKey || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const cwd = options?.cwd || process.cwd()

    // 会话子进程：dangerous 模式 + stream-json 输入
    const args = [
      '--dangerously-skip-permissions',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
    ]
    if (this.config.binary) args.unshift(this.config.binary)

    const child = spawn(this.config.binary || process.execPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, CLAUDE_CODE_SERVE_SESSION: id },
    })

    const session: BackendSession = {
      id,
      process: child,
      cwd,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }
    this.sessions.set(id, session)
    return session
  }

  /** 发送 JSON 消息到会话子进程 stdin */
  async sendMessage(sessionId: string, message: any): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (!session.process.stdin || session.process.stdin.destroyed) return false
    session.lastActiveAt = Date.now()
    session.process.stdin.write(JSON.stringify(message) + '\n')
    return true
  }

  /** 向会话子进程发送中断信号 */
  async interrupt(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session && session.process.pid) {
      try { session.process.kill('SIGINT') } catch { /* ignore */ }
    }
  }

  /** 终止并移除会话 */
  async destroy(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.process.pid) {
      try { session.process.kill('SIGKILL') } catch { /* ignore */ }
    }
    this.sessions.delete(sessionId)
  }

  /** 销毁全部会话 */
  async destroyAll(): Promise<void> {
    for (const id of Array.from(this.sessions.keys())) {
      await this.destroy(id)
    }
  }

  /** 获取会话（不含子进程引用） */
  getSession(sessionId: string): Omit<BackendSession, 'process'> | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return { id: s.id, cwd: s.cwd, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt }
  }

  /** 会话总数 */
  size(): number {
    return this.sessions.size
  }
}
