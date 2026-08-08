import type { Command } from '../../commands.js'

const snapshot = {
  type: 'local' as const,
  name: 'snapshot',
  description: '创建或恢复会话快照',
  isEnabled: () => true,
  supportsNonInteractive: false,
  argumentHint: '<create|restore|list> [name]',
  load: () => import('./snapshot.ts'),
} satisfies Command

export default snapshot
