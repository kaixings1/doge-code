import type { InternalMessage, SessionMetadata } from './types.js';

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
 */
export class SessionManager {
  async createSession(): Promise<ISession> {
    throw new Error('Not implemented');
  }

  async loadSession(sessionId: string): Promise<ISession | null> {
    throw new Error('Not implemented');
  }

  async saveSession(session: ISession): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteSession(sessionId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  getActiveSession(): ISession | null {
    throw new Error('Not implemented');
  }

  async listSessions(): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async addMessage(sessionId: string, message: InternalMessage): Promise<void> {
    throw new Error('Not implemented');
  }

  async clearMessages(sessionId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}