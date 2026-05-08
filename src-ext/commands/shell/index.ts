import type { Command } from '../types/command.js'

const shell: Command = {
  name: 'shell',
  description: '高级 shell 命令执行',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/shell\n\n在安全的 shell 环境中执行系统命令。',
      description: '高级 shell 命令执行',
    }
  },
}

export default shell
