import type { Command } from '../../commands.js'

const http = {
  type: 'local',
  name: 'http',
  description: '发送 HTTP 请求并查看响应结果',
  argumentHint: '<method> <url> [body]',
  load: () => import('./http.js'),
} satisfies Command

export default http
