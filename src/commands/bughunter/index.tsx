import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  const [status, setStatus] = React.useState<'idle' | 'scanning' | 'done'>('idle')
  const [findings, setFindings] = React.useState<string[]>([])

  useInput((_input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return && status === 'idle') {
      setStatus('scanning')
      setTimeout(() => {
        setFindings(['发现 2 个潜在 bug', '建议修复: src/example.ts:42'])
        setStatus('done')
      }, 1000)
    }
  })   // ✅ 补充闭合的 ) 和分号（分号可选）

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🐛 Bug 猎人</Text>
      <Box marginTop={1}>
        {status === 'idle' && <Text>按 Enter 开始扫描代码库...</Text>}
        {status === 'scanning' && <Text color="yellow">正在扫描中...</Text>}
        {status === 'done' && (
          <Box flexDirection="column">
            <Text color="green">扫描完成！</Text>
            <Box marginTop={1} flexDirection="column">
              {findings.map((f, i) => (
                <Text key={i} color="yellow">• {f}</Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}

const bughunter = {
  type: 'local-jsx',
  name: 'bughunter',
  description: '扫描代码中的潜在 bug',
  aliases: ['bug-hunter'],
  load: () => Promise.resolve({ call }),
} satisfies Command

export default bughunter