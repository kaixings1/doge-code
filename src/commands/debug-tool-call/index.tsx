import type { Command } from '../../commands.js'

const debugToolCall = {
  type: 'local',
  name: 'debug-tool-call',
  description: '调试工具调用',
  isHidden: true,
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '工具调用调试信息: 所有工具调用正常。',
    }),
  }),
} satisfies Command

export default debugToolCall
