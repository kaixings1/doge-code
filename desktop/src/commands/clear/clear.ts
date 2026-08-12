import type { LocalCommandCall } from '../../types/command.js'
import { clearConversation } from './conversation.js'

export const call: LocalCommandCall = async (_, context) => {
  await clearConversation(context)
  const now = new Date()
  const timeStr = now.toLocaleString()
  return { type: 'text', value: ` 对话已清除，开始新的会话。  [${timeStr}]` }
}
