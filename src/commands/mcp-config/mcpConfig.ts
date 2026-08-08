import type { LocalCommandCall } from '../../types/command.js'
import {
  addMcpServer,
  getMcpServer,
  hasMcpConfig,
  listMcpServers,
  loadMcpConfig,
  removeMcpServer,
  saveMcpConfig,
} from '../../utils/config/dogeMcpConfig.js'

const call: LocalCommandCall = async (args: string) => {
  const trimmed = (args || '').trim()
  const parts = trimmed.split(/\s+/)
  const action = parts[0]?.toLowerCase() || 'list'
  const arg1 = parts[1]
  const arg2 = parts.slice(2).join(' ')

  switch (action) {
    case 'list':
    case 'ls':
      return handleList()
    case 'add':
      return handleAdd(arg1, arg2)
    case 'remove':
    case 'rm':
    case 'del':
      return handleRemove(arg1)
    case 'show':
    case 'get':
      return handleShow(arg1)
    case 'help':
    case '--help':
    case '-h':
    default:
      return { type: 'text' as const, value: getHelpText() }
  }
}

function handleList(): { type: 'text'; value: string } {
  if (!hasMcpConfig()) {
    return {
      type: 'text' as const,
      value: '🔌 没有 MCP 服务器配置\n\n使用 /mcp-config add <name> <command> [args...] 添加服务器\n或直接编辑 .doge/mcp.json',
    }
  }

  const config = loadMcpConfig()
  const servers = Object.entries(config.mcpServers)

  if (servers.length === 0) {
    return {
      type: 'text' as const,
      value: '🔌 MCP 配置为空\n\n使用 /mcp-config add <name> <command> [args...] 添加服务器',
    }
  }

  const lines = [`🔌 MCP 服务器 (${servers.length} 个)`, '']

  for (const [name, server] of servers) {
    const transport = server.transport || 'stdio'
    if (transport === 'stdio') {
      lines.push(`  ${name}`)
      lines.push(`    命令: ${server.command} ${(server.args || []).join(' ')}`)
    } else if (transport === 'sse' || transport === 'websocket') {
      lines.push(`  ${name}`)
      lines.push(`    URL: ${server.url} (${transport})`)
    }
    lines.push('')
  }

  lines.push('使用 /mcp-config show <name> 查看服务器详情')
  lines.push('使用 /mcp-config remove <name> 删除服务器')

  return { type: 'text' as const, value: lines.join('\n') }
}

function handleAdd(name?: string, rest?: string): { type: 'text'; value: string } {
  if (!name || !rest) {
    return {
      type: 'text' as const,
      value: '用法: /mcp-config add <name> <command> [args...]\n\n示例:\n  /mcp-config add filesystem npx -y @modelcontextprotocol/server-filesystem /path\n  /mcp-config add github https://api.github.com --transport sse',
    }
  }

  const parts = rest.split(/\s+/)
  let command = ''
  let args: string[] = []
  let url: string | undefined
  let transport: 'stdio' | 'sse' | 'websocket' = 'stdio'
  let headers: Record<string, string> | undefined

  // Check if it's a URL (HTTP transport)
  if (parts[0].startsWith('http://') || parts[0].startsWith('https://')) {
    url = parts[0]
    transport = 'sse'
    if (parts.includes('--transport') && parts[parts.indexOf('--transport') + 1]) {
      transport = parts[parts.indexOf('--transport') + 1] as 'stdio' | 'sse' | 'websocket'
    }
  } else {
    command = parts[0]
    args = parts.slice(1)
  }

  const serverConfig: Record<string, unknown> = {}
  if (command && args.length > 0) {
    serverConfig.command = command
    serverConfig.args = args
  }
  if (url) {
    serverConfig.url = url
    serverConfig.transport = transport
  }
  if (headers) {
    serverConfig.headers = headers
  }

  addMcpServer(name, serverConfig)

  return {
    type: 'text' as const,
    value: `✅ MCP 服务器已添加: ${name}\n\n使用 /mcp-config list 查看所有服务器`,
  }
}

function handleRemove(name?: string): { type: 'text'; value: string } {
  if (!name) {
    return {
      type: 'text' as const,
      value: '用法: /mcp-config remove <name>',
    }
  }

  if (removeMcpServer(name)) {
    return { type: 'text' as const, value: `🗑️ MCP 服务器已删除: ${name}` }
  }

  return {
    type: 'text' as const,
    value: `❌ 未找到 MCP 服务器: ${name}\n使用 /mcp-config list 查看可用服务器`,
  }
}

function handleShow(name?: string): { type: 'text'; value: string } {
  if (!name) {
    return {
      type: 'text' as const,
      value: '用法: /mcp-config show <name>',
    }
  }

  const server = getMcpServer(name)
  if (!server) {
    return {
      type: 'text' as const,
      value: `❌ 未找到 MCP 服务器: ${name}`,
    }
  }

  const lines = [`🔌 MCP 服务器: ${name}`, '']

  for (const [key, value] of Object.entries(server)) {
    if (key === 'env' || key === 'headers') {
      lines.push(`  ${key}:`)
      for (const [k, v] of Object.entries(value as Record<string, string>)) {
        lines.push(`    ${k}: ${v}`)
      }
    } else if (Array.isArray(value)) {
      lines.push(`  ${key}: [${(value as string[]).join(', ')}]`)
    } else {
      lines.push(`  ${key}: ${value}`)
    }
  }

  return { type: 'text' as const, value: lines.join('\n') }
}

function getHelpText(): string {
  return [
    '🔌 MCP 服务器配置管理',
    '',
    '用法:',
    '  /mcp-config list                  - 列出所有 MCP 服务器',
    '  /mcp-config add <name> <cmd> [args...] - 添加 stdio 服务器',
    '  /mcp-config add <name> <url> --transport sse - 添加 SSE 服务器',
    '  /mcp-config remove <name>         - 删除 MCP 服务器',
    '  /mcp-config show <name>           - 查看服务器详情',
    '',
    '说明:',
    '  - 配置存储在 .doge/mcp.json',
    '  - 支持 stdio / sse / websocket 传输类型',
    '  - 添加服务器后需重启以加载',
  ].join('\n')
}

export default call
