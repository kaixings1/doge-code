import type { Command } from '../types/command.js'

const plan modeCommand: Command = {
  name: 'plan-mode',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/plan-mode\n\nplan-mode 命令的功能描述。',
      description: 'plan-mode 命令描述',
    }
  },
}

export default plan modeCommand
