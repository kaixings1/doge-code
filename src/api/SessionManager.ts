import type { InternalMessage, SessionMetadata } from './types.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ISession {
  id: string;
  messages: InternalMessage[];
  metadata: SessionMetadata;
  state: {
    status: 'active' | 'inactive' | 'archived';
    lastActive: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 会话管理器类
 * 提供会话 CRUD、消息管理、磁盘持久化
 */
export class SessionManager {
  private sessions = new Map<string, ISession>();
  private activeSessionId: string | null = null;
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || join(homedir(), '.doge', 'sessions');
    this.ensureStorageDir();
    this.loadFromDisk();
  }

  private ensureStorageDir(): void {
    try { mkdirSync(this.storageDir, { recursive: true }); } catch { /* ignore */ }
  }

  private sessionPath(id: string): string {
    return join(this.storageDir, `${id}.json`);
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.storageDir)) return;
      const files = readdirSync(this.storageDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(this.storageDir, file), 'utf-8'));
          const session: ISession = {
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            state: { ...data.state, lastActive: data.state?.lastActive ? new Date(data.state.lastActive) : null },
          };
          this.sessions.set(session.id, session);
        } catch { /* 忽略损坏的会话文件 */ }
      }
    } catch { /* ignore */ }
  }

  private persist(session: ISession): void {
    try {
      this.ensureStorageDir();
      writeFileSync(this.sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }

  async createSession(config?: { metadata?: SessionMetadata }): Promise<ISession> {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: ISession = {
      id,
      messages: [],
      metadata: config?.metadata || { title: 'New Session', tags: [] },
      state: { status: 'active', lastActive: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.persist(session);
    return session;
  }

  async loadSession(sessionId: string): Promise<ISession | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.activeSessionId = sessionId;
      session.state.lastActive = new Date();
      session.state.status = 'active';
      this.persist(session);
    }
    return session ?? null;
  }

  async saveSession(session: ISession): Promise<void> {
    session.updatedAt = new Date();
    this.sessions.set(session.id, session);
    this.persist(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    try { rmSync(this.sessionPath(sessionId), { force: true }); } catch { /* ignore */ }
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.sessions.size > 0 ? this.sessions.keys().next().value ?? null : null;
    }
  }

  getActiveSession(): ISession | null {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) ?? null : null;
  }

  async listSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async addMessage(sessionId: string, message: InternalMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.messages.push(message);
    session.updatedAt = new Date();
    session.state.lastActive = new Date();
    this.persist(session);
  }

  async clearMessages(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.messages = [];
    session.updatedAt = new Date();
    this.persist(session);
  }

  /** 按标题搜索会话 */
  async searchSessions(query: string): Promise<ISession[]> {
    const q = query.toLowerCase();
    return Array.from(this.sessions.values()).filter(s =>
      s.metadata.title?.toLowerCase().includes(q) ||
      s.metadata.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  /** 获取会话统计 */
  async getSessionStats(sessionId: string): Promise<{ messageCount: number; userMessages: number; assistantMessages: number; toolMessages: number; createdAt: Date; updatedAt: Date } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      messageCount: session.messages.length,
      userMessages: session.messages.filter(m => m.role === 'user').length,
      assistantMessages: session.messages.filter(m => m.role === 'assistant').length,
      toolMessages: session.messages.filter(m => m.toolCalls?.length || m.toolResults?.length).length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /** 归档会话 */
  async archiveSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.state.status = 'archived';
    this.persist(session);
  }

  /** 导出会话为 JSON */
  async exportSession(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  /** 导出所有会话为 JSON */
  async exportAll(): Promise<string> {
    return JSON.stringify(Array.from(this.sessions.values()), null, 2);
  }

  /** 从 JSON 导入会话 */
  async importSession(json: string): Promise<ISession> {
    const data = JSON.parse(json);
    const session: ISession = {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      state: { ...data.state, lastActive: data.state?.lastActive ? new Date(data.state.lastActive) : null },
    };
    if (!session.id || !Array.isArray(session.messages)) {
      throw new Error('Invalid session data: missing id or messages');
    }
    this.sessions.set(session.id, session);
    this.persist(session);
    return session;
  }

  /** 从 JSON 文件导入会话 */
  async importFromFile(filePath: string): Promise<number> {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const sessions = Array.isArray(data) ? data : [data];
      let imported = 0;
      for (const s of sessions) {
        try {
          await this.importSession(JSON.stringify(s));
          imported++;
        } catch { /* 跳过无效会话 */ }
      }
      return imported;
    } catch {
      throw new Error(`Failed to import from: ${filePath}`);
    }
  }

  /** 获取会话总数 */
  count(): number {
    return this.sessions.size;
  }
}