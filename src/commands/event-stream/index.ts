import type { Command } from '../../commands.js'

const eventStream: Command = {
  name: 'event-stream',
  description: '命令描述',
  type: 'local',
  load: () => import('./eventStream.js'),
}

export default eventStream
