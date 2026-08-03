import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ============================================================================
// 多会话管理 - 持久化版本
// ============================================================================

interface SessionEntry {
  id: string
  name: string
  createdAt: number
  lastActiveAt: number
  messageCount: number
}

const SESSION_DIR = join(process.cwd(), '.doge', 'sessions')
const SESSION_FILE = join(SESSION_DIR, 'sessions.json')

function ensureSessionDir(): void {
  try {
    mkdirSync(SESSION_DIR, { recursive: true })
  } catch {
    // ignore
  }
}

function loadSessions(): Map<string, SessionEntry> {
  const store = new Map<string, SessionEntry>()
  try {
    if (existsSync(SESSION_FILE)) {
      const data = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'))
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          store.set(s.id, s)
        }
      }
    }
  } catch {
    // ignore - start fresh
  }
  return store
}

function persistSessions(store: Map<string, SessionEntry>): void {
  try {
    ensureSessionDir()
    const data = {
      sessions: Array.from(store.values()),
      updatedAt: Date.now(),
    }
    writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

// Global state - loaded from disk on module init
const sessionStore = loadSessions()
let activeSessionId: string | null = null
let sessionCounter = sessionStore.size

// Pre-create first session if empty
if (sessionStore.size === 0) {
  const id = `s-${Date.now().toString(36)}-1`
  const name = '会话 1'
  const entry: SessionEntry = {
    id,
    name,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messageCount: 0,
  }
  sessionStore.set(id, entry)
  activeSessionId = id
  sessionCounter = 1
  persistSessions(sessionStore)
} else {
  // Find the most recently active session
  let latest: SessionEntry | null = null
  for (const s of sessionStore.values()) {
    if (!latest || s.lastActiveAt > latest.lastActiveAt) {
      latest = s
    }
  }
  activeSessionId = latest?.id ?? null
}

function createSession(): SessionEntry {
  const id = `s-${Date.now().toString(36)}-${++sessionCounter}`
  const name = `会话 ${sessionCounter}`
  const entry: SessionEntry = {
    id,
    name,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    messageCount: 0,
  }
  sessionStore.set(id, entry)
  activeSessionId = id
  persistSessions(sessionStore)
  return entry
}

function switchSession(id: string): SessionEntry | null {
  const entry = sessionStore.get(id)
  if (entry) {
    entry.lastActiveAt = Date.now()
    activeSessionId = id
    persistSessions(sessionStore)
  }
  return entry
}

function deleteSession(id: string): boolean {
  if (sessionStore.size <= 1) return false
  const result = sessionStore.delete(id)
  if (result) {
    if (activeSessionId === id) {
      activeSessionId = Array.from(sessionStore.keys())[0] ?? null
    }
    persistSessions(sessionStore)
  }
  return result
}

export const call: LocalJSXCommandCall = async (_onDone, _context, _args) => {
  const [, setRefresh] = React.useState(0)
  const [mode, setMode] = React.useState<'list' | 'new'>('list')
  const [message, setMessage] = React.useState<string | null>(null)

  // Keyboard shortcuts
  useInput((input, key) => {
    if (key.escape) {
      _onDone()
      return
    }
    if (input === 'n') {
      setMode('new')
    }
    if (input === 'r') {
      setRefresh(k => k + 1)
    }
    if (input === 'd') {
      // Delete current session
      if (activeSessionId && sessionStore.size > 1) {
        const deleted = deleteSession(activeSessionId)
        if (deleted) {
          setMessage('已删除当前会话')
        }
      } else {
        setMessage('至少需要保留一个会话')
      }
      setRefresh(k => k + 1)
    }
    // Number keys to switch sessions
    if (!isNaN(Number(input)) && Number(input) >= 1 && Number(input) <= 9) {
      const sessions = Array.from(sessionStore.values())
      const idx = Number(input) - 1
      if (idx < sessions.length) {
        switchSession(sessions[idx].id)
        setRefresh(k => k + 1)
      }
    }
  })

  const sessions = Array.from(sessionStore.values())
  const activeIdx = sessions.findIndex(s => s.id === activeSessionId)

  if (mode === 'new') {
    const entry = createSession()
    setMode('list')
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✓ 已创建新会话: {entry.name}</Text>
        {message && <Text color="yellow">{message}</Text>}
        <Text dimColor>按 Esc 退出 | 按 n 创建新会话 | 按 1-9 切换会话 | 按 d 删除当前</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          📑 会话管理 ({sessions.length} 个会话)
        </Text>
      </Box>

      {/* Session list */}
      <Box flexDirection="column">
        {sessions.map((s, i) => {
          const isActive = s.id === activeSessionId
          const date = new Date(s.createdAt).toLocaleDateString('zh-CN')
          return (
            <Box key={s.id} flexDirection="row">
              <Text color={isActive ? 'green' : 'white'}>
                {isActive ? '●' : '○'}
              </Text>
              <Text color={isActive ? 'green' : 'white'}>
                {' '}[{i + 1}] {s.name}
              </Text>
              <Text dimColor> ({date})</Text>
              {isActive && <Text color="green"> ← 当前</Text>}
            </Box>
          )
        })}
      </Box>

      {/* Status message */}
      {message && (
        <Box marginTop={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* Bottom hint */}
      <Box marginTop={1}>
        <Text dimColor>
          按 n 创建新会话 | 按 1-{Math.min(sessions.length, 9)} 切换 | 按 d 删除 | 按 r 刷新 | 按 Esc 退出
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Command Definition
// ============================================================================
const sessions = {
  type: 'local-jsx' as const,
  name: 'sessions',
  description: '多会话管理（创建、切换、删除会话，数据持久化到 .doge/sessions/）',
  aliases: ['session'],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default sessions
