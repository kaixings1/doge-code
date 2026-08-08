export interface ServerClient {
  type: string
  name?: string
  capabilities?: Record<string, unknown>
}

export interface ServerOAuth {
  clientId?: string
  callbackPort?: number
}

export interface ServerInfo {
  name: string
  client: ServerClient
  type: string
  url?: string
  isAuthenticated?: boolean
  oauth?: ServerOAuth
  tools?: unknown[]
  resources?: unknown[]
  prompts?: unknown[]
  commands?: unknown[]
  config?: Record<string, unknown>
  capabilities?: Record<string, unknown>
  version?: string
  status?: string
  error?: string
  [key: string]: unknown
}

export type AgentMcpServerInfo = ServerInfo
export type ClaudeAIServerInfo = ServerInfo
export type HTTPServerInfo = ServerInfo
export type SSEServerInfo = ServerInfo
export type StdioServerInfo = ServerInfo
export type MCPViewState = string
