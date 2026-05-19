import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async () => {
  const contextInfo = {
    tokensUsed: 12500,
    maxTokens: 200000,
    messageCount: 42,
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>📊 上下文可视化</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Token 使用: {contextInfo.tokensUsed.toLocaleString()} / {contextInfo.maxTokens.toLocaleString()}</Text>
        <Text>消息数量: {contextInfo.messageCount}</Text>
        <Box marginTop={1}>
          <Text color={(contextInfo.tokensUsed / contextInfo.maxTokens) > 0.8 ? 'red' : 'green'}>
            使用率: {Math.round((contextInfo.tokensUsed / contextInfo.maxTokens) * 100)}%
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

const ctxViz = {
  type: 'local-jsx',
  name: 'ctx_viz',
  description: '显示上下文使用情况',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default ctxViz