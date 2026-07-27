/**
 * Electron preload 脚本
 * 通过 contextBridge 向渲染进程暴露安全的 API
 */

import { contextBridge, ipcRenderer } from 'electron'

interface DogeAPIValue {
  // 配置
  readConfig: (filePath: string) => Promise<unknown>
  writeConfig: (filePath: string, data: unknown) => Promise<boolean>
  getCwd: () => Promise<string>
  listDir: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>
  getConfig: () => Promise<{
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    workingDir: string
  }>
  updateConfig: (data: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) => Promise<{ success: boolean; error?: string }>

  // 聊天
  sendMessage: (content: string) => Promise<{ success: boolean; content?: string; error?: string }>
  getState: () => Promise<string>
  abort: () => Promise<boolean>
  getHistory: () => Promise<{ messages: Array<{ role: string; content: string }> }>
  clearHistory: () => Promise<boolean>

  // Git
  getGitStatus: (cwd: string) => Promise<Array<{ path: string; status: string; staged: boolean }>>
  getGitDiff: (cwd: string, filePath: string) => Promise<string>
  gitStage: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitUnstage: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitDiscard: (cwd: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  gitCommit: (cwd: string, message: string) => Promise<{ success: boolean; error?: string }>

  // 工具
  getTools: () => Promise<Array<{ name: string; description: string; input_schema: Record<string, unknown> }>>
  executeTool: (call: { name: string; input: Record<string, unknown> }) => Promise<{ toolUseId: string; success: boolean; output?: unknown; error?: string }>

  // 命令
  getCommands: () => Promise<Array<{ name: string; description: string; category: string }>>
  executeCommand: (name: string, args: string[]) => Promise<{ success: boolean; output?: string; error?: string }>

  // 主题与设置
  getTheme: () => Promise<{ theme: string; fontSize: number; fontFamily: string; sidebarWidth: number; rightPanelWidth: number }>
  setTheme: (settings: Record<string, unknown>) => Promise<{ success: boolean }>

  // 模型与状态
  getModelInfo: () => Promise<{ provider: string; model: string; baseUrl: string; hasApiKey: boolean }>
  getTokenUsage: () => Promise<{ inputTokens: number; outputTokens: number; totalTokens: number; lastResponseLength: number; messageCount: number }>

  // 事件订阅
  onChunk: (callback: (chunk: { text: string }) => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void

  // 会话
  listSessions: () => Promise<Array<{ id: string; createdAt: string; messageCount: number }>>
  loadSession: (sessionId: string) => Promise<{ success: boolean; messageCount?: number; error?: string }>
  newSession: () => Promise<{ success: boolean }>
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (filePath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  newFile: (dirPath: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>
  newFolder: (dirPath: string, folderName: string) => Promise<{ success: boolean; path?: string; error?: string }>
  openTerminal: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  getCurrentSessionId: () => Promise<string | null>
  notify: (title: string, body: string) => Promise<{ success: boolean }>
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

  getModelInfo: () => ipcRenderer.invoke('doge:get-model-info'),
  getTokenUsage: () => ipcRenderer.invoke('doge:get-token-usage'),
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
  getCurrentSessionId: () => ipcRenderer.invoke('doge:get-session-id'),
  notify: (title: string, body: string) => ipcRenderer.invoke('doge:notify', title, body),
}

contextBridge.exposeInMainWorld('dogeAPI', dogeAPI)
export type DogeAPI = DogeAPIValue
