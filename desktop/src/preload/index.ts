/**
 * Electron preload 脚本
 * 通过 contextBridge 向渲染进程暴露安全的 API
 */

import { contextBridge, ipcRenderer } from 'electron'

interface DogeAPIValue {
  readConfig: (filePath: string) => Promise<unknown>
  writeConfig: (filePath: string, data: unknown) => Promise<boolean>
  getCwd: () => Promise<string>
  listDir: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>
  getConfig: () => Promise<{ provider: string; apiKey: string; model: string; baseUrl: string; workingDir: string }>
  updateConfig: (data: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) => Promise<{ success: boolean; error?: string }>
  getTools: () => Promise<Array<{ name: string; description: string; input_schema: any }>>
  executeTool: (call: { name: string; input: any }) => Promise<{ toolUseId: string; success: boolean; output?: any; error?: string }>
  getCommands: () => Promise<Array<{ name: string; description: string; category: string }>>
  executeCommand: (name: string, args: string[]) => Promise<{ success: boolean; output?: string; error?: string }>
  sendMessage: (content: string) => Promise<{ success: boolean; content?: string; error?: string }>
  getState: () => Promise<string>
  abort: () => Promise<boolean>
  getHistory: () => Promise<{ messages: Array<{ role: string; content: string }> }>
  clearHistory: () => Promise<boolean>
  getGitStatus: (cwd: string) => Promise<Array<{ path: string; status: string; staged: boolean }>>
  getGitDiff: (cwd: string, filePath: string) => Promise<string>
  gitStage: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitUnstage: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitDiscard: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitCommit: (cwd: string, message: string) => Promise<{ success: boolean; error?: string }>
  getTheme: () => Promise<{ theme: string; fontSize: number; fontFamily: string; sidebarWidth: number; rightPanelWidth: number }>
  setTheme: (settings: Record<string, unknown>) => Promise<{ success: boolean }>
  getModelInfo: () => Promise<{ provider: string; model: string; baseUrl: string; hasApiKey: boolean }>
  getTokenUsage: () => Promise<{ inputTokens: number; outputTokens: number; totalTokens: number; lastResponseLength: number; messageCount: number }>
  getMemoryUsage: () => Promise<{ success: boolean; heapUsed?: number; rss?: number; external?: number; error?: string } | null>
  saveDraft: (data: { input: string; sessionId: string }) => Promise<{ success: boolean; error?: string }>
  loadDraft: (sessionId: string) => Promise<{ success: boolean; input?: string }>
  onChunk: (callback: (chunk: { text: string }) => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void
  onAutoSend: (callback: (text: string) => void) => () => void
  listSessions: () => Promise<Array<{ id: string; createdAt: string; messageCount: number }>>
  loadSession: (sessionId: string) => Promise<{ success: boolean; messageCount?: number; messages?: Array<{ role: string; content: string }>; error?: string }>
  newSession: () => Promise<{ success: boolean }>
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (filePath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  newFile: (dirPath: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>
  newFolder: (dirPath: string, folderName: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openTerminal: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  closeSession: () => Promise<{ success: boolean; sessionId?: string; error?: string }>
  getCurrentSessionId: () => Promise<string | null>
  notify: (title: string, body: string) => Promise<{ success: boolean }>
  getWindowState: () => Promise<{ width?: number; height?: number; x?: number; y?: number }>
  saveWindowState: (state: { width?: number; height?: number; x?: number; y?: number }) => Promise<{ success: boolean }>
  spawnTerminal: (cwd: string) => Promise<{ success: boolean; id?: string; error?: string }>
  terminalWrite: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
  terminalResize: (id: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>
  terminalKill: (id: string) => Promise<{ success: boolean; error?: string }>
  onTerminalData: (callback: (id: string, data: string) => void) => () => void
  onTerminalExit: (callback: (id: string) => void) => () => void
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; size?: number; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  searchFiles: (query: string, cwd: string, maxResults?: number) => Promise<Array<{ path: string; line: number; content: string }>>
  revealInExplorer: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getCrashRecovery: () => Promise<{ hasRecovery: boolean; sessionId?: string; messageCount?: number; timestamp?: string }>
  clearCrashRecovery: () => Promise<{ success: boolean }>
  dbConnect: (conn: { id: string; type: string; path: string; name: string }) => Promise<{ success: boolean; error?: string }>
  dbTables: (connectionId: string) => Promise<{ success: boolean; tables: Array<{ name: string; columns: any[]; indexes: any[]; rowCount?: number }>; error?: string }>
  dbQuery: (connectionId: string, sql: string) => Promise<{ success: boolean; rows: Array<Record<string, unknown>>; columns?: string[]; rowCount?: number; error?: string }>
  mcpList: () => Promise<Array<{ name: string; command: string; args: string[]; transport: string }>>
  mcpAdd: (name: string, command: string, args: string[], transport?: string) => Promise<{ success: boolean; error?: string; message?: string }>
  mcpRemove: (name: string) => Promise<{ success: boolean; error?: string; message?: string }>
  mcpTest: (name: string) => Promise<{ success: boolean; error?: string; message?: string }>
  mcpConnect: (name: string) => Promise<{ success: boolean; tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>; error?: string }>
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; output?: string; error?: string }>
  mcpGetTools: (name: string) => Promise<{ success: boolean; tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>; error?: string }>
  agentList: () => Promise<Array<{ id: string; name: string; description: string; model: string }>>
  agentGet: (id: string) => Promise<Record<string, unknown> | null>
  agentSave: (agent: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string }>
  agentDelete: (id: string) => Promise<{ success: boolean; error?: string }>
  pluginScan: () => Promise<Array<{ name: string; path: string; manifest: { name: string; description?: string; version?: string; author?: string }; enabled: boolean; commands: Array<{ name: string; description?: string; path: string }>; agents: Array<{ name: string; description?: string; path: string }> }>>
  pluginEnable: (pluginName: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  pluginInstall: (sourceDir: string, pluginName: string) => Promise<{ success: boolean; error?: string }>
  pluginUninstall: (pluginName: string) => Promise<{ success: boolean; error?: string }>
  pluginGetCommand: (pluginName: string, commandName: string) => Promise<{ content: string | null }>
  aiComplete: (input: { filePath: string; code: string; line: number; column: number }) => Promise<{ success: boolean; completions: Array<{ insertText: string; endLine?: number; endColumn?: number; documentation?: string }> }>
  formatCode: (params: { code: string; language: string; tool: string; cwd: string; range?: { start: number; end: number } }) => Promise<{ success: boolean; output?: string; error?: string }>
  apiTestSend: (request: { url: string; method: string; headers: Record<string, string>; body?: string; bodyType: string }) => Promise<{ success: boolean; status: number; statusText: string; responseHeaders: Record<string, string>; body: string; error?: string }>
  getGitStats: (cwd: string) => Promise<{ commits: Array<{ hash: string; date: string; author: string; message: string; additions: number; deletions: number }> }>
}

const dogeAPI: DogeAPIValue = {
  readConfig: (filePath: string) => ipcRenderer.invoke('read-config', filePath),
  writeConfig: (filePath: string, data: unknown) => ipcRenderer.invoke('write-config', filePath, data),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  listDir: (dirPath: string) => ipcRenderer.invoke('list-dir', dirPath),
  getConfig: () => ipcRenderer.invoke('doge:get-config'),
  updateConfig: (data: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) => ipcRenderer.invoke('doge:update-config', data),
  getTools: () => ipcRenderer.invoke('doge:get-tools'),
  executeTool: (call: { name: string; input: Record<string, unknown> }) => ipcRenderer.invoke('doge:execute-tool', call),
  getCommands: () => ipcRenderer.invoke('doge:get-commands'),
  executeCommand: (name: string, args: string[]) => ipcRenderer.invoke('doge:execute-command', name, args),
  sendMessage: (content: string) => ipcRenderer.invoke('doge:send-message', content),
  getState: () => ipcRenderer.invoke('doge:get-state'),
  abort: () => ipcRenderer.invoke('doge:abort'),
  getHistory: () => ipcRenderer.invoke('doge:get-history'),
  clearHistory: () => ipcRenderer.invoke('doge:clear-history'),
  getGitStatus: (cwd: string) => ipcRenderer.invoke('doge:get-git-status', cwd),
  getGitDiff: (cwd: string, filePath: string) => ipcRenderer.invoke('doge:get-git-diff', cwd, filePath),
  gitStage: (cwd: string, filePath: string) => ipcRenderer.invoke('doge:git-stage', cwd, filePath),
  gitUnstage: (cwd: string, filePath: string) => ipcRenderer.invoke('doge:git-unstage', cwd, filePath),
  gitDiscard: (cwd: string, filePath: string) => ipcRenderer.invoke('doge:git-discard', cwd, filePath),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('doge:git-commit', cwd, message),
  onChunk: (callback: (chunk: { text: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: { text: string }) => callback(chunk)
    ipcRenderer.on('doge:chunk', handler)
    return () => ipcRenderer.removeListener('doge:chunk', handler)
  },
  onStateChange: (callback: (state: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: string) => callback(state)
    ipcRenderer.on('doge:state-change', handler)
    return () => ipcRenderer.removeListener('doge:state-change', handler)
  },
  onAutoSend: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('doge:auto-send', handler)
    return () => ipcRenderer.removeListener('doge:auto-send', handler)
  },
  getModelInfo: () => ipcRenderer.invoke('doge:get-model-info'),
  getTokenUsage: () => ipcRenderer.invoke('doge:get-token-usage'),
  getMemoryUsage: () => ipcRenderer.invoke('doge:get-memory-usage'),
  saveDraft: (data: { input: string; sessionId: string }) => ipcRenderer.invoke('doge:save-draft', data),
  loadDraft: (sessionId: string) => ipcRenderer.invoke('doge:load-draft', sessionId),
  getTheme: () => ipcRenderer.invoke('doge:get-theme'),
  setTheme: (settings: Record<string, unknown>) => ipcRenderer.invoke('doge:set-theme', settings),
  listSessions: () => ipcRenderer.invoke('doge:list-sessions'),
  loadSession: (sessionId: string) => ipcRenderer.invoke('doge:load-session', sessionId),
  newSession: () => ipcRenderer.invoke('doge:new-session'),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('doge:delete-session', sessionId),
  deleteFile: (filePath: string) => ipcRenderer.invoke('doge:delete-file', filePath),
  renameFile: (filePath: string, newName: string) => ipcRenderer.invoke('doge:rename-file', filePath, newName),
  newFile: (dirPath: string, fileName: string) => ipcRenderer.invoke('doge:new-file', dirPath, fileName),
  newFolder: (dirPath: string, folderName: string) => ipcRenderer.invoke('doge:new-folder', dirPath, folderName),
  openTerminal: (dirPath: string) => ipcRenderer.invoke('doge:open-terminal', dirPath),
  closeSession: () => ipcRenderer.invoke('doge:close-session'),
  getCurrentSessionId: () => ipcRenderer.invoke('doge:get-session-id'),
  notify: (title: string, body: string) => ipcRenderer.invoke('doge:notify', title, body),
  getWindowState: () => ipcRenderer.invoke('doge:get-window-state'),
  saveWindowState: (state: { width?: number; height?: number; x?: number; y?: number }) => ipcRenderer.invoke('doge:save-window-state', state),
  readFile: (filePath: string) => ipcRenderer.invoke('doge:read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('doge:write-file', filePath, content),
  searchFiles: (query: string, cwd: string, maxResults?: number) => ipcRenderer.invoke('doge:search-files', query, cwd, maxResults),
  revealInExplorer: (filePath: string) => ipcRenderer.invoke('doge:reveal-in-explorer', filePath),
  spawnTerminal: (cwd: string) => ipcRenderer.invoke('doge:spawn-terminal', cwd),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke('doge:terminal-write', id, data),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('doge:terminal-resize', id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.invoke('doge:terminal-kill', id),
  onTerminalData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data)
    ipcRenderer.on('doge:terminal-data', handler)
    return () => ipcRenderer.removeListener('doge:terminal-data', handler)
  },
  onTerminalExit: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => callback(id)
    ipcRenderer.on('doge:terminal-exit', handler)
    return () => ipcRenderer.removeListener('doge:terminal-exit', handler)
  },
  getCrashRecovery: () => ipcRenderer.invoke('doge:get-crash-recovery'),
  clearCrashRecovery: () => ipcRenderer.invoke('doge:clear-crash-recovery'),
  dbConnect: (conn: { id: string; type: string; path: string; name: string }) => ipcRenderer.invoke('doge:db-connect', conn),
  dbTables: (connectionId: string) => ipcRenderer.invoke('doge:db-tables', connectionId),
  dbQuery: (connectionId: string, sql: string) => ipcRenderer.invoke('doge:db-query', connectionId, sql),
  mcpList: () => ipcRenderer.invoke('doge:mcp-list'),
  mcpAdd: (name: string, command: string, args: string[], transport?: string) => ipcRenderer.invoke('doge:mcp-add', name, command, args, transport),
  mcpRemove: (name: string) => ipcRenderer.invoke('doge:mcp-remove', name),
  mcpTest: (name: string) => ipcRenderer.invoke('doge:mcp-test', name),
  mcpConnect: (name: string) => ipcRenderer.invoke('doge:mcp-connect', name),
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) => ipcRenderer.invoke('doge:mcp-call-tool', serverName, toolName, args),
  mcpGetTools: (name: string) => ipcRenderer.invoke('doge:mcp-get-tools', name),
  agentList: () => ipcRenderer.invoke('doge:agent-list'),
  agentGet: (id: string) => ipcRenderer.invoke('doge:agent-get', id),
  agentSave: (agent: Record<string, unknown>) => ipcRenderer.invoke('doge:agent-save', agent),
  agentDelete: (id: string) => ipcRenderer.invoke('doge:agent-delete', id),
  pluginScan: () => ipcRenderer.invoke('doge:plugin-scan'),
  pluginEnable: (pluginName: string, enabled: boolean) => ipcRenderer.invoke('doge:plugin-enable', pluginName, enabled),
  pluginInstall: (sourceDir: string, pluginName: string) => ipcRenderer.invoke('doge:plugin-install', sourceDir, pluginName),
  pluginUninstall: (pluginName: string) => ipcRenderer.invoke('doge:plugin-uninstall', pluginName),
  pluginGetCommand: (pluginName: string, commandName: string) => ipcRenderer.invoke('doge:plugin-get-command', pluginName, commandName),
  // 以下为占位 API（主进程 IPC handler 未实现，调用时返回失败）
  aiComplete: (input: { filePath: string; code: string; line: number; column: number }) => ipcRenderer.invoke('doge:ai-complete', input),
  formatCode: async (params) => {
    try {
      const result = await ipcRenderer.invoke('doge:format-code', params)
      return result
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : '格式化服务不可用' }
    }
  },
  apiTestSend: (request: { url: string; method: string; headers: Record<string, string>; body?: string; bodyType: string }) => ipcRenderer.invoke('doge:api-test-send', request),
  getGitStats: async () => ({ commits: [] }),
}

contextBridge.exposeInMainWorld('dogeAPI', dogeAPI)
export type DogeAPI = DogeAPIValue
