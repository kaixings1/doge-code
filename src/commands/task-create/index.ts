import type { Command } from '../../commands.js'

const taskCreate = {
  type: 'local',
  name: 'task-create',
  aliases: ['TaskCreate', 'taskcreate'],
  description: '任务管理: 创建|list|done|delete|pause|resume|cancel|subtask|info|start|clear-done',
  argumentHint: '<任务描述>',
  supportsNonInteractive: true,
  load: () => import('./task-create.ts'),
} satisfies Command

export default taskCreate
