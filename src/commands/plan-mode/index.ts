import type { Command } from '../../commands.js'

const planMode = {
  type: 'local',
  name: 'plan-mode',
  description: '命令描述',
  load: () => import('./planMode.js'),
} satisfies Command

export default planMode
