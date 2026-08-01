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
  sendMessage: (content: string, preAnalysis?: Array<{ type: string; message: string; line?: number }>) => Promise<{ success: boolean; content?: string; error?: string }>
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
  gitMergeStatus: (cwd: string) => Promise<{ inMerge: boolean; conflicts: Array<{ file: string; base: string; ours: string; theirs: string }>; message: string; error?: string }>
  gitMergeResolve: (cwd: string, filePath: string, resolvedContent: string, strategy: 'ours' | 'theirs' | 'manual') => Promise<{ success: boolean; error?: string }>
  gitAbortMerge: (cwd: string) => Promise<{ success: boolean; error?: string }>
  gitBranchList: (cwd: string) => Promise<{ local: Array<{ name: string; commit: string; date: string; isCurrent: boolean; isRemote: boolean }>; remote: Array<{ name: string; commit: string; date: string; isCurrent: boolean; isRemote: boolean }>; current: string; error?: string }>
  gitBranchCreate: (cwd: string, branchName: string, checkout: boolean) => Promise<{ success: boolean; error?: string }>
  gitBranchSwitch: (cwd: string, branchName: string) => Promise<{ success: boolean; error?: string }>
  gitBranchDelete: (cwd: string, branchName: string, force: boolean) => Promise<{ success: boolean; error?: string }>
  gitBranchMerge: (cwd: string, sourceBranch: string, targetBranch: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitLogGraph: (cwd: string, maxCount?: number) => Promise<{ success: boolean; graph?: string; error?: string }>
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
  marketplaceList: () => Promise<Array<{ name: string; source: string; plugins: Array<{ name: string; description?: string; version?: string; source: string; repo?: string; installed: boolean }> }>>
  marketplaceInstall: (pluginName: string, repo: string) => Promise<{ success: boolean; error?: string }>
  aiComplete: (input: { filePath: string; code: string; line: number; column: number }) => Promise<{ success: boolean; completions: Array<{ insertText: string; endLine?: number; endColumn?: number; documentation?: string }> }>
  formatCode: (params: { code: string; language: string; tool: string; cwd: string; range?: { start: number; end: number } }) => Promise<{ success: boolean; output?: string; error?: string }>
  apiTestSend: (request: { url: string; method: string; headers: Record<string, string>; body?: string; bodyType: string }) => Promise<{ success: boolean; status: number; statusText: string; responseHeaders: Record<string, string>; body: string; error?: string }>
  getGitStats: (cwd: string) => Promise<{ commits: Array<{ hash: string; date: string; author: string; message: string; additions: number; deletions: number }> }>
  gitShow: (cwd: string, sha: string) => Promise<{ success: boolean; sha: string; author: string; date: string; message: string; stats: Array<{ file: string; additions: number; deletions: number }>; error?: string }>
  gitDiff: (cwd: string, shaA: string, shaB: string, filePath?: string) => Promise<{ success: boolean; stats: Array<{ file: string; additions: number; deletions: number; changeType: string }>; error?: string }>
  lspStart: (languageId: string) => Promise<{ success: boolean; error?: string; serverName?: string }>
  lspStop: (languageId: string) => Promise<{ success: boolean; error?: string }>
  lspStopAll: () => Promise<{ success: boolean; error?: string }>
  lspCompletion: (filePath: string, line: number, character: number) => Promise<{ success: boolean; items?: Array<{ label: string; insertText: string; kind?: number; detail?: string; documentation?: string }>; error?: string }>
  lspDefinition: (filePath: string, line: number, character: number) => Promise<{ success: boolean; locations?: Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>; error?: string }>
  lspHover: (filePath: string, line: number, character: number) => Promise<{ success: boolean; result?: { contents?: unknown }; error?: string }>
  lspReferences: (filePath: string, line: number, character: number) => Promise<{ success: boolean; locations?: Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>; error?: string }>
  lspDocumentSymbol: (filePath: string) => Promise<{ success: boolean; symbols?: Array<{ name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>; error?: string }>
  codeReview: (params: { filePath: string; cwd: string }) => Promise<{ success: boolean; result?: { score: { overall: number; security: number; performance: number; maintainability: number; testability: number }; findings: Array<{ id: string; category: string; severity: string; title: string; description: string; filePath: string; lineNumber: number; column?: number; suggestedFix?: string; originalCode?: string }>; duration?: number }; error?: string }>
  applyFix: (params: { filePath: string; lineNumber: number; column: number; fixedCode: string; originalCode?: string }) => Promise<{ success: boolean; error?: string }>
  getOutline: (params: { filePath: string; cwd: string }) => Promise<{ success: boolean; symbols?: Array<{ id: string; name: string; kind: string; range: { startLine: number; startColumn: number; endLine: number; endColumn: number }; children?: Array<unknown> }>; error?: string }>
  semanticSearch: (params: { query: string; cwd: string; maxResults?: number; fileTypes?: string[]; directories?: string[] }) => Promise<{ success: boolean; results?: Array<{ filePath: string; lineNumber: number; column: number; content: string; score: number; context?: string }>; error?: string }>
  debugStart: (params: { cwd: string; script: string; args?: string[] }) => Promise<{ success: boolean; sessionId?: string; pid?: number; error?: string }>
  debugStop: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugListSessions: () => Promise<{ success: boolean; sessions?: Array<{ id: string; pid: number; isRunning: boolean; isPaused: boolean; breakpointCount: number }> }>
  debugSetBreakpoint: (params: { sessionId: string; file: string; line: number; condition?: string }) => Promise<{ success: boolean; message?: string; error?: string }>
  debugRemoveBreakpoint: (params: { sessionId: string; file: string; line: number }) => Promise<{ success: boolean; error?: string }>
  debugListBreakpoints: (sessionId: string) => Promise<{ success: boolean; breakpoints?: Array<{ file: string; line: number }> }>
  debugContinue: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugPause: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugStepOver: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugStepInto: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugStepOut: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  debugGetCallstack: (sessionId: string) => Promise<{ success: boolean; callStack?: Array<{ name: string; file: string; line: number; column: number }> }>
  debugGetVariables: (sessionId: string) => Promise<{ success: boolean; variables?: Record<string, string> }>
  debugEvaluate: (params: { sessionId: string; expression: string }) => Promise<{ success: boolean; result?: string; type?: string; error?: string }>
  lspWorkspaceSymbol: (query: string) => Promise<{ success: boolean; symbols?: Array<{ name: string; kind: number; location: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } }>; error?: string }>
  lspDocumentHighlight: (filePath: string, line: number, character: number) => Promise<{ success: boolean; highlights?: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; kind: number }>; error?: string }>
  lspConnectedServers: () => Promise<{ success: boolean; servers?: string[]; error?: string }>
  onLspDiagnostic: (callback: (uri: string, diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: number; message: string; source?: string; code?: string | number }>) => void) => () => void

  // ── 安全审计 ──
  securityAudit: (params: { scanPath: string; rules?: string[]; scanType?: 'file' | 'directory' }) => Promise<{ success: boolean; issues?: Array<{ id: string; file: string; line: number; rule: string; severity: string; message: string; code: string }>; stats?: { total: number; high: number; medium: number; low: number }; error?: string }>
  securityRules: () => Promise<{ success: boolean; rules?: Array<{ id: string; severity: string; message: string }>; error?: string }>

  // ── 协作功能 ──
  collabCreateRoom: (params: { name: string; cwd: string }) => Promise<{ success: boolean; roomId?: string; hostId?: string; error?: string }>
  collabJoinRoom: (roomId: string) => Promise<{ success: boolean; roomId?: string; userId?: string; participants?: Array<{ id: string; name: string; color: string }>; comments?: Array<unknown>; error?: string }>
  collabLeaveRoom: (params: { roomId: string; userId: string }) => Promise<{ success: boolean; error?: string }>
  collabListRooms: () => Promise<{ success: boolean; rooms?: Array<{ id: string; name: string; hostId: string; participantCount: number; commentCount: number }> }>
  collabGetParticipants: (roomId: string) => Promise<{ success: boolean; participants?: Array<{ id: string; name: string; color: string; cursorLine?: number; cursorCol?: number; file?: string }> }>
  collabUpdateCursor: (params: { roomId: string; userId: string; file: string; line: number; col: number }) => Promise<{ success: boolean }>
  collabAddComment: (params: { roomId: string; file: string; line: number; author: string; text: string }) => Promise<{ success: boolean; comment?: { id: string; file: string; line: number; author: string; text: string; resolved: boolean; createdAt: number }; error?: string }>
  collabResolveComment: (params: { roomId: string; commentId: string }) => Promise<{ success: boolean }>
  collabGetComments: (params: { roomId: string; file?: string }) => Promise<{ success: boolean; comments?: Array<{ id: string; file: string; line: number; author: string; text: string; resolved: boolean; createdAt: number }> }>
  collabApplyEdit: (params: { roomId: string; userId: string; file: string; oldText: string; newText: string; line: number }) => Promise<{ success: boolean; version?: number; error?: string }>

  // ── 远程协助 ──
  remoteOffer: (params: { sessionId: string; callerId: string; calleeId: string; offer: RTCSessionDescriptionInit }) => Promise<{ success: boolean; error?: string }>
  remoteAnswer: (params: { sessionId: string; answer: RTCSessionDescriptionInit }) => Promise<{ success: boolean; error?: string }>
  remoteIceCandidate: (params: { sessionId: string; candidate: RTCIceCandidateInit }) => Promise<{ success: boolean }>
  remoteGetSignal: (sessionId: string) => Promise<{ success: boolean; signal?: { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; iceCandidates?: RTCIceCandidateInit[] } | null }>
  remoteClose: (sessionId: string) => Promise<{ success: boolean }>

  // ── 测试运行器 ──
  testRun: (cwd: string, testCommand: string) => Promise<{ success: boolean; output?: string; error?: string; exitCode?: number }>
  testList: (cwd: string) => Promise<{ framework: string; tests: string[] }>

  // ── 日志查看器 ──
  getLogs: (params?: { level?: string; limit?: number; offset?: number }) => Promise<{ logs: Array<{ id: string; timestamp: string; level: string; source: string; message: string }>; total: number }>
  logStreamStart: (options?: { level?: string }) => Promise<{ success: boolean }>
  logStreamStop: () => Promise<{ success: boolean }>
  onLogEntry: (callback: (entry: { level: string; timestamp: string; message: string }) => void) => () => void

  // ── 诊断数据 ──
  getAllDiagnostics: () => Promise<{ success: boolean; diagnostics: Array<{ uri: string; diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: number; message: string; source?: string; code?: string | number }> }> }>

  // ── 语音权限 ──
  requestMicrophonePermission: () => Promise<{ granted: boolean }>
  rollbackTool: (toolUseId: string) => Promise<{ success: boolean; restored: string[]; error?: string }>
  getToolOperations: () => Promise<Array<{ toolUseId: string; toolName: string; timestamp: number; files: string[]; hasSnapshot: boolean; rolledBack: boolean }>>
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
  sendMessage: (content: string, preAnalysis?: Array<{ type: string; message: string; line?: number }>) => ipcRenderer.invoke('doge:send-message', content, preAnalysis),
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
  gitMergeStatus: (cwd: string) => ipcRenderer.invoke('doge:git-merge-status', cwd),
  gitMergeResolve: (cwd: string, filePath: string, resolvedContent: string, strategy: 'ours' | 'theirs' | 'manual') => ipcRenderer.invoke('doge:git-merge-resolve', cwd, filePath, resolvedContent, strategy),
  gitAbortMerge: (cwd: string) => ipcRenderer.invoke('doge:git-abort-merge', cwd),
  gitBranchList: (cwd: string) => ipcRenderer.invoke('doge:git-branch-list', cwd),
  gitBranchCreate: (cwd: string, branchName: string, checkout: boolean) => ipcRenderer.invoke('doge:git-branch-create', cwd, branchName, checkout),
  gitBranchSwitch: (cwd: string, branchName: string) => ipcRenderer.invoke('doge:git-branch-switch', cwd, branchName),
  gitBranchDelete: (cwd: string, branchName: string, force: boolean) => ipcRenderer.invoke('doge:git-branch-delete', cwd, branchName, force),
  gitBranchMerge: (cwd: string, sourceBranch: string, targetBranch: string) => ipcRenderer.invoke('doge:git-branch-merge', cwd, sourceBranch, targetBranch),
  gitLogGraph: (cwd: string, maxCount?: number) => ipcRenderer.invoke('doge:git-log-graph', cwd, maxCount),
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
  marketplaceList: () => ipcRenderer.invoke('doge:marketplace-list'),
  marketplaceInstall: (pluginName: string, repo: string) => ipcRenderer.invoke('doge:marketplace-install', pluginName, repo),
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
  gitShow: (cwd: string, sha: string) => ipcRenderer.invoke('doge:git-show', cwd, sha),
  gitDiff: (cwd: string, shaA: string, shaB: string, filePath?: string) => ipcRenderer.invoke('doge:git-diff', cwd, shaA, shaB, filePath),
  lspStart: (languageId: string) => ipcRenderer.invoke('doge:lsp-start', languageId),
  lspStop: (languageId: string) => ipcRenderer.invoke('doge:lsp-stop', languageId),
  lspStopAll: () => ipcRenderer.invoke('doge:lsp-stop-all'),
  lspCompletion: (filePath: string, line: number, character: number) => ipcRenderer.invoke('doge:lsp-completion', filePath, line, character),
  lspDefinition: (filePath: string, line: number, character: number) => ipcRenderer.invoke('doge:lsp-definition', filePath, line, character),
  lspHover: (filePath: string, line: number, character: number) => ipcRenderer.invoke('doge:lsp-hover', filePath, line, character),
  lspReferences: (filePath: string, line: number, character: number) => ipcRenderer.invoke('doge:lsp-references', filePath, line, character),
  lspDocumentSymbol: (filePath: string) => ipcRenderer.invoke('doge:lsp-document-symbol', filePath),
  lspWorkspaceSymbol: (query: string) => ipcRenderer.invoke('doge:lsp-workspace-symbol', query),
  lspDocumentHighlight: (filePath: string, line: number, character: number) => ipcRenderer.invoke('doge:lsp-document-highlight', filePath, line, character),
  lspConnectedServers: () => ipcRenderer.invoke('doge:lsp-connected-servers'),
  onLspDiagnostic: (callback: (uri: string, diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: number; message: string; source?: string; code?: string | number }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, uri: string, diagnostics: unknown) => callback(uri, diagnostics as Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: number; message: string; source?: string; code?: string | number }>)
    ipcRenderer.on('doge:lsp-diagnostic', handler)
    return () => ipcRenderer.removeListener('doge:lsp-diagnostic', handler)
  },
  codeReview: (params: { filePath: string; cwd: string }) => ipcRenderer.invoke('doge:code-review', params),
  applyFix: (params: { filePath: string; lineNumber: number; column: number; fixedCode: string; originalCode?: string }) => ipcRenderer.invoke('doge:apply-fix', params),
  securityAudit: (params: { scanPath: string; rules?: string[]; scanType?: 'file' | 'directory' }) => ipcRenderer.invoke('doge:security-audit', params),
  securityRules: () => ipcRenderer.invoke('doge:security-rules'),
  getOutline: (params: { filePath: string; cwd: string }) => ipcRenderer.invoke('doge:get-outline', params),
  semanticSearch: (params: { query: string; cwd: string; maxResults?: number; fileTypes?: string[]; directories?: string[] }) => ipcRenderer.invoke('doge:semantic-search', params),
  debugStart: (params: { cwd: string; script: string; args?: string[] }) => ipcRenderer.invoke('doge:debug-start', params),
  debugStop: (sessionId: string) => ipcRenderer.invoke('doge:debug-stop', sessionId),
  debugListSessions: () => ipcRenderer.invoke('doge:debug-list-sessions'),
  debugSetBreakpoint: (params: { sessionId: string; file: string; line: number; condition?: string }) => ipcRenderer.invoke('doge:debug-set-breakpoint', params),
  debugRemoveBreakpoint: (params: { sessionId: string; file: string; line: number }) => ipcRenderer.invoke('doge:debug-remove-breakpoint', params),
  debugListBreakpoints: (sessionId: string) => ipcRenderer.invoke('doge:debug-list-breakpoints', sessionId),
  debugContinue: (sessionId: string) => ipcRenderer.invoke('doge:debug-continue', sessionId),
  debugPause: (sessionId: string) => ipcRenderer.invoke('doge:debug-pause', sessionId),
  debugStepOver: (sessionId: string) => ipcRenderer.invoke('doge:debug-step-over', sessionId),
  debugStepInto: (sessionId: string) => ipcRenderer.invoke('doge:debug-step-into', sessionId),
  debugStepOut: (sessionId: string) => ipcRenderer.invoke('doge:debug-step-out', sessionId),
  debugGetCallstack: (sessionId: string) => ipcRenderer.invoke('doge:debug-get-callstack', sessionId),
  debugGetVariables: (sessionId: string) => ipcRenderer.invoke('doge:debug-get-variables', sessionId),
  debugEvaluate: (params: { sessionId: string; expression: string }) => ipcRenderer.invoke('doge:debug-evaluate', params),

  // ── 协作功能 ──
  collabCreateRoom: (params: { name: string; cwd: string }) => ipcRenderer.invoke('doge:collab-create-room', params),
  collabJoinRoom: (roomId: string) => ipcRenderer.invoke('doge:collab-join-room', roomId),
  collabLeaveRoom: (params: { roomId: string; userId: string }) => ipcRenderer.invoke('doge:collab-leave-room', params),
  collabListRooms: () => ipcRenderer.invoke('doge:collab-list-rooms'),
  collabGetParticipants: (roomId: string) => ipcRenderer.invoke('doge:collab-get-participants', roomId),
  collabUpdateCursor: (params: { roomId: string; userId: string; file: string; line: number; col: number }) => ipcRenderer.invoke('doge:collab-update-cursor', params),
  collabAddComment: (params: { roomId: string; file: string; line: number; author: string; text: string }) => ipcRenderer.invoke('doge:collab-add-comment', params),
  collabResolveComment: (params: { roomId: string; commentId: string }) => ipcRenderer.invoke('doge:collab-resolve-comment', params),
  collabGetComments: (params: { roomId: string; file?: string }) => ipcRenderer.invoke('doge:collab-get-comments', params),
  collabApplyEdit: (params: { roomId: string; userId: string; file: string; oldText: string; newText: string; line: number }) => ipcRenderer.invoke('doge:collab-apply-edit', params),

  // ── 远程协助 ──
  remoteOffer: (params: { sessionId: string; callerId: string; calleeId: string; offer: RTCSessionDescriptionInit }) => ipcRenderer.invoke('doge:remote-offer', params),
  remoteAnswer: (params: { sessionId: string; answer: RTCSessionDescriptionInit }) => ipcRenderer.invoke('doge:remote-answer', params),
  remoteIceCandidate: (params: { sessionId: string; candidate: RTCIceCandidateInit }) => ipcRenderer.invoke('doge:remote-ice-candidate', params),
  remoteGetSignal: (sessionId: string) => ipcRenderer.invoke('doge:remote-get-signal', sessionId),
  remoteClose: (sessionId: string) => ipcRenderer.invoke('doge:remote-close', sessionId),
  requestMicrophonePermission: () => ipcRenderer.invoke('doge:request-microphone-permission'),

  // ── 测试运行器 ──
  testRun: (cwd: string, testCommand: string) => ipcRenderer.invoke('doge:test-run', cwd, testCommand),
  testList: (cwd: string) => ipcRenderer.invoke('doge:test-list', cwd),

  // ── 日志查看器 ──
  getLogs: (params?: { level?: string; limit?: number; offset?: number }) => ipcRenderer.invoke('doge:get-logs', params),
  logStreamStart: (options?: { level?: string }) => ipcRenderer.invoke('doge:log-stream-start', options),
  logStreamStop: () => ipcRenderer.invoke('doge:log-stream-stop'),
  onLogEntry: (callback: (entry: { level: string; timestamp: string; message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: { level: string; timestamp: string; message: string }) => callback(entry)
    ipcRenderer.on('doge:log-entry', handler)
    return () => ipcRenderer.removeListener('doge:log-entry', handler)
  },
  getAllDiagnostics: () => ipcRenderer.invoke('doge:get-all-diagnostics'),
  rollbackTool: (toolUseId: string) => ipcRenderer.invoke('doge:rollback-tool', toolUseId),
  getToolOperations: () => ipcRenderer.invoke('doge:get-tool-operations'),
}

contextBridge.exposeInMainWorld('dogeAPI', dogeAPI)
export type DogeAPI = DogeAPIValue
