import type { Command } from '../../commands.js'

const cache: Command = {
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

export default cache
