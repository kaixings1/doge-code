import type { Command } from '../../commands.js'

const planMode: Command = {
  name: 'plan-mode',
  description: '命令描述',
  type: 'local',
  load: () => import('./planMode.js'),
}

export default planMode
