import type { Command } from '../../commands.js'

const metrics = {
  type: 'local',
  name: 'metrics',
  description: '命令描述',
  load: () => import('./metrics.js'),
} satisfies Command

export default metrics
