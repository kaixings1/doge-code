import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async () => {
  const perfInfo = {
    responseTime: '245ms',
    tokenRate: '45tok/s',
    memory: '128MB',
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>⚡ 性能监控</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>响应时间: {perfInfo.responseTime}</Text>
        <Text>Token 速率: {perfInfo.tokenRate}</Text>
        <Text>内存使用: {perfInfo.memory}</Text>
      </Box>
    </Box>
  )
}

const perfIssue = {
  type: 'local-jsx',
  name: 'perf-issue',
  description: '显示性能信息',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default perfIssue
