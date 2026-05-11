import type { Command } from '../../commands.js'

const fileWatcher = {
  type: 'local',
  name: 'file-watcher',
  description: '监听文件变化并执行相应操作',
  argumentHint: '<文件路径>',
  load: () => import('./fileWatcher.js'),
} satisfies Command

export default fileWatcher
