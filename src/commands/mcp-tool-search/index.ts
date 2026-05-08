import type { Command } from '../../commands.js'

const mcpToolsearch = {
  type: 'local',
  name: 'mcp-tool-search',
  description: '命令描述',
  load: () => import('./mcpToolsearch.js'),
} satisfies Command

export default mcpToolsearch
