import type { Command } from '../types/command.js'

const event streamCommand: Command = {
  name: 'event-stream',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/event-stream\n\nevent-stream 命令的功能描述。',
      description: 'event-stream 命令描述',
    }
  },
}

export default event streamCommand
