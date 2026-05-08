import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'add-model',
  description: '将自定义模型添加到已保存的模型列表',
  supportsNonInteractive: false,
  load: () => import('./add-model.js'),
} satisfies Command
