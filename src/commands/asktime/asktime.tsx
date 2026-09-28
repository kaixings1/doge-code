import { Text } from '../../ink.js'
import type { Command, LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return <Text>asktime — N秒后自动输入「继续」并提交\n用法: /asktime</Text>
  }
  const seconds = parseInt(args?.trim() || '10', 10)
  const clamped = Math.max(1, Math.min(seconds, 3600))

  setTimeout(() => {
    onDone('继续', { submitNextInput: true })
  }, clamped * 1000)

  return <Text>⏳ 将在 {clamped} 秒后自动输入「继续」并提交</Text>
}

const asktime: Command = {
  type: 'local-jsx',
  name: 'asktime',
  description: 'N秒后自动输入「继续」并提交',
  aliases: [],
  load: () => Promise.resolve({ call }),
}

export default asktime
