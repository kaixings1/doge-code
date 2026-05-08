import type { Command } from '../../commands.js'

const mcpToolSearch: Command = {
  name: 'mcp-tool-search',
  description: '命令描述',
  type: 'local',
  load: () => import('./mcpToolSearch.js'),
}

export default mcpToolSearch
