import * as React from 'react'
import { Box, Text, useInput } from '../ink.js'

export interface AssistantSession {
  id: string
  [key: string]: any
}

/**
 * 会话选择器：渲染会话列表，支持键盘导航选择。
 *
 * 按键：
 *   ↑ / k    上移
 *   ↓ / j    下移
 *   Enter    确认选择（onSelect）
 *   q / Esc  取消（onCancel）
 */
export function AssistantSessionChooser(props: {
  sessions: AssistantSession[]
  onSelect: (id: string) => void
  onCancel: () => void
}): React.ReactElement {
  const { sessions, onSelect, onCancel } = props
  const [cursor, setCursor] = React.useState(0)

  useInput((input: string) => {
    if (input === '\u001b[A' || input === 'k') {
      setCursor(c => (c - 1 + sessions.length) % sessions.length)
    } else if (input === '\u001b[B' || input === 'j') {
      setCursor(c => (c + 1) % sessions.length)
    } else if (input === '\r') {
      const s = sessions[cursor]
      if (s) onSelect(s.id)
    } else if (input === 'q' || input === '\u001b') {
      onCancel()
    }
  })

  if (sessions.length === 0) {
    return (
      <Box>
        <Text color="yellow">没有可用的会话</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>选择要恢复的会话：</Text>
      {sessions.map((s, i) => (
        <Box key={s.id}>
          <Text color={i === cursor ? 'cyan' : undefined} bold={i === cursor}>
            {i === cursor ? '> ' : '  '}{s.title || s.id}
          </Text>
        </Box>
      ))}
      <Text color="gray">↑/↓ 或 j/k 选择  Enter 确认  q 取消</Text>
    </Box>
  )
}
