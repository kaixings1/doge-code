import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const MCP_CONFIG_FILE = join(homedir(), '.doge', 'mcp.json')

export interface McpServerConfig {
  command?: string
  args?: string[]
  url?: string
  transport?: 'stdio' | 'sse' | 'websocket'
  headers?: Record<string, string>
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

const DEFAULT_CONFIG: McpConfig = {
  mcpServers: {},
}

/**
 * Ensure the .doge directory exists
 */
export function ensureDogeDir(): void {
  const dogeDir = join(homedir(), '.doge')
  if (!existsSync(dogeDir)) {
    try {
      const { mkdirSync } = require('fs')
      mkdirSync(dogeDir, { recursive: true })
    } catch {
      // ignore
    }
  }
}

/**
 * Check if MCP config file exists
 */
export function hasMcpConfig(): boolean {
  return existsSync(MCP_CONFIG_FILE)
}

/**
 * Load MCP configuration from file
 */
export function loadMcpConfig(): McpConfig {
  if (!hasMcpConfig()) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const content = readFileSync(MCP_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(content)
    return {
      mcpServers: { ...DEFAULT_CONFIG.mcpServers, ...(parsed.mcpServers || {}) },
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save MCP configuration to file
 */
export function saveMcpConfig(config: McpConfig): void {
  ensureDogeDir()
  writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * List all MCP server names
 */
export function listMcpServers(): string[] {
  const config = loadMcpConfig()
  return Object.keys(config.mcpServers)
}

/**
 * Get a specific MCP server configuration
 */
export function getMcpServer(name: string): McpServerConfig | undefined {
  const config = loadMcpConfig()
  return config.mcpServers[name]
}

/**
 * Add an MCP server configuration
 */
export function addMcpServer(name: string, serverConfig: McpServerConfig): void {
  const config = loadMcpConfig()
  config.mcpServers[name] = serverConfig
  saveMcpConfig(config)
}

/**
 * Remove an MCP server configuration
 * @returns true if the server was removed, false if it didn't exist
 */
export function removeMcpServer(name: string): boolean {
  const config = loadMcpConfig()
  if (!(name in config.mcpServers)) {
    return false
  }
  delete config.mcpServers[name]
  saveMcpConfig(config)
  return true
}
