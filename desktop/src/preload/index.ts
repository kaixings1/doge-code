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

  // 聊天
  sendMessage: (content: string) => Promise<{ success: boolean; content?: string; error?: string }>
  getState: () => Promise<string>
  abort: () => Promise<boolean>
  getHistory: () => Promise<{ messages: Array<{ role: string; content: string }> }>
  clearHistory: () => Promise<boolean>

  // Git
  getGitStatus: (cwd: string) => Promise<Array<{ path: string; status: string; staged: boolean }>>
  getGitDiff: (cwd: string, filePath: string) => Promise<string>

  // 事件订阅
  onChunk: (callback: (chunk: { text: string }) => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void
}

const dogeAPI: DogeAPIValue = {
  readConfig: (filePath: string) => ipcRenderer.invoke('read-config', filePath),
  writeConfig: (filePath: string, data: unknown) => ipcRenderer.invoke('write-config', filePath, data),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  listDir: (dirPath: string) => ipcRenderer.invoke('list-dir', dirPath),
  getConfig: () => ipcRenderer.invoke('doge:get-config'),

  sendMessage: (content: string) => ipcRenderer.invoke('doge:send-message', content),
  getState: () => ipcRenderer.invoke('doge:get-state'),
  abort: () => ipcRenderer.invoke('doge:abort'),
  getHistory: () => ipcRenderer.invoke('doge:get-history'),
  clearHistory: () => ipcRenderer.invoke('doge:clear-history'),
  getGitStatus: (cwd: string) => ipcRenderer.invoke('doge:get-git-status', cwd),
  getGitDiff: (cwd: string, filePath: string) => ipcRenderer.invoke('doge:get-git-diff', cwd, filePath),

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
}

contextBridge.exposeInMainWorld('dogeAPI', dogeAPI)
export type DogeAPI = DogeAPIValue
