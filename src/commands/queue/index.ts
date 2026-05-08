import type { Command } from '../../commands.js'

const queue: Command = {
  name: 'queue',
  description: '命令描述',
  type: 'local',
  load: () => import('./queue.js'),
}

export default queue
