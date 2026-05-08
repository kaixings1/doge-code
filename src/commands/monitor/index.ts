import type { Command } from '../../commands.js'

const monitor: Command = {
  name: 'monitor',
  description: '命令描述',
  type: 'local',
  load: () => import('./monitor.js'),
}

export default monitor
