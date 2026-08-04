import * as React from 'react'
import { Box, Text, useInput } from '../../ink.js'
import type { AgentMemoryScope } from '../../tools/AgentTool/agentMemory.js'

const CHOICES = [
  { value: 'merge' as const, label: '合并快照', desc: '将新快照与现有记忆合并' },
  { value: 'keep' as const, label: '保留当前', desc: '保留现有记忆，忽略新快照' },
  { value: 'replace' as const, label: '替换快照', desc: '用新快照替换现有记忆' },
]

function scopeLabel(scope: AgentMemoryScope): string {
  return scope === 'user' ? '用户级' : scope === 'project' ? '项目级' : '本地级'
}

/**
 * 代理记忆快照更新对话框。
 *
 * 显示快照信息（代理类型/范围/时间戳），并提供三个选项：
 * merge（合并）、keep（保留当前）、replace（替换）。
 *
 * 按键：↑/↓ 或 j/k 选择，Enter 确认，Esc/q 取消。
 */
export const SnapshotUpdateDialog: React.FC<{
  agentType: string
  scope: AgentMemoryScope
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}> = ({ agentType, scope, snapshotTimestamp, onComplete, onCancel }) => {
  const [cursor, setCursor] = React.useState(0)

  useInput((input: string) => {
    if (input === '\u001b[A' || input === 'k') {
      setCursor(c => (c - 1 + CHOICES.length) % CHOICES.length)
    } else if (input === '\u001b[B' || input === 'j') {
      setCursor(c => (c + 1) % CHOICES.length)
    } else if (input === '\r') {
      onComplete(CHOICES[cursor].value)
    } else if (input === 'q' || input === '\u001b') {
      onCancel()
    }
  })

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true, color: 'yellow' }, '代理记忆快照更新'),
    React.createElement(Text, null, `代理 ${agentType} 的快照需要处理：`),
    React.createElement(Text, { color: 'gray' }, `范围：${scopeLabel(scope)} | 快照时间：${snapshotTimestamp}`),
    React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      ...CHOICES.map((c, i) =>
        React.createElement(
          Box,
          { key: c.value },
          React.createElement(
            Text,
            { color: i === cursor ? 'cyan' : undefined, bold: i === cursor },
            `${i === cursor ? '> ' : '  '}${c.label}`,
          ),
          React.createElement(Text, { color: 'gray' }, ` — ${c.desc}`),
        ),
      ),
    ),
    React.createElement(
      Text,
      { color: 'gray', marginTop: 1 },
      '↑/↓ 或 j/k 选择  Enter 确认  Esc/q 取消',
    ),
  )
}

/** 生成合并快照的提示文本 */
export const buildMergePrompt: (agentType: string, scope: AgentMemoryScope) => string = (agentType, scope) => {
  const label = scopeLabel(scope)
  return `代理 ${agentType} 的${label}记忆快照更新：请合并新旧快照，保留仍然有效的记忆并整合新增内容。`
}
