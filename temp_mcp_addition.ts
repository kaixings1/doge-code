// ─── MCP 协议握手与工具调用 ───

/** MCP 客户端连接缓存 */
const mcpConnections = new Map<string, { connected: boolean; tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>()

/** IPC: 连接 MCP 服务器并获取工具列表 */
ipcMain.handle('doge:mcp-connect', async (_event, name: string) => {
  const config = readMcpConfig()
  const server = config.servers?.[name] as { command?: string; args?: string[]; transport?: string } | undefined
  if (!server) return { success: false, error: `服务器 "${name}" 不存在` }

  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')

    const transport = new StdioClientTransport({
      command: server.command!,
      args: server.args || [],
    })

    const client = new Client({ name: 'doge-desktop', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)

    const toolsResponse = await client.listTools()
    const tools = toolsResponse.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
    }))

    mcpConnections.set(name, { connected: true, tools })
    await client.close()
    return { success: true, tools }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '连接失败'
    return { success: false, error: message }
  }
})

/** IPC: 调用 MCP 工具 */
ipcMain.handle('doge:mcp-call-tool', async (_event, serverName: string, toolName: string, args: Record<string, unknown>) => {
  const config = readMcpConfig()
  const server = config.servers?.[serverName] as { command?: string; args?: string[]; transport?: string } | undefined
  if (!server) return { success: false, error: `服务器 "${serverName}" 不存在` }

  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')

    const transport = new StdioClientTransport({
      command: server.command!,
      args: server.args || [],
    })

    const client = new Client({ name: 'doge-desktop', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)

    const result = await client.callTool({ name: toolName, arguments: args })

    let output = ''
    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          output += item.text
        } else if (item.type === 'image' && item.data) {
          output += `[图片: ${item.mimeType || 'image'}]`
        } else {
          output += JSON.stringify(item)
        }
      }
    }

    await client.close()
    return { success: !(result as { isError?: boolean }).isError, output: output || JSON.stringify(result) }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '调用失败'
    return { success: false, error: message }
  }
})

/** IPC: 获取已缓存的 MCP 工具列表 */
ipcMain.handle('doge:mcp-get-tools', (_event, name: string) => {
  const conn = mcpConnections.get(name)
  if (!conn) return { success: false, error: '未连接' }
  return { success: true, tools: conn.tools }
})
