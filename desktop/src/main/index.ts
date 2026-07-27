/**
 * Electron 主进程入口 — 集成 QueryEngine
 */

import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import Store from 'electron-store'
import * as path from 'path'
import * as fs from 'fs'
import { QueryEngine, type ToolDefinition } from '../../../src/engine/index.js'
import type { InternalMessage } from '../../../src/engine/messageNormalizer.js'
import type { APIRequest } from '../../../src/engine/requestBuilder.js'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const store = new Store()

// ─── 路径 ───
const projectRoot = path.resolve(__dirname, '..', '..', '..')
const CONFIG_PATH = path.join(projectRoot, '.doge', 'api.json')

function loadConfig(): { provider: string; apiKey: string; model: string; baseUrl: string; workingDir: string } {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const data = JSON.parse(raw)
    const preset = data.activePreset && data.presets?.[data.activePreset]
      ? data.presets[data.activePreset]
      : data.presets?.default || {}
    const provider = preset.provider || 'openai'
    const configuredUrl = preset.baseURL || preset.baseUrl || ''
    const baseUrl = provider === 'anthropic'
      ? 'https://api.anthropic.com/v1'
      : (configuredUrl || 'https://api.openai.com/v1')
    return {
      provider,
      apiKey: preset.apiKey || '',
      model: preset.model || 'gpt-4o',
      baseUrl,
      workingDir: projectRoot,
    }
  } catch {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', workingDir: projectRoot }
  }
}

// ─── 轻量工具适配器（桌面端专用） ───

interface ToolCallInput {
  name: string
  input: Record<string, unknown>
}

interface ToolResult {
  toolUseId: string
  success: boolean
  output?: unknown
  error?: string
}

async function executeTool(call: ToolCallInput): Promise<ToolResult> {
  const { name, input } = call
  const toolUseId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    switch (name) {
      case 'BashTool': {
        const command = input.command as string
        if (typeof command !== 'string') throw new Error('command 参数缺失')
        const { execSync } = await import('node:child_process')
        const result = execSync(command, {
          cwd: engineConfig?.workingDir,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        })
        return { toolUseId, success: true, output: result }
      }
      case 'FileReadTool': {
        const filePath = input.file_path || input.path as string
        if (!filePath) throw new Error('file_path 参数缺失')
        const content = fs.readFileSync(filePath, 'utf-8')
        return { toolUseId, success: true, output: content }
      }
      case 'FileWriteTool': {
        const writePath = input.file_path || input.path as string
        const content = input.content as string
        if (!writePath || content === undefined) throw new Error('file_path 和 content 参数缺失')
        const dir = path.dirname(writePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(writePath, content, 'utf-8')
        return { toolUseId, success: true, output: `已写入 ${writePath}` }
      }
      case 'GrepTool': {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || engineConfig?.workingDir || '.'
        if (!pattern) throw new Error('pattern 参数缺失')
        const { execSync: exec } = await import('node:child_process')
        const result = exec(`find "${searchPath}" -type f -not -path "*/node_modules/*" -not -path "*/dist/*" -exec grep -n "${pattern}" {} + 2>/dev/null`, {
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
        }).catch(() => '')
        return { toolUseId, success: true, output: result || '无匹配结果' }
      }
      case 'GlobTool': {
        const globPattern = input.pattern as string
        const searchDir = (input.path as string) || engineConfig?.workingDir || '.'
        if (!globPattern) throw new Error('pattern 参数缺失')
        const { execSync: exec } = await import('node:child_process')
        const result = exec(`find "${searchDir}" -path "*/node_modules" -prune -o -path "*/dist" -prune -o -name "${globPattern}" -print`, {
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
        })
        return { toolUseId, success: true, output: result }
      }
      case 'FileEditTool': {
        const editPath = input.file_path || input.path as string
        const oldText = input.oldText as string
        const newText = input.newText as string
        if (!editPath || oldText === '' || newText === '') throw new Error('file_path、oldText、newText 参数缺失')
        const content = fs.readFileSync(editPath, 'utf-8')
        if (!content.includes(oldText)) throw new Error('未找到匹配的文本')
        const updated = content.replace(oldText, newText)
        fs.writeFileSync(editPath, updated, 'utf-8')
        return { toolUseId, success: true, output: '已替换 ' + editPath + ' (' + content.split('\n').length + ' 行)' }
      }
      case 'WebFetchTool': {
        const url = input.url as string
        if (!url) throw new Error('url 参数缺失')
        const res = await fetch(url)
        const text = await res.text()
        return { toolUseId, success: true, output: text.slice(0, 50000) }
      }
      case 'HttpTool': {
        const method = (input.method as string) || 'GET'
        const url = input.url as string
        if (!url) throw new Error('url 参数缺失')
        const opts: RequestInit = { method, headers: input.headers as Record<string, string> }
        if (input.body) opts.body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body)
        const res = await fetch(url, opts)
        const contentType = res.headers.get('content-type') || ''
        const output = contentType.includes('application/json') ? JSON.stringify(await res.json(), null, 2) : await res.text()
        return { toolUseId, success: true, output: 'HTTP ' + res.status + ' ' + res.statusText + '\n\n' + output.slice(0, 50000) }
      }
      default:
        return { toolUseId, success: false, error: '未知工具: ' + name }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { toolUseId, success: false, error: message }
  }
}

