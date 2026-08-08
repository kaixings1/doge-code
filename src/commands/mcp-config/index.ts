import type { Command } from '../../commands.js'

const mcpConfig = {
  type: 'local' as const,
  name: 'mcp-config',
  description: '管理 MCP 服务器配置',
  isEnabled: () => true,
  supportsNonInteractive: false,
  argumentHint: '<list|add|remove> [args...]',
  load: () => import('./mcp-config.ts'),
} satisfies Command

export default mcpConfig
