import type { Command } from '../types/command.js'

const eventStream: Command = {
  name: 'event-stream',
  description: '事件流处理',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/event-stream\n\n处理实时事件流数据。',
      description: '事件流处理',
    }
  },
}

export default eventStream
