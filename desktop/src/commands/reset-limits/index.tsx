import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

async function resetAllLimits() {
  const results: string[] = []
  const dogeDir = path.join(os.homedir(), '.doge')
  try {
    await fs.unlink(path.join(dogeDir, 'rate-limits.json')).catch(() => {})
    results.push('✓ Rate limit 缓存已重置')
    await fs.unlink(path.join(dogeDir, 'token-usage.json')).catch(() => {})
    results.push('✓ Token 计数已重置')
    await fs.rm(path.join(dogeDir, 'cache'), { recursive: true, force: true }).catch(() => {})
    results.push('✓ 缓存目录已清空')
    return { success: true, message: results.join('\n') }
  } catch (error) {
    return { success: false, message: `重置失败: ${error}` }
  }
}
export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [confirmed, setConfirmed] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'resetting' | 'done'>('idle')
  
  const force = args?.includes('--force') || args?.includes('-f')
  if (force) {
    await resetAllLimits()
    onDone('✓ 所有限制已重置', { display: 'skip' })
    return null
    }
  useInput(async (input, key) => {
    if (key.escape && status === 'idle') { onDone(undefined, { display: 'skip' }); return }
    if (status === 'idle') {
      if (input.toLowerCase() === 'y') {
        setStatus('resetting')
        const result = await resetAllLimits()
        setStatus('done')
        setTimeout(() => onDone(result.message, { display: 'skip' }), 1500)
      } else if (input.toLowerCase() === 'n') {
        onDone('已取消', { display: 'skip' })
      } else if (key.return && !confirmed) {
      setConfirmed(true)
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🔄 重置限制</Text>
      {!confirmed ? (
        <Box marginTop={1}><Text>确定要重置所有限制吗？(y/n)</Text></Box>
      ) : (
        <Box marginTop={1}><Text color="yellow">请按 Enter 确认重置，或 Esc 取消</Text></Box>
      )}
      {status === 'resetting' && <Text color="yellow">正在重置中...</Text>}
      {status === 'done' && <Text color="green">✓ 重置完成</Text>}
    </Box>
  )
}

const resetLimitsCommand = {
  type: 'local-jsx',
  name: 'reset-limits',
  description: '重置使用限制',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default resetLimitsCommand
export const resetLimits = resetLimitsCommand;
export const resetLimitsNonInteractive = resetLimitsCommand;