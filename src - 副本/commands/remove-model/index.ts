import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'remove-model',
  description: '从已保存的模型列表中移除自定义模型',
  supportsNonInteractive: false,
  load: () => import('./remove-model'),
} satisfies Command
