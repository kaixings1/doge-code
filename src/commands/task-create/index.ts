import type { Command } from '../../commands.js'

const taskCreate = {
  type: 'local',
  name: 'task-create',
  description: '创建/管理持久化任务 list|done|delete|clear-done',
  argumentHint: '<任务描述>',
  load: () => import('./task-create.ts'),
} satisfies Command

export default taskCreate
