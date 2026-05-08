import type { Command } from '../../commands.js'

const taskCreate = {
  type: 'local',
  name: 'task-create',
  description: '命令描述',
  load: () => import('./taskCreate.js'),
} satisfies Command

export default taskCreate
