import type { Command } from '../../commands.js'

const taskCreate: Command = {
  name: 'task-create',
  description: '命令描述',
  type: 'local',
  load: () => import('./taskCreate.js'),
}

export default taskCreate
