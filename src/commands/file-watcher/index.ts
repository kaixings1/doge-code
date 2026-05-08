import type { Command } from '../../commands.js'

const fileWatcher = {
  type: 'local',
  name: 'file-watcher',
  description: '命令描述',
  load: () => import('./fileWatcher.js'),
} satisfies Command

export default fileWatcher
