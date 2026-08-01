import type { Command } from '../../commands.js'

const blockMode = {
  type: 'local' as const,
  name: 'block-mode',
  description: '切换块状输出模式（为工具输出添加边框和折叠功能）',
  aliases: [],
  supportsNonInteractive: false,
  load: () => import('./block-mode.ts'),
} satisfies Command

export default blockMode
