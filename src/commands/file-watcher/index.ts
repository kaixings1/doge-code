import type { Command } from '../../commands.js'

const fileWatcher: Command = {
  name: 'file-watcher',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/file-watcher\n\nfile-watcher 命令的功能描述。',
      description: 'file-watcher 命令描述',
    }
  },
}

export default fileWatcher
