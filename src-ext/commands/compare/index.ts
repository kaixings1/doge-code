import type { Command } from '../types/command.js'

const compare: Command = {
  name: 'compare',
  description: '文件比较工具',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/compare\n\n比较两个文件或目录之间的差异。',
      description: '文件比较工具',
    }
  },
}

export default compare
