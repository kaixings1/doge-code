import type { Command } from '../../commands.js'

const fileWatcher: Command = {
  name: 'file-watcher',
  description: '命令描述',
  type: 'local',
  load: () => import('./fileWatcher.js'),
}

export default fileWatcher
