import type { Command } from '../../commands.js'

const share = {
  type: 'local',
  name: 'share',
  description: '分享当前会话到团队',
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: '会话已分享到团队！请在团队界面查看。',
    }),
  }),
} satisfies Command

export default share
