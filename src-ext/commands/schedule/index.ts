import type { Command } from '../types/command.js'

const schedule: Command = {
  name: 'schedule',
  description: '定时任务调度',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/schedule\n\n设置和管理定时任务。',
      description: '定时任务调度',
    }
  },
}

export default schedule
