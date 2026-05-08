import type { Command } from '../types/command.js'

const monitor: Command = {
  name: 'monitor',
  description: '系统监控',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/monitor\n\n监控系统资源和性能。',
      description: '系统监控',
    }
  },
}

export default monitor
