import type { Command } from '../../commands.js'

const metrics: Command = {
  name: 'metrics',
  description: '命令描述',
  type: 'local',
  load: () => import('./metrics.js'),
}

export default metrics
