import type { Command } from '../../commands.js'

const monitor = {
  type: 'local',
  name: 'monitor',
  description: '命令描述',
  load: () => import('./monitor.js'),
} satisfies Command

export default monitor
