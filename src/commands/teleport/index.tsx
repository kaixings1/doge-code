import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [sessionId, setSessionId] = React.useState(args?.trim() || '')
  const [showHelp, setShowHelp] = React.useState(false)
  
  useInput((input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return && sessionId) {
      onDone(`传送到会话: ${sessionId}`, { display: 'skip' })
    }
    if (input === '?') {
      setShowHelp(true)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🚀 传送 (Teleport)</Text>
      <Box marginTop={1}>
        <Text>输入会话 ID 传送到该会话：</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="blue">{sessionId || '_'} </Text>
        <Text dimColor>(按 Enter 传送 | ? 查看帮助 | Esc 退出)</Text>
      </Box>
      {showHelp && (
        <Box marginTop={1} flexDirection="column">
          <Text>用法: /teleport &lt;session-id&gt;</Text>
          <Text dimColor>传送到指定的会话继续工作</Text>
        </Box>
      )}
    </Box>
  )
}

const teleport = {
  type: 'local-jsx',
  name: 'teleport',
  description: '传送到另一个会话继续工作',
  aliases: ['goto'],
  argumentHint: '<session-id>',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default teleport
