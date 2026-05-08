import type { Command } from '../../commands.js'

const websocket: Command = {
  name: 'websocket',
  description: '命令描述',
  type: 'local',
  load: () => import('./websocket.js'),
}

export default websocket
