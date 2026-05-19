import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async () => {
  const now = new Date()
  const traceInfo = {
    timestamp: now.toISOString(),
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || 'unknown',
    userType: process.env.USER_TYPE || 'ant',
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🔍 ANT 追踪</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>时间: {traceInfo.timestamp}</Text>
        <Text>会话: {traceInfo.sessionId.slice(0, 16)}...</Text>
        <Text>类型: {traceInfo.userType}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">追踪记录已保存到 ~/.doge/trace.log</Text>
      </Box>
    </Box>
  )
}

const antTrace = {
  type: 'local-jsx',
  name: 'ant-trace',
  description: '显示 ANT 调试追踪信息',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default antTrace
