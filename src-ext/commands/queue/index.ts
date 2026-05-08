import type { Command } from '../types/command.js'

const queue: Command = {
  name: 'queue',
  description: '任务队列管理',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/queue\n\n管理任务队列。',
      description: '任务队列管理',
    }
  },
}

export default queue
