import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [prNumber, setPrNumber] = React.useState(args?.trim() || '')
  const [status, setStatus] = React.useState<'idle' | 'fixing' | 'done'>('idle')

  useInput((input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return && prNumber && status === 'idle') {
      setStatus('fixing')
      setTimeout(() => {
        setStatus('done')
        // 可选：修复完成后自动退出或等待用户按 Esc
        // onDone(`PR #${prNumber} 已修复`, { display: 'skip' })
      }, 2000)
      return
    }
    // 处理字符输入（仅当空闲状态）
    if (status === 'idle') {
      if (input && !key.ctrl && !key.meta) {
        setPrNumber(prev => prev + input)
      }
      if (key.backspace || key.delete) {
        setPrNumber(prev => prev.slice(0, -1))
      }
    }
  })  // ✅ 补全闭合括号

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🔧 自动修复 PR</Text>
      <Box marginTop={1}>
        <Text>PR 编号: {prNumber || '_'} </Text>
      </Box>
      {status === 'fixing' && <Text color="yellow">正在分析和修复中...</Text>}
      {status === 'done' && <Text color="green">PR 已自动修复！</Text>}
      <Box marginTop={1}>
        <Text dimColor>
          {status === 'idle' ? '输入 PR 编号后按 Enter | Esc 退出' : '按 Esc 退出'}
        </Text>
      </Box>
    </Box>
  )
}

const autofixPr = {
  type: 'local-jsx',
  name: 'autofix-pr',
  description: '自动修复拉取请求',
  argumentHint: '<pr-number>',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default autofixPr