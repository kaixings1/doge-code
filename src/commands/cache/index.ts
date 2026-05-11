import type { Command } from '../../commands.js'

const cache = {
  type: 'local-jsx',
  name: 'cache',
  description: '缓存操作',
  load: () => import('./cache.tsx'),
} satisfies Command

export default cache
