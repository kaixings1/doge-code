import type { Command } from '../types/command.js'

const graphql: Command = {
  name: 'graphql',
  description: 'GraphQL 查询工具',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/graphql\n\n向 GraphQL API 发送查询请求。',
      description: 'GraphQL 查询工具',
    }
  },
}

export default graphql
