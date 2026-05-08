import type { Command } from '../../commands.js'

const cache: Command = {
  name: 'cache',
  description: '缓存操作',
  type: 'local',
  load: () => import('./cache.js'),
}

export default cache
