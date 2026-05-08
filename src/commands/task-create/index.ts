import type { Command } from '../../commands.js'

const taskCreate: Command = {
  name: 'task-create',
  description: '创建新任务',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/task-create\n\n创建一个新的后台任务来处理耗时操作。',
      description: '创建新任务',
    }
  },
}

export default taskCreate
