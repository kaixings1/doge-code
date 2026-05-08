import type { Command } from '../types/command.js'

const metricsCommand: Command = {
  name: 'metrics',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/metrics\n\nmetrics 命令的功能描述。',
      description: 'metrics 命令描述',
    }
  },
}

export default metricsCommand
