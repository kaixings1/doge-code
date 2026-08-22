import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async () => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `env — 显示环境变量\n用法: /env`.trim(), truncated: false }
  }
  const envVars = [
    { name: 'env', value: process.env.ANTHROPIC_BASE_URL || '（未设置）' },
    { name: 'ANTHROPIC_MODEL', value: process.env.ANTHROPIC_MODEL || '（未设置）' },
    { name: 'DOGE_API_KEY', value: process.env.DOGE_API_KEY ? '***（已设置）***' : '（未设置）' },
    { name: 'CLAUDE_CODE_SESSION_ID', value: process.env.CLAUDE_CODE_SESSION_ID || '（未设置）' },
    { name: 'USER_TYPE', value: process.env.USER_TYPE || '（未设置）' },
  ]

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🔧 环境变量</Text>
      <Box flexDirection="column" marginTop={1}>
        {envVars.map(({ name, value }) => (
          <Box key={name}>
            <Text color="cyan">{name}: </Text>
            <Text>{value}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

const env = {
  type: 'local-jsx',
  name: 'env',
  description: '显示环境变量',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default env
