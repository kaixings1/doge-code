import type { Command } from '../../commands.js'

const monitor = {
  type: 'local',
  name: 'monitor',
  description: '启动实时监控界面',
  load: () => import('./monitor.js'),
} satisfies Command

export default monitor
