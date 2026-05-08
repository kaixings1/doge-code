import type { Command } from '../types/command.js'

const compareCommand: Command = {
  name: 'compare',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/compare\n\ncompare 命令的功能描述。',
      description: 'compare 命令描述',
    }
  },
}

export default compareCommand
