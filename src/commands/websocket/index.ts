import type { Command } from '../../commands.js'

const websocket = {
  type: 'local',
  name: 'websocket',
  description: '通过 WebSocket 连接与服务器实时通信',
  argumentHint: '<url>',
  load: () => import('./websocket.js'),
} satisfies Command

export default websocket
