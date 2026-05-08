import type { Command } from '../../commands.js'

const schedule: Command = {
  name: 'schedule',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/schedule\n\nschedule 命令的功能描述。',
      description: 'schedule 命令描述',
    }
  },
}

export default schedule
