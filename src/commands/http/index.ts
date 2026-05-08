import type { Command } from '../../commands.js'

const http = {
  type: 'local',
  name: 'http',
  description: '命令描述',
  load: () => import('./http.js'),
} satisfies Command

export default http
