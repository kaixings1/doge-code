import type { Command } from '../../commands.js'

const monitor: Command = {
  name: 'monitor',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/monitor\n\nmonitor 命令的功能描述。',
      description: 'monitor 命令描述',
    }
  },
}

export default monitor
