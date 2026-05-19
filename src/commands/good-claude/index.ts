import type { Command } from '../../commands.js'

const goodClaude = {
  type: 'local',
  name: 'good-claude',
  description: '给 Claude 发送正面反馈',
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '感谢您的正面反馈！Claude 会继续努力的。',
    }),
  }),
} satisfies Command

export default goodClaude
