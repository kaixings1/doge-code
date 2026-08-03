import type { Command } from '../../commands.js'
import { discoverMcpServers, generateDiscoveryReport } from '../../services/mcpDiscovery.js'

const mcpDiscovery = {
  type: 'local' as const,
  name: 'mcp-discovery',
  aliases: ['/mcp-discover', '/mcp-recommend'],
  description: 'MCP Server 发现 - 分析项目并推荐合适的 MCP servers',
  argumentHint: '[path]',
  isEnabled: () => true,
  get isHidden() {
    return false
  },
  call(args: string) {
    const targetPath = args.trim() || process.cwd()
    try {
      const result = discoverMcpServers(void 0, targetPath)
      const report = generateDiscoveryReport(result)
      return { type: 'text' as const, value: report }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { type: 'text' as const, value: 'Error: ' + msg }
    }
  },
} satisfies Command

export default mcpDiscovery
