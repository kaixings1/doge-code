import type { Command } from '../types/command.js'

const logger: Command = {
  name: 'logger',
  description: '日志记录工具',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/logger\n\n记录和分析日志。',
      description: '日志记录工具',
    }
  },
}

export default logger
