import type { Command } from '../../commands.js'

const http: Command = {
  name: 'http',
  description: '命令描述',
  type: 'local',
  load: () => import('./http.js'),
}

export default http
