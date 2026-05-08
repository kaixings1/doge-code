import type { Command } from '../../commands.js'

const http: Command = {
  name: 'http',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/http\n\nhttp 命令的功能描述。',
      description: 'http 命令描述',
    }
  },
}

export default http
