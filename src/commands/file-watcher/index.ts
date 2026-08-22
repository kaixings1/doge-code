import type { Command } from '../../commands.js'
import { call } from './fileWatcher.js'

const fileWatcher = {
  type: 'local',
  name: 'file-watcher',
  description: '监听文件变化并执行相应操作',
  argumentHint: '<文件路径>',
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default fileWatcher