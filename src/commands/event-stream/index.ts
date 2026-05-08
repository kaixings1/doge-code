import type { Command } from '../../commands.js'

const eventStream = {
  type: 'local',
  name: 'event-stream',
  description: '命令描述',
  load: () => import('./eventStream.js'),
} satisfies Command

export default eventStream
