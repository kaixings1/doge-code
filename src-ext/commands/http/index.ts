import type { Command } from '../types/command.js'

const http: Command = {
  name: 'http',
  description: 'HTTP 请求工具',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/http\n\n发送 HTTP 请求到指定的 URL。',
      description: 'HTTP 请求工具',
    }
  },
}

export default http
