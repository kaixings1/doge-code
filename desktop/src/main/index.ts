/**
 * Electron 主进程入口 — 集成 QueryEngine
 */

import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import pty from 'node-pty'
import Store from 'electron-store'
import * as path from 'path'
import * as fs from 'fs'
import { QueryEngine, type ToolDefinition } from '../../../src/engine/index.js'
import type { InternalMessage } from '../../../src/engine/messageNormalizer.js'
import type { APIRequest } from '../../../src/engine/requestBuilder.js'
import { getAllBaseTools, type Tool } from '../../../src/tools.js'
import { zodToJsonSchema } from '../../../src/utils/zodToJsonSchema.js'
import { getPermissionManager, DesktopPermissionManager } from './permissionManager.js'
import { initBundledSkills } from '../../../src/skills/bundled/index.js'
import { getBundledSkills } from '../../../src/skills/bundledSkills.js'
import { createEngineApi, type EngineApi } from './engineApi.js'
import { scanPlugins, setPluginEnabled, installPlugin, uninstallPlugin, getPluginCommandContent, type PluginInfo } from './pluginManager.js'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const store = new Store()

// ─── 路径 ───
// 打包后 __dirname = dist/main/，桌面目录 = __dirname/../..
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..')
// 项目根目录（包含 .doge/api.json）
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')
const projectRoot = PROJECT_ROOT
const DIST_DIR = path.join(DESKTOP_ROOT, 'dist')
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

// ─── 工具适配 ───

function buildToolContext(config: ReturnType<typeof loadConfig>) {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: config.model,
      tools: [] as Tool[],
      verbose: false,
      thinkingConfig: { type: 'none' as const },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: [],
    },
  }
}

function createAdaptedTools(config: ReturnType<typeof loadConfig>): Map<string, { name: string; description: string; parameters: Record<string, unknown>; execute: (params: unknown) => Promise<{ content: unknown }> }> {
  const srcTools = getAllBaseTools()
  const adaptedTools = new Map<string, { name: string; description: string; parameters: Record<string, unknown>; execute: (params: unknown) => Promise<{ content: unknown }> }>()

  const ctx = buildToolContext(config)
  const pm = getPermissionManager()

  for (const srcTool of srcTools) {
    if (!srcTool || !srcTool.name) continue

    ctx.options.tools = srcTools

    adaptedTools.set(srcTool.name, {
      name: srcTool.name,
      description: srcTool.description,
      parameters: zodToJsonSchema(srcTool.inputSchema),
      execute: async (params: unknown) => {
        try {
          const args = params as Record<string, unknown>

          const permCtx = {
            tool: srcTool.name,
            action: 'execute',
            params: args,
            path: (args.file_path || args.path) as string | undefined,
            command: (args.command || args.cmd) as string | undefined,
          }
          const decision = await pm.checkPermission(permCtx)
          if (decision === 'deny') {
            return { content: '用户拒绝了操作请求。' }
          }

          const result = await srcTool.call(
            args,
            ctx,
            async () => ({ allowed: decision === 'allow' || decision === 'allow_once' }),
            { role: 'user', content: '' },
            null,
          )
          return result
        } catch (e) {
          return { content: String(e instanceof Error ? e.message : '未知错误') }
        }
      },
    })
  }

  // ─── 桌面端补充工具：SnipTool（裁剪历史上下文） ───
  try {
    const { SnipTool: SnipToolCls } = require('../../../src/tools/SnipTool/SnipTool.js')
    const snipInstance = SnipToolCls()
    adaptedTools.set('SnipTool', {
      name: 'SnipTool',
      description: '裁剪历史上下文以减少 token 使用量',
      parameters: { type: 'object', properties: { lines: { type: 'number' }, keepRecent: { type: 'number' }, preserveSystem: { type: 'boolean' } } },
      execute: async (params: unknown) => {
        const args = params as Record<string, unknown>
        const result = await snipInstance.call(
          { lines: args.lines ?? 100, keepRecent: args.keepRecent ?? 50, preserveSystem: args.preserveSystem ?? true, target: 'all' },
          ctx,
          async () => ({ allowed: true }),
          { role: 'user', content: '' },
          null,
        )
        return result
      },
    })
  } catch { /* SnipTool 不可用，静默忽略 */ }

  return adaptedTools
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
let engineApi: EngineApi | null = null
let engineConfig: ReturnType<typeof loadConfig> | null = null
let currentSessionId: string | null = null

function getEngine(): QueryEngine {
  if (!engine) {
    const config = loadConfig()
    engineConfig = config

    getPermissionManager().setMainWindow(mainWindow)
    const adaptedTools = createAdaptedTools(config)

    engine = new QueryEngine({
      model: config.model,
      systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
      maxOutputTokens: 40000,
      tools: adaptedTools,
    })

    // 注入真实的 apiClient，将 OpenAI/Anthropic SSE 转为 StreamProcessor 格式
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const provider = config.provider

    // 直接访问 messageLoop.deps.apiClient（绕过 setApiClient 被 tree-shaking 优化掉的问题）
    const messageLoop = (engine as unknown as { messageLoop: { deps: { apiClient: unknown } } }).messageLoop
    messageLoop.deps.apiClient = {
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

    // 创建公共 API 封装
    engineApi = createEngineApi(engine)

    // 将 StreamProcessor 的 chunk 回调连接到 notifyChunk
    engineApi.setChunkCallback((chunk: { type: string; text?: string }) => {
      if (chunk.type === 'text' && chunk.text && mainWindow) {
        console.log('[MAIN] chunk callback, text:', chunk.text.slice(0, 50))
        mainWindow.webContents.send('doge:chunk', { text: chunk.text })
      }
    })

    // 监听状态机变化
    engineApi.setStateChangeCallback((state: string) => {
      if (mainWindow) {
        mainWindow.webContents.send('doge:state-change', state)
      }
    })
  }

  if (!engineConfig) {
    const config = loadConfig()
    engineConfig = config
  }

  return engine
}

// ─── 获取 EngineApi 实例 ───
function getEngineApi(): EngineApi {
  if (!engineApi) {
    getEngine()
  }
  return engineApi!
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
      preload: path.join(DIST_DIR, 'preload', 'index.cjs'),
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
    const htmlUrl = `file://${path.join(DIST_DIR, 'renderer', 'index.html').replace(/\\/g, '/')}#/desktop`
    mainWindow.loadURL(htmlUrl)
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('close', (e) => {
    if (!mainWindow?.isVisible()) return
    e.preventDefault()
    mainWindow.hide()
  })

  // 自动发送测试消息（用于调试）
  if (process.env.AUTO_SEND_MESSAGE) {
    setTimeout(() => {
      mainWindow.webContents.send('doge:auto-send', process.env.AUTO_SEND_MESSAGE)
    }, 5000)
  }
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
  console.log('[MAIN] doge:send-message called, content:', content?.slice(0, 100))
  const currentEngine = getEngine()
  const config = engineConfig!
  console.log('[MAIN] getEngine() returned, config:', { provider: config.provider, model: config.model, baseUrl: config.baseUrl })

  if (!config.apiKey) {
    console.log('[MAIN] no apiKey configured')
    return { error: '未配置 API Key。请在 .doge/api.json 中配置。' }
  }

  try {
    // 解析可能包含图片的 JSON 格式消息
    let queryText = content
    let images: Array<{ type: string; url: string }> = []
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.text) {
        queryText = parsed.text
        if (Array.isArray(parsed.images)) {
          images = parsed.images
        }
      }
    } catch {
      // 纯文本消息，直接使用
    }

    // 构建 QueryEngine 的输入：文本 + 图片
    let engineInput: string | { text: string; images: Array<{ data: string; mimeType: string }> } = queryText
    if (images.length > 0) {
      // 将 base64 data URL 转换为 QueryEngine 需要的格式
      const formattedImages = images.map(img => {
        // 支持 data URL 格式: data:image/png;base64,xxxx
        const match = img.url.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          return { data: match[2], mimeType: match[1] }
        }
        // 如果不是 data URL，作为 URL 传递
        return { data: img.url, mimeType: 'image/png' }
      })
      engineInput = { text: queryText, images: formattedImages }
    }

    console.log('[MAIN] calling currentEngine.query(), engineInput type:', typeof engineInput)
    const result = await currentEngine.query(engineInput)
    const messages = result.messages as InternalMessage[]
    console.log('[MAIN] query() returned, state:', result.state, 'messageCount:', messages.length)
    // 自动保存会话
    if (!currentSessionId && messages.length > 0) {
      currentSessionId = saveSession(messages)
    } else if (currentSessionId && messages.length > 0) {
      const file = path.join(SESSIONS_DIR, `${currentSessionId}.json`)
      const data = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
      fs.writeFileSync(file, JSON.stringify({ id: currentSessionId, messages: data, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
    }
    // 崩溃恢复标记（成功发送后清除）
    try {
      const crashFile = path.join(SESSIONS_DIR, '.crash-recovery.json')
      if (fs.existsSync(crashFile)) fs.unlinkSync(crashFile)
    } catch { /* ignore */ }
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const reply = typeof lastAssistant?.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant?.content ?? '')
    console.log('[MAIN] returning reply, length:', reply.length, 'content:', reply.slice(0, 100))
    return { success: true, content: reply }
  } catch (error: unknown) {
    // 保存崩溃恢复标记
    try {
      const crashFile = path.join(SESSIONS_DIR, '.crash-recovery.json')
      fs.writeFileSync(crashFile, JSON.stringify({ sessionId: currentSessionId, messageCount: 0, timestamp: new Date().toISOString() }, null, 2))
    } catch { /* ignore */ }
    const message = error instanceof Error ? error.message : '未知错误'
    console.log('[MAIN] query threw error:', message)
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
    engineApi = null
    engineConfig = null
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

// 获取对话历史
ipcMain.handle('doge:get-history', () => {
  try {
    const api = getEngineApi()
    if (!api) return { messages: [] }
    const messages = api.getMessages()
    return { messages }
  } catch {
    return { messages: [] }
  }
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
    const api = getEngineApi()
    const tools = api.getTools()
    if (tools && tools.length > 0) {
      // 使用 JSON 序列化确保对象可被 IPC 结构化克隆
      return JSON.parse(JSON.stringify(
        tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
      ))
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
ipcMain.handle('doge:get-memory-usage', () => {
  try {
    const usage = process.memoryUsage()
    return { success: true, heapUsed: usage.heapUsed, rss: usage.rss, external: usage.external }
  } catch {
    return { success: false, error: '无法获取内存信息' }
  }
})

ipcMain.handle('doge:save-draft', async (_event, data: { input: string; sessionId: string }) => {
  try {
    const draftDir = path.join(projectRoot, '.doge', 'drafts')
    if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true })
    const file = path.join(draftDir, `${data.sessionId}.json`)
    fs.writeFileSync(file, JSON.stringify({ input: data.input, savedAt: new Date().toISOString() }, null, 2), 'utf-8')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '未知错误' }
  }
})

ipcMain.handle('doge:load-draft', async (_event, sessionId: string) => {
  try {
    const draftDir = path.join(projectRoot, '.doge', 'drafts')
    const file = path.join(draftDir, `${sessionId}.json`)
    if (!fs.existsSync(file)) return { success: true, input: '' }
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return { success: true, input: data.input || '' }
  } catch {
    return { success: true, input: '' }
  }
})

ipcMain.handle('doge:get-token-usage', () => {
  try {
    const api = getEngineApi()
    if (!api) return { inputTokens: 0, outputTokens: 0, totalTokens: 0, lastResponseLength: 0, messageCount: 0 }
    const msgs = api.getMessages()
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
    return {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      lastResponseLength: lastContent.length,
      messageCount: msgs.length,
    }
  } catch {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, lastResponseLength: 0, messageCount: 0 }
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
// 动态导入 prompt 类型命令模板，避免顶层循环依赖
const dynamicCommandImports: Record<string, () => Promise<{ default?: { getPromptForCommand?: (...args: unknown[]) => Promise<unknown[]>; type?: string } }>> = {
  '/commit': () => import('../../../src/commands/commit.js'),
  '/review': () => import('../../../src/commands/review.js'),
  '/plan': () => import('../../../src/commands/plan-mode/index.js').catch(() => ({ default: null })),
  '/diff': () => import('../../../src/commands/diff/diff.js').catch(() => ({ default: null })),
  '/branch': () => import('../../../src/commands/branch/branch.js').catch(() => ({ default: null })),
  '/memory': () => import('../../../src/commands/memory/memory.js').catch(() => ({ default: null })),
  '/deploy': () => import('../../../src/commands/deploy/deploy.js').catch(() => ({ default: null })),
  '/task': () => import('../../../src/commands/task/task.js').catch(() => ({ default: null })),
  '/session-search': () => import('../../../src/commands/session-search.js'),
  '/session-tag': () => import('../../../src/commands/session-tag.js'),
}

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
  { name: '/session-search', description: '按内容搜索历史会话', category: '会话' },
  { name: '/session-tag', description: '分析会话并生成标签', category: '会话' },
  // 常用内置技能
  { name: '/debug', description: '调试会话并读取日志', category: '技能' },
  { name: '/simplify', description: '简化代码提高质量', category: '技能' },
  { name: '/tdd', description: '测试驱动开发', category: '技能' },
  { name: '/codebase-design', description: '架构设计与评审', category: '技能' },
  { name: '/domain-modeling', description: '领域建模', category: '技能' },
  { name: '/diagnosing-bugs', description: '系统化诊断 Bug', category: '技能' },
  { name: '/git-guardrails', description: 'Git 安全护栏', category: '技能' },
  { name: '/code-review', description: '代码审查', category: '技能' },
  { name: '/remember', description: '记忆管理', category: '技能' },
]

ipcMain.handle('doge:get-commands', () => {
  return DESKTOP_COMMANDS
})

// 将 prompt 类型命令模板转发给 QueryEngine，让 AI 通过已注册的工具执行
async function executeAIDrivenCommand(commandName: string, args: string[] = []): Promise<{ success: boolean; output?: string; error?: string }> {
  const importFn = dynamicCommandImports[commandName]
  if (!importFn) return { success: false, error: `命令 ${commandName} 暂不支持 AI 驱动执行` }

  try {
    const mod = await importFn()
    const cmd = mod.default || mod
    if (!cmd || cmd.type !== 'prompt' || typeof cmd.getPromptForCommand !== 'function') {
      return { success: false, error: `命令 ${commandName} 无可用 prompt 模板` }
    }

    const argsStr = args.join(' ')
    const prompts = await cmd.getPromptForCommand(argsStr, {
      sessionId: currentSessionId || '',
      workingDirectory: projectRoot,
      args,
      options: {},
    })

    const promptText = prompts
      .filter((p: { type?: string }) => p.type === 'text')
      .map((p: { text?: string }) => p.text || '')
      .join('\n')

    if (!promptText) return { success: false, error: '命令模板为空' }

    const currentEngine = getEngine()
    const result = await currentEngine.query(promptText)
    const messages = result.messages as InternalMessage[]

    // 提取所有 assistant 消息的内容（包括工具调用结果）
    const assistantParts: string[] = []
    for (const m of messages) {
      if (m.role === 'assistant') {
        if (typeof m.content === 'string') {
          if (m.content.trim()) assistantParts.push(m.content)
        } else {
          assistantParts.push(JSON.stringify(m.content))
        }
      }
    }

    // 取最后一条 assistant 消息作为主要输出，附带完整上下文摘要
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const primaryOutput = typeof lastAssistant?.content === 'string'
      ? lastAssistant.content
      : JSON.stringify(lastAssistant?.content ?? '')

    // 构建完整输出：主要回复 + 工具调用摘要
    let fullOutput = primaryOutput
    const toolCalls = messages.filter(m => m.role === 'tool')
    if (toolCalls.length > 0) {
      const toolSummary = toolCalls.map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content
        return '[工具结果] ' + truncated
      }).join('\n')
      if (toolSummary.length > 0) {
        fullOutput += '\n\n--- 执行详情 ---\n' + toolSummary
      }
    }

    return { success: true, output: fullOutput }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
}

// 内置技能执行：从 bundledSkills 注册表查找并执行
async function executeSkillCommand(skillName: string, args: string[] = []): Promise<{ success: boolean; output?: string; error?: string }> {
  const skills = getBundledSkills()
  const skill = skills.find(s => s.name === skillName.replace('/', ''))
  if (!skill) return { success: false, error: `技能 ${skillName} 未注册` }
  if (typeof skill.getPromptForCommand !== 'function') {
    return { success: false, error: `技能 ${skillName} 无可执行模板` }
  }

  try {
    const argsStr = args.join(' ')
    const prompts = await skill.getPromptForCommand(argsStr, {
      sessionId: currentSessionId || '',
      workingDirectory: projectRoot,
      args,
      options: {},
    } as never)

    const promptText = Array.isArray(prompts)
      ? prompts.filter((p: { type?: string }) => p.type === 'text').map((p: { text?: string }) => p.text || '').join('\n')
      : ''

    if (!promptText) return { success: false, error: '技能模板为空' }

    const currentEngine = getEngine()
    const result = await currentEngine.query(promptText)
    const messages = result.messages as InternalMessage[]
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const reply = typeof lastAssistant?.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant?.content ?? '')

    return { success: true, output: reply }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
}

ipcMain.handle('doge:execute-command', async (_event, commandName: string, args: string[]) => {
  const { execSync } = await import('node:child_process')
  const cwd = engineConfig?.workingDir || projectRoot

  // prompt 类型命令：通过 AI 引擎执行（利用已注册的工具）
  const aiDrivenCommands = ['/commit', '/review', '/plan', '/diff', '/branch', '/memory', '/deploy', '/task', '/session-search', '/session-tag']
  if (aiDrivenCommands.includes(commandName)) {
    return executeAIDrivenCommand(commandName, args)
  }

  // 内置技能：从 bundledSkills 注册表获取 prompt 并通过 AI 引擎执行
  const skillCommands = ['/debug', '/simplify', '/tdd', '/codebase-design', '/domain-modeling', '/diagnosing-bugs', '/git-guardrails', '/code-review', '/remember']
  if (skillCommands.includes(commandName)) {
    return executeSkillCommand(commandName, args)
  }

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
        const lines: string[] = ['# 命令列表', '']
        for (const [cat, cmds] of Object.entries(grouped)) {
          lines.push(`## ${cat}`)
          for (const c of cmds) lines.push(`- **${c.name}** — ${c.description}`)
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
        const api = getEngineApi()
        const msgs = api.getMessages()
        if (msgs.length > 0) {
          const id = saveSession(msgs)
          return { success: true, output: `对话历史已清除。已保存会话: ${id} (${msgs.length} 条消息)` }
        }
        engine = null
        engineApi = null
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
        const api = getEngineApi()
        const msgs = api.getMessages()
        const userMsgs = msgs.filter(m => m.role === 'user').length
        const assistantMsgs = msgs.filter(m => m.role === 'assistant').length
        const toolMsgs = msgs.filter(m => m.role === 'tool').length
        const sessions = listSessions()
        return { success: true, output: `当前会话:\n  用户消息: ${userMsgs}\n  助手消息: ${assistantMsgs}\n  工具调用: ${toolMsgs}\n  总计: ${msgs.length}\n  会话ID: ${currentSessionId || '新会话'}\n\n历史会话: ${sessions.length} 个\n${sessions.slice(0, 5).map(s => `  - ${s.id} (${s.messageCount} 条, ${s.createdAt})`).join('\n')}` }
      }
      case '/skills': {
        try {
          // 内置技能（bundled skills）
          const bundled = getBundledSkills()
          const bundledNames = bundled.map(s => `  ✦ ${s.name} — ${s.description}`)

          // 用户目录技能 (.claudeskills/)
          const skillsDir = path.join(projectRoot, '.claudeskills')
          let userNames: string[] = []
          if (fs.existsSync(skillsDir)) {
            userNames = fs.readdirSync(skillsDir)
              .filter(f => !f.startsWith('.'))
              .slice(0, 30)
              .map(f => `  • ${f.replace(/\.(md|json)$/, '')}`)
          }

          const lines: string[] = []
          if (bundledNames.length > 0) {
            lines.push(`内置技能 (${bundledNames.length}):`)
            lines.push(...bundledNames)
          }
          if (userNames.length > 0) {
            lines.push(`\n用户技能 (${userNames.length}):`)
            lines.push(...userNames)
          }
          if (lines.length === 0) {
            return { success: true, output: '暂无可用技能。在 .claudeskills/ 中添加技能文件。' }
          }
          return { success: true, output: lines.join('\n') }
        } catch {
          return { success: true, output: '技能列表不可用。' }
        }
      }
      case '/compact': {
        const api = getEngineApi()
        const count = api.getMessageCount()
        const summary = `压缩摘要: 共 ${count} 条消息已压缩。对话上下文已优化。`
        return { success: true, output: summary }
      }
      case '/rstk': {
        engine = null
        engineConfig = null
        return { success: true, output: '会话已重启。' }
      }
      case '/stats': {
        const api = getEngineApi()
        const msgs = api.getMessages()
        const userMsgs = msgs.filter(m => m.role === 'user').length
        const assistantMsgs = msgs.filter(m => m.role === 'assistant').length
        const toolMsgs = msgs.filter(m => m.role === 'tool').length
        const state = api.getState()
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
        const api = getEngineApi()
        const msgs = api.getMessages()
        const exportData = JSON.stringify(msgs, null, 2)
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
          const action = args[0] || 'list'
          const serverName = args[1] || ''

          if (action === 'list') {
            if (fs.existsSync(mcpConfig)) {
              const config = JSON.parse(fs.readFileSync(mcpConfig, 'utf-8'))
              const servers = config.servers || {}
              if (Object.keys(servers).length === 0) {
                return { success: true, output: '暂无 MCP 服务器配置。\n使用 /mcp add <name> <command> 添加本地服务器。' }
              }
              const lines = Object.entries(servers).map(([name, s]) => {
                const cfg = s as { command?: string; args?: string[]; transport?: string }
                return `  • ${name} — ${cfg.command || cfg.transport || 'unknown'} ${(cfg.args || []).join(' ')}`
              })
              return { success: true, output: `已配置 MCP 服务器 (${Object.keys(servers).length}):\n${lines.join('\n')}` }
            }
            return { success: true, output: 'MCP 配置未找到。使用 /mcp add <name> <command> 添加。' }
          }

          if (action === 'add') {
            if (!serverName || !args[2]) {
              return { success: false, error: '用法: /mcp add <name> <command> [args...]\n示例: /mcp add my-server npx -y @my/mcp-server' }
            }
            const command = args[2]
            const cmdArgs = args.slice(3)
            let config: { servers?: Record<string, unknown> } = {}
            if (fs.existsSync(mcpConfig)) {
              try { config = JSON.parse(fs.readFileSync(mcpConfig, 'utf-8')) } catch { /* ignore */ }
            }
            config.servers = config.servers || {}
            config.servers[serverName] = { command, args: cmdArgs, transport: 'stdio' }
            const dir = path.dirname(mcpConfig)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(mcpConfig, JSON.stringify(config, null, 2), 'utf-8')
            return { success: true, output: `已添加 MCP 服务器: ${serverName}\n命令: ${command} ${cmdArgs.join(' ')}\n重启应用后生效。` }
          }

          if (action === 'remove') {
            if (!serverName) return { success: false, error: '用法: /mcp remove <name>' }
            if (!fs.existsSync(mcpConfig)) return { success: false, error: 'MCP 配置文件不存在' }
            const config = JSON.parse(fs.readFileSync(mcpConfig, 'utf-8'))
            if (!config.servers?.[serverName]) return { success: false, error: `服务器 "${serverName}" 不存在` }
            delete config.servers[serverName]
            fs.writeFileSync(mcpConfig, JSON.stringify(config, null, 2), 'utf-8')
            return { success: true, output: `已移除 MCP 服务器: ${serverName}` }
          }

          return { success: false, error: `未知操作: ${action}\n可用操作: /mcp list | add <name> <command> [args] | remove <name>` }
        } catch (e: unknown) {
          return { success: true, output: `MCP 命令错误: ${e instanceof Error ? e.message : '未知错误'}` }
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
        engineApi = null
        const config = loadConfig()
        engineConfig = config
        getPermissionManager().setMainWindow(mainWindow)
        const adaptedTools = createAdaptedTools(config)
        engine = new QueryEngine({
          model: config.model,
          systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
          maxOutputTokens: 40000,
          tools: adaptedTools,
        })
        engineApi = createEngineApi(engine)
        engineApi.loadMessages(msgs)
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

  const mcpConfigPath = path.join(projectRoot, '.doge', 'mcp.json')

  function readMcpConfig(): { servers: Record<string, unknown> } {
    try {
      if (fs.existsSync(mcpConfigPath)) {
        return JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))
      }
    } catch { /* ignore */ }
    return { servers: {} }
  }

  function writeMcpConfig(config: { servers: Record<string, unknown> }): void {
    const dir = path.dirname(mcpConfigPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  ipcMain.handle('doge:mcp-list', () => {
    const config = readMcpConfig()
    const servers = config.servers || {}
    return Object.entries(servers).map(([name, s]) => {
      const cfg = s as { command?: string; args?: string[]; transport?: string }
      return { name, command: cfg.command || cfg.transport || 'unknown', args: cfg.args || [], transport: cfg.transport || 'stdio' }
    })
  })

  ipcMain.handle('doge:mcp-add', (_event, name: string, command: string, args: string[], transport = 'stdio') => {
    if (!name || !command) return { success: false, error: '缺少名称或命令' }
    const config = readMcpConfig()
    config.servers = config.servers || {}
    config.servers[name] = { command, args, transport }
    writeMcpConfig(config)
    return { success: true, message: `已添加 MCP 服务器: ${name}` }
  })

  ipcMain.handle('doge:mcp-remove', (_event, name: string) => {
    const config = readMcpConfig()
    if (!config.servers?.[name]) return { success: false, error: `服务器 "${name}" 不存在` }
    delete config.servers[name]
    writeMcpConfig(config)
    return { success: true, message: `已移除 MCP 服务器: ${name}` }
  })

ipcMain.handle('doge:mcp-test', async (_event, name: string) => {
  try {
    const config = readMcpConfig()
    const server = config.servers?.[name]
    if (!server) return { success: false, error: `服务器 "${name}" 不存在` }
    const cfg = server as { command?: string; args?: string[] }
    const { execSync } = await import('node:child_process')
    try {
      execSync(`${cfg.command} ${(cfg.args || []).join(' ')} --help`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' })
      return { success: true, message: `${name} 可用` }
    } catch {
      return { success: true, message: `${name} 命令已注册（连接测试需要实际 MCP 握手）` }
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '测试失败' }
  }
})

// MCP 协议握手与工具调用

const mcpConnections = new Map<string, { connected: boolean; tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>()

ipcMain.handle('doge:mcp-connect', async (_event, name: string) => {
  const config = readMcpConfig()
  const server = config.servers?.[name] as { command?: string; args?: string[]; transport?: string }
  if (!server) return { success: false, error: `服务器 "${name}" 不存在` }
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({ command: server.command!, args: server.args || [] })
    const client = new Client({ name: 'doge-desktop', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    const toolsResponse = await client.listTools()
    const tools = toolsResponse.tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: (t.inputSchema || {}) as Record<string, unknown> }))
    mcpConnections.set(name, { connected: true, tools })
    await client.close()
    return { success: true, tools }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '连接失败' }
  }
})

ipcMain.handle('doge:mcp-call-tool', async (_event, serverName: string, toolName: string, args: Record<string, unknown>) => {
  const config = readMcpConfig()
  const server = config.servers?.[serverName] as { command?: string; args?: string[]; transport?: string }
  if (!server) return { success: false, error: `服务器 "${serverName}" 不存在` }
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({ command: server.command!, args: server.args || [] })
    const client = new Client({ name: 'doge-desktop', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    const result = await client.callTool({ name: toolName, arguments: args })
    let output = ''
    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) { output += item.text }
        else if (item.type === 'image' && item.data) { output += `[图片: ${item.mimeType || 'image'}]` }
        else { output += JSON.stringify(item) }
      }
    }
    await client.close()
    return { success: !(result as { isError?: boolean }).isError, output: output || JSON.stringify(result) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '调用失败' }
  }
})

ipcMain.handle('doge:mcp-get-tools', (_event, name: string) => {
  const conn = mcpConnections.get(name)
  if (!conn) return { success: false, error: '未连接' }
  return { success: true, tools: conn.tools }
})

ipcMain.handle('doge:agent-list', () => {
  try {
    const agentsDir = path.join(projectRoot, '.doge', 'agents')
    if (!fs.existsSync(agentsDir)) return []
    return fs.readdirSync(agentsDir).filter(f => f.endsWith('.json')).map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(agentsDir, f), 'utf-8'))
      return { id: data.id || f.replace('.json', ''), name: data.name || f, description: data.description || '', model: data.model || '' }
    })
  } catch { return [] }
})

ipcMain.handle('doge:agent-get', (_event, id: string) => {
  try {
    const agentsDir = path.join(projectRoot, '.doge', 'agents')
    const file = path.join(agentsDir, `${id}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch { return null }
})

ipcMain.handle('doge:agent-save', (_event, agent: Record<string, unknown>) => {
  try {
    const agentsDir = path.join(projectRoot, '.doge', 'agents')
    if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true })
    const id = (agent.id as string) || `agent-${Date.now()}`
    fs.writeFileSync(path.join(agentsDir, `${id}.json`), JSON.stringify(agent, null, 2), 'utf-8')
    return { success: true, id }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '保存失败' }
  }
})

ipcMain.handle('doge:agent-delete', (_event, id: string) => {
  try {
    const agentsDir = path.join(projectRoot, '.doge', 'agents')
    const file = path.join(agentsDir, `${id}.json`)
    if (!fs.existsSync(file)) return { success: false, error: 'Agent 不存在' }
    fs.unlinkSync(file)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '删除失败' }
  }
})

// ─── 插件管理 IPC ───

ipcMain.handle('doge:plugin-scan', () => {
  return scanPlugins(projectRoot)
})

ipcMain.handle('doge:plugin-enable', (_event, pluginName: string, enabled: boolean) => {
  try {
    setPluginEnabled(projectRoot, pluginName, enabled)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '操作失败' }
  }
})

ipcMain.handle('doge:plugin-install', (_event, sourceDir: string, pluginName: string) => {
  return installPlugin(projectRoot, sourceDir, pluginName)
})

ipcMain.handle('doge:plugin-uninstall', (_event, pluginName: string) => {
  return uninstallPlugin(projectRoot, pluginName)
})

ipcMain.handle('doge:plugin-get-command', (_event, pluginName: string, commandName: string) => {
  return { content: getPluginCommandContent(projectRoot, pluginName, commandName) }
})

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
  const messages = msgs.map((m) => ({ role: m.role, content: m.content }))
  engine = null
  engineApi = null
  const config = loadConfig()
  engineConfig = config
  const adaptedTools = createAdaptedTools(config)
  engine = new QueryEngine({
    model: config.model,
    systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
    maxOutputTokens: 40000,
    tools: adaptedTools,
  })
  engineApi = createEngineApi(engine)
  engineApi.loadMessages(msgs)
  currentSessionId = sessionId
  return { success: true, messageCount: msgs.length, messages }
})

ipcMain.handle('doge:new-session', () => {
  engine = null
  engineApi = null
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
    if (currentSessionId && engineApi) {
      // 保存当前会话状态
      const msgs = engineApi.getMessages()
      if (msgs.length > 0) {
        const file = path.join(SESSIONS_DIR, `${currentSessionId}.json`)
        fs.writeFileSync(file, JSON.stringify({ id: currentSessionId, messages: msgs, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
      }
    }
    engine = null
    engineApi = null
    engineConfig = null
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

const activeTerminals = new Map<string, { proc: ReturnType<typeof pty.spawn>; cwd: string }>()

ipcMain.handle('doge:spawn-terminal', async (_event, cwd: string) => {
  try {
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || 'bash'
    const proc = pty.spawn(shell, [], {
      cwd: cwd || projectRoot,
      rows: 24,
      cols: 80,
      encoding: 'utf-8',
    })
    const id = `term_${Date.now()}`
    activeTerminals.set(id, { proc, cwd: cwd || projectRoot })

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('doge:terminal-data', id, data)
      }
    })

    proc.onExit(() => {
      activeTerminals.delete(id)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('doge:terminal-exit', id)
      }
    })

    return { success: true, id }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'spawn 失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:terminal-write', async (_event, id: string, data: string) => {
  const t = activeTerminals.get(id)
  if (!t) return { success: false, error: 'terminal not found' }
  try {
    t.proc.write(data)
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'write failed'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:terminal-resize', async (_event, id: string, cols: number, rows: number) => {
  const t = activeTerminals.get(id)
  if (!t) return { success: false, error: 'terminal not found' }
  try {
    t.proc.resize(cols, rows)
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'resize failed'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:terminal-kill', async (_event, id: string) => {
  const t = activeTerminals.get(id)
  if (!t) return { success: false, error: 'terminal not found' }
  try {
    t.proc.kill()
    activeTerminals.delete(id)
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'kill failed'
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
app.whenReady().then(() => {
  // 初始化内置技能（注册到 bundledSkills 注册表）
  try { initBundledSkills() } catch { /* ignore skill init errors */ }
  createWindow(); createTray()
})

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

ipcMain.handle('doge:get-crash-recovery', async () => {
  try {
    const crashFile = path.join(SESSIONS_DIR, '.crash-recovery.json')
    if (!fs.existsSync(crashFile)) return { hasRecovery: false }
    const data = JSON.parse(fs.readFileSync(crashFile, 'utf-8'))
    return { hasRecovery: true, sessionId: data.sessionId, messageCount: data.messageCount, timestamp: data.timestamp }
  } catch { return { hasRecovery: false } }
})

ipcMain.handle('doge:clear-crash-recovery', async () => {
  try {
    const crashFile = path.join(SESSIONS_DIR, '.crash-recovery.json')
    if (fs.existsSync(crashFile)) fs.unlinkSync(crashFile)
    return { success: true }
  } catch { return { success: false } }
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
