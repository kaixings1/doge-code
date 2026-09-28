export type ScopedLspServerConfig = Record<string, unknown>
/**
 * 插件声明式 LSP 服务器配置（shape 对齐 utils/plugins/schemas.ts 的
 * LspServerConfigSchema）。
 */
export type LspServerConfig = {
  command: string
  args?: string[]
  extensionToLanguage?: Record<string, string>
  transport?: 'stdio' | 'socket'
  env?: Record<string, string>
  workspaceFolder?: string
  startupTimeout?: number
  maxRestarts?: number
  initializationOptions?: unknown
  settings?: unknown
}
export type LspServerState = string
