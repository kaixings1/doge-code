import type { Command } from '../../commands.js'

const mcpToolSearch: Command = {
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

export default mcpToolSearch
