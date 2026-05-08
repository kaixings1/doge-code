import type { Command } from '../types/command.js'

const shellCommand: Command = {
  name: 'shell',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/shell\n\nshell 命令的功能描述。',
      description: 'shell 命令描述',
    }
  },
}

export default shellCommand
