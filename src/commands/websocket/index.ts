import type { Command } from '../types/command.js'

const websocketCommand: Command = {
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

export default websocketCommand
