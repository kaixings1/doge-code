/**
 * desktop/src/main/sessionStore.ts — 会话持久化
 *
 * 管理对话会话的保存、加载、列出和删除。
 * 会话存储在 .doge/sessions/ 目录下，每个会话一个 JSON 文件。
 */

import * as fs from 'fs'
import * as path from 'path'
import type { InternalMessage } from '../engine/messageNormalizer.js'

export const SESSIONS_DIR = path.join(process.cwd(), '.doge', 'sessions')

function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

/**
 * 保存会话到磁盘
 */
export function saveSession(messages: InternalMessage[], existingId?: string): string {
  ensureSessionsDir()
  const id = existingId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const file = path.join(SESSIONS_DIR, `${id}.json`)
  const data = messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }))
  fs.writeFileSync(file, JSON.stringify({ id, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
  return id
}

/**
 * 列出所有保存的会话
 */
export function listSessions(): Array<{ id: string; createdAt: string; messageCount: number }> {
  ensureSessionsDir()
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const file = path.join(SESSIONS_DIR, f)
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
          return { id: data.id, createdAt: data.createdAt, messageCount: data.messages?.length || 0 }
        } catch { return null }
      })
      .filter((s): s is { id: string; createdAt: string; messageCount: number } => s !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch { return [] }
}

/**
 * 加载指定会话的消息历史
 */
export function loadSession(id: string): InternalMessage[] | null {
  try {
    const file = path.join(SESSIONS_DIR, `${id}.json`)
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return data.messages?.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })) || null
  } catch { return null }
}

/**
 * 删除指定会话
 */
export function deleteSession(id: string): boolean {
  try {
    const file = path.join(SESSIONS_DIR, `${id}.json`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
      return true
    }
    return false
  } catch { return false }
}

/**
 * 更新现有会话（追加消息）
 */
export function updateSession(id: string, messages: InternalMessage[]): void {
  ensureSessionsDir()
  const file = path.join(SESSIONS_DIR, `${id}.json`)
  const data = messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }))
  fs.writeFileSync(file, JSON.stringify({ id, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
}

// ─── 崩溃恢复标记 ───

const CRASH_FILE = path.join(SESSIONS_DIR, '.crash-recovery.json')

/**
 * 保存崩溃恢复标记
 */
export function saveCrashRecovery(sessionId: string | null, messageCount: number): void {
  try {
    fs.writeFileSync(CRASH_FILE, JSON.stringify({
      sessionId,
      messageCount,
      timestamp: new Date().toISOString(),
    }, null, 2))
  } catch { /* ignore */ }
}

/**
 * 读取崩溃恢复标记
 */
export function getCrashRecovery(): { hasRecovery: boolean; sessionId?: string; messageCount?: number; timestamp?: string } {
  try {
    if (!fs.existsSync(CRASH_FILE)) return { hasRecovery: false }
    const data = JSON.parse(fs.readFileSync(CRASH_FILE, 'utf-8'))
    return { hasRecovery: true, sessionId: data.sessionId, messageCount: data.messageCount, timestamp: data.timestamp }
  } catch { return { hasRecovery: false } }
}

/**
 * 清除崩溃恢复标记
 */
export function clearCrashRecovery(): void {
  try {
    if (fs.existsSync(CRASH_FILE)) fs.unlinkSync(CRASH_FILE)
  } catch { /* ignore */ }
}
