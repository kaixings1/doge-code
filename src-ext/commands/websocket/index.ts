import type { Command } from '../types/command.js'

const websocket: Command = {
  name: 'websocket',
  description: 'WebSocket 客户端',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/websocket\n\n连接和操作 WebSocket。',
      description: 'WebSocket 客户端',
    }
  },
}

export default websocket
