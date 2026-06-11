import type { Command } from '../../commands.js'

const queue = {
  type: 'local',
  name: 'queue',
  description: '管理消息队列',
  load: () => import('./queue.ts'),
} satisfies Command

export default queue
