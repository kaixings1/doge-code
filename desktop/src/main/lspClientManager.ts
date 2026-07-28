/**
 * desktop/src/main/lspClientManager.ts — LSP 客户端管理器
 *
 * 提供 LSP 服务器进程管理：
 * 1. 启动/停止 LSP 服务器（spawn child process）
 * 2. JSON-RPC over stdio 通信（Content-Length 帧格式）
 * 3. 请求/响应映射（message ID 关联）
 * 4. 通知推送（server → client 主动通知）
 *
 * 支持的 LSP 服务器：
 * - typescript-language-server (TypeScript/JavaScript)
 * - 未来可扩展：gopls, rust-analyzer, pyright 等
 */

import { spawn, ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { EventEmitter } from 'node:events'

// ─── 类型定义 ───

export interface LspServerConfig {
  /** 服务器名称（如 'typescript'） */
  name: string
  /** 语言 ID（如 'typescript'） */
  languageId: string
  /** 启动命令 */
  command: string
  /** 启动参数 */
  args: string[]
  /** 文件扩展名列表（用于自动匹配） */
  fileExtensions: string[]
  /** 工作目录（可选，默认为项目根目录） */
  cwd?: string
}

export interface LspClientState {
  /** 是否已连接 */
  connected: boolean
  /** 是否正在初始化 */
  initializing: boolean
  /** 进程 PID */
  pid?: number
  /** 最后活跃时间 */
  lastActivity: number
  /** 错误信息 */
  error?: string
}

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string
  insertText: string
  filterText?: string
  sortText?: string
  additionalTextEdits?: Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } }
    newText: string
  }>
}

export interface LspLocation {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface LspSymbolInformation {
  name: string
  kind: number
  location: LspLocation
  containerName?: string
  detail?: string
}

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  severity: number
  message: string
  source?: string
  code?: string | number
}

// ─── 默认 LSP 服务器配置 ───

const DEFAULT_LSP_SERVERS: LspServerConfig[] = [
  {
    name: 'typescript',
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  },
  {
    name: 'typescript-js',
    languageId: 'javascript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  },
]

// ─── 语言 ID 映射（文件扩展名 → LSP languageId） ───

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  'ts': 'typescript',
  'tsx': 'typescript',
  'js': 'javascript',
  'jsx': 'javascript',
  'json': 'json',
  'py': 'python',
  'go': 'go',
  'rs': 'rust',
  'rb': 'ruby',
  'java': 'java',
  'c': 'c',
  'cpp': 'cpp',
  'h': 'c',
  'hpp': 'cpp',
  'cs': 'csharp',
  'php': 'php',
  'swift': 'swift',
  'kt': 'kotlin',
  'scala': 'scala',
}

// ─── LSP 生命周期管理器 ───

export class LspClientManager {
  private servers: Map<string, LspClientState> = new Map()
  private processes: Map<string, ChildProcess> = new Map()
  private requestId = 0
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = new Map()
  private notificationHandlers: Map<string, Set<(params: unknown) => void>> = new Map()
  private messageBuffers: Map<string, Buffer> = new Map()
  private projectRoot: string
  private maxServers = 8

  // 回调
  private onDiagnosticCallback?: (uri: string, diagnostics: LspDiagnostic[]) => void
  private onLogMessageCallback?: (type: number, message: string) => void

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  // ─── 服务器生命周期 ───

  /**
   * 启动 LSP 服务器（按语言）
   */
  async startServer(languageId: string): Promise<{ success: boolean; error?: string; serverName?: string }> {
    // 查找匹配的服务器配置
    const config = DEFAULT_LSP_SERVERS.find(s => s.languageId === languageId)
    if (!config) {
      return { success: false, error: `不支持的语言: ${languageId}` }
    }

    const serverKey = `${config.name}`

    // 如果已连接，直接返回
    const existing = this.servers.get(serverKey)
    if (existing?.connected) {
      return { success: true, serverName: serverKey }
    }

    // 如果正在初始化，等待
    if (existing?.initializing) {
      return { success: true, serverName: serverKey }
    }

    // 清理旧进程
    await this.stopServer(serverKey)

    // 检查服务器命令是否可用
    const resolvedCommand = this.resolveCommand(config.command)
    if (!resolvedCommand) {
      return { success: false, error: `LSP 服务器命令不可用: ${config.command}。请全局安装 ${config.command}` }
    }

    // 启动新进程
    this.servers.set(serverKey, {
      connected: false,
      initializing: true,
      lastActivity: Date.now(),
    })

    try {
      const cwd = config.cwd || this.projectRoot
      const proc = spawn(resolvedCommand, config.args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'development' },
      })

