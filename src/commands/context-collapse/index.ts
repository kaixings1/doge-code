import type { Command } from '../types/command.js'

const context collapseCommand: Command = {
  name: 'context-collapse',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/context-collapse\n\ncontext-collapse 命令的功能描述。',
      description: 'context-collapse 命令描述',
    }
  },
}

export default context collapseCommand
