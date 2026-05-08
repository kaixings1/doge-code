import type { Command } from '../types/command.js'

const graphqlCommand: Command = {
  name: 'graphql',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/graphql\n\ngraphql 命令的功能描述。',
      description: 'graphql 命令描述',
    }
  },
}

export default graphqlCommand
