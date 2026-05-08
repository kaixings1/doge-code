import type { Command } from '../../commands.js'

const cache = {
  type: 'local',
  name: 'cache',
  description: '缓存操作',
  load: () => import('./cache.js'),
} satisfies Command

export default cache
