import type { Command } from '../types/command.js'

const cron: Command = {
  name: 'cron',
  description: 'Cron 作业管理',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/cron\n\n管理类 Unix cron 作业。',
      description: 'Cron 作业管理',
    }
  },
}

export default cron
