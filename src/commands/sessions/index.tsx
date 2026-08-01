import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

// ============================================================================
// 多会话管理 - 类似 tmux 的标签页系统（MVP 版本）
// ============================================================================

interface SessionEntry {
  id: string
  name: string
  createdAt: number
}

const sessionStore = new Map<string, SessionEntry>()
let activeSessionId: string | null = null
let sessionCounter = 0

function createSession(): SessionEntry {
  const id = `s-${Date.now().toString(36)}-${++sessionCounter}`
  const name = `会话 ${sessionCounter}`
  const entry: SessionEntry = { id, name, createdAt: Date.now() }
  sessionStore.set(id, entry)
  activeSessionId = id
  return entry
}

function switchSession(id: string): SessionEntry | null {
  const entry = sessionStore.get(id)
  if (entry) {
    activeSessionId = id
  }
  return entry
}

// 预创建第一个会话
if (sessionStore.size === 0) {
  createSession()
}

export const call: LocalJSXCommandCall = async (_onDone, _context, _args) => {
  const [, setRefresh] = React.useState(0)
  const [mode, setMode] = React.useState<'list' | 'new'>('list')

  // 快捷键
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
    // 数字键切换会话
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
        <Text dimColor>按 Esc 退出 | 按 n 创建新会话 | 按 1-9 切换会话</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          📑 会话管理
        </Text>
      </Box>

      {/* 会话列表 */}
      <Box flexDirection="column">
        {sessions.map((s, i) => {
          const isActive = s.id === activeSessionId
          return (
            <Box key={s.id} flexDirection="row">
              <Text color={isActive ? 'green' : 'white'}>
                {isActive ? '●' : '○'}
              </Text>
              <Text color={isActive ? 'green' : 'white'}>
                {' '}[{i + 1}] {s.name}
              </Text>
              {isActive && <Text color="green"> ← 当前</Text>}
            </Box>
          )
        })}
      </Box>

      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text dimColor>
          按 n 创建新会话 | 按 1-{Math.min(sessions.length, 9)} 切换 | 按 r 刷新 | 按 Esc 退出
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 命令定义
// ============================================================================
const sessions = {
  type: 'local-jsx' as const,
  name: 'sessions',
  description: '多会话管理（创建、切换、列出会话，类似 tmux 标签页）',
  aliases: ['session'],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default sessions
