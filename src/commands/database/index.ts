import type { Command } from '../types/command.js'

const databaseCommand: Command = {
  name: 'database',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/database\n\ndatabase 命令的功能描述。',
      description: 'database 命令描述',
    }
  },
}

export default databaseCommand
