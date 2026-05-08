import type { Command } from '../../commands.js'

const compare: Command = {
  name: 'compare',
  description: '命令描述',
  type: 'local',
  load: () => import('./compare.js'),
}

export default compare
