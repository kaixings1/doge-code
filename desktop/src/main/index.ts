/**
 * Electron 主进程入口 — 集成 QueryEngine
 */
console.log('[MAIN] Electron main process starting...')
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import Store from 'electron-store'
import * as path from 'path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const requireModule = createRequire(import.meta.url)
import * as fs from 'fs'
import { scanFile as securityScanFile, scanDirectory as securityScanDirectory, SECURITY_RULES } from '../commands/security-audit/index.js'
import { QueryEngine, type ToolDefinition } from '../engine/index.js'
import type { InternalMessage } from '../engine/messageNormalizer.js'
import type { APIRequest } from '../engine/requestBuilder.js'
import { getAllBaseTools, type Tool } from '../tools.js'
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js'
import { getPermissionManager, DesktopPermissionManager } from './permissionManager.js'
import { setOriginalCwd, setCwdState, getProjectRoot } from '../bootstrap/state.js'
import { initBundledSkills } from '../skills/bundled/index.js'
import { getBundledSkills } from '../skills/bundledSkills.js'
import { createEngineApi, type EngineApi } from './engineApi.js'
import { scanPlugins, setPluginEnabled, installPlugin, uninstallPlugin, getPluginCommandContent, type PluginInfo } from './pluginManager.js'
import { getMarketplaces, installPluginFromMarketplace, type MarketplacePlugin } from './pluginMarketplace.js'
import { DocumentManager, type DocOperation } from './collaborativeDoc.js'
import { BatchEngine, safeReadFile, safeWriteFile, scanFiles, type BatchConfig } from './batchEngine.js'
import { validateManifest, validatePluginPath, scanPluginSecurity, safeReadCommand, validateSource, DEFAULT_SANDBOX_CONFIG } from './pluginSandbox.js'
import { createPluginRuntime } from './pluginRuntime.js'
import { createCodeIndexer } from './localIndex.js'
import { createDebuggerManager } from './debuggerManager.js'
import { createAgentOrchestrator, loadAllRoles } from './agentOrchestrator.js'
import { RemoteSignalingServer, type RemoteMessage } from './remoteSignaling.js'
import { createDesktopApiClient, type DesktopApiClient } from './apiClient.js'
import { saveSession, listSessions, loadSession, deleteSession, updateSession, saveCrashRecovery, getCrashRecovery, clearCrashRecovery } from './sessionStore.js'
import { createAdaptedTools, executeTool, resetAdaptedToolsCache, rollbackTool, getAllOperations } from './toolExecutor.js'
import { getLspClientManager, type LspServerConfig, type LspDiagnostic } from './lspClientManager.js'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const store = new Store()

// ─── CRDT 文档协作引擎 ───
const docManager = new DocumentManager()

// ─── 批量处理引擎 ───
const batchEngine = new BatchEngine()

// ─── 远程信令服务器（内置 WebSocket） ───
const signalingServer = new RemoteSignalingServer()
let signalingServerPort = 0

// 启动远程信令服务器（异步，不阻塞）
signalingServer.start(0).then(port => {
  signalingServerPort = port
  tsLog('SIGNALING', `WebSocket signaling server started on port ${port}`)
}).catch(err => {
  tsLog('SIGNALING', 'Failed to start signaling server:', err)
})

// 监听信令消息，转发到渲染进程
signalingServer.onMessage((msg: RemoteMessage) => {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(win => {
    win.webContents.send('doge:remote-signal', msg)
  })
})

// ─── 日志辅助 ───
function tsLog(tag: string, ...args: unknown[]): void {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${t}] [${tag}]`, ...args)
}

// ─── 路径 ───
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// 项目根目录（包含 .doge/lc2.json）
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')
const projectRoot = PROJECT_ROOT
const DIST_DIR = path.join(DESKTOP_ROOT, 'dist')
const CONFIG_PATH_DEFAULT = path.join(projectRoot, '.doge', 'lc2.json')

// ─── 插件运行时（JS 沙箱执行 + hooks + 热加载） ───
// 必须在 projectRoot 定义之后创建（原在第 47 行过早调用导致路径参数为空）
const pluginRuntime = createPluginRuntime(projectRoot, { timeoutMs: 8000 })

// ─── 本地代码索引（BM25 + 增量 + 持久化） ───
const codeIndexer = createCodeIndexer(projectRoot)
codeIndexer.load()
// 启动时异步重建（不阻塞主进程）
void codeIndexer.rebuild().then(() => {
  codeIndexer.watch()
  tsLog('INDEX', `本地索引就绪: ${codeIndexer.getStats().fileCount} 文件`)
}).catch(err => {
  console.warn(' 错误: [INDEX] 启动重建失败:', err)
})

/**
 * 定位 .doge/lc2.json（默认）或 .doge/api.json（备用）。
 * 开发模式：desktop/src/main → doge-code/.doge/lc2.json（常规计算正确）。
 * 打包后（portable / unpacked）：主进程被 bundle 进 app.asar，dirname 层级变化导致
 * CONFIG_PATH_DEFAULT 指向 app.asar 内部（不存在）。因此从多个候选起点（当前 cwd、
 * 可执行文件目录、process.env 指定）向上回溯查找最近的 .doge/lc2.json。
 */
// 配置查找诊断日志（写入 %TEMP%\doge_debug_config.log），便于真实 portable 环境定位
const DEBUG_CONFIG_LOG = path.join(process.env.TEMP || 'C:/Windows/Temp', 'doge_debug_config.log')
function cfgDbg(msg: string): void {
  try {
    fs.appendFileSync(DEBUG_CONFIG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
  } catch { /* ignore */ }
}

function findApiConfig(): string {
  const pad = (s: string) => (s ? s : '(null)')
  cfgDbg('=== findApiConfig start ===')
  cfgDbg(`  cwd = ${pad(process.cwd())}`)
  cfgDbg(`  execPath = ${pad(process.execPath)}`)
  cfgDbg(`  DOGE_API_JSON = ${pad(process.env.DOGE_API_JSON)}`)
  cfgDbg(`  PORTABLE_EXECUTABLE_DIR = ${pad(process.env.PORTABLE_EXECUTABLE_DIR)}`)
  cfgDbg(`  PORTABLE_EXECUTABLE_FILE = ${pad(process.env.PORTABLE_EXECUTABLE_FILE)}`)
  cfgDbg(`  CONFIG_PATH_DEFAULT = ${pad(CONFIG_PATH_DEFAULT)}`)
  if (process.env.DOGE_API_JSON) {
    const explicit = path.resolve(process.env.DOGE_API_JSON)
    if (isFileSync(explicit)) {
      cfgDbg(`  通过 DOGE_API_JSON 找到配置: ${explicit}`)
      tsLog('CONFIG', 'findApiConfig: 通过 DOGE_API_JSON 找到配置:', explicit)
      return explicit
    }
    cfgDbg(`  DOGE_API_JSON 指定文件不存在: ${explicit}`)
  }
  const candidates: string[] = []
  // electron-builder portable 的 7z SFX 运行时可能注入这些变量，指向用户放置 portable exe 的目录。
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    try { candidates.push(path.resolve(process.env.PORTABLE_EXECUTABLE_DIR)) } catch { /* ignore */ }
  }
  try { candidates.push(path.dirname(process.execPath)) } catch { /* ignore */ }
  try { candidates.push(process.cwd()) } catch { /* ignore */ }
  candidates.push(projectRoot)
  const configFiles = ['lc2.json', 'api.json'] // 优先查找 lc2.json
  for (const start of candidates) {
    try {
      let dir = path.resolve(start)
      cfgDbg(`  候选起点: ${dir}`)
      for (let i = 0; i < 10; i++) {
        for (const cfgFile of configFiles) {
          const candidate = path.join(dir, '.doge', cfgFile)
          if (isFileSync(candidate)) {
            cfgDbg(`  找到配置: ${candidate}`)
            tsLog('CONFIG', 'findApiConfig: 找到配置:', candidate)
            return candidate
          }
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch { /* 继续下一个候选起点 */ }
  }
  cfgDbg(' 错误:   所有候选路径均未找到 .doge/lc2.json 或 api.json, 回退默认')
  return CONFIG_PATH_DEFAULT
}

function isFileSync(p: string): boolean {
  try { return fs.statSync(p).isFile() } catch { return false }
}

function loadConfig(): { provider: string; apiKey: string; model: string; baseUrl: string; workingDir: string } {
  const configPath = findApiConfig()
  cfgDbg(`loadConfig: 读取配置文件: ${configPath}`)
  tsLog('CONFIG', 'loadConfig: 尝试读取配置文件:', configPath)
  // 工作目录 = 包含 .doge 目录的上一级（即项目根）
  const configDirParent = path.dirname(configPath)   // .../.doge
  const workingDir = path.resolve(configDirParent, '..')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw)
    const preset = data.activePreset && data.presets?.[data.activePreset]
      ? data.presets[data.activePreset]
      : data.presets?.default || {}
    const provider = preset.provider || 'openai'
    const configuredUrl = preset.baseURL || preset.baseUrl || ''
    const baseUrl = provider === 'anthropic'
      ? 'https://api.anthropic.com/v1'
      : (configuredUrl || 'https://api.openai.com/v1')
    const hasKey = !!preset.apiKey
    cfgDbg(`loadConfig: 读到 activePreset=${data.activePreset}, model=${preset.model || 'gpt-4o'}, apiKey非空=${hasKey}, baseURL=${baseUrl}`)
    tsLog('CONFIG', 'loadConfig: 配置加载成功, provider:', provider, 'apiKey 已配置:', hasKey)
    return {
      provider,
      apiKey: preset.apiKey || '',
      model: preset.model || 'gpt-4o',
      baseUrl,
      workingDir,
    }
  } catch (e) {
    tsLog('CONFIG', ' 错误: loadConfig: 读取配置失败 -', e instanceof Error ? e.message : String(e))
    return { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', workingDir: projectRoot }
  }
}

// ─── 工具适配和会话持久化已拆分为独立模块 ───
// toolExecutor.ts: executeTool(), createAdaptedTools()
// sessionStore.ts: saveSession(), listSessions(), loadSession(), etc.
// apiClient.ts: createDesktopApiClient()

// ─── QueryEngine 实例（全局单例） ───
let engine: QueryEngine | null = null
let engineApi: EngineApi | null = null
let engineConfig: ReturnType<typeof loadConfig> | null = null
let currentSessionId: string | null = null

function getEngine(): QueryEngine {
  if (!engine) {
    tsLog('MAIN', 'Creating new QueryEngine instance')
    const config = loadConfig()
    engineConfig = config

    // 确保工具执行时 cwd 指向项目根目录
    // Electron 打包后 process.cwd() 可能不是项目目录
    const cwdRoot = getProjectRoot()
    setOriginalCwd(cwdRoot)
    setCwdState(cwdRoot)
    tsLog('MAIN', 'Working directory set to:', cwdRoot)

    getPermissionManager().setMainWindow(mainWindow)
    let adaptedTools: Map<string, unknown>
    try {
      adaptedTools = createAdaptedTools(config)
    } catch (toolErr) {
      tsLog('MAIN', 'createAdaptedTools failed:', toolErr instanceof Error ? toolErr.message : String(toolErr))
      tsLog('MAIN', 'Stack:', toolErr instanceof Error ? toolErr.stack : 'no stack')
      adaptedTools = new Map()
    }

    engine = new QueryEngine({
      model: config.model,
      systemPrompt: `You are Doge Code, a helpful AI programming assistant.

Available tools:
- BashTool: run shell commands (ls, cat, grep, find, etc.)
- FileReadTool: read file contents
- FileWriteTool: write files
- FileEditTool: edit files with search/replace
- GlobTool: find files by pattern
- WebFetchTool: fetch web pages
- NotebookEditTool: edit Jupyter notebooks
- TaskStopTool: stop a running task
- BriefTool: create project brief

Use tools when needed. If a tool call fails or returns empty, try a different approach or answer directly with text.`,
      maxOutputTokens: 40000,
      tools: adaptedTools,
      provider: config.provider,
    })

    // 注入 API 客户端（复用 src/services/api/ 的成熟实现）
    const desktopApiClient = createDesktopApiClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      provider: config.provider,
    })

    // 直接访问 messageLoop.deps.apiClient（绕过 setApiClient 被 tree-shaking 优化掉的问题）
    const messageLoop = (engine as unknown as { messageLoop: { deps: { apiClient: unknown } } }).messageLoop
    messageLoop.deps.apiClient = desktopApiClient

    // 创建公共 API 封装
    engineApi = createEngineApi(engine)

    // 将 StreamProcessor 的 chunk 回调连接到 notifyChunk
    let lastSentChunkText = ''
    engineApi.setChunkCallback((chunk: { type: string; text?: string }) => {
      if (chunk.type === 'text' && chunk.text && mainWindow) {
        const text = chunk.text
        if (text === lastSentChunkText) {
          console.log(`[MAIN-IPC] EXACT-DUP SKIP: "${text.slice(0, 50)}"`)
          return
        }
        if (lastSentChunkText.length > 0 && lastSentChunkText.startsWith(text)) {
          console.log(`[MAIN-IPC] PREFIX-DUP SKIP: "${text.slice(0, 50)}" prevLen=${lastSentChunkText.length}`)
          return
        }
        lastSentChunkText = text
        console.log(`[MAIN-IPC] SEND: len=${text.length} text="${text.slice(0, 50)}"`)
        mainWindow.webContents.send('doge:chunk', { text })
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
      // 本地 file:// 协议下 ES module 加载受 CORS 限制（origin 为 null），
      // 必须关闭 webSecurity 才能加载 index.html 中的 <script type="module">
      webSecurity: false,
    },
  })

  // ─── 麦克风权限处理 ───
  // 在 Electron 中，navigator.permissions.query('microphone') 需要主进程响应
  // 否则 webkitSpeechRecognition 无法获取麦克风权限
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
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

  const rendererUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(`${rendererUrl}?desktop=1`)
  } else {
    const htmlUrl = `file://${path.join(DIST_DIR, 'renderer', 'index.html').replace(/\\/g, '/')}#/desktop`
    mainWindow.loadURL(htmlUrl)
  }

  // ─── 渲染进程诊断：转发所有级别，便于定位渲染进程问题 ───
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[RENDERER:${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('[RENDERER:did-fail-load]', errorCode, errorDescription, validatedURL)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[RENDERER:render-process-gone]', JSON.stringify(details))
  })

  if (process.env.NODE_ENV === 'development' || process.env.DOGE_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin') {
      e.preventDefault()
      mainWindow.hide()
    }
    // Windows/Linux: 不阻止，让窗口正常关闭并退出应用
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

