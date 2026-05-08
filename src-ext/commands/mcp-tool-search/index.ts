import type { Command } from '../types/command.js'

const mcpToolSearch: Command = {
  name: 'mcp-tool-search',
  description: 'MCP 工具搜索',
  type: 'prompt',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    return {
      command: '/mcp-tool-search\n\n搜索可用的 MCP 工具。',
      description: 'MCP 工具搜索',
    }
  },
}

export default mcpToolSearch
