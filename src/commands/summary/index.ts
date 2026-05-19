import type { Command } from '../../commands.js'

const summary = {
  type: 'local',
  name: 'summary',
  description: '总结当前会话',
  load: async () => ({
    call: async (_args, context) => {
      const { messages } = context
      const msgCount = messages.length
      const userMsgs = messages.filter(m => m.type === 'user').length
      const assistantMsgs = messages.filter(m => m.type === 'assistant').length

      return {
        type: 'text' as const,
        value: `
会话总结
========
总消息数: ${msgCount}
用户消息: ${userMsgs}
助手消息: ${assistantMsgs}

当前会话正在进行中...
`.trim(),
      }
    },
  }),
} satisfies Command

export default summary