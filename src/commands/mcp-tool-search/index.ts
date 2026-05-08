import type { Command } from '../types/command.js'

const mcp tool searchCommand: Command = {
  name: 'mcp-tool-search',
  description: '命令描述',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/mcp-tool-search\n\nmcp-tool-search 命令的功能描述。',
      description: 'mcp-tool-search 命令描述',
    }
  },
}

export default mcp tool searchCommand