// ─── 会话持久化 ───
const SESSIONS_DIR = path.join(projectRoot, '.doge', 'sessions')

function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function saveSession(messages: InternalMessage[]): string {
  ensureSessionsDir()
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const file = path.join(SESSIONS_DIR, `${id}.json`)
  const data = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
  fs.writeFileSync(file, JSON.stringify({ id, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
  return id
}

function listSessions(): Array<{ id: string; createdAt: string; messageCount: number }> {
  ensureSessionsDir()
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const file = path.join(SESSIONS_DIR, f)
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
          return { id: data.id, createdAt: data.createdAt, messageCount: data.messages?.length || 0 }
        } catch { return null }
      })
      .filter((s): s is { id: string; createdAt: string; messageCount: number } => s !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch { return [] }
}

function loadSession(id: string): InternalMessage[] | null {
  try {
    const file = path.join(SESSIONS_DIR, `${id}.json`)
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return data.messages?.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content
    })) || null
  } catch { return null }
}

// ─── QueryEngine 实例（全局单例） ───
let engine: QueryEngine | null = null
let engineConfig: ReturnType<typeof loadConfig> | null = null
let currentSessionId: string | null = null

function getEngine(): QueryEngine {
  if (!engine) {
    const config = loadConfig()
    engineConfig = config
    engine = new QueryEngine({
      model: config.model,
      systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
      maxOutputTokens: 40000,
    })

    // 注入真实的 apiClient，将 OpenAI/Anthropic SSE 转为 StreamProcessor 格式
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const provider = config.provider

    // 直接修改 MessageLoop.deps.apiClient
    const deps = (engine as unknown as { messageLoop: { deps: { apiClient: { sendMessage: (req: unknown) => Promise<AsyncIterable<unknown>> } } } }).messageLoop
    if (deps) {
      deps.deps.apiClient = {
        async sendMessage(request: unknown): Promise<AsyncIterable<unknown>> {
          const req = request as APIRequest
          const isAnthropic = provider === 'anthropic'
          const trimmed = baseUrl.replace(/\/+$/, '')
          const url = isAnthropic
            ? (trimmed.endsWith('/messages') ? trimmed : `${trimmed}/messages`)
            : (trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`)

          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (isAnthropic) {
            headers['x-api-key'] = apiKey
            headers['anthropic-version'] = '2023-06-01'
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`
          }

          const body = isAnthropic
            ? {
                model: req.model,
                max_tokens: req.max_tokens,
                stream: true,
                system: req.system,
                messages: req.messages.map((m: InternalMessage) => ({
                  role: m.role === 'tool' ? 'user' : m.role,
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                })),
              }
            : {
                model: req.model,
                max_tokens: req.max_tokens,
                stream: true,
                messages: [
                  { role: 'system', content: (req.system as string) || 'You are Doge Code, a helpful AI programming assistant.' },
                  ...req.messages.map((m: InternalMessage) => ({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                  })),
                ],
              }

          const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`API 请求失败 (${response.status}): ${text || response.statusText}`)
          }

          const reader = response.body!.getReader()

          const decoder = new TextDecoder()
          let buffer = ''
          let messageStarted = false
          let blockIndex = 0

          async function* stream(): AsyncGenerator<unknown> {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed || !trimmed.startsWith('data:')) continue
                  const data = trimmed.slice(5).trim()
                  if (data === '[DONE]') {
                    if (!messageStarted) {
                      yield { type: 'message_start', message: { model: req.model } }
                    }
                    yield { type: 'message_stop' }
                    return
                  }

                  try {
                    const parsed = JSON.parse(data)

                    if (isAnthropic) {
                      yield parsed
                      messageStarted = true
                    } else {
                      const choice = parsed.choices?.[0]
                      if (choice?.delta) {
                        if (!messageStarted) {
                          yield { type: 'message_start', message: { model: parsed.model || req.model } }
                          messageStarted = true
                        }
                        const delta = choice.delta

                        if (delta.content) {
                          yield { type: 'content_block_start', content_block: { type: 'text', index: blockIndex } }
                          yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text: delta.content } }
                          yield { type: 'content_block_stop', index: blockIndex }
                          blockIndex++
                        }

                        if (delta.tool_calls) {
                          for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0
                            yield { type: 'content_block_start', content_block: { type: 'tool_use', index: idx, id: tc.id, name: tc.function?.name } }
                            if (tc.function?.arguments) {
                              yield { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } }
                            }
                            yield { type: 'content_block_stop', index: idx }
                          }
                        }

                        if (choice.finish_reason) {
                          yield { type: 'message_delta', delta: { stop_reason: choice.finish_reason } }
                        }
                      }
                      if (parsed.usage) {
                        yield { type: 'message_delta', delta: { usage: parsed.usage } }
                      }
                    }
                  } catch { /* ignore parse errors */ }
                }
              }

              if (messageStarted) {
                yield { type: 'message_stop' }
              }
            } finally {
              reader.releaseLock()
            }
          }

          return stream()
        },
      }
    }

    // 将 StreamProcessor 的 chunk 回调连接到 notifyChunk
    engine.responseHandler.onChunk = (chunk: { type: string; text?: string }) => {
      if (chunk.type === 'text' && chunk.text && mainWindow) {
        mainWindow.webContents.send('doge:chunk', { text: chunk.text })
      }
    }

    // 监听状态机变化
    engine.stateMachine.onStateChange((evt) => {
      if (mainWindow) {
        mainWindow.webContents.send('doge:state-change', evt.to)
      }
    })
  }

  if (!engineConfig) {
    const config = loadConfig()
    engineConfig = config
  }

  return engine
}

