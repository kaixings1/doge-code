import type { Command } from '../../commands.js'

const stickers = {
  type: 'local',
  name: 'stickers',
  description: '订购 Claude Code 贴纸',
  supportsNonInteractive: false,
  load: () => import('./stickers.ts'),
} satisfies Command

export default stickers
