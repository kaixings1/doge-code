import type { Command } from '../types/command.js'

const metrics: Command = {
  name: 'metrics',
  description: '指标收集',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/metrics\n\n收集和分析系统指标。',
      description: '指标收集',
    }
  },
}

export default metrics
