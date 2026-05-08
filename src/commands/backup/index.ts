import type { Command } from '../../commands.js'

const backup: Command = {
  name: 'backup',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/backup\n\nbackup 命令的功能描述。',
      description: 'backup 命令描述',
    }
  },
}

export default backup
