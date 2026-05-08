import type { Command } from '../../commands.js'

const queue = {
  type: 'local',
  name: 'queue',
  description: '命令描述',
  load: () => import('./queue.js'),
} satisfies Command

export default queue
