import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [title, setTitle] = React.useState(args?.trim() || '')
  
  useInput((input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return && title) {
      onDone(`问题已创建: ${title}`, { display: 'skip' })
      return
    }
    // 普通字符输入：追加到标题
    if (input && !key.ctrl && !key.meta && !key.shift) {
      setTitle(prev => prev + input)
    }
    // 处理退格
    if (key.backspace || key.delete) {
      setTitle(prev => prev.slice(0, -1))
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🐛 创建问题</Text>
      <Box marginTop={1}>
        <Text>问题标题: {title || '_'} </Text>
      </Box>
      {!title && <Text dimColor>输入问题标题后按 Enter</Text>}
    </Box>
  )
}

const issue = {
  type: 'local-jsx',
  name: 'issue',
  description: '创建新问题',
  argumentHint: '<title>',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default issue