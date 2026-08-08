import type { Command } from '../../commands.js'

const cmd = {
  type: 'local' as const,
  name: 'cmd',
  description: '搜索和浏览可用命令',
  isEnabled: () => true,
  supportsNonInteractive: false,
  argumentHint: '<搜索关键词>',
  load: () => import('./cmd.ts'),
} satisfies Command

export default cmd
