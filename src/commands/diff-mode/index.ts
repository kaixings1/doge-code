import type { Command } from '../../commands.js'

const diffMode = {
  type: 'local' as const,
  name: 'diff-mode',
  description: '切换并排/单列差异视图模式',
  aliases: [],
  supportsNonInteractive: false,
  load: () => import('./diff-mode.ts'),
} satisfies Command

export default diffMode
