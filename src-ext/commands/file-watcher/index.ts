import type { Command } from '../types/command.js'

const fileWatcher: Command = {
  name: 'file-watcher',
  description: '文件变更监听',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/file-watcher\n\n监视文件或目录的变更。',
      description: '文件变更监听',
    }
  },
}

export default fileWatcher