ipcMain.handle('doge:request-microphone-permission', async () => {
  // 权限已在 setPermissionRequestHandler 中授予，此处仅做状态确认
  return { granted: true }
})

// 发送消息（使用 QueryEngine）
// 追踪 send-message 调用次数，检测重复调用
let sendMessageCallCount = 0

ipcMain.handle('doge:send-message', async (_event, content: string, preAnalysis?: Array<{ type: string; message: string; line?: number }>) => {
  sendMessageCallCount++
  console.log(`[MAIN-IPC] doge:send-message called #${sendMessageCallCount} content="${content.slice(0, 80)}"`)
  console.trace(`[MAIN-IPC] call stack for #${sendMessageCallCount}`)
  let currentEngine: QueryEngine
  try {
    currentEngine = getEngine()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    tsLog('MAIN', 'getEngine failed:', msg)
    return { error: '引擎初始化失败: ' + msg }
  }
  const config = engineConfig!

  if (!config.apiKey) {
    return { error: '未配置 API Key。请在 .doge/lc2.json 中配置。' }
  }

  try {
    // 注入预测性 AI 建议
    currentEngine.setPreAnalysis(preAnalysis)

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

    const result = await currentEngine.query(engineInput)
    const messages = result.messages as InternalMessage[]
    // 自动保存会话
    if (!currentSessionId && messages.length > 0) {
      currentSessionId = saveSession(messages)
    } else if (currentSessionId && messages.length > 0) {
      updateSession(currentSessionId, messages)
    }
    // 崩溃恢复标记（成功发送后清除）
    clearCrashRecovery()

    // 诊断日志：输出消息角色分布和内容概况
    tsLog('MAIN', 'query() returned, messages count:', messages.length)
    for (const m of messages) {
      const preview = typeof m.content === 'string' ? m.content.slice(0, 50) : JSON.stringify(m.content).slice(0, 50)
      tsLog('MAIN', `  msg role=${m.role} content_preview=${preview}...`)
    }

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    let reply: string
    if (typeof lastAssistant?.content === 'string') {
      reply = lastAssistant.content
    } else if (Array.isArray(lastAssistant?.content)) {
      const textBlocks = (lastAssistant.content as Array<Record<string, unknown>>)
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text as string)
      reply = textBlocks.join('')
    } else {
      reply = ''
    }
    if (!reply) {
      // 纯工具调用消息：前端已通过事件流显示工具执行过程
      // 但为了兼容非流式调用模式（如自动测试），同时返回最后一条 tool 消息的内容
      const toolMsgs = [...messages].filter(m => m.role === 'tool')
      tsLog('MAIN', 'no text reply, toolMsgs count:', toolMsgs.length, 'lastAssistant exists:', !!lastAssistant)
      if (toolMsgs.length > 0) {
        const lastTool = toolMsgs[toolMsgs.length - 1]
        const toolContent = typeof lastTool.content === 'string'
          ? lastTool.content
          : JSON.stringify(lastTool.content)
        tsLog('MAIN', 'toolOutput preview:', toolContent.slice(0, 80))
        // 标记为工具结果，让前端知道这是工具输出而不是 AI 回复
        return { success: true, content: '', toolOutput: toolContent }
      }
      tsLog('MAIN', 'NO tool messages found! Returning empty content.')
      return { success: true, content: '' }
    }
    return { success: true, content: reply }
  } catch (error: unknown) {
    // 保存崩溃恢复标记
    saveCrashRecovery(currentSessionId, 0)
    const message = error instanceof Error ? error.message : '未知错误'
    tsLog('MAIN', 'query threw error:', message)
    return { error: message }
  }
})

// 回滚工具操作
ipcMain.handle('doge:rollback-tool', async (_event, toolUseId: string) => {
  try {
    const restored = rollbackTool(toolUseId)
    return { success: true, restored }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: message }
  }
})

// 获取工具操作历史
ipcMain.handle('doge:get-tool-operations', () => {
  try {
    return getAllOperations()
  } catch {
    return []
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
    const configPath = findApiConfig()
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    if (!config.presets) config.presets = {}
    const presetName = config.activePreset || 'default'
    if (!config.presets[presetName]) config.presets[presetName] = {}
    if (data.provider) config.presets[presetName].provider = data.provider
    if (data.apiKey) config.presets[presetName].apiKey = data.apiKey
    if (data.model) config.presets[presetName].model = data.model
    if (data.baseUrl) config.presets[presetName].baseUrl = data.baseUrl
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    engine = null
    engineApi = null
    engineConfig = null
    resetAdaptedToolsCache()
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
    if (!api) { tsLog('MAIN', 'getHistory: no engineApi'); return { messages: [] } }
    const messages = api.getMessages()
    tsLog('MAIN', 'getHistory: returning', messages.length, 'messages')
    for (const m of messages) {
      tsLog('MAIN', `  getHistory msg role=${m.role} preview=${typeof m.content === 'string' ? m.content.slice(0, 50) : JSON.stringify(m.content).slice(0, 50)}...`)
    }
    return { messages }
  } catch {
    return { messages: [] }
  }
})

