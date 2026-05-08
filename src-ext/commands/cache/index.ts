import type { Command } from '../types/command.js'

const cache: Command = {
  name: 'cache',
  description: '缓存操作',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/cache\n\n管理缓存系统。',
      description: '缓存操作',
    }
  },
}

export default cache