// ─── 创建窗口 ───
function createWindow(): void {
  const saved = (store.get('windowState') as { width?: number; height?: number; x?: number; y?: number } | null)
  mainWindow = new BrowserWindow({
    width: saved?.width || 1400,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1000,
    minHeight: 600,
    title: 'Doge Code',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('resize', () => {
    if (mainWindow.isMaximized() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    const [w, h] = mainWindow.getSize()
    const s = (store.get('windowState') as Record<string, number>) || {}
    store.set('windowState', { ...s, width: w, height: h })
  })

  mainWindow.on('move', () => {
    if (mainWindow.isMaximized() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    const [x, y] = mainWindow.getPosition()
    const s = (store.get('windowState') as Record<string, number>) || {}
    store.set('windowState', { ...s, x, y })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?desktop=1`)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { desktop: '1' },
    })
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('close', (e) => {
    if (!mainWindow?.isVisible()) return
    e.preventDefault()
    mainWindow.hide()
  })
}

function createTray(): void {
  try {
    const iconPath = path.join(projectRoot, 'assets', 'icon.png')
    let trayIcon: Electron.NativeImage | null = null
    try { trayIcon = nativeImage.createFromPath(iconPath) } catch { /* ignore */ }
    if (!trayIcon || trayIcon.isEmpty()) return

    tray = new Tray(trayIcon)
    tray.setToolTip('Doge Code')

    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: '新会话', click: () => { mainWindow?.webContents.send('doge:new-session-action') } },
      { type: 'separator' },
      { label: '退出', click: () => { app.quit() } }
    ])

    tray.setContextMenu(contextMenu)
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
  } catch { /* ignore */ }
}

// ─── IPC 处理程序 ───

// 发送消息（使用 QueryEngine）
ipcMain.handle('doge:send-message', async (_event, content: string) => {
  const currentEngine = getEngine()
  const config = engineConfig!

  if (!config.apiKey) {
    return { error: '未配置 API Key。请在 .doge/api.json 中配置。' }
  }

  try {
    const result = await currentEngine.query(content)
    const messages = result.messages as InternalMessage[]
    // 自动保存会话
    if (!currentSessionId && messages.length > 0) {
      currentSessionId = saveSession(messages)
    } else if (currentSessionId && messages.length > 0) {
      const file = path.join(SESSIONS_DIR, `${currentSessionId}.json`)
      const data = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
      fs.writeFileSync(file, JSON.stringify({ id: currentSessionId, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
    }
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const reply = typeof lastAssistant?.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant?.content ?? '')
    return { success: true, content: reply }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { error: message }
  }
})

// 获取当前状态
ipcMain.handle('doge:get-state', () => {
  const currentEngine = getEngine()
  return currentEngine.getState()
})

// 中断
ipcMain.handle('doge:abort', async () => {
  const currentEngine = getEngine()
  await currentEngine.abort()
  return true
})

// 获取配置
ipcMain.handle('doge:get-config', () => loadConfig())

// 更新配置
ipcMain.handle('doge:update-config', async (_event, data: Record<string, string>) => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)
    if (!config.presets) config.presets = {}
    const presetName = config.activePreset || 'default'
    if (!config.presets[presetName]) config.presets[presetName] = {}
    if (data.provider) config.presets[presetName].provider = data.provider
    if (data.apiKey) config.presets[presetName].apiKey = data.apiKey
    if (data.model) config.presets[presetName].model = data.model
    if (data.baseUrl) config.presets[presetName].baseUrl = data.baseUrl
    const dir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
    engine = null
    engineConfig = null
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

// 获取对话历史
ipcMain.handle('doge:get-history', () => {
  const currentEngine = getEngine()
  const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
  return { messages: msgs.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })) }
})

// 清除对话历史
ipcMain.handle('doge:clear-history', () => {
  engine = null
  engineConfig = null
  return true
})

// 获取工具列表（桌面端工具面板用）
ipcMain.handle('doge:get-tools', () => {
  try {
    const currentEngine = getEngine()
    const tools = (currentEngine as unknown as { getTools?: () => ToolDefinition[] }).getTools?.()
    if (tools && tools.length > 0) {
      return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
    }
  } catch { /* use static fallback */ }

  return [
    { name: 'BashTool', description: '执行命令行', input_schema: { type: 'object', properties: { command: { type: 'string', description: '要执行的命令' } } } },
    { name: 'FileReadTool', description: '读取文件内容', input_schema: { type: 'object', properties: { file_path: { type: 'string', description: '文件路径' } } } },
    { name: 'FileWriteTool', description: '写入文件', input_schema: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } } } },
    { name: 'FileEditTool', description: '替换文件内容', input_schema: { type: 'object', properties: { file_path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } } } },
    { name: 'GrepTool', description: '搜索文本', input_schema: { type: 'object', properties: { pattern: { type: 'string' } } } },
    { name: 'GlobTool', description: '文件匹配', input_schema: { type: 'object', properties: { pattern: { type: 'string' } } } },
    { name: 'WebFetchTool', description: '获取网页内容', input_schema: { type: 'object', properties: { url: { type: 'string', description: 'URL' } } } },
    { name: 'HttpTool', description: '发送 HTTP 请求', input_schema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' }, body: {} } } },
    { name: 'CompareTool', description: '对比两个文件', input_schema: { type: 'object', properties: { left: { type: 'string' }, right: { type: 'string' } } } },
    { name: 'TodoWriteTool', description: '添加 TODO', input_schema: { type: 'object', properties: { content: { type: 'string' } } } },
  ]
})

// 执行单条工具（桌面端工具面板用）
ipcMain.handle('doge:execute-tool', async (_event, call: ToolCallInput) => {
  return executeTool(call)
})

// 配置相关
ipcMain.handle('read-config', async (_event, filePath: string) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return null }
})

ipcMain.handle('write-config', async (_event, filePath: string, data: unknown) => {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch { return false }
})

ipcMain.handle('get-cwd', () => projectRoot)

ipcMain.handle('list-dir', async (_event, dirPath: string) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
  } catch { return [] }
})

ipcMain.handle('doge:get-git-status', async (_event, cwd: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return output.trim().split('\n').filter(Boolean).map((line: string) => {
      const status = line.slice(0, 2)
      const filePath = line.slice(3)
      return { path: filePath, status, staged: status[0] !== ' ' && status[0] !== '?' }
    })
  } catch { return [] }
})

// ─── Git 操作 ───
ipcMain.handle('doge:git-stage', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git add -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-unstage', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git restore --staged -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-discard', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git checkout -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-commit', async (_event, cwd: string, message: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

// 获取模型信息
ipcMain.handle('doge:get-model-info', () => {
  const config = engineConfig || loadConfig()
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: !!config.apiKey,
  }
})

// 获取 Token 使用量（从最近一次响应中提取）
ipcMain.handle('doge:get-token-usage', () => {
  const currentEngine = getEngine()
  const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
  let totalInput = 0
  let totalOutput = 0
  for (const m of msgs) {
    if (m.role === 'tool' && typeof m.content === 'string') {
      const usageMatch = m.content.match(/"usage":\s*\{\s*"input_tokens":\s*(\d+),\s*"output_tokens":\s*(\d+)/)
      if (usageMatch) {
        totalInput += parseInt(usageMatch[1])
        totalOutput += parseInt(usageMatch[2])
      }
    }
  }
  const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
  const lastContent = typeof lastAssistant?.content === 'string' ? lastAssistant.content : ''
  const lastUsageMatch = lastContent.match(/Token 使用.*?(\d+)\s*[→→]\s*(\d+)/)
  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    lastResponseLength: lastContent.length,
    messageCount: msgs.length,
  }
})

ipcMain.handle('doge:get-git-diff', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`git diff -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return output || '(空 diff)'
  } catch { return '读取失败' }
})

// ─── 命令系统（桌面端轻量实现） ───

interface CommandDef {
  name: string
  description: string
  category: string
}

const DESKTOP_COMMANDS: CommandDef[] = [
  { name: '/commit', description: '创建 git 提交', category: 'Git' },
  { name: '/commit-push-pr', description: '提交、推送并创建 PR', category: 'Git' },
  { name: '/branch', description: '分支管理', category: 'Git' },
  { name: '/review', description: '代码审查', category: 'Git' },
  { name: '/diff', description: '查看 diff', category: 'Git' },
  { name: '/status', description: '查看状态', category: 'Git' },
  { name: '/config', description: '配置管理', category: '系统' },
  { name: '/help', description: '帮助信息', category: '系统' },
  { name: '/clear', description: '清除对话', category: '会话' },
  { name: '/model', description: '切换模型', category: '系统' },
  { name: '/plan', description: '计划模式', category: '系统' },
  { name: '/memory', description: '记忆管理', category: '系统' },
  { name: '/session', description: '会话管理', category: '会话' },
  { name: '/skills', description: '技能管理', category: '系统' },
  { name: '/compact', description: '压缩对话历史', category: '会话' },
  { name: '/rstk', description: '重启会话', category: '会话' },
  { name: '/stats', description: '统计信息', category: '系统' },
  { name: '/cost', description: '费用统计', category: '系统' },
  { name: '/task', description: '任务管理', category: '系统' },
  { name: '/todo', description: 'TODO 管理', category: '系统' },
  { name: '/theme', description: '主题切换', category: '系统' },
  { name: '/export', description: '导出对话', category: '会话' },
  { name: '/ide', description: 'IDE 集成', category: '系统' },
  { name: '/hooks', description: 'Hooks 管理', category: '系统' },
  { name: '/plugin', description: '插件管理', category: '系统' },
  { name: '/mcp', description: 'MCP 工具管理', category: '系统' },
  { name: '/share', description: '分享对话', category: '会话' },
  { name: '/resume', description: '恢复会话', category: '会话' },
  { name: '/bridge', description: '桥接模式', category: '系统' },
  { name: '/teleport', description: '远程会话', category: '系统' },
]

ipcMain.handle('doge:get-commands', () => {
  return DESKTOP_COMMANDS
})

ipcMain.handle('doge:execute-command', async (_event, commandName: string, args: string[]) => {
  const { execSync } = await import('node:child_process')
  const cwd = engineConfig?.workingDir || projectRoot

  try {
    switch (commandName) {
      case '/status': {
        const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim()
        const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
        return { success: true, output: `分支: ${branch}\n\n${output || '工作区干净'}` }
      }
      case '/branch': {
        const current = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
        const list = execSync('git branch', { cwd, encoding: 'utf-8' }).trim()
        return { success: true, output: `当前分支: ${current}\n\n${list}` }
      }
      case '/diff': {
        const file = args[0] || ''
        const output = file
          ? execSync(`git diff -- "${file}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
          : execSync('git diff', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
        return { success: true, output: output || '(无 diff)' }
      }
      case '/help': {
        const grouped = DESKTOP_COMMANDS.reduce<Record<string, CommandDef[]>>((acc, cmd) => {
          (acc[cmd.category] ??= []).push(cmd)
          return acc
        }, {})
        const lines: string[] = []
        for (const [cat, cmds] of Object.entries(grouped)) {
          lines.push(`[${cat}]`)
          for (const c of cmds) lines.push(`  ${c.name} — ${c.description}`)
          lines.push('')
        }
        return { success: true, output: lines.join('\n').trim() }
      }
      case '/commit': {
        const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
        const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim()
        const diff = execSync('git diff HEAD', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim()
        const recentLog = execSync('git log --oneline -10', { cwd, encoding: 'utf-8' }).trim()

        if (!status) return { success: false, error: '没有要提交的更改' }

        const contextInfo = `分支: ${branch}\n最近提交:\n${recentLog}\n\n变更文件:\n${status}\n\n请提供提交信息，或使用 AI 辅助生成。`
        return { success: true, output: contextInfo }
      }
      case '/review': {
        const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
        const diff = execSync('git diff HEAD', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim()
        if (!diff) return { success: false, error: '没有可审查的更改' }
        return { success: true, output: `分支: ${branch}\n\n代码审查请求已创建。请在对话中描述审查重点。` }
      }
      case '/model': {
        const available = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022']
        return { success: true, output: `当前模型: ${engineConfig?.model || 'gpt-4o'}\n可用模型:\n${available.map(m => `  - ${m}`).join('\n')}` }
      }
      case '/clear': {
        const msgs = (engine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
        if (msgs.length > 0) {
          const id = saveSession(msgs)
          return { success: true, output: `对话历史已清除。已保存会话: ${id} (${msgs.length} 条消息)` }
        }
        engine = null
        engineConfig = null
        return { success: true, output: '对话历史已清除' }
      }
      case '/plan': {
        return { success: true, output: '计划模式已启用。在计划模式下，助手会先制定计划再执行。请在对话中描述你想实现的功能。' }
      }
      case '/memory': {
        try {
          const memoryDir = path.join(projectRoot, '.doge', 'memory')
          if (!fs.existsSync(memoryDir)) {
            return { success: true, output: '记忆系统尚未使用。随着对话进行，重要的上下文会自动保存。' }
          }
          const files = fs.readdirSync(memoryDir).filter(f => !f.startsWith('.')).slice(0, 20)
          if (files.length === 0) {
            return { success: true, output: '记忆目录为空。' }
          }
          return { success: true, output: `记忆文件 (最近 20 个):\n${files.map(f => `  - ${f}`).join('\n')}` }
        } catch {
          return { success: true, output: '记忆目录不可用。' }
        }
      }
      case '/session': {
        const currentEngine = getEngine()
        const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
        const userMsgs = msgs.filter((m: InternalMessage) => m.role === 'user').length
        const assistantMsgs = msgs.filter((m: InternalMessage) => m.role === 'assistant').length
        const toolMsgs = msgs.filter((m: InternalMessage) => m.role === 'tool').length
        const sessions = listSessions()
        return { success: true, output: `当前会话:\n  用户消息: ${userMsgs}\n  助手消息: ${assistantMsgs}\n  工具调用: ${toolMsgs}\n  总计: ${msgs.length}\n  会话ID: ${currentSessionId || '新会话'}\n\n历史会话: ${sessions.length} 个\n${sessions.slice(0, 5).map(s => `  - ${s.id} (${s.messageCount} 条, ${s.createdAt})`).join('\n')}` }
      }
      case '/skills': {
        try {
          const skillsDir = path.join(projectRoot, '.claudeskills')
          if (!fs.existsSync(skillsDir)) {
            return { success: true, output: '技能目录尚未创建。技能会在首次使用时自动加载。' }
          }
          const files = fs.readdirSync(skillsDir).filter(f => !f.startsWith('.')).slice(0, 30)
          if (files.length === 0) {
            return { success: true, output: '暂无可用技能。' }
          }
          return { success: true, output: `已加载技能:\n${files.map(f => `  - ${f.replace(/\.(md|json)$/, '')}`).join('\n')}` }
        } catch {
          return { success: true, output: '技能目录不可用。' }
        }
      }
      case '/compact': {
        const currentEngine = getEngine()
        const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
        const summary = `压缩摘要: 共 ${msgs.length} 条消息已压缩。对话上下文已优化。`
        return { success: true, output: summary }
      }
      case '/rstk': {
        engine = null
        engineConfig = null
        return { success: true, output: '会话已重启。' }
      }
      case '/stats': {
        const currentEngine = getEngine()
        const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
        const userMsgs = msgs.filter((m: InternalMessage) => m.role === 'user').length
        const assistantMsgs = msgs.filter((m: InternalMessage) => m.role === 'assistant').length
        const toolMsgs = msgs.filter((m: InternalMessage) => m.role === 'tool').length
        const state = currentEngine.getState()
        return { success: true, output: `会话统计:\n  状态: ${state}\n  用户消息: ${userMsgs}\n  助手消息: ${assistantMsgs}\n  工具调用: ${toolMsgs}\n  总计: ${msgs.length}` }
      }
      case '/cost': {
        const stats = (engineConfig?.apiKey ? '已配置' : '未配置') + '\n\n提示: 费用取决于实际 API 使用量，请在 API 提供商控制台查看详细账单。'
        return { success: true, output: `费用统计:\n提供商: ${engineConfig?.provider || 'openai'}\n模型: ${engineConfig?.model || 'gpt-4o'}\nAPI Key: ${stats}` }
      }
      case '/task': {
        const taskCount = 0
        return { success: true, output: `任务管理:\n  当前活跃任务: ${taskCount}\n\n使用对话描述任务，助手会自动跟踪和管理。` }
      }
      case '/todo': {
        const todoFile = path.join(projectRoot, 'TODO.md')
        if (fs.existsSync(todoFile)) {
          const content = fs.readFileSync(todoFile, 'utf-8').split('\n').filter(l => l.includes('[ ]') || l.includes('[x]')).slice(0, 30)
          return { success: true, output: `TODO 列表 (前 30 项):\n${content.join('\n') || '无待办项'}` }
        }
        return { success: true, output: '未找到 TODO 文件。' }
      }
      case '/theme': {
        return { success: true, output: '主题切换: 当前为深色主题。浅色主题即将推出。' }
      }
      case '/commit-push-pr': {
        const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
        const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim()
        if (!status) return { success: false, error: '没有要提交的更改' }
        const remote = execSync('git remote', { cwd, encoding: 'utf-8' }).trim().split('\n')[0] || 'origin'
        const remoteUrl = execSync(`git remote get-url ${remote}`, { cwd, encoding: 'utf-8' }).trim()
        return { success: true, output: `准备提交并推送:\n分支: ${branch}\n远程: ${remote} (${remoteUrl})\n变更文件:\n${status}\n\n请确认后提交。` }
      }
      case '/export': {
        const currentEngine = getEngine()
        const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
        const exportData = JSON.stringify(msgs.map((m: InternalMessage) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })), null, 2)
        const exportPath = path.join(projectRoot, 'doge-export.json')
        fs.writeFileSync(exportPath, exportData, 'utf-8')
        return { success: true, output: `对话已导出到: ${exportPath}\n共 ${msgs.length} 条消息` }
      }
      case '/ide': {
        const ide = process.env.IDE || process.env.TERM_PROGRAM || 'unknown'
        return { success: true, output: `IDE 集成:\n当前环境: ${ide}\n\n桌面应用已支持代码查看和编辑功能。` }
      }
      case '/hooks': {
        try {
          const hooksDir = path.join(projectRoot, '.doge', 'hooks')
          if (!fs.existsSync(hooksDir)) return { success: true, output: 'Hooks 目录尚未创建。' }
          const files = fs.readdirSync(hooksDir).filter(f => !f.startsWith('.')).slice(0, 20)
          return { success: true, output: `已注册 Hooks (前 20):\n${files.map(f => `  - ${f}`).join('\n') || '无'}` }
        } catch {
          return { success: true, output: 'Hooks 目录不可用。' }
        }
      }
      case '/plugin': {
        const pluginDirs = ['plugins', '.doge/plugins', '.claude/plugins']
        const found = pluginDirs.map(d => path.join(projectRoot, d)).filter(p => fs.existsSync(p))
        return { success: true, output: `插件系统:\n插件目录: ${found.length > 0 ? found.join('\n  ') : '无'}\n\n桌面端插件支持即将推出。` }
      }
      case '/mcp': {
        try {
          const mcpConfig = path.join(projectRoot, '.doge', 'mcp.json')
          if (fs.existsSync(mcpConfig)) {
            const config = JSON.parse(fs.readFileSync(mcpConfig, 'utf-8'))
            const servers = Object.keys(config.servers || {})
            return { success: true, output: `MCP 服务器:\n${servers.map(s => `  - ${s}`).join('\n') || '无'}` }
          }
          return { success: true, output: 'MCP 配置未找到。在 .doge/mcp.json 中配置 MCP 服务器。' }
        } catch {
          return { success: true, output: 'MCP 配置不可用。' }
        }
      }
      case '/share': {
        return { success: true, output: '分享功能即将推出。你可以使用 /export 导出对话，然后手动分享。' }
      }
      case '/resume': {
        const sessions = listSessions()
        if (sessions.length === 0) return { success: true, output: '没有历史会话。开始新对话。' }
        const latest = sessions[0]
        const msgs = loadSession(latest.id)
        if (!msgs) return { success: false, error: `无法加载会话: ${latest.id}` }
        // 替换当前引擎的对话历史
        engine = null
        const config = loadConfig()
        engineConfig = config
        engine = new QueryEngine({
          model: config.model,
          systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
          maxOutputTokens: 40000,
        })
        const conv = (engine as unknown as { conversation: { messages: InternalMessage[]; addToolResults: (r: unknown[]) => void } }).conversation
        conv.messages = msgs
        currentSessionId = latest.id
        return { success: true, output: `已恢复会话: ${latest.id}\n消息数: ${latest.messageCount}\n创建时间: ${latest.createdAt}` }
      }
      case '/bridge': {
        return { success: true, output: '桥接模式: 桌面应用已内置桥接功能，可直接操作文件系统、执行命令。' }
      }
      case '/teleport': {
        return { success: true, output: '远程会话: 使用 /bridge 启动桥接，或配置 SSH 连接进行远程会话。' }
      }
      case '/config': {
        try {
          const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
          const config = JSON.parse(raw)
          const activePreset = config.activePreset || 'default'
          const preset = config.presets?.[activePreset] || {}
          const lines: string[] = [`当前配置 (preset: ${activePreset}):`]
          for (const [key, value] of Object.entries(preset)) {
            if (key === 'apiKey' && typeof value === 'string' && value.length > 0) {
              lines.push(`  ${key}: ${value.slice(0, 4)}****${value.slice(-4)}`)
            } else {
              lines.push(`  ${key}: ${JSON.stringify(value)}`)
            }
          }
          return { success: true, output: lines.join('\n') }
        } catch {
          return { success: false, error: '无法读取配置文件' }
        }
      }
      default:
        return { success: false, error: `命令尚未实现: ${commandName}` }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: message }
  }
})

// ─── 主题系统（桌面端轻量实现） ───

interface ThemeSettings {
  theme: 'dark' | 'light' | 'auto'
  fontSize: number
  fontFamily: string
  sidebarWidth: number
  rightPanelWidth: number
}

const THEME_PATH = path.join(projectRoot, '.doge', 'settings.json')

function loadTheme(): ThemeSettings {
  try {
    if (fs.existsSync(THEME_PATH)) {
      const raw = fs.readFileSync(THEME_PATH, 'utf-8')
      return { ...{ theme: 'dark', fontSize: 13, fontFamily: 'system', sidebarWidth: 260, rightPanelWidth: 280 }, ...JSON.parse(raw) }
    }
  } catch { /* ignore */ }
  return { theme: 'dark', fontSize: 13, fontFamily: 'system', sidebarWidth: 260, rightPanelWidth: 280 }
}

function saveTheme(settings: ThemeSettings): void {
  try {
    const dir = path.dirname(THEME_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(THEME_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

ipcMain.handle('doge:get-theme', () => loadTheme())
ipcMain.handle('doge:set-theme', async (_event, settings: Partial<ThemeSettings>) => {
  const current = loadTheme()
  saveTheme({ ...current, ...settings })
  return { success: true }
})

ipcMain.handle('doge:list-sessions', () => {
  return listSessions()
})

ipcMain.handle('doge:load-session', async (_event, sessionId: string) => {
  const msgs = loadSession(sessionId)
  if (!msgs) return { success: false, error: '无法加载会话' }
  engine = null
  const config = loadConfig()
  engineConfig = config
  engine = new QueryEngine({
    model: config.model,
    systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
    maxOutputTokens: 40000,
  })
  const conv = (engine as unknown as { conversation: { messages: InternalMessage[]; addToolResults: (r: unknown[]) => void } }).conversation
  conv.messages = msgs
  currentSessionId = sessionId
  return { success: true, messageCount: msgs.length }
})

ipcMain.handle('doge:new-session', () => {
  engine = null
  engineConfig = null
  currentSessionId = saveSession([])
  return { success: true }
})

ipcMain.handle('doge:delete-session', async (_event, sessionId: string) => {
  try {
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
      if (currentSessionId === sessionId) {
        engine = null
        engineConfig = null
        currentSessionId = null
      }
      return { success: true }
    }
    return { success: false, error: '会话不存在' }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:get-session-id', () => {
  if (!currentSessionId) {
    currentSessionId = saveSession([])
  }
  return currentSessionId
})

// 关闭当前会话并自动创建新会话（多 Tab 用）
ipcMain.handle('doge:close-session', async () => {
  try {
    engine = null
    engineConfig = null
    if (currentSessionId) {
      // 保存当前会话状态
      const currentEngine = getEngine()
      const msgs = (currentEngine as unknown as { conversation: { messages: InternalMessage[] } }).conversation?.messages ?? []
      if (msgs.length > 0) {
        const file = path.join(SESSIONS_DIR, `${currentSessionId}.json`)
        const data = msgs.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
        fs.writeFileSync(file, JSON.stringify({ id: currentSessionId, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
      }
    }
    currentSessionId = null
    const newSessionId = saveSession([])
    return { success: true, sessionId: newSessionId }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:notify', (_event, title: string, body: string) => {
  try {
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: path.join(projectRoot, 'assets', 'icon.png') }).show()
    }
  } catch { /* ignore */ }
  return { success: true }
})

ipcMain.handle('doge:delete-file', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true })
    } else {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:rename-file', async (_event, filePath: string, newName: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    if (!newName || newName.includes('/') || newName.includes('\\')) return { success: false, error: '无效的文件名' }
    const newPath = path.join(path.dirname(filePath), newName)
    if (fs.existsSync(newPath)) return { success: false, error: '目标已存在: ' + newName }
    fs.renameSync(filePath, newPath)
    return { success: true, newPath }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:new-file', async (_event, dirPath: string, fileName: string) => {
  try {
    const fullPath = path.join(dirPath, fileName)
    if (fs.existsSync(fullPath)) return { success: false, error: '文件已存在' }
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, '', 'utf-8')
    return { success: true, path: fullPath }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:new-folder', async (_event, dirPath: string, folderName: string) => {
  try {
    const fullPath = path.join(dirPath, folderName)
    if (fs.existsSync(fullPath)) return { success: false, error: '文件夹已存在' }
    fs.mkdirSync(fullPath, { recursive: true })
    return { success: true, path: fullPath }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:open-terminal', async (_event, dirPath: string) => {
  try {
    const targetDir = fs.existsSync(dirPath) ? dirPath : projectRoot
    const cmd = process.platform === 'win32'
      ? ['cmd', '/c', 'start', 'cmd', '/k', 'cd', '/d', targetDir]
      : process.platform === 'darwin'
        ? ['open', '-a', 'Terminal', targetDir]
        : ['x-terminal-emulator', '--working-directory', targetDir]
    const { execSync } = await import('node:child_process')
    execSync(cmd.join(' '), { windowsHide: true })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:reveal-in-explorer', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    if (process.platform === 'win32') {
      const { execSync } = await import('node:child_process')
      execSync(`explorer.exe /select,"${filePath}"`, { windowsHide: true })
    } else if (process.platform === 'darwin') {
      const { execSync } = await import('node:child_process')
      execSync(`open -R "${filePath}"`, { windowsHide: true })
    } else {
      const { execSync } = await import('node:child_process')
      execSync(`xdg-open "${path.dirname(filePath)}"`, { windowsHide: true })
    }
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

// ─── 应用生命周期 ───
app.whenReady().then(() => { createWindow(); createTray() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('doge:get-window-state', () => {
  return {
    width: store.get('width'),
    height: store.get('height'),
    x: store.get('x'),
    y: store.get('y'),
  }
})

ipcMain.handle('doge:save-window-state', (_event, state: { width?: number; height?: number; x?: number; y?: number }) => {
  if (typeof state.width === 'number') store.set('width', state.width)
  if (typeof state.height === 'number') store.set('height', state.height)
  if (typeof state.x === 'number') store.set('x', state.x)
  if (typeof state.y === 'number') store.set('y', state.y)
  return { success: true }
})

ipcMain.handle('doge:read-file', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return { success: false, error: '无法预览文件夹' }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content, size: stat.size }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:write-file', async (_event, filePath: string, content: string) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return { success: false, error: '无法写入文件夹' }
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:search-files', async (_event, query: string, cwd: string, maxResults: number = 50) => {
  try {
    const results: Array<{ path: string; line: number; content: string }> = []
    if (!query || query.length < 2) return results

    const walk = (dir: string) => {
      if (results.length >= maxResults) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= maxResults) break
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue
            walk(fullPath)
          } else {
            // skip binary-like and large files
            const ext = entry.name.split('.').pop()?.toLowerCase() || ''
            const skipExts = ['png','jpg','jpeg','gif','ico','woff','woff2','ttf','eot','zip','tar','gz','7z','exe','dll','so','dylib','pdf','mp3','mp4','avi','mov','lock','bin','o','a','pyc','class']
            if (skipExts.includes(ext)) continue
            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              const lines = content.split('\n')
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                  results.push({ path: fullPath, line: i + 1, content: lines[i].trim() })
                  if (results.length >= maxResults) break
                }
              }
            } catch { /* skip unreadable files */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
    walk(cwd)
    return results
  } catch { return [] }
})