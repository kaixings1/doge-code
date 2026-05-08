import type { Command } from '../../commands.js'

const compare = {
  type: 'local',
  name: 'compare',
  description: '命令描述',
  load: () => import('./compare.js'),
} satisfies Command

export default compare