      this.processes.set(serverKey, proc)

      proc.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(serverKey, data)
      })

      proc.stderr?.on('data', (data: Buffer) => {
        console.log(`[LSP:${serverKey}]`, data.toString().slice(0, 200))
      })

      proc.on('exit', (code, signal) => {
        console.log(`[LSP:${serverKey}] exited: code=${code}, signal=${signal}`)
        this.cleanupServer(serverKey)
      })

      proc.on('error', (err) => {
        console.log(`[LSP:${serverKey}] error:`, err.message)
        this.servers.set(serverKey, {
          connected: false,
          initializing: false,
          lastActivity: Date.now(),
          error: err.message,
        })
      })

      // 发送 initialize 请求
      const initResult = await this.sendRequest(serverKey, 'initialize', {
        processId: process.pid,
        rootUri: `file:///${this.projectRoot.replace(/\\/g, '/')}`,
        capabilities: {
          textDocument: {
            completion: { completionItem: { snippetSupport: true } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            references: {},
            documentSymbol: {},
            workspaceSymbol: {},
            documentHighlight: {},
            codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'info'] } } },
          },
          workspace: {
            workspaceFolders: true,
            configuration: true,
          },
        },
        workspaceFolders: [{ uri: `file:///${this.projectRoot.replace(/\\/g, '/')}`, name: path.basename(this.projectRoot) }],
      }, 15000)

      // 发送 initialized 通知
      this.sendNotification(serverKey, 'initialized', {})

      this.servers.set(serverKey, {
        connected: true,
        initializing: false,
        pid: proc.pid,
        lastActivity: Date.now(),
      })

      return { success: true, serverName: serverKey }
    } catch (err) {
      this.cleanupServer(serverKey)
      return { success: false, error: err instanceof Error ? err.message : '启动 LSP 服务器失败' }
    }
  }

  /**
   * 停止 LSP 服务器
   */
  async stopServer(serverName: string): Promise<void> {
    const proc = this.processes.get(serverName)
    if (proc) {
      try {
        this.sendNotification(serverName, 'shutdown', {})
        proc.kill('SIGTERM')
      } catch {
        proc.kill('SIGKILL')
      }
    }
    this.cleanupServer(serverName)
  }

  /**
   * 停止所有 LSP 服务器
   */
  async stopAll(): Promise<void> {
    const names = Array.from(this.processes.keys())
    for (const name of names) {
      await this.stopServer(name)
    }
  }

  // ─── LSP 请求 ───

  /**
   * 发送 LSP 请求（带响应）
   */
  async sendRequest(serverName: string, method: string, params: unknown, timeout = 10000): Promise<unknown> {
    const id = ++this.requestId
    const payload = { jsonrpc: '2.0', id, method, params }

    const server = this.servers.get(serverName)
    if (!server?.connected) {
      // 尝试自动启动服务器
      const langMatch = DEFAULT_LSP_SERVERS.find(s => s.name === serverName)
      if (langMatch) {
        const result = await this.startServer(langMatch.languageId)
        if (!result.success) {
          return { error: `LSP 服务器未连接: ${serverName}` }
        }
      } else {
        return { error: `LSP 服务器未连接: ${serverName}` }
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`LSP 请求超时: ${method} (${timeout}ms)`))
      }, timeout)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })

      this.sendMessage(serverName, payload)
    })
  }

  /**
   * 发送 LSP 通知（无响应）
   */
  sendNotification(serverName: string, method: string, params: unknown): void {
    const payload = { jsonrpc: '2.0', method, params }
    this.sendMessage(serverName, payload)
  }

  // ─── LSP 文档管理 ───

  /**
   * 打开文档
   */
  async openDocument(serverName: string, uri: string, languageId: string, content: string, version = 1): Promise<void> {
    await this.sendRequest(serverName, 'textDocument/didOpen', {
      textDocument: { uri, languageId, version, text: content },
    })
  }

  /**
   * 更新文档内容
   */
  async changeDocument(serverName: string, uri: string, content: string, version = 1): Promise<void> {
    await this.sendNotification(serverName, 'textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    })
  }

  /**
   * 关闭文档
   */
  async closeDocument(serverName: string, uri: string): Promise<void> {
    await this.sendNotification(serverName, 'textDocument/didClose', {
      textDocument: { uri },
    })
  }

  // ─── LSP 功能调用 ───

  /**
   * 代码补全
   */
  async completion(serverName: string, uri: string, line: number, character: number): Promise<LspCompletionItem[]> {
    const result = await this.sendRequest(serverName, 'textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    })

    const response = result as { result?: { items?: LspCompletionItem[]; isIncomplete?: boolean } }
    return response?.result?.items || []
  }

  /**
   * 转到定义
   */
  async definition(serverName: string, uri: string, line: number, character: number): Promise<LspLocation[]> {
    const result = await this.sendRequest(serverName, 'textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    })

    const response = result as { result?: LspLocation[] }
    return response?.result || []
  }

  /**
   * 查找引用
   */
  async references(serverName: string, uri: string, line: number, character: number): Promise<LspLocation[]> {
    const result = await this.sendRequest(serverName, 'textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    })

    const response = result as { result?: LspLocation[] }
    return response?.result || []
  }

  /**
   * 悬停信息
   */
  async hover(serverName: string, uri: string, line: number, character: number): Promise<{ contents: unknown; range?: { start: { line: number; character: number }; end: { line: number; character: number } } } | null> {
    const result = await this.sendRequest(serverName, 'textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    })

    const response = result as { result?: { contents?: unknown; range?: unknown } }
    return response?.result || null
  }

  /**
   * 文档符号
   */
  async documentSymbol(serverName: string, uri: string): Promise<LspSymbolInformation[]> {
    const result = await this.sendRequest(serverName, 'textDocument/documentSymbol', {
      textDocument: { uri },
    })

    const response = result as { result?: LspSymbolInformation[] }
    return response?.result || []
  }

  /**
   * 工作区符号
   */
  async workspaceSymbol(serverName: string, query: string): Promise<LspSymbolInformation[]> {
    const result = await this.sendRequest(serverName, 'workspace/symbol', {
      query,
    })

    const response = result as { result?: LspSymbolInformation[] }
    return response?.result || []
  }

  /**
   * 代码高亮
   */
  async documentHighlight(serverName: string, uri: string, line: number, character: number): Promise<Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; kind: number }>> {
    const result = await this.sendRequest(serverName, 'textDocument/documentHighlight', {
      textDocument: { uri },
      position: { line, character },
    })

    const response = result as { result?: Array<unknown> }
    return response?.result || []
  }

  // ─── 状态查询 ───

  getServerState(serverName: string): LspClientState | undefined {
    return this.servers.get(serverName)
  }

  isConnected(serverName: string): boolean {
    return this.servers.get(serverName)?.connected || false
  }

  getConnectedServers(): string[] {
    return Array.from(this.servers.entries())
      .filter(([, state]) => state.connected)
      .map(([name]) => name)
  }

  /**
   * 根据文件路径查找匹配的 LSP 服务器
   */
  findServerForFile(filePath: string): string | undefined {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const langId = EXTENSION_TO_LANGUAGE[ext]
    if (!langId) return undefined

    const config = DEFAULT_LSP_SERVERS.find(s => s.languageId === langId)
    return config?.name
  }

  /**
   * 设置诊断回调
   */
  onDiagnostic(callback: (uri: string, diagnostics: LspDiagnostic[]) => void): void {
    this.onDiagnosticCallback = callback
  }

  /**
   * 设置日志回调
   */
  onLogMessage(callback: (type: number, message: string) => void): void {
    this.onLogMessageCallback = callback
  }

  // ─── 内部方法 ───

  /**
   * 解析命令路径
   */
  private resolveCommand(command: string): string | null {
    // 优先使用 npx 查找全局安装的命令
    try {
      const { execSync } = require('node:child_process')
      const result = execSync(`where "${command}" 2>nul || which "${command}" 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      if (result && fs.existsSync(result)) return result
    } catch {
      // 尝试直接查找
      const localPath = path.join(this.projectRoot, 'node_modules', '.bin', command)
      if (fs.existsSync(localPath)) return localPath

      // 尝试全局 node_modules
      const globalPath = path.join(process.execPath, '..', 'lib', 'node_modules', command, 'bin', command)
      if (fs.existsSync(globalPath)) return globalPath
    }
    return null
  }

  /**
   * 处理 stdout 数据（LSP Content-Length 帧）
   */
  private handleStdout(serverName: string, data: Buffer): void {
    const buffer = this.messageBuffers.get(serverName) || Buffer.alloc(0)
    this.messageBuffers.set(serverName, Buffer.concat([buffer, data]))

    this.parseMessages(serverName)
  }

  /**
   * 解析 LSP 消息帧
   */
  private parseMessages(serverName: string): void {
    const buffer = this.messageBuffers.get(serverName)
    if (!buffer) return

    while (true) {
      // 查找 Content-Length 头
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const headerStr = buffer.slice(0, headerEnd).toString('utf-8')
      const contentLengthMatch = headerStr.match(/Content-Length:\s*(\d+)/i)
      if (!contentLengthMatch) break

      const contentLength = parseInt(contentLengthMatch[1], 10)
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + contentLength

      if (buffer.length < messageEnd) break

      // 解析 JSON 消息
      const messageStr = buffer.slice(messageStart, messageEnd).toString('utf-8')
      try {
        const message = JSON.parse(messageStr)
        this.dispatchMessage(serverName, message)
      } catch {
        console.log(`[LSP:${serverName}] 无法解析消息:`, messageStr.slice(0, 100))
      }

      // 移除已处理的消息
      this.messageBuffers.set(serverName, buffer.slice(messageEnd))
    }
  }

  /**
   * 分发 LSP 消息
   */
  private dispatchMessage(serverName: string, message: Record<string, unknown>): void {
    // 响应（有 id 字段）
    if ('id' in message && message.id !== undefined && message.id !== null) {
      const id = message.id as number
      const pending = this.pendingRequests.get(id)
      if (pending) {
        if ('result' in message) {
          pending.resolve(message.result)
        } else if ('error' in message) {
          pending.reject(new Error(`LSP error: ${JSON.stringify(message.error)}`))
        }
        this.pendingRequests.delete(id)
      }
      return
    }

    // 通知（无 id 字段，有 method）
    if ('method' in message) {
      const method = message.method as string
      const params = message.params

      switch (method) {
        case 'textDocument/publishDiagnostics': {
          const diagParams = params as { uri: string; diagnostics: LspDiagnostic[] }
          if (this.onDiagnosticCallback) {
            this.onDiagnosticCallback(diagParams.uri, diagParams.diagnostics)
          }
          break
        }
        case 'window/logMessage': {
          const logParams = params as { type: number; message: string }
          if (this.onLogMessageCallback) {
            this.onLogMessageCallback(logParams.type, logParams.message)
          }
          break
        }
        case '$/progress': {
          // 进度通知，可忽略
          break
        }
      }

      // 调用自定义通知处理器
      const handlers = this.notificationHandlers.get(method)
      if (handlers) {
        handlers.forEach(handler => handler(params))
      }
    }
  }

  /**
   * 发送原始消息到 LSP 服务器
   */
  private sendMessage(serverName: string, payload: Record<string, unknown>): void {
    const proc = this.processes.get(serverName)
    if (!proc || !proc.stdin) {
      console.log(`[LSP:${serverName}] 发送失败: 进程不存在`)
      return
    }

    const json = JSON.stringify(payload)
    const message = `Content-Length: ${Buffer.byteLength(json)}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${json}`

    try {
      proc.stdin.write(message, 'utf-8')
      const state = this.servers.get(serverName)
      if (state) {
        state.lastActivity = Date.now()
      }
    } catch (err) {
      console.log(`[LSP:${serverName}] 写入失败:`, err instanceof Error ? err.message : err)
    }
  }

  /**
   * 清理服务器状态
   */
  private cleanupServer(serverName: string): void {
    // 拒绝所有待处理的请求
    for (const [id, pending] of this.pendingRequests) {
      if (pending) {
        pending.reject(new Error(`LSP 服务器已关闭: ${serverName}`))
      }
    }
    this.pendingRequests.clear()

    // 清理状态
    this.servers.delete(serverName)
    this.processes.delete(serverName)
    this.messageBuffers.delete(serverName)
    this.notificationHandlers.delete(serverName)
  }

  /**
   * 项目根目录键（内部使用）
   */
  private get projectKey(): string {
    return this.projectRoot
  }
}

// ─── 单例管理 ───

let instance: LspClientManager | null = null

export function getLspClientManager(projectRoot: string): LspClientManager {
  if (!instance || instance.projectKey !== projectRoot) {
    instance = new LspClientManager(projectRoot)
  }
  return instance
}
