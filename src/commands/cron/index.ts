import type { Command } from '../types/command.js'

const cronCommand: Command = {
  name: 'cron',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/cron\n\ncron 命令的功能描述。',
      description: 'cron 命令描述',
    }
  },
}

export default cronCommand
