import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'


const execAsync = promisify(exec)
interface BugFinding {
  file: string
  line: number
  severity: 'high' | 'medium' | 'low'
  message: string
  suggestion?: string
}
async function scanForBugs(): Promise<BugFinding[]> {
  const findings: BugFinding[] = []
  const files = await glob('**/*.{ts,tsx,js,jsx}', { ignore: ['**/node_modules/**', '**/dist/**'] })
  for (const file of files.slice(0, 100)) {
    try {
      const content = await readFile(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineNum = i + 1
        if (line.includes('any ') || line.includes(': any')) {
          findings.push({ file, line: lineNum, severity: 'medium', message: '使用了 any 类型', suggestion: '考虑使用更具体的类型' })
        }
        if (line.includes('@ts-ignore')) {
          findings.push({ file, line: lineNum, severity: 'high', message: '使用了 @ts-ignore', suggestion: '修复类型问题' })
        }
        if (line.includes('console.log') && !line.includes('//')) {
          findings.push({ file, line: lineNum, severity: 'low', message: '遗留的 console.log', suggestion: '移除或使用日志库' })
        }
      }
    } catch {}
  }
  return findings
}
export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  const [status, setStatus] = React.useState<'idle' | 'scanning' | 'done'>('idle')
  const [findings, setFindings] = React.useState<BugFinding[]>([])

  useInput(async (input, key) => {
    if (key.escape) { onDone(undefined, { display: 'skip' }); return }
    if (key.return && status === 'idle') {
      setStatus('scanning')
      const bugs = await scanForBugs()
      setFindings(bugs)
        setStatus('done')
    }
  })

  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount = findings.filter(f => f.severity === 'low').length
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🐛 Bug 猎人</Text>
      {status === 'idle' && <Box marginTop={1}><Text>按 Enter 开始扫描代码库...</Text></Box>}
      {status === 'scanning' && <Box marginTop={1}><Text color="yellow">🔍 正在扫描中...</Text></Box>}
        {status === 'done' && (
        <Box marginTop={1} flexDirection="column">
          {findings.length === 0 ? <Text color="green">✓ 未发现明显 bug！</Text> : (
            <>
              <Text color="yellow">发现 {findings.length} 个潜在问题</Text>
              <Box marginTop={1}><Text color="red">🔴 严重: {highCount}</Text><Text color="yellow" marginLeft={1}>🟡 中等: {mediumCount}</Text><Text color="blue" marginLeft={1}>🔵 轻微: {lowCount}</Text></Box>
            <Box marginTop={1} flexDirection="column">
                {findings.slice(0, 10).map((bug, i) => (
                  <Box key={i} marginTop={1}>
                    <Text color={bug.severity === 'high' ? 'red' : bug.severity === 'medium' ? 'yellow' : 'blue'}>
                      {bug.severity === 'high' ? '🔴' : bug.severity === 'medium' ? '🟡' : '🔵'} {bug.file}:{bug.line}
                    </Text>
                    <Text marginLeft={1} dimColor>{bug.message}</Text>
                    {bug.suggestion && <Text marginLeft={2} dimColor>💡 {bug.suggestion}</Text>}
                  </Box>
              ))}
            </Box>
            </>
        )}
      </Box>
      )}
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