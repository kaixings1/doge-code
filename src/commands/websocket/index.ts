import type { Command } from '../../commands.js'

const websocket = {
  type: 'local',
  name: 'websocket',
  description: '命令描述',
  load: () => import('./websocket.js'),
} satisfies Command

export default websocket
