import type { Command } from '../../commands.js'

const websocket: Command = {
  name: 'websocket',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/websocket\n\nwebsocket 命令的功能描述。',
      description: 'websocket 命令描述',
    }
  },
}

export default websocket
