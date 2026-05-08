import type { Command } from '../types/command.js'

const backup: Command = {
  name: 'backup',
  description: '备份管理',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/backup\n\n创建和管理备份。',
      description: '备份管理',
    }
  },
}

export default backup