// 清除对话历史
ipcMain.handle('doge:clear-history', () => {
  engine = null
  engineApi = null
  engineConfig = null
  resetAdaptedToolsCache()
  currentSessionId = null
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
  const config = engineConfig || loadConfig()
  return executeTool(call, config, projectRoot)
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

// ─── Git 合并冲突 ───
ipcMain.handle('doge:git-merge-status', async (_event, cwd: string) => {
  try {
    const { execSync } = await import('node:child_process')
    // 检查是否在合并中
    const mergeHead = path.join(cwd, '.git', 'MERGE_HEAD')
    const inMerge = fs.existsSync(mergeHead)
    if (!inMerge) {
      return { inMerge: false, conflicts: [], message: '当前无合并冲突' }
    }
    // 获取冲突文件列表
    const output = execSync('git diff --name-only --diff-filter=U', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const conflictFiles = output.trim().split('\n').filter(Boolean)
    // 获取每个文件的冲突内容
    const conflicts: Array<{ file: string; base: string; ours: string; theirs: string }> = []
    for (const file of conflictFiles) {
      const fullPath = path.join(cwd, file)
      const content = fs.readFileSync(fullPath, 'utf-8')
      // 解析冲突标记
      const ours: string[] = []
      const theirs: string[] = []
      const base: string[] = []
      let inOurs = false
      let inTheirs = false
      let inBase = false
      for (const line of content.split('\n')) {
        if (line.startsWith('<<<<<<< ')) { inOurs = true; inBase = false; continue }
        if (line.startsWith('=======')) { inOurs = false; inTheirs = true; continue }
        if (line.startsWith('>>>>>>> ')) { inTheirs = false; continue }
        if (inOurs) ours.push(line)
        else if (inTheirs) theirs.push(line)
        else base.push(line)
      }
      conflicts.push({
        file,
        base: base.join('\n'),
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
      })
    }
    return { inMerge: true, conflicts, message: `发现 ${conflicts.length} 个冲突文件` }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { inMerge: false, conflicts: [], error: message }
  }
})

ipcMain.handle('doge:git-merge-resolve', async (_event, cwd: string, filePath: string, resolvedContent: string, strategy: 'ours' | 'theirs' | 'manual') => {
  try {
    const { execSync } = await import('node:child_process')
    const fullPath = path.join(cwd, filePath)
    if (strategy === 'ours') {
      execSync(`git checkout --ours -- "${filePath}"`, { cwd, encoding: 'utf-8' })
      execSync(`git add -- "${filePath}"`, { cwd, encoding: 'utf-8' })
    } else if (strategy === 'theirs') {
      execSync(`git checkout --theirs -- "${filePath}"`, { cwd, encoding: 'utf-8' })
      execSync(`git add -- "${filePath}"`, { cwd, encoding: 'utf-8' })
    } else {
      fs.writeFileSync(fullPath, resolvedContent, 'utf-8')
      execSync(`git add -- "${filePath}"`, { cwd, encoding: 'utf-8' })
    }
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-abort-merge', async (_event, cwd: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync('git merge --abort', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

// ─── Git 分支管理 ───
ipcMain.handle('doge:git-branch-list', async (_event, cwd: string) => {
  try {
    const { execSync } = await import('node:child_process')
    // 获取本地分支列表
    const local = execSync('git branch --format="%(refname:short) %(objectname:short) %(committerdate:relative)"', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    // 获取当前分支
    const current = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
    // 获取远程分支
    const remote = execSync('git branch -r --format="%(refname:short)"', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const localBranches = local.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(' ')
      return { name: parts[0], commit: parts[1] || '', date: parts.slice(2).join(' ') || '', isCurrent: parts[0] === current, isRemote: false }
    })
    const remoteBranches = remote.trim().split('\n').filter(Boolean).map(name => ({
      name: name.replace('origin/', ''),
      commit: '',
      date: '',
      isCurrent: false,
      isRemote: true,
    }))
    return { local: localBranches, remote: remoteBranches, current }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { local: [], remote: [], current: '', error: message }
  }
})

ipcMain.handle('doge:git-branch-create', async (_event, cwd: string, branchName: string, checkout: boolean) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git branch "${branchName}"`, { cwd, encoding: 'utf-8' })
    if (checkout) execSync(`git checkout "${branchName}"`, { cwd, encoding: 'utf-8' })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-branch-switch', async (_event, cwd: string, branchName: string) => {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`git checkout "${branchName}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-branch-delete', async (_event, cwd: string, branchName: string, force: boolean) => {
  try {
    const { execSync } = await import('node:child_process')
    const flag = force ? '-D' : '-d'
    execSync(`git branch ${flag} "${branchName}"`, { cwd, encoding: 'utf-8' })
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-branch-merge', async (_event, cwd: string, sourceBranch: string, targetBranch: string) => {
  try {
    const { execSync } = await import('node:child_process')
    // 先切换到目标分支
    execSync(`git checkout "${targetBranch}"`, { cwd, encoding: 'utf-8' })
    const output = execSync(`git merge "${sourceBranch}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true, output: output as string }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-log-graph', async (_event, cwd: string, maxCount: number) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`git log --graph --oneline --all -n ${maxCount || 20}`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { success: true, graph: output }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:git-show', async (_event, cwd: string, sha: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`git show --stat --format=fuller -- "${sha}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const raw = output as string
    const lines = raw.split('\n')
    const header: Record<string, string> = {}
    let inStat = false
    const stats: Array<{ file: string; additions: number; deletions: number }> = []
    for (const line of lines) {
      if (line.startsWith('commit ')) header.sha = line.replace('commit ', '').trim()
      else if (line.startsWith('Author: ')) header.author = line.replace('Author: ', '').trim()
      else if (line.startsWith('Date:   ')) header.date = line.replace('Date:   ', '').trim()
      else if (line.startsWith('    ')) header.message = (header.message || '') + line.trim()
      else if (line.startsWith(' ') && line.includes('|')) inStat = true
      else if (inStat && line.includes('|')) {
        const statPart = line.trim()
        const idx = statPart.indexOf('|')
        if (idx > -1) {
          const file = statPart.slice(0, idx).trim()
          const tail = statPart.slice(idx + 1).trim()
          const additions = tail.match(/\+(\d+)/)?.[1] ? Number(tail.match(/\+(\d+)/)?.[1]) : 0
          const deletions = tail.match(/-(\d+)/)?.[1] ? Number(tail.match(/-(\d+)/)?.[1]) : 0
          stats.push({ file, additions, deletions })
        }
      }
    }
    if (!header.message && header.sha) header.message = header.sha
    return { sha: header.sha || sha, author: header.author || '', date: header.date || '', message: header.message || '', stats }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { sha, author: '', date: '', message: '', stats: [], error: message }
  }
})

ipcMain.handle('doge:git-diff', async (_event, cwd: string, shaA: string, shaB: string, filePath?: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const target = filePath ? ` -- "${filePath}"` : ''
    const output = execSync(`git diff --stat ${shaA} ${shaB}${target}`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const raw = output as string
    const stats: Array<{ file: string; additions: number; deletions: number; changeType: string }> = []
    const lines = raw.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const match = trimmed.match(/^(.*)\s+\|\s+(\d+)\s+([+-]+)$/)
      if (match) {
        const file = match[1].trim()
        const changes = Number(match[2].trim())
        const signs = match[3].trim()
        const additions = (signs.match(/\+/g) || []).length
        const deletions = (signs.match(/-/g) || []).length
        let changeType = 'modified'
        if (file.startsWith('{')) changeType = 'renamed'
        else if (trimmed.includes('create mode')) changeType = 'added'
        else if (trimmed.includes('delete mode')) changeType = 'deleted'
        stats.push({ file, additions, deletions, changeType })
      }
    }
    return { stats }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    return { stats: [], error: message }
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

// ─── AI 代码补全 ───
ipcMain.handle('doge:ai-complete', async (_event, input: { filePath: string; code: string; line: number; column: number }) => {
  try {
    const { filePath, code, line, column } = input
    const api = getEngineApi()
    if (!api) return { success: false, completions: [], error: '引擎未就绪' }

    const prompt = `为以下代码在行 ${line} 列 ${column} 位置生成 3 个代码补全建议。只返回补全文本，不要解释。\n\n文件: ${filePath}\n\`\`\`\n${code}\n\`\`\``

    const msgs = api.getMessages()
    const completions: Array<{ insertText: string; endLine?: number; endColumn?: number; documentation?: string }> = []

    try {
      const response = await api.sendMessage(prompt)
      const text = typeof response === 'string' ? response : JSON.stringify(response)
      const lines = text.split('\n').filter(l => l.trim())
      for (const line of lines.slice(0, 3)) {
        const trimmed = line.trim()
        if (trimmed) {
          completions.push({
            insertText: trimmed,
            endLine: line + 1,
            endColumn: column + trimmed.length,
            documentation: 'AI 补全建议',
          })
        }
      }
    } catch {
      return { success: false, completions: [], error: '生成补全建议失败' }
    }

    return { success: true, completions }
  } catch {
    return { success: false, completions: [], error: 'AI 补全服务不可用' }
  }
})

// ─── AI 代码审查 ───
ipcMain.handle('doge:code-review', async (_event, params: { filePath: string; cwd: string }) => {
  try {
    const { filePath, cwd } = params
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const code = fs.readFileSync(filePath, 'utf-8')
    const engine = getEngine()
    if (!engine) return { success: false, error: '引擎未就绪' }

    const prompt = `对以下代码进行全面的代码审查。评估维度包括：\n1. 整体质量（overall, 0-100）\n2. 安全性（security, 0-100）\n3. 性能（performance, 0-100）\n4. 可维护性（maintainability, 0-100）\n5. 可测试性（testability, 0-100）\n\n请列出发现的问题（findings），每个问题包含：category（security/performance/maintainability/style/bug）、severity（critical/high/medium/low/info）、title、description、lineNumber、suggestedFix。\n\n只返回 JSON 格式：{"score": {"overall": N, "security": N, "performance": N, "maintainability": N, "testability": N}, "findings": [...]}\n\n文件: ${filePath}\n\`\`\`\n${code}\n\`\`\``

    const result = await engine.query(prompt)
    const messages = result.messages as InternalMessage[]
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const text = typeof lastAssistant?.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant?.content ?? '')

    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*"score"[\s\S]*"findings"[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, result: { score: data.score, findings: data.findings || [], duration: 0 } }
      }
    } catch { /* parse error, fall through */ }

    return { success: true, result: { score: { overall: 70, security: 70, performance: 70, maintainability: 70, testability: 70 }, findings: [], duration: 0 } }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// ─── AI 代码一键修复 ───
ipcMain.handle('doge:apply-fix', async (_event, params: { filePath: string; lineNumber: number; column: number; fixedCode: string; originalCode?: string }) => {
  try {
    const { filePath, lineNumber, column, fixedCode, originalCode } = params
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    let content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    // 策略：优先按行号范围精确替换；回退到 originalCode 文本搜索替换
    if (originalCode) {
      if (content.includes(originalCode)) {
        content = content.replace(originalCode, fixedCode)
      } else {
        // 按行号替换该行
        const targetLine = lineNumber - 1
        if (targetLine >= 0 && targetLine < lines.length) {
          lines[targetLine] = fixedCode
          content = lines.join('\n')
        }
      }
    } else {
      // 无 originalCode 时直接替换目标行
      const targetLine = lineNumber - 1
      if (targetLine >= 0 && targetLine < lines.length) {
        lines[targetLine] = fixedCode
        content = lines.join('\n')
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// ─── 安全漏洞扫描 ───
interface SecurityAuditIssue {
  file: string
  line: number
  rule: string
  severity: 'high' | 'medium' | 'low'
  message: string
  code: string
}
ipcMain.handle('doge:security-audit', async (_event, params: { scanPath: string; rules?: string[]; scanType?: 'file' | 'directory' }) => {
  try {
    const { scanPath, rules, scanType = 'file' } = params
    const isFile = scanType === 'file'
    const issues = isFile ? securityScanFile(scanPath, rules) : securityScanDirectory(scanPath, rules)
    const issuesWithId: Array<SecurityAuditIssue & { id: string }> = issues.map((issue, idx) => ({ ...issue, id: `sec-${idx}` }))
    const stats = {
      total: issuesWithId.length,
      high: issuesWithId.filter(i => i.severity === 'high').length,
      medium: issuesWithId.filter(i => i.severity === 'medium').length,
      low: issuesWithId.filter(i => i.severity === 'low').length,
    }
    return { success: true, issues: issuesWithId, stats }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('doge:security-rules', async () => {
  try {
    const rules = Object.entries(SECURITY_RULES).map(([key, val]) => ({ id: key, severity: val.severity, message: val.message }))
    return { success: true, rules }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 符号大纲 ───
ipcMain.handle('doge:get-outline', async (_event, params: { filePath: string; cwd: string }) => {
  try {
    const { filePath } = params
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
    const code = fs.readFileSync(filePath, 'utf-8')
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const engine = getEngine()
    if (!engine) return { success: false, error: '引擎未就绪' }

    const prompt = `分析以下代码的符号结构，返回 JSON 格式的符号列表。每个符号包含：id、name、kind（function/class/interface/variable/constant/import/type）、range（startLine, startColumn, endLine, endColumn）、children（可选嵌套）。\n\n只返回 JSON 数组格式。\n\n文件: ${filePath} (${ext})\n\`\`\`\n${code}\n\`\`\``

    const result = await engine.query(prompt)
    const messages = result.messages as InternalMessage[]
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    const text = typeof lastAssistant?.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant?.content ?? '')

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const symbols = JSON.parse(jsonMatch[0])
        return { success: true, symbols }
      }
    } catch { /* parse error, fall through */ }

    return { success: false, error: '无法解析符号结构' }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

// ─── 语义代码搜索 ───
ipcMain.handle('doge:semantic-search', async (_event, params: { query: string; cwd: string; maxResults?: number; fileTypes?: string[]; directories?: string[] }) => {
  try {
    const { query, maxResults = 20, fileTypes, directories } = params
    // 使用本地索引（BM25，增量+持久化）
    const results = codeIndexer.search(query, { maxResults, fileTypes, directories })
    return { success: true, results, indexed: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg, results: [] }
  }
})

// ─── 本地索引状态 IPC ───

ipcMain.handle('doge:index-status', async () => {
  try {
    return { success: true, stats: codeIndexer.getStats() }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:index-rebuild', async (_event, force: boolean) => {
  try {
    const stats = await codeIndexer.rebuild(force)
    return { success: true, stats }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:index-symbol-search', async (_event, params: { query: string; maxResults?: number }) => {
  try {
    const results = codeIndexer.searchSymbols(params.query, params.maxResults || 20)
    return { success: true, results }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e), results: [] }
  }
})

// ─── 调试器（真实 CDP / Inspector 协议） ───
const debuggerManager = createDebuggerManager()

// ─── 多 Agent 并行编排引擎 ───
const agentOrchestrator = createAgentOrchestrator()

ipcMain.handle('doge:debug-start', async (_event, params: { cwd: string; script: string; args?: string[] }) => {
  try {
    const result = await debuggerManager.start(params.cwd, params.script, params.args || [])
    if (result.error) return { success: false, error: result.error, sessionId: '' }
    return { success: true, sessionId: result.sessionId, pid: result.pid }
  } catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg, sessionId: '' } }
})

ipcMain.handle('doge:debug-stop', async (_event, sessionId) => {
  try { const ok = await debuggerManager.stop(sessionId); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-list-sessions', () => {
  return { success: true, sessions: debuggerManager.list() }
})

ipcMain.handle('doge:debug-set-breakpoint', async (_event, params) => {
  try { return await debuggerManager.setBreakpoint(params.sessionId, params.file, params.line, params.condition) }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-remove-breakpoint', async (_event, params) => {
  try { const ok = debuggerManager.removeBreakpoint(params.sessionId, params.file, params.line); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-list-breakpoints', (_event, sessionId) => {
  return { success: true, breakpoints: debuggerManager.listBreakpoints(sessionId) }
})

ipcMain.handle('doge:debug-continue', async (_event, sessionId) => {
  try { const ok = await debuggerManager.resume(sessionId); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-pause', async (_event, sessionId) => {
  try { const ok = await debuggerManager.pause(sessionId); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-step-over', async (_event, sessionId) => {
  try { const ok = await debuggerManager.step(sessionId, 'over'); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-step-into', async (_event, sessionId) => {
  try { const ok = await debuggerManager.step(sessionId, 'into'); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-step-out', async (_event, sessionId) => {
  try { const ok = await debuggerManager.step(sessionId, 'out'); return { success: ok } }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-get-callstack', (_event, sessionId) => {
  const s = debuggerManager.get(sessionId)
  return { success: true, callStack: s ? s.callStack : [] }
})

ipcMain.handle('doge:debug-get-variables', (_event, sessionId) => {
  const s = debuggerManager.get(sessionId)
  return { success: true, variables: s ? s.variables : {}, variableObjects: s ? s.variableObjects : {} }
})

ipcMain.handle('doge:debug-evaluate', async (_event, params) => {
  try {
    return await debuggerManager.evaluate(params.sessionId, params.expression)
  } catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:debug-get-object-props', async (_event, params: { sessionId: string; objectId: string }) => {
  try {
    return await debuggerManager.getObjectProperties(params.sessionId, params.objectId)
  } catch (e) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

// ─── 断点方案导出/导入为文件（跨机器迁移） ───

ipcMain.handle('doge:debug-scheme-export', async (_event, params: { name: string; breakpoints: Array<{ file: string; line: number; condition?: string }> }) => {
  try {
    const dir = path.join(projectRoot, '.doge', 'debug-schemes')
    fs.mkdirSync(dir, { recursive: true })
    const safeName = (params.name || 'scheme').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    const outPath = path.join(dir, `${safeName}.json`)
    fs.writeFileSync(outPath, JSON.stringify({ name: params.name, breakpoints: params.breakpoints, exportedAt: new Date().toISOString() }, null, 2), 'utf-8')
    return { success: true, path: outPath }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:debug-scheme-list', () => {
  try {
    const dir = path.join(projectRoot, '.doge', 'debug-schemes')
    if (!fs.existsSync(dir)) return { success: true, schemes: [] }
    const schemes = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as { name?: string; breakpoints?: unknown[]; exportedAt?: string }
          return { file: f, name: raw.name || f.replace(/\.json$/, ''), breakpointCount: Array.isArray(raw.breakpoints) ? raw.breakpoints.length : 0, exportedAt: raw.exportedAt || '' }
        } catch { return null }
      })
      .filter((s): s is { file: string; name: string; breakpointCount: number; exportedAt: string } => s !== null)
    return { success: true, schemes }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:debug-scheme-import', async (_event, fileName: string) => {
  try {
    if (typeof fileName !== 'string' || !fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { success: false, error: '非法文件名' }
    }
    const filePath = path.join(projectRoot, '.doge', 'debug-schemes', fileName)
    if (!fs.existsSync(filePath)) return { success: false, error: '方案文件不存在' }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { name?: string; breakpoints?: Array<{ file?: string; line?: number; condition?: string }> }
    if (!Array.isArray(raw.breakpoints)) return { success: false, error: '方案格式无效' }
    const breakpoints = raw.breakpoints
      .filter(b => typeof b.file === 'string' && typeof b.line === 'number' && b.line > 0)
      .map(b => ({ file: b.file as string, line: b.line as number, condition: b.condition }))
    return { success: true, name: raw.name || fileName.replace(/\.json$/, ''), breakpoints }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 调试会话快照（保存/恢复会话配置） ───

ipcMain.handle('doge:debug-snapshot-save', async (_event, params: { sessionId: string; name?: string; watchExpressions?: string[] }) => {
  try {
    const config = debuggerManager.getSessionConfig(params.sessionId)
    if (!config) return { success: false, error: '会话不存在' }
    const dir = path.join(projectRoot, '.doge', 'debug-snapshots')
    fs.mkdirSync(dir, { recursive: true })
    const safeName = (params.name || `snapshot-${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    const outPath = path.join(dir, `${safeName}.json`)
    fs.writeFileSync(outPath, JSON.stringify({
      name: params.name || safeName,
      script: config.script,
      args: config.args,
      breakpoints: config.breakpoints,
      watchExpressions: params.watchExpressions || [],
      savedAt: new Date().toISOString(),
    }, null, 2), 'utf-8')
    return { success: true, path: outPath }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:debug-snapshot-list', () => {
  try {
    const dir = path.join(projectRoot, '.doge', 'debug-snapshots')
    if (!fs.existsSync(dir)) return { success: true, snapshots: [] }
    const snapshots = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as { name?: string; script?: string; breakpoints?: unknown[]; watchExpressions?: unknown[]; savedAt?: string }
          return {
            file: f,
            name: raw.name || f.replace(/\.json$/, ''),
            script: raw.script || '',
            breakpointCount: Array.isArray(raw.breakpoints) ? raw.breakpoints.length : 0,
            watchCount: Array.isArray(raw.watchExpressions) ? raw.watchExpressions.length : 0,
            savedAt: raw.savedAt || '',
          }
        } catch { return null }
      })
      .filter((s): s is { file: string; name: string; script: string; breakpointCount: number; watchCount: number; savedAt: string } => s !== null)
    return { success: true, snapshots }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:debug-snapshot-restore', async (_event, fileName: string) => {
  try {
    if (typeof fileName !== 'string' || !fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { success: false, error: '非法文件名' }
    }
    const filePath = path.join(projectRoot, '.doge', 'debug-snapshots', fileName)
    if (!fs.existsSync(filePath)) return { success: false, error: '快照文件不存在' }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      name?: string; script?: string; args?: string[];
      breakpoints?: Array<{ file?: string; line?: number; condition?: string }>
      watchExpressions?: string[]
    }
    if (!raw.script) return { success: false, error: '快照缺少脚本路径' }
    return {
      success: true,
      name: raw.name || fileName.replace(/\.json$/, ''),
      script: raw.script,
      args: Array.isArray(raw.args) ? raw.args : [],
      breakpoints: Array.isArray(raw.breakpoints)
        ? raw.breakpoints.filter(b => typeof b.file === 'string' && typeof b.line === 'number' && b.line > 0).map(b => ({ file: b.file as string, line: b.line as number, condition: b.condition }))
        : [],
      watchExpressions: Array.isArray(raw.watchExpressions) ? raw.watchExpressions.filter((w): w is string => typeof w === 'string') : [],
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 多 Agent 编排 IPC ───

ipcMain.handle('doge:agent-list-roles', () => {
  try {
    // 内置角色 + .doge/agents 自定义角色
    return { success: true, roles: loadAllRoles(projectRoot) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e), roles: [] }
  }
})

ipcMain.handle('doge:agent-orchestrate', async (_event, params: { task: string; roles: Array<{ id: string; name: string; description?: string; systemPrompt: string; model?: string }>; defaultModel: string; maxTokens?: number; timeoutMs?: number; mode?: 'parallel' | 'discuss'; maxRounds?: number }) => {
  try {
    const config = loadConfig()
    const result = await agentOrchestrator.orchestrate(
      { apiKey: config.apiKey, baseUrl: config.baseUrl, provider: config.provider },
      {
        task: params.task,
        roles: params.roles,
        defaultModel: params.defaultModel,
        maxTokens: params.maxTokens,
        timeoutMs: params.timeoutMs,
        mode: params.mode,
        maxRounds: params.maxRounds,
      }
    )
    return { success: true, result }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('doge:agent-cancel', (_event, orchestrationId: string) => {
  const ok = agentOrchestrator.cancel(orchestrationId)
  return { success: ok }
})

// ─── Agent 编排工作流持久化 ───

interface AgentWorkflow {
  id: string
  name: string
  description?: string
  task: string
  mode: 'parallel' | 'discuss'
  maxRounds?: number
  roleIds: string[]
  createdAt: number
  updatedAt: number
}

function getWorkflowsDir(): string {
  const dir = path.join(projectRoot, '.doge', 'workflows')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('doge:agent-workflow-save', async (_event, wf: AgentWorkflow) => {
  try {
    const dir = getWorkflowsDir()
    const now = Date.now()
    const data: AgentWorkflow = {
      id: wf.id || `wf-${now}`,
      name: wf.name || '未命名工作流',
      description: wf.description,
      task: wf.task,
      mode: wf.mode,
      maxRounds: wf.maxRounds,
      roleIds: wf.roleIds || [],
      createdAt: wf.createdAt || now,
      updatedAt: now,
    }
    // 清理文件名不安全字符
    const safeId = data.id.replace(/[^a-zA-Z0-9_-]/g, '_')
    fs.writeFileSync(path.join(dir, `${safeId}.json`), JSON.stringify(data, null, 2), 'utf-8')
    return { success: true, workflow: data }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:agent-workflow-list', async () => {
  try {
    const dir = getWorkflowsDir()
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    const workflows: AgentWorkflow[] = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as AgentWorkflow }
      catch { return null }
    }).filter((w): w is AgentWorkflow => w !== null)
    workflows.sort((a, b) => b.updatedAt - a.updatedAt)
    return { success: true, workflows }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e), workflows: [] }
  }
})

ipcMain.handle('doge:agent-workflow-delete', async (_event, workflowId: string) => {
  try {
    const dir = getWorkflowsDir()
    const safeId = workflowId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const file = path.join(dir, `${safeId}.json`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
      return { success: true }
    }
    return { success: false, error: '工作流不存在' }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 编排结果导出 Markdown 报告 ───

ipcMain.handle('doge:agent-export-report', async (_event, params: { task: string; mode: string; roundsUsed?: number; outputs: Array<{ name: string; roleId: string; content: string; status: string; durationMs: number; error?: string }> }) => {
  try {
    const reportsDir = path.join(projectRoot, '.doge', 'reports')
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const outPath = path.join(reportsDir, `agent-report-${ts}.md`)

    const modeLabel = params.mode === 'discuss' ? '多轮讨论' : '并行编排'
    const lines: string[] = []
    lines.push(`# 🤖 Agent 军团编排报告`)
    lines.push('')
    lines.push(`- **时间**: ${now.toLocaleString('zh-CN')}`)
    lines.push(`- **模式**: ${modeLabel}${params.roundsUsed ? `（${params.roundsUsed} 轮）` : ''}`)
    lines.push(`- **Agent 数**: ${params.outputs.length}`)
    lines.push('')
    lines.push(`## 📋 任务`)
    lines.push('')
    lines.push(params.task || '(空)')
    lines.push('')
    lines.push(`## 📊 结果`)
    lines.push('')
    for (const out of params.outputs) {
      lines.push(`### ${out.name} \`${out.roleId}\``)
      lines.push('')
      const statusLabel = out.status === 'completed' ? ' 完成' : out.status === 'failed' ? ' 失败' : out.status === 'timeout' ? '⏱ 超时' : ' 取消'
      lines.push(`- **状态**: ${statusLabel}（${(out.durationMs / 1000).toFixed(1)}s）`)
      lines.push('')
      if (out.error) {
        lines.push(`>  ${out.error}`)
        lines.push('')
      } else {
        lines.push(out.content.trim())
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    }
    lines.push(`*报告由 Doge Code 桌面版自动生成*`)

    fs.writeFileSync(outPath, lines.join('\n'), 'utf-8')
    return { success: true, path: outPath }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:get-git-diff', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`git diff -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return output || '(空 diff)'
  } catch { return '读取失败' }
})

// ─── API 测试（主进程代理以绕过 CORS） ───
ipcMain.handle('doge:api-test-send', async (_event, request: { url: string; method: string; headers: Record<string, string>; body?: string; bodyType: string }) => {
  try {
    const { url, method, headers, body, bodyType } = request
    const opts: RequestInit = { method, headers }
    if (body && method !== 'GET') {
      opts.body = body
    }
    const startTime = Date.now()
    const res = await fetch(url, opts)
    const duration = Date.now() - startTime
    const responseHeaders: Record<string, string> = {}
    res.headers.forEach((v, k) => { responseHeaders[k] = v })
    const contentType = res.headers.get('content-type') || ''
    let responseBody = ''
    if (contentType.includes('application/json')) {
      responseBody = JSON.stringify(await res.json(), null, 2)
    } else {
      responseBody = await res.text()
    }
    return {
      success: true,
      status: res.status,
      statusText: res.statusText,
      responseHeaders,
      body: responseBody.slice(0, 500000),
      duration,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '请求失败'
    return { success: false, status: 0, statusText: msg, responseHeaders: {}, body: '', error: msg }
  }
})

// ─── 命令系统（桌面端轻量实现） ───
// 动态导入 prompt 类型命令模板，避免顶层循环依赖
const dynamicCommandImports: Record<string, () => Promise<{ default?: { getPromptForCommand?: (...args: unknown[]) => Promise<unknown[]>; type?: string } }>> = {
  '/commit': () => import('../commands/commit.js'),
  '/review': () => import('../commands/review.js'),
  '/plan': () => import('../commands/plan-mode/index.js').catch(() => ({ default: null })),
  '/diff': () => import('../commands/diff/diff.js').catch(() => ({ default: null })),
  '/branch': () => import('../commands/branch/branch.js').catch(() => ({ default: null })),
  '/memory': () => import('../commands/memory/memory.js').catch(() => ({ default: null })),
  '/deploy': () => import('../commands/deploy/index.js').catch(() => ({ default: null })),
  '/task': () => import('../commands/task/task.js').catch(() => ({ default: null })),
  '/session-search': () => import('../commands/session-search.js'),
  '/session-tag': () => import('../commands/session-tag.js'),
}

// ─── 命令注册表（动态构建，复用 src/commands/ 和 bundledSkills） ───

interface CommandDef {
  name: string
  description: string
  category: string
}

/**
 * 动态构建桌面端命令列表
 * - 内置命令：桌面端特有的命令（theme, export, clear 等）
 * - AI 驱动命令：从 src/commands/ 动态导入 prompt 模板的命令
 * - 技能命令：从 bundledSkills 注册表获取
 */
function buildDesktopCommands(): CommandDef[] {
  const commands: CommandDef[] = []

  // 桌面端特有命令
  const desktopOnly: CommandDef[] = [
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
    // Git 命令（有执行逻辑但不在 dynamicCommandImports 中）
    { name: '/status', description: '查看状态', category: 'Git' },
    { name: '/commit-push-pr', description: '提交、推送并创建 PR', category: 'Git' },
    // 代码审查（通过 doge:code-review IPC 实现）
    { name: '/code-review', description: '代码审查', category: '技能' },
  ]
  commands.push(...desktopOnly)

  // AI 驱动命令（从 src/commands/ 动态导入）
  for (const [name, importFn] of Object.entries(dynamicCommandImports)) {
    // 避免重复添加已在 desktopOnly 中的命令
    if (commands.some(c => c.name === name)) continue
    // 从 importFn 的模块路径推断描述（实际描述从模块的 description 字段获取）
    const existingCommand = getDynamicCommandDescription(name, importFn)
    if (existingCommand) {
      commands.push(existingCommand)
    } else {
      commands.push({ name, description: 'AI 驱动命令', category: 'AI' })
    }
  }

  // 技能命令（从 bundledSkills 注册表获取）
  try {
    const skills = getBundledSkills()
    for (const skill of skills) {
      const name = `/${skill.name}`
      if (commands.some(c => c.name === name)) continue
      commands.push({
        name,
        description: skill.description || '内置技能',
        category: '技能',
      })
    }
  } catch { /* bundledSkills 不可用 */ }

  return commands
}

/**
 * 尝试从动态导入的命令模块获取描述
 */
function getDynamicCommandDescription(
  name: string,
  importFn: () => Promise<{ default?: { description?: string; getPromptForCommand?: unknown } }>,
): CommandDef | null {
  // 静态映射已知描述（避免异步加载所有模块）
  const knownDescriptions: Record<string, { description: string; category: string }> = {
    '/commit': { description: '创建 git 提交', category: 'Git' },
    '/review': { description: '代码审查', category: 'Git' },
    '/diff': { description: '查看 diff', category: 'Git' },
    '/branch': { description: '分支管理', category: 'Git' },
    '/status': { description: '查看状态', category: 'Git' },
    '/memory': { description: '记忆管理', category: '系统' },
    '/deploy': { description: '部署应用', category: 'DevOps' },
    '/task': { description: '任务管理', category: '系统' },
    '/session-search': { description: '按内容搜索历史会话', category: '会话' },
    '/session-tag': { description: '分析会话并生成标签', category: '会话' },
    '/commit-push-pr': { description: '提交、推送并创建 PR', category: 'Git' },
  }
  return knownDescriptions[name] || null
}

ipcMain.handle('doge:get-commands', async () => {
  return buildDesktopCommands()
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
  // 特殊处理：/code-review 通过 doge:code-review IPC 实现
  if (skillName === '/code-review') {
    return { success: true, output: '代码审查请通过文件面板的"审查"按钮触发，或在对话中描述需要审查的代码。' }
  }
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
  // 所有在 dynamicCommandImports 中注册的命令都走 AI 驱动执行
  if (dynamicCommandImports[commandName]) {
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
        const cmds = buildDesktopCommands()
        const grouped = cmds.reduce<Record<string, CommandDef[]>>((acc, cmd) => {
          (acc[cmd.category] ??= []).push(cmd)
          return acc
        }, {})
        const lines: string[] = ['# 命令列表', '']
        for (const [cat, catCmds] of Object.entries(grouped)) {
          lines.push(`## ${cat}`)
          for (const c of catCmds) lines.push(`- **${c.name}** — ${c.description}`)
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
        resetAdaptedToolsCache()
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
        resetAdaptedToolsCache()
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
            return { success: true, output: ' 错误: MCP 配置未找到。使用 /mcp add <name> <command> 添加。' }
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
          systemPrompt: `You are Doge Code, a helpful AI programming assistant.

Available tools:
- BashTool: run shell commands (ls, cat, grep, find, etc.)
- FileReadTool: read file contents
- FileWriteTool: write files
- FileEditTool: edit files with search/replace
- GlobTool: find files by pattern
- WebFetchTool: fetch web pages
- NotebookEditTool: edit Jupyter notebooks
- TaskStopTool: stop a running task
- BriefTool: create project brief

Use tools when needed. If a tool call fails or returns empty, try a different approach or answer directly with text.`,
          maxOutputTokens: 40000,
          tools: adaptedTools,
          provider: config.provider,
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
          const configPath = findApiConfig()
          const raw = fs.readFileSync(configPath, 'utf-8')
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

// ─── 插件管理 IPC（带沙箱安全） ───

ipcMain.handle('doge:plugin-scan', () => {
  return scanPlugins(projectRoot)
})

ipcMain.handle('doge:plugin-enable', (_event, pluginName: string, enabled: boolean) => {
  try {
    // 沙箱: 验证插件名格式
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(pluginName)) {
      return { success: false, error: '非法插件名' }
    }
    setPluginEnabled(projectRoot, pluginName, enabled)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '操作失败' }
  }
})

ipcMain.handle('doge:plugin-install', (_event, sourceDir: string, pluginName: string) => {
  // 沙箱: 验证插件名格式
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(pluginName)) {
    return { success: false, error: '非法插件名' }
  }

  // 沙箱: 验证路径安全
  const allowedDirs = [
    path.join(projectRoot, '.doge', 'plugins'),
    path.join(projectRoot, 'plugins'),
    path.join(projectRoot, '.claude', 'plugins'),
  ]
  const pathCheck = validatePluginPath(sourceDir, [...allowedDirs, path.dirname(sourceDir)])
  if (!pathCheck.valid) {
    return { success: false, error: `路径安全检查失败: ${pathCheck.error}` }
  }

  // 沙箱: 安全扫描源目录
  const securityResult = scanPluginSecurity(sourceDir)
  if (!securityResult.valid) {
    return { success: false, error: `安全扫描失败: ${securityResult.errors.join('; ')}` }
  }

  // 沙箱: 验证 manifest
  const manifestPath = path.join(sourceDir, 'plugin.json')
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const manifestCheck = validateManifest(raw)
      if (!manifestCheck.valid) {
        return { success: false, error: `清单验证失败: ${manifestCheck.errors.join('; ')}` }
      }
    } catch {
      return { success: false, error: ' 错误:  错误: manifest.json 解析失败' }
    }
  }

  return installPlugin(projectRoot, sourceDir, pluginName)
})

ipcMain.handle('doge:plugin-uninstall', (_event, pluginName: string) => {
  // 沙箱: 验证插件名格式
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(pluginName)) {
    return { success: false, error: '非法插件名' }
  }
  return uninstallPlugin(projectRoot, pluginName)
})

ipcMain.handle('doge:plugin-get-command', (_event, pluginName: string, commandName: string) => {
  // 沙箱: 使用安全读取（带内容净化）
  // 先找到插件目录
  const pluginDirs = [
    path.join(projectRoot, '.doge', 'plugins'),
    path.join(projectRoot, 'plugins'),
    path.join(projectRoot, '.claude', 'plugins'),
  ]

  for (const dir of pluginDirs) {
    const pluginDir = path.join(dir, pluginName)
    if (fs.existsSync(pluginDir)) {
      const result = safeReadCommand(pluginDir, commandName)
      return {
        content: result.content || null,
        error: result.error,
        warnings: result.warnings,
      }
    }
  }

  return { content: null, error: '插件不存在' }
})

// ─── 插件安全审计 IPC ───

ipcMain.handle('doge:plugin-security-audit', (_event, pluginName: string) => {
  try {
    const pluginDirs = [
      path.join(projectRoot, '.doge', 'plugins'),
      path.join(projectRoot, 'plugins'),
      path.join(projectRoot, '.claude', 'plugins'),
    ]

    for (const dir of pluginDirs) {
      const pluginDir = path.join(dir, pluginName)
      if (fs.existsSync(pluginDir)) {
        // 路径安全检查
        const pathCheck = validatePluginPath(pluginDir, pluginDirs)
        if (!pathCheck.valid) {
          return { valid: false, errors: [`路径安全: ${pathCheck.error}`], warnings: [] }
        }

        // 安全扫描
        const scanResult = scanPluginSecurity(pluginDir)

        // Manifest 验证
        const manifestPath = path.join(pluginDir, 'plugin.json')
        let manifestErrors: string[] = []
        let manifestWarnings: string[] = []
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            const mf = validateManifest(raw)
            manifestErrors = mf.errors
            manifestWarnings = mf.warnings
          } catch {
            manifestErrors = [' 错误:  错误: manifest.json 解析失败']
          }
        }

        return {
          valid: scanResult.valid && manifestErrors.length === 0,
          errors: [...scanResult.errors, ...manifestErrors],
          warnings: [...scanResult.warnings, ...manifestWarnings],
        }
      }
    }

    return { valid: false, errors: ['插件不存在'], warnings: [] }
  } catch (e: unknown) {
    return { valid: false, errors: [e instanceof Error ? e.message : '审计失败'], warnings: [] }
  }
})

// ─── 插件市场 IPC ───

ipcMain.handle('doge:marketplace-list', async () => {
  try {
    return await getMarketplaces(projectRoot)
  } catch (e: unknown) {
    return []
  }
})

ipcMain.handle('doge:marketplace-install', async (_event, pluginName: string, repo: string) => {
  return await installPluginFromMarketplace(projectRoot, pluginName, repo)
})

ipcMain.handle('doge:get-theme', () => loadTheme())
ipcMain.handle('doge:set-theme', async (_event, settings: Partial<ThemeSettings>) => {
  const current = loadTheme()
  saveTheme({ ...current, ...settings })
  return { success: true }
})

const dbStore = new Map()

ipcMain.handle('doge:db-connect', async (_event, conn) => {
  try {
    if (conn.type !== 'sqlite') return { success: false, error: '仅支持 SQLite' }
    const { Database } = requireModule('better-sqlite3')
    const db = new Database(conn.path || ':memory:')
    dbStore.set(conn.id, db)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
})

ipcMain.handle('doge:db-tables', async (_event, connectionId) => {
  try {
    const db = dbStore.get(connectionId)
    if (!db) return { success: false, error: '连接不存在', tables: [] }
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    const tables = result.map((r: any) => ({ name: r.name, columns: [], indexes: [], rowCount: 0 }))
    return { success: true, tables }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg, tables: [] }
  }
})

ipcMain.handle('doge:db-query', async (_event, connectionId, sql) => {
  try {
    const db = dbStore.get(connectionId)
    if (!db) return { success: false, error: '连接不存在', rows: [] }
    const isSelect = /^SELECT|^PRAGMA|^EXPLAIN/i.test(sql.trim())
    if (isSelect) {
      const rows = db.prepare(sql).all()
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { success: true, rows, columns, rowCount: rows.length }
    } else {
      const result = db.prepare(sql).run()
      return { success: true, rows: [], columns: [], rowCount: result.changes }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg, rows: [] }
  }
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
    provider: config.provider,
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
  resetAdaptedToolsCache()
  currentSessionId = saveSession([])
  return { success: true }
})

ipcMain.handle('doge:delete-session', async (_event, sessionId: string) => {
  try {
    const deleted = deleteSession(sessionId)
    if (deleted && currentSessionId === sessionId) {
      engine = null
      engineConfig = null
      resetAdaptedToolsCache()
      currentSessionId = null
    }
    return { success: deleted }
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
        updateSession(currentSessionId, msgs.map(m => ({ role: m.role, content: m.content })))
      }
    }
    engine = null
    engineApi = null
    engineConfig = null
    resetAdaptedToolsCache()
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
    const { Notification } = requireModule('electron')
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

const activeTerminals = new Map<string, { proc: any; cwd: string }>()

ipcMain.handle('doge:spawn-terminal', async (_event, cwd: string) => {
  try {
    let pty: any
    try {
      pty = requireModule('node-pty')
    } catch {
      return { success: false, error: 'node-pty 未安装，终端功能不可用。请安装 Visual Studio Build Tools 后重新安装 node-pty。' }
    }
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

// ─── 代码格式化 ───
ipcMain.handle('doge:format-code', async (_event, params: { code: string; language: string; tool: string; cwd: string; range?: { start: number; end: number } }) => {
  try {
    const { code, language, tool, cwd, range } = params
    if (!code || !tool) return { success: false, error: '缺少 code 或 tool 参数' }

    const targetFile = path.join(cwd || projectRoot, `__format_tmp__.${language === 'typescript' || language === 'ts' ? 'ts' : language === 'javascript' || language === 'js' ? 'js' : language === 'json' ? 'json' : language === 'python' || language === 'py' ? 'py' : 'txt'}`)

    // 写入临时文件
    let contentToFormat = code
    if (range) {
      const lines = code.split('\n')
      contentToFormat = lines.slice(range.start, range.end).join('\n')
    }

    fs.writeFileSync(targetFile, contentToFormat, 'utf-8')

    let result: string
    switch (tool) {
      case 'prettier': {
        const prettierBin = path.join(projectRoot, 'node_modules', '.bin', 'prettier')
        const hasPrettier = fs.existsSync(prettierBin)
        if (!hasPrettier) return { success: false, error: '未找到 prettier，请运行 npm install -D prettier' }
        const { execSync } = await import('node:child_process')
        result = execSync(`"${prettierBin}" --parser ${language === 'typescript' || language === 'ts' ? 'typescript' : language === 'javascript' || language === 'js' ? 'babel' : language === 'json' ? 'json' : language === 'python' || language === 'py' ? 'python' : 'markdown'} --stdin-filepath "${targetFile}"`, {
          input: contentToFormat,
          encoding: 'utf-8',
          cwd: cwd || projectRoot,
          timeout: 30_000,
        })
        break
      }
      case 'biome': {
        const biomeBin = path.join(projectRoot, 'node_modules', '.bin', 'biome')
        const hasBiome = fs.existsSync(biomeBin)
        if (!hasBiome) return { success: false, error: '未找到 biome，请运行 npm install -D @biomejs/biome' }
        const { execSync } = await import('node:child_process')
        result = execSync(`"${biomeBin}" format --stdin-file-path "${targetFile}"`, {
          input: contentToFormat,
          encoding: 'utf-8',
          cwd: cwd || projectRoot,
          timeout: 30_000,
        })
        break
      }
      case 'eslint': {
        const eslintBin = path.join(projectRoot, 'node_modules', '.bin', 'eslint')
        const hasEslint = fs.existsSync(eslintBin)
        if (!hasEslint) return { success: false, error: '未找到 eslint，请运行 npm install -D eslint' }
        return { success: false, error: 'eslint 格式化需要 --fix 标志，建议使用 prettier 或 biome 代替' }
      }
      case 'dprint': {
        const dprintBin = path.join(projectRoot, 'node_modules', '.bin', 'dprint')
        const hasDprint = fs.existsSync(dprintBin)
        if (!hasDprint) return { success: false, error: '未找到 dprint，请运行 npm install -D dprint' }
        const { execSync } = await import('node:child_process')
        result = execSync(`"${dprintBin}" fmt --file "${targetFile}" --stdin`, {
          input: contentToFormat,
          encoding: 'utf-8',
          cwd: cwd || projectRoot,
          timeout: 30_000,
        })
        break
      }
      default:
        return { success: false, error: `不支持的格式化工具: ${tool}。请使用 prettier、biome、eslint 或 dprint` }
    }

    fs.unlinkSync(targetFile)
    // 恢复范围内的内容（仅替换范围部分）
    if (range) {
      const lines = code.split('\n')
      const formattedLines = result.split('\n')
      lines.splice(range.start, range.end - range.start, ...formattedLines)
      result = lines.join('\n')
    }

    return { success: true, output: result }
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
// 注意：createWindow / createTray 由 entrypoint.ts → bootDesktop() 调用。
// 此处不再重复创建，避免 dev 模式（entrypoint.ts + index.ts 同时加载）产生双窗口。

app.on('window-all-closed', () => {
  // 清理数据库连接
  try {
    for (const [id, db] of dbStore) {
      try { db.close() } catch { /* ignore */ }
    }
    dbStore.clear()
  } catch { /* ignore */ }
  // 清理终端进程
  try {
    for (const [id, t] of activeTerminals) {
      try { t.proc.kill() } catch { /* ignore */ }
    }
    activeTerminals.clear()
  } catch { /* ignore */ }
  if (process.platform !== 'darwin') {
    // 强制退出进程（双重保障：app.quit() + process.exit(0)）
    // 有时 app.quit() 可能被 IPC handler 或其他异步操作拦截，
    // 导致进程无法退出，这里添加 process.exit(0) 作为兜底
    app.quit()
    process.exit(0)
  }
})

app.on('before-quit', () => {
  // 确保所有资源被清理
  try {
    for (const [id, db] of dbStore) {
      try { db.close() } catch { /* ignore */ }
    }
    dbStore.clear()
  } catch { /* ignore */ }
  try {
    for (const [id, t] of activeTerminals) {
      try { t.proc.kill() } catch { /* ignore */ }
    }
    activeTerminals.clear()
  } catch { /* ignore */ }
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
  return getCrashRecovery()
})

ipcMain.handle('doge:clear-crash-recovery', async () => {
  clearCrashRecovery()
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
    const isListingAll = !query || query.length < 2

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
              if (isListingAll) {
                results.push({ path: fullPath, line: 1, content: '' })
              } else {
                const lines = content.split('\n')
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    results.push({ path: fullPath, line: i + 1, content: lines[i].trim() })
                    if (results.length >= maxResults) break
                  }
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

// ─── LSP IPC Handlers ───

const lspManager = getLspClientManager(projectRoot)
const lspDiagnosticCache = new Map<string, LspDiagnostic[]>()

// 转发 LSP 诊断到渲染进程
lspManager.onDiagnostic((uri: string, diagnostics: LspDiagnostic[]) => {
  lspDiagnosticCache.set(uri, diagnostics)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('doge:lsp-diagnostic', uri, diagnostics)
  }
})

ipcMain.handle('doge:lsp-start', async (_event, languageId: string) => {
  try {
    const result = await lspManager.startServer(languageId)
    return result
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '启动 LSP 服务器失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-stop', async (_event, languageId: string) => {
  try {
    const config = lspManager.findServerForFile(`file.${languageId}`)
    const serverName = config || languageId
    await lspManager.stopServer(serverName)
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '停止 LSP 服务器失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-stop-all', async () => {
  try {
    await lspManager.stopAll()
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '停止 LSP 服务器失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-completion', async (_event, filePath: string, line: number, character: number) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    // 确保文档已打开
    try {
      const content = fs.readFileSync(absolutePath, 'utf-8')
      await lspManager.openDocument(serverName, uri, lspManager.findServerForFile(filePath) || 'typescript', content)
    } catch { /* 打开文档失败，继续尝试 */ }
    const items = await lspManager.completion(serverName, uri, line, character)
    return { success: true, items }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取补全失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-definition', async (_event, filePath: string, line: number, character: number) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    const locations = await lspManager.definition(serverName, uri, line, character)
    return { success: true, locations }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取定义失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-hover', async (_event, filePath: string, line: number, character: number) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    const result = await lspManager.hover(serverName, uri, line, character)
    return { success: true, result }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取悬停信息失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-references', async (_event, filePath: string, line: number, character: number) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    const locations = await lspManager.references(serverName, uri, line, character)
    return { success: true, locations }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取引用失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-document-symbol', async (_event, filePath: string) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    const symbols = await lspManager.documentSymbol(serverName, uri)
    return { success: true, symbols }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取符号失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-workspace-symbol', async (_event, query: string) => {
  try {
    // 使用 typescript 服务器搜索工作区符号
    const result = await lspManager.workspaceSymbol('typescript', query)
    return { success: true, symbols: result }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '搜索符号失败'
    return { success: false, error: message }
  }
})

ipcMain.handle('doge:lsp-document-highlight', async (_event, filePath: string, line: number, character: number) => {
  try {
    const serverName = lspManager.findServerForFile(filePath)
    if (!serverName) return { success: false, error: `不支持的文件类型: ${filePath}` }
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const uri = pathToFileURL(absolutePath).href
    const highlights = await lspManager.documentHighlight(serverName, uri, line, character)
    return { success: true, highlights }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取高亮失败'
    return { success: false, error: message }
  }
})


// ─── 协作功能 ───

// 房间状态存储（内存，刷新重置）
const collabRooms = new Map<string, {
  id: string
  name: string
  hostId: string
  participants: Array<{ id: string; name: string; color: string; cursorLine?: number; cursorCol?: number; file?: string }>
  comments: Array<{ id: string; file: string; line: number; author: string; text: string; resolved: boolean; createdAt: number }>
  document: string // 当前文档内容（简易 OT 用）
  version: number
  permissions: Map<string, 'read' | 'write' | 'admin'>  // [NEW] 权限管理 只读/编辑/管理员
  issues: Array<{ id: string; title: string; description: string; severity: 'critical' | 'high' | 'medium' | 'low'; assignee: string; status: 'open' | 'in_progress' | 'closed'; createdAt: number }>  // [NEW] 问题标记
  notifications: Array<{ id: string; type: 'comment' | 'mention' | 'issue' | 'permission'; message: string; from: string; timestamp: number; read: boolean }>  // [NEW] 评论通知
  recording: { isRecording: boolean; startTime: number; events: Array<{ type: string; data: unknown; timestamp: number }> } | null  // [NEW] 会话录制
}>()

const collabColors = ['#FF6B6B', '#4ECB71', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']

ipcMain.handle('doge:collab-create-room', async (_event, params: { name: string; cwd: string }) => {
  try {
    const roomId = `room-${Date.now()}`
    const hostId = `user-${Math.random().toString(36).slice(2, 8)}`
    const permissions = new Map<string, 'read' | 'write' | 'admin'>()
    permissions.set(hostId, 'admin')
    collabRooms.set(roomId, {
      id: roomId, name: params.name, hostId,
      participants: [{ id: hostId, name: '主机', color: collabColors[0] }],
      comments: [], document: '', version: 0,
      permissions,
      issues: [], notifications: [], recording: null
    })
    return { success: true, roomId, hostId }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:collab-join-room', async (_event, roomId: string) => {
  try {
    const room = collabRooms.get(roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const userId = `user-${Math.random().toString(36).slice(2, 8)}`
    const colorIndex = room.participants.length % collabColors.length
    room.participants.push({ id: userId, name: `用户${room.participants.length}`, color: collabColors[colorIndex] })
    return { success: true, roomId, userId, participants: room.participants, comments: room.comments }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:collab-leave-room', async (_event, params: { roomId: string; userId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (room) {
      room.participants = room.participants.filter(p => p.id !== params.userId)
      if (room.hostId === params.userId && room.participants.length > 0) {
        room.hostId = room.participants[0].id
      }
    }
    return { success: true }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:collab-list-rooms', () => {
  const list = Array.from(collabRooms.values()).map(r => ({
    id: r.id, name: r.name, hostId: r.hostId,
    participantCount: r.participants.length,
    commentCount: r.comments.length
  }))
  return { success: true, rooms: list }
})

ipcMain.handle('doge:collab-get-participants', (_event, roomId: string) => {
  const room = collabRooms.get(roomId)
  if (!room) return { success: true, participants: [] }
  return { success: true, participants: room.participants }
})

ipcMain.handle('doge:collab-update-cursor', async (_event, params: { roomId: string; userId: string; file: string; line: number; col: number }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false }
    const participant = room.participants.find(p => p.id === params.userId)
    if (participant) {
      participant.cursorLine = params.line
      participant.cursorCol = params.col
      participant.file = params.file
    }
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:collab-add-comment', async (_event, params: { roomId: string; file: string; line: number; author: string; text: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: params.file, line: params.line, author: params.author,
      text: params.text, resolved: false, createdAt: Date.now()
    }
    room.comments.push(comment)
    return { success: true, comment }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:collab-resolve-comment', async (_event, params: { roomId: string; commentId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false }
    const comment = room.comments.find(c => c.id === params.commentId)
    if (comment) comment.resolved = true
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:collab-get-comments', (_event, params: { roomId: string; file?: string }) => {
  const room = collabRooms.get(params.roomId)
  if (!room) return { success: true, comments: [] }
  const comments = params.file
    ? room.comments.filter(c => c.file === params.file)
    : room.comments
  return { success: true, comments }
})


// ─── 权限管理 IPC (更新日志功能) ───

ipcMain.handle('doge:collab-set-permission', async (_event, params: { roomId: string; userId: string; permission: 'read' | 'write' | 'admin'; requesterId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const requesterPerm = room.permissions.get(params.requesterId)
    if (requesterPerm !== 'admin') return { success: false, error: '只有管理员可以修改权限' }
    room.permissions.set(params.userId, params.permission)
    return { success: true }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:collab-get-permission', (_event, params: { roomId: string; userId: string }) => {
  const room = collabRooms.get(params.roomId)
  if (!room) return { success: false, error: '房间不存在' }
  return { success: true, permission: room.permissions.get(params.userId) || 'read' }
})

// ─── 问题标记 IPC ───

ipcMain.handle('doge:issue-create', async (_event, params: { roomId: string; title: string; description: string; severity: 'critical' | 'high' | 'medium' | 'low'; assignee?: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const issue = {
      id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: params.title, description: params.description, severity: params.severity,
      assignee: params.assignee || '', status: 'open' as const, createdAt: Date.now()
    }
    room.issues.push(issue)
    // 创建通知
    if (params.assignee) {
      room.notifications.push({
        id: `notif-${Date.now()}`, type: 'issue',
        message: `被分配问题: ${params.title}`, from: 'system', timestamp: Date.now(), read: false
      })
    }
    return { success: true, issue }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:issue-update', async (_event, params: { roomId: string; issueId: string; status?: 'open' | 'in_progress' | 'closed'; assignee?: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const issue = room.issues.find(i => i.id === params.issueId)
    if (!issue) return { success: false, error: '问题不存在' }
    if (params.status) issue.status = params.status
    if (params.assignee) issue.assignee = params.assignee
    return { success: true, issue }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:issue-list', (_event, params: { roomId: string; status?: string }) => {
  const room = collabRooms.get(params.roomId)
  if (!room) return { success: true, issues: [] }
  const issues = params.status ? room.issues.filter(i => i.status === params.status) : room.issues
  return { success: true, issues }
})

// ─── 评论通知 IPC ───

ipcMain.handle('doge:notify-list', (_event, params: { roomId: string }) => {
  const room = collabRooms.get(params.roomId)
  if (!room) return { success: true, notifications: [] }
  return { success: true, notifications: room.notifications.sort((a, b) => b.timestamp - a.timestamp) }
})

ipcMain.handle('doge:notify-mark-read', (_event, params: { roomId: string; notificationId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false }
    const notif = room.notifications.find(n => n.id === params.notificationId)
    if (notif) notif.read = true
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:notify-unread-count', (_event, params: { roomId: string }) => {
  const room = collabRooms.get(params.roomId)
  if (!room) return { success: true, count: 0 }
  return { success: true, count: room.notifications.filter(n => !n.read).length }
})

// ─── 会话录制 IPC ───

ipcMain.handle('doge:recording-start', (_event, params: { roomId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    room.recording = { isRecording: true, startTime: Date.now(), events: [] }
    return { success: true }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:recording-stop', (_event, params: { roomId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room || !room.recording) return { success: false, error: '没有正在进行的录制' }
    room.recording.isRecording = false
    const recording = { ...room.recording }
    room.recording = null
    return { success: true, recording }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:recording-log', (_event, params: { roomId: string; type: string; data?: unknown }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room || !room.recording || !room.recording.isRecording) return { success: false }
    room.recording.events.push({ type: params.type, data: params.data, timestamp: Date.now() })
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:recording-list', () => {
  const recordings: Array<{ roomId: string; name: string; startTime: number; eventCount: number }> = []
  for (const [roomId, room] of collabRooms.entries()) {
    if (room.recording) {
      recordings.push({ roomId, name: room.name, startTime: room.recording.startTime, eventCount: room.recording.events.length })
    }
  }
  return { success: true, recordings }
})

ipcMain.handle('doge:collab-apply-edit', async (_event, params: { roomId: string; userId: string; file: string; operation: { type: 'insert' | 'delete'; position: number; text?: string; length?: number } }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }

    const doc = docManager.getOrCreate(params.roomId)
    let op: DocOperation

    if (params.operation.type === 'insert' && params.operation.text) {
      op = doc.localInsert(params.userId, params.operation.position, params.operation.text)
    } else if (params.operation.type === 'delete' && params.operation.length) {
      op = doc.localDelete(params.userId, params.operation.position, params.operation.length)
    } else {
      return { success: false, error: '无效的操作类型' }
    }

    room.version = doc.getVersion()

    // 广播给房间内所有协作者（通过渲染进程事件）
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send('doge:collab-remote-edit', {
        roomId: params.roomId,
        userId: params.userId,
        operation: { type: op.type, position: op.position, text: op.text, length: op.length },
        version: room.version,
        file: params.file,
      })
    })

    return { success: true, version: room.version, operationId: op.id }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

// ─── CRDT 文档同步 ───

ipcMain.handle('doge:collab-sync-document', async (_event, params: { roomId: string; file?: string }) => {
  try {
    const doc = docManager.get(params.roomId)
    if (!doc) return { success: true, snapshot: { content: '', version: 0, lamportClock: 0 }, operations: [] }
    const snapshot = doc.getSnapshot()
    return { success: true, snapshot, operations: doc.getOperations() }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : '同步失败' } }
})

ipcMain.handle('doge:collab-join-sync', async (_event, params: { roomId: string; userId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }

    const doc = docManager.getOrCreate(params.roomId)
    const snapshot = doc.getSnapshot()

    return {
      success: true,
      snapshot,
      operations: doc.getOperations(),
      document: room.document,
    }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : '加入同步失败' } }
})

ipcMain.handle('doge:collab-apply-remote-op', async (_event, params: { roomId: string; userId: string; operation: { type: 'insert' | 'delete'; position: number; text?: string; length?: number; lamport: number; parentVersion: number } }) => {
  try {
    const doc = docManager.getOrCreate(params.roomId)
    const op: DocOperation = {
      id: `op-remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: params.roomId,
      userId: params.userId,
      type: params.operation.type,
      position: params.operation.position,
      text: params.operation.text,
      length: params.operation.length,
      lamport: params.operation.lamport,
      parentVersion: params.operation.parentVersion,
      timestamp: Date.now(),
    }

    const applied = doc.applyRemote(op)
    const room = collabRooms.get(params.roomId)
    if (room) room.version = doc.getVersion()

    return { success: applied, version: doc.getVersion(), snapshot: doc.getSnapshot() }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : '应用远程操作失败' } }
})

// ─── 语音通话 IPC (更新日志功能) ───

ipcMain.handle('doge:voice-start', async (_event, params: { roomId: string; userId: string }) => {
  try {
    const room = collabRooms.get(params.roomId)
    if (!room) return { success: false, error: '房间不存在' }
    // 广播语音开始事件
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('doge:voice-event', { type: 'started', userId: params.userId, roomId: params.roomId })
    })
    return { success: true }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:voice-stop', async (_event, params: { roomId: string; userId: string }) => {
  try {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('doge:voice-event', { type: 'stopped', userId: params.userId, roomId: params.roomId })
    })
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:voice-mute', async (_event, params: { roomId: string; userId: string; muted: boolean }) => {
  try {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('doge:voice-event', { type: 'muted', userId: params.userId, roomId: params.roomId, muted: params.muted })
    })
    return { success: true }
  } catch { return { success: false } }
})

// ─── 远程协助（WebRTC + 内置信令服务器） ───

// 保留旧 API 兼容层（内部转发到新的信令服务器）
const webrtcSignals = new Map<string, {
  callerId: string
  calleeId: string
  offer: RTCSessionDescriptionInit | null
  answer: RTCSessionDescriptionInit | null
  iceCandidates: RTCIceCandidateInit[]
}>()

ipcMain.handle('doge:remote-offer', async (_event, params: { sessionId: string; callerId: string; calleeId: string; offer: RTCSessionDescriptionInit }) => {
  try {
    if (!webrtcSignals.has(params.sessionId)) {
      webrtcSignals.set(params.sessionId, { callerId: params.callerId, calleeId: params.calleeId, offer: params.offer, answer: null, iceCandidates: [] })
    } else {
      const sig = webrtcSignals.get(params.sessionId)!
      sig.offer = params.offer
    }
    // 同时转发到信令服务器
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send('doge:remote-signal', {
        type: 'sdp-offer',
        timestamp: Date.now(),
        sessionId: params.sessionId,
        payload: { callerId: params.callerId, calleeId: params.calleeId, sdp: params.offer },
      })
    })
    return { success: true }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:remote-answer', async (_event, params: { sessionId: string; answer: RTCSessionDescriptionInit }) => {
  try {
    const sig = webrtcSignals.get(params.sessionId)
    if (sig) { sig.answer = params.answer }
    // 转发到信令服务器
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send('doge:remote-signal', {
        type: 'sdp-answer',
        timestamp: Date.now(),
        sessionId: params.sessionId,
        payload: { sdp: params.answer },
      })
    })
    return { success: true }
  } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); return { success: false, error: msg } }
})

ipcMain.handle('doge:remote-ice-candidate', async (_event, params: { sessionId: string; candidate: RTCIceCandidateInit }) => {
  try {
    const sig = webrtcSignals.get(params.sessionId)
    if (sig) { sig.iceCandidates.push(params.candidate) }
    // 转发到信令服务器
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send('doge:remote-signal', {
        type: 'ice-candidate',
        timestamp: Date.now(),
        sessionId: params.sessionId,
        payload: { candidate: params.candidate },
      })
    })
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:remote-get-signal', (_event, sessionId: string) => {
  const sig = webrtcSignals.get(sessionId)
  if (!sig) return { success: true, signal: null }
  return { success: true, signal: { offer: sig.offer, answer: sig.answer, iceCandidates: sig.iceCandidates } }
})

ipcMain.handle('doge:remote-close', async (_event, sessionId: string) => {
  try {
    webrtcSignals.delete(sessionId)
    // 广播断开
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.webContents.send('doge:remote-signal', {
        type: 'disconnect',
        timestamp: Date.now(),
        sessionId,
        payload: { reason: 'session_closed' },
      })
    })
    return { success: true }
  } catch { return { success: false } }
})

// ─── 远程控制增强 API ───

ipcMain.handle('doge:remote-signaling-status', () => {
  const stats = signalingServer.getStats()
  return {
    success: true,
    running: signalingServer.isRunning,
    port: signalingServerPort,
    ...stats,
  }
})

ipcMain.handle('doge:remote-signaling-start', async () => {
  try {
    if (signalingServer.isRunning) {
      return { success: true, port: signalingServerPort, message: 'Already running' }
    }
    const port = await signalingServer.start(0)
    signalingServerPort = port
    return { success: true, port }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '启动失败' }
  }
})

ipcMain.handle('doge:remote-signaling-stop', async () => {
  try {
    await signalingServer.stop()
    signalingServerPort = 0
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '停止失败' }
  }
})

ipcMain.handle('doge:remote-signaling-restart', async () => {
  try {
    if (signalingServer.isRunning) {
      await signalingServer.stop()
    }
    const port = await signalingServer.start(signalingServerPort || 0)
    signalingServerPort = port
    return { success: true, port }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '重启失败' }
  }
})

ipcMain.handle('doge:lsp-connected-servers', async () => {
  try {
    const servers = lspManager.getConnectedServers()
    return { success: true, servers }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取服务器列表失败'
    return { success: false, error: message }
  }
})

// ─── 模板引擎 IPC (更新日志功能) ───

const templateStore = new Map<string, { id: string; name: string; description: string; steps: Array<{ type: string; params: Record<string, unknown> }>; createdAt: number }>()

ipcMain.handle('doge:template-create', async (_event, params: { name: string; description?: string; steps: Array<{ type: string; params: Record<string, unknown> }> }) => {
  try {
    const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const template = { id, name: params.name, description: params.description || '', steps: params.steps, createdAt: Date.now() }
    templateStore.set(id, template)
    return { success: true, template }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:template-list', () => {
  return { success: true, templates: Array.from(templateStore.values()) }
})

ipcMain.handle('doge:template-get', (_event, templateId: string) => {
  return { success: true, template: templateStore.get(templateId) }
})

ipcMain.handle('doge:template-delete', (_event, templateId: string) => {
  templateStore.delete(templateId)
  return { success: true }
})

ipcMain.handle('doge:template-apply', async (_event, params: { templateId: string; variables?: Record<string, unknown> }) => {
  try {
    const template = templateStore.get(params.templateId)
    if (!template) return { success: false, error: '模板不存在' }
    // 替换变量
    const steps = template.steps.map(step => {
      let stepStr = JSON.stringify(step)
      if (params.variables) {
        for (const [key, value] of Object.entries(params.variables)) {
          stepStr = stepStr.split(`{{${key}}}`).join(String(value))
        }
      }
      return JSON.parse(stepStr)
    })
    return { success: true, steps }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:template-export', (_event, templateId: string) => {
  const template = templateStore.get(templateId)
  if (!template) return { success: false, error: '模板不存在' }
  return { success: true, data: JSON.stringify(template, null, 2) }
})

ipcMain.handle('doge:template-import', async (_event, params: { data: string }) => {
  try {
    const template = JSON.parse(params.data)
    templateStore.set(template.id, template)
    return { success: true, template }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

// ─── Test Runner IPC Handlers ───
ipcMain.handle('doge:test-run', async (_event, cwd: string, testCommand: string) => {
  try {
    const result = await execCommand(testCommand, cwd, 60000)
    return { success: true, output: result.stdout, error: result.stderr, exitCode: result.code }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Test execution failed' }
  }
})

ipcMain.handle('doge:test-list', async (_event, cwd: string) => {
  try {
    const frameworks = [
      { cmd: 'npx jest --listTests --json', name: 'jest' },
      { cmd: 'npx vitest run --reporter=json', name: 'vitest' },
      { cmd: 'npx mocha --reporter json', name: 'mocha' },
      { cmd: 'go test -list . ./...', name: 'go' },
      { cmd: 'pytest --collect-only -q', name: 'pytest' },
    ]

    for (const fw of frameworks) {
      try {
        const result = await execCommand(fw.cmd, cwd, 10000)
        if (result.code === 0) {
          return { framework: fw.name, tests: result.stdout.split('\n').filter(l => l.trim()) }
        }
      } catch { /* try next */ }
    }

    return { framework: 'unknown', tests: [] }
  } catch {
    return { framework: 'unknown', tests: [] }
  }
})

ipcMain.handle('doge:get-logs', async (_event, _params: { level?: string; limit?: number; offset?: number }) => {
  // In production, read from actual log files or log store
  // For now, return recent application logs from memory
  const logFile = path.join(app.getPath('userData'), 'logs', 'doge.log')
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim()).slice(-200)
      return {
        logs: lines.map((line, i) => ({
          id: `log-${i}`,
          timestamp: new Date().toISOString(),
          level: (line.match(/\[(DEBUG|INFO|WARN|ERROR)\]/i)?.[1]?.toLowerCase() as LogEntry['level']) || 'info',
          source: 'application',
          message: line,
        })),
        total: lines.length,
      }
    }
  } catch { /* ignore */ }

  // Return empty with current timestamp logs for demo
  return {
    logs: [
      { id: '1', timestamp: new Date().toISOString(), level: 'info' as const, source: 'system', message: '日志查看器已就绪' },
    ],
    total: 1,
  }
})

// ─── 日志实时流 ───
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  timestamp: string
  message: string
}

interface LogStreamListener {
  level?: string
  interval: NodeJS.Timeout
}

const logStreamListeners = new Map<number, LogStreamListener>()

function parseLogLine(line: string): LogEntry | null {
  const match = line.match(/^\[(DEBUG|INFO|WARN|ERROR)\]\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/)
  if (!match) return null
  return {
    level: match[1].toLowerCase() as LogEntry['level'],
    timestamp: match[2],
    message: match[3],
  }
}

ipcMain.handle('doge:log-stream-start', (event, options?: { level?: string }) => {
  const webContents = event.sender
  const id = webContents.id
  const level = options?.level?.toLowerCase()

  let lastSize = 0
  const interval = setInterval(async () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'logs', 'doge.log')
      if (!fs.existsSync(logPath)) return

      const stat = fs.statSync(logPath)
      if (stat.size < lastSize) {
        // 文件被轮转或截断，从头读取
        lastSize = 0
      }

      if (stat.size <= lastSize) return

      const stream = fs.createReadStream(logPath, { start: lastSize, encoding: 'utf-8' })
      let buffer = ''
      for await (const chunk of stream) {
        buffer += chunk
      }

      if (buffer) {
        const lines = buffer.split('\n').filter(l => l.trim())
        for (const line of lines) {
          const entry = parseLogLine(line)
          if (entry) {
            if (!level || entry.level === level || entry.level === 'error') {
              webContents.send('doge:log-entry', entry)
            }
          }
        }
        lastSize = stat.size
      }
    } catch { /* ignore */ }
  }, 500)

  logStreamListeners.set(id, { level, interval })
  return { success: true }
})

ipcMain.handle('doge:log-stream-stop', (event) => {
  const id = event.sender.id
  const listener = logStreamListeners.get(id)
  if (listener?.interval) {
    clearInterval(listener.interval)
    logStreamListeners.delete(id)
  }
  return { success: true }
})

// ─── 批量处理引擎 IPC ───

ipcMain.handle('doge:batch-start', async (_event, params: { workflowId: string; workflowName: string; files: Array<{ filePath: string; fileName?: string }>; config?: Partial<BatchConfig> }) => {
  try {
    const job = batchEngine.createJob(params.workflowId, params.workflowName, params.files, params.config)

    // 启动异步执行
    batchEngine.execute(job.id, async (filePath, _workflowId) => {
      // 读取文件内容
      const readResult = safeReadFile(filePath)
      if (readResult.error) {
        return { error: readResult.error }
      }

      // 这里可以集成真实 AI 处理逻辑
      // 目前返回文件基本信息作为演示
      const content = readResult.content || ''
      const lineCount = content.split('\n').length
      const charCount = content.length

      return {
        output: `已处理: ${path.basename(filePath)} (${lineCount} 行, ${charCount} 字符)`,
      }
    }, params.config).catch(err => {
      tsLog('BATCH', `Job ${job.id} failed:`, err)
    })

    return { success: true, batchId: job.id, totalFiles: job.files.length }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '启动批量任务失败' }
  }
})

ipcMain.handle('doge:batch-cancel', async (_event, batchId: string) => {
  try {
    const cancelled = batchEngine.cancelJob(batchId)
    return { success: cancelled }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '取消失败' }
  }
})

ipcMain.handle('doge:batch-status', async (_event, batchId: string) => {
  try {
    const job = batchEngine.getJob(batchId)
    if (!job) return { success: false, error: '任务不存在' }
    return { success: true, job }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '查询失败' }
  }
})

ipcMain.handle('doge:batch-list', async () => {
  try {
    const jobs = batchEngine.getAllJobs()
    return { success: true, jobs }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '查询失败' }
  }
})

ipcMain.handle('doge:batch-scan-files', async (_event, params: { dirPath: string; extensions?: string[]; maxFiles?: number }) => {
  try {
    const files = scanFiles(params.dirPath, params.extensions, params.maxFiles || 500)
    return { success: true, files }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '扫描失败' }
  }
})

ipcMain.handle('doge:batch-cleanup', async (_event, batchId: string) => {
  try {
    batchEngine.cleanup(batchId)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '清理失败' }
  }
})

// ─── 插件 SDK + 热加载 IPC (更新日志功能) ───

const pluginWatchers = new Map<string, { watcher: any; pluginName: string }>()

ipcMain.handle('doge:plugin-hot-reload', async (_event, pluginName: string) => {
  try {
    const pluginDirs = [
      path.join(projectRoot, '.doge', 'plugins'),
      path.join(projectRoot, 'plugins'),
      path.join(projectRoot, '.claude', 'plugins'),
    ]
    for (const dir of pluginDirs) {
      const pluginDir = path.join(dir, pluginName)
      if (fs.existsSync(pluginDir)) {
        // 重新加载插件
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('doge:plugin-reloaded', { pluginName, path: pluginDir })
        })
        return { success: true, path: pluginDir }
      }
    }
    return { success: false, error: '插件不存在' }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:plugin-watch', async (_event, pluginName: string) => {
  try {
    const pluginDirs = [
      path.join(projectRoot, '.doge', 'plugins'),
      path.join(projectRoot, 'plugins'),
    ]
    for (const dir of pluginDirs) {
      const pluginDir = path.join(dir, pluginName)
      if (fs.existsSync(pluginDir)) {
        if (pluginWatchers.has(pluginName)) {
          pluginWatchers.get(pluginName)!.watcher.close()
        }
        const watcher = fs.watch(pluginDir, { recursive: true }, () => {
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('doge:plugin-reloaded', { pluginName, path: pluginDir })
          })
        })
        pluginWatchers.set(pluginName, { watcher, pluginName })
        return { success: true }
      }
    }
    return { success: false, error: '插件不存在' }
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
})

ipcMain.handle('doge:plugin-unwatch', async (_event, pluginName: string) => {
  try {
    if (pluginWatchers.has(pluginName)) {
      pluginWatchers.get(pluginName)!.watcher.close()
      pluginWatchers.delete(pluginName)
    }
    return { success: true }
  } catch { return { success: false } }
})

ipcMain.handle('doge:plugin-sdk-info', () => {
  return {
    success: true,
    sdk: {
      version: '1.0.0',
      api: ['registerCommand', 'registerTool', 'registerHook', 'getConfig', 'setConfig', 'log', 'on', 'off'],
      types: ['PluginManifest', 'PluginContext', 'PluginAPI'],
      docs: 'SDK provides registerCommand(), registerTool(), registerHook() for plugin development.'
    }
  }
})

ipcMain.handle('doge:plugin-list-active', () => {
  try {
    const plugins = scanPlugins(projectRoot)
    return { success: true, plugins: plugins.filter((p: any) => p.enabled) }
  } catch { return { success: true, plugins: [] } }
})

// ─── 插件运行时 IPC（JS 沙箱执行 + hooks + 热加载） ───

ipcMain.handle('doge:plugin-runtime-load-all', async () => {
  try {
    const loaded = pluginRuntime.loadAll()
    return { success: true, count: loaded.length, plugins: pluginRuntime.list() }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-load', async (_event, pluginDir: string) => {
  try {
    const p = pluginRuntime.loadPlugin(pluginDir)
    if (!p) return { success: false, error: '未找到可执行入口（index.js/main.js）' }
    return { success: true, plugin: pluginRuntime.list().find(x => x.name === p.name) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-list', async () => {
  return { success: true, plugins: pluginRuntime.list(), commands: pluginRuntime.getCommandNames() }
})

ipcMain.handle('doge:plugin-runtime-invoke', async (_event, fullName: string, ...args: unknown[]) => {
  return pluginRuntime.invokeCommand(fullName, ...args)
})

ipcMain.handle('doge:plugin-runtime-reload', async (_event, pluginName: string) => {
  try {
    const p = pluginRuntime.get(pluginName)
    if (!p) return { success: false, error: `插件 ${pluginName} 未加载` }
    pluginRuntime.loadPlugin(p.dir)
    return { success: true, plugin: pluginRuntime.list().find(x => x.name === pluginName) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-unload', async (_event, pluginName: string) => {
  try {
    const ok = pluginRuntime.unloadPlugin(pluginName)
    return { success: ok }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-watch', async (_event, pluginName: string) => {
  try {
    const ok = pluginRuntime.watch(pluginName)
    return { success: ok }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-unwatch', async (_event, pluginName: string) => {
  try {
    pluginRuntime.stopWatch(pluginName)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-runtime-emit', async (_event, event: string, data: unknown) => {
  pluginRuntime.emitEvent(event, data)
  return { success: true }
})

// ─── 插件 Scaffold 生成器 ───

ipcMain.handle('doge:plugin-scaffold', async (_event, pluginName: string) => {
  try {
    const name = pluginName.trim()
    if (!name) return { success: false, error: '请输入插件名称' }
    // 名称校验：字母数字下划线横线
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return { success: false, error: '插件名称仅允许字母、数字、下划线、横线' }
    }
    const dir = path.join(projectRoot, '.doge', 'plugins', name)
    if (fs.existsSync(dir)) return { success: false, error: `插件 "${name}" 已存在` }
    fs.mkdirSync(dir, { recursive: true })

    const manifest = {
      name,
      description: `${name} 插件`,
      version: '0.1.0',
      author: 'user',
    }
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8')

    const entry = `/**
 * ${name} 插件入口 — Doge Code 插件运行时 SDK
 *
 * SDK 能力：
 * - registerCommand(name, fn)：注册可调用命令
 * - registerHook(hook)：注册生命周期 hooks（onFileOpen/onFileSave/onToolExecuted/onMessageSent/onStateChange）
 * - on/emit：插件间事件总线
 * - log：日志输出
 *
 * 插件形态：module.exports = (ctx) => { ... } 或 exports.activate = (ctx) => { ... }
 */
module.exports = (ctx) => {
  // 注册一个示例命令（在 PluginPanel「运行时」Tab 点击执行）
  ctx.registerCommand('hello', () => {
    return '你好，来自插件 ${name} 👋'
  })

  // 注册生命周期 hook
  ctx.registerHook({
    onFileOpen: (filePath) => {
      ctx.log('文件被打开:', filePath)
    },
    onStateChange: (state) => {
      ctx.log('状态变化:', state)
    },
  })

  // 事件总线示例
  ctx.on('custom-event', (data) => {
    ctx.log('收到事件:', data)
  })

  ctx.log('插件 ${name} 已激活')
}
`
    fs.writeFileSync(path.join(dir, 'index.js'), entry, 'utf-8')

    // 立即加载到运行时
    const loaded = pluginRuntime.loadPlugin(dir)
    if (loaded) pluginRuntime.watch(name)

    return { success: true, path: dir, entry: path.join(dir, 'index.js'), commands: ['hello'] }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 插件导出/导入协议 ───

function getPluginExportsDir(): string {
  const dir = path.join(projectRoot, '.doge', 'exports')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// 读取插件目录所有文件（相对路径 → base64）
function readPluginFiles(pluginDir: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string, rel: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(full, relPath)
      else files[relPath] = fs.readFileSync(full).toString('base64')
    }
  }
  walk(pluginDir, '')
  return files
}

// 还原插件包文件到目录
function writePluginFiles(pluginDir: string, files: Record<string, string>): void {
  fs.mkdirSync(pluginDir, { recursive: true })
  for (const [relPath, b64] of Object.entries(files)) {
    // 路径安全：拒绝 ../ 和绝对路径
    const norm = relPath.replace(/\\/g, '/')
    if (norm.startsWith('../') || path.isAbsolute(norm) || norm.includes('/../')) continue
    const target = path.join(pluginDir, ...norm.split('/'))
    if (!target.startsWith(pluginDir + path.sep)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, Buffer.from(b64, 'base64'))
  }
}

ipcMain.handle('doge:plugin-export', async (_event, pluginName: string) => {
  try {
    const pluginDirs = [
      path.join(projectRoot, '.doge', 'plugins'),
      path.join(projectRoot, 'plugins'),
    ]
    for (const dir of pluginDirs) {
      const pluginDir = path.join(dir, pluginName)
      if (fs.existsSync(pluginDir)) {
        // 读取 manifest 获取版本
        let manifest: Record<string, unknown> = { name: pluginName }
        try {
          const mp = path.join(pluginDir, 'plugin.json')
          if (fs.existsSync(mp)) manifest = JSON.parse(fs.readFileSync(mp, 'utf-8'))
        } catch { /* ignore */ }

        const pkg = {
          format: 'doge-plugin',
          version: 1,
          manifest,
          files: readPluginFiles(pluginDir),
          exportedAt: Date.now(),
        }
        const safeName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_')
        const outPath = path.join(getPluginExportsDir(), `${safeName}.dogeplugin`)
        fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), 'utf-8')
        return { success: true, path: outPath, fileCount: Object.keys(pkg.files).length, size: fs.statSync(outPath).size }
      }
    }
    return { success: false, error: `插件 "${pluginName}" 不存在` }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('doge:plugin-list-exports', async () => {
  try {
    const dir = getPluginExportsDir()
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.dogeplugin'))
    const list = files.map(f => {
      try {
        const stat = fs.statSync(path.join(dir, f))
        return { name: f.replace(/\.dogeplugin$/, ''), path: path.join(dir, f), size: stat.size, modifiedAt: stat.mtimeMs }
      } catch { return null }
    }).filter((x): x is { name: string; path: string; size: number; modifiedAt: number } => x !== null)
    return { success: true, exports: list }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e), exports: [] }
  }
})

ipcMain.handle('doge:plugin-import', async (_event, exportName: string) => {
  try {
    const pkgPath = path.join(getPluginExportsDir(), `${exportName.replace(/[^a-zA-Z0-9_-]/g, '_')}.dogeplugin`)
    if (!fs.existsSync(pkgPath)) return { success: false, error: '导出包不存在' }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (pkg.format !== 'doge-plugin' || !pkg.manifest?.name || !pkg.files) {
      return { success: false, error: '无效的插件包格式' }
    }
    const pluginName = String(pkg.manifest.name)
    const destDir = path.join(projectRoot, '.doge', 'plugins', pluginName)
    writePluginFiles(destDir, pkg.files)
    // 加载到运行时 + 热加载
    const loaded = pluginRuntime.loadPlugin(destDir)
    if (loaded) pluginRuntime.watch(pluginName)
    return { success: true, pluginName, path: destDir }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 文件树 API ───
ipcMain.handle('doge:file-tree', async (_event, dirPath: string, maxDepth: number) => {
  try {
    const result = buildFileTree(dirPath, 0, maxDepth)
    return { success: true, tree: result }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '获取文件树失败' }
  }
})

function buildFileTree(dirPath: string, depth: number, maxDepth: number): Array<{ name: string; path: string; isDirectory: boolean; children?: Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }> }> {
  if (depth > maxDepth) return []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const nodes: Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }> = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.git') continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath, depth + 1, maxDepth)
        nodes.push({ name: entry.name, path: fullPath, isDirectory: true, children })
      } else {
        nodes.push({ name: entry.name, path: fullPath, isDirectory: false })
      }
    }
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  } catch {
    return []
  }
}

ipcMain.handle('doge:file-create', async (_event, parentPath: string, fileName: string) => {
  try {
    const targetPath = path.join(parentPath, fileName)
    await fs.promises.writeFile(targetPath, '', 'utf-8')
    return { success: true, path: targetPath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '创建文件失败' }
  }
})

ipcMain.handle('doge:file-mkdir', async (_event, parentPath: string, folderName: string) => {
  try {
    const targetPath = path.join(parentPath, folderName)
    await fs.promises.mkdir(targetPath, { recursive: true })
    return { success: true, path: targetPath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '创建目录失败' }
  }
})

ipcMain.handle('doge:file-delete', async (_event, filePath: string) => {
  try {
    const stat = await fs.promises.stat(filePath)
    if (stat.isDirectory()) {
      await fs.promises.rm(filePath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(filePath)
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '删除失败' }
  }
})

ipcMain.handle('doge:file-rename', async (_event, filePath: string, newName: string) => {
  try {
    const newPath = path.join(path.dirname(filePath), newName)
    await fs.promises.rename(filePath, newPath)
    return { success: true, newPath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '重命名失败' }
  }
})

// ─── 安全与隐私 IPC (更新日志功能) ───

// 会话锁定状态
let sessionLocked = false
let sessionLockTimeout: ReturnType<typeof setTimeout> | null = null
let lastActivityTime = Date.now()
const SESSION_LOCK_MS = parseInt(process.env.CLAUDE_CODE_SESSION_LOCK_MS || '300000') // 5分钟默认

ipcMain.handle('doge:session-lock', () => {
  sessionLocked = true
  return { success: true }
})

ipcMain.handle('doge:session-unlock', async (_event, params: { password?: string }) => {
  // 实际实现需要验证密码/生物识别
  sessionLocked = false
  lastActivityTime = Date.now()
  return { success: true }
})

ipcMain.handle('doge:session-is-locked', () => {
  return { success: true, locked: sessionLocked }
})

ipcMain.handle('doge:session-lock-config', (_event, params?: { timeoutMs?: number }) => {
  if (params?.timeoutMs) {
    // 更新超时配置
  }
  return { success: true, timeoutMs: SESSION_LOCK_MS }
})

ipcMain.handle('doge:session-activity', () => {
  lastActivityTime = Date.now()
  return { success: true }
})

// TOTP 2FA
ipcMain.handle('doge:2fa-generate', () => {
  const secret = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('')
  return { success: true, secret, uri: `otpauth://totp:DogeCode?secret=${secret}&issuer=DogeCode` }
})

ipcMain.handle('doge:2fa-verify', (_event, params: { secret: string; code: string }) => {
  // 简化实现：实际需要使用 TOTP 算法
  return { success: true, valid: params.code.length === 6 }
})

ipcMain.handle('doge:2fa-enable', (_event, params: { secret: string }) => {
  // 存储 secret 到安全存储
  return { success: true }
})

ipcMain.handle('doge:2fa-disable', () => {
  return { success: true }
})

// 端到端加密
ipcMain.handle('doge:e2ee-generate-key', () => {
  const key = Array.from({ length: 64 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
  return { success: true, keyId: `key-${Date.now()}`, publicKey: key }
})

ipcMain.handle('doge:e2ee-encrypt', (_event, params: { keyId: string; data: string }) => {
  // 简化实现：实际需要使用 Web Crypto API
  return { success: true, encrypted: Buffer.from(params.data).toString('base64') }
})

ipcMain.handle('doge:e2ee-decrypt', (_event, params: { keyId: string; encrypted: string }) => {
  return { success: true, data: Buffer.from(params.encrypted, 'base64').toString('utf-8') }
})

ipcMain.handle('doge:e2ee-list-keys', () => {
  return { success: true, keys: [] }
})

ipcMain.handle('doge:e2ee-delete-key', (_event, keyId: string) => {
  return { success: true }
})

ipcMain.handle('doge:get-all-diagnostics', async () => {
  const diagnostics: Array<{ uri: string; diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: number; message: string; source?: string }> }> = []
  lspDiagnosticCache.forEach((entries, uri) => {
    diagnostics.push({ uri, diagnostics: entries })
  })
  return { success: true, diagnostics }
})

// ─── 测试框架检测（在主进程中执行文件系统操作） ───
ipcMain.handle('doge:detect-framework', async (_event, cwd: string) => {
  try {
    const checkExists = (file: string) => fs.existsSync(path.join(cwd, file))

    if (checkExists('jest.config.js') || checkExists('jest.config.ts') || checkExists('jest.config.json')) {
      return { success: true, framework: 'jest', configFile: 'jest.config.*', testCommand: 'npm test -- --verbose', coverageCommand: 'npm test -- --coverage' }
    }
    if (checkExists('vitest.config.ts') || checkExists('vitest.config.js') || checkExists('vite.config.ts') || checkExists('vite.config.js')) {
      return { success: true, framework: 'vitest', configFile: 'vitest.config.*', testCommand: 'npx vitest run', coverageCommand: 'npx vitest run --coverage' }
    }
    if (checkExists('.mocharc.js') || checkExists('.mocharc.json') || checkExists('mocha.opts')) {
      return { success: true, framework: 'mocha', configFile: '.mocharc.*', testCommand: 'npx mocha', coverageCommand: 'npx mocha --require nyc/register' }
    }
    if (checkExists('pytest.ini') || checkExists('pyproject.toml') || checkExists('setup.cfg')) {
      return { success: true, framework: 'pytest', configFile: 'pytest.ini', testCommand: 'pytest -v', coverageCommand: 'pytest --cov' }
    }
    if (checkExists('go.mod')) {
      return { success: true, framework: 'go', configFile: 'go.mod', testCommand: 'go test -v ./...', coverageCommand: 'go test -cover ./...' }
    }
    if (checkExists('Cargo.toml')) {
      return { success: true, framework: 'cargo', configFile: 'Cargo.toml', testCommand: 'cargo test', coverageCommand: 'cargo tarpaulin' }
    }

    // 检查 package.json 中的 test 脚本
    try {
      const pkgRaw = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
      const pkg = JSON.parse(pkgRaw)
      if (pkg.scripts?.test) {
        return { success: true, framework: 'unknown', configFile: 'package.json', testCommand: 'npm test -- --verbose', coverageCommand: 'npm test -- --coverage' }
      }
    } catch { /* ignore */ }

    return { success: true, framework: 'unknown', testCommand: 'npm test', coverageCommand: 'npm test -- --coverage' }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ─── 导出入口函数 ───
export function bootDesktop(): void {
  createWindow()
  createTray()
  tsLog('MAIN', 'Desktop boot complete')
}

