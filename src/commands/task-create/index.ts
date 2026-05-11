import type { Command } from '../../commands.js'

const taskCreate = {
  type: 'local',
  name: 'task-create',
  description: '创建一个新的子任务用于并行执行',
  argumentHint: '<任务描述>',
  load: () => import('./taskCreate.js'),
} satisfies Command

export default taskCreate
