import type { Command } from '../types/command.js'

const cacheCommand: Command = {
  name: 'cache',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/cache\n\ncache 命令的功能描述。',
      description: 'cache 命令描述',
    }
  },
}

export default cacheCommand
