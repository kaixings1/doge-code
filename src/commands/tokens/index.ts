import type { Command } from '../../commands.js'

const tokens = {
  type: 'local',
  name: 'tokens',
  description: '显示当前会话的 token 用量和费用估算',
  aliases: [],
  argumentHint: '[--by-model]',
  supportsNonInteractive: true,
  load: () => import('./tokens.ts'),
} satisfies Command

export default tokens
