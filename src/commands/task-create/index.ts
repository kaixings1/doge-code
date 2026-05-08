import type { Command } from '../types/command.js'

const task createCommand: Command = {
  name: 'task-create',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/task-create\n\ntask-create 命令的功能描述。',
      description: 'task-create 命令描述',
    }
  },
}

export default task createCommand
