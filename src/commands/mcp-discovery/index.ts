import type { Command } from '../../commands.js'
import { analyzeProject, generateDiscoveryReport } from '../../services/mcpDiscovery.js'

const mcpDiscovery = {
  type: 'local' as const,
  name: 'mcp-discovery',
  aliases: ['/mcp-discover', '/mcp-recommend'],
  description: 'MCP Server discovery - analyze project and recommend MCP servers',
  argumentHint: '[path]',
  isEnabled: () => true,
  get isHidden() {
    return false
  },
  async call(args: string) {
    const targetPath = args.trim() || process.cwd()
    try {
      const analysis = await analyzeProject(targetPath)
      const report = generateDiscoveryReport(analysis)
      return { type: 'text' as const, value: report }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { type: 'text' as const, value: 'Error: ' + msg }
    }
  },
} satisfies Command

export default mcpDiscovery
