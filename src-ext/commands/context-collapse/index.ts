import type { Command } from '../types/command.js'

const contextCollapse: Command = {
  name: 'context-collapse',
  description: '上下文折叠减少token消耗',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/context-collapse\n\n对话历史进行智能折叠，保留关键上下文，减少token消耗。',
      description: '上下文折叠减少token消耗',
    }
  },
}

export default contextCollapse
