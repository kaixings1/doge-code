import type { Command } from '../../commands.js'

const reflect = {
  type: 'local',
  name: 'reflect',
  description: '反思当前会话状态和项目环境，提供改进建议',
  argumentHint: '',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => import('./reflect.js'),
} satisfies Command

export default reflect
