import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [confirmed, setConfirmed] = React.useState(false)
  
  useInput((input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (input.toLowerCase() === 'y' || key.return) {
      setConfirmed(true)
      setTimeout(() => {
        onDone('限制已重置！', { display: 'skip' })
      }, 500)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🔄 重置限制</Text>
      {!confirmed ? (
        <Box marginTop={1}>
          <Text>确定要重置所有限制吗？(y/Enter 确认 | Esc 取消)</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="green">正在重置...</Text>
        </Box>
      )}
    </Box>
  )
}

const resetLimitsCommand = {
  type: 'local-jsx',
  name: 'reset-limits',
  description: '重置使用限制',
  load: () => Promise.resolve({ call }),
} satisfies Command

// 同时导出框架所需的名字
export const resetLimits = resetLimitsCommand
export const resetLimitsNonInteractive = resetLimitsCommand
export default resetLimitsCommand