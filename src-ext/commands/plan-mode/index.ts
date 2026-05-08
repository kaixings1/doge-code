import type { Command } from '../types/command.js'

const planMode: Command = {
  name: 'plan-mode',
  description: '计划模式管理',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/plan-mode\n\n切换到计划模式，先制定计划再执行。',
      description: '计划模式管理',
    }
  },
}

export default planMode
