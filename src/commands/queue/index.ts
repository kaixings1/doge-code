import type { Command } from '../types/command.js'

const queueCommand: Command = {
  name: 'queue',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/queue\n\nqueue 命令的功能描述。',
      description: 'queue 命令描述',
    }
  },
}

export default queueCommand
