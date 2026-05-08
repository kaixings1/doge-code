import type { Command } from '../../commands.js'

const logger: Command = {
  name: 'logger',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/logger\n\nlogger 命令的功能描述。',
      description: 'logger 命令描述',
    }
  },
}

export default logger
