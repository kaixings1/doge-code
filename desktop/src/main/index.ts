/**
 * Electron 主进程入口 — 集成 QueryEngine
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { QueryEngine } from '../../../src/engine/index.js'
import type { InternalMessage } from '../../../src/engine/messageNormalizer.js'
import type { APIRequest } from '../../../src/engine/requestBuilder.js'

let mainWindow: BrowserWindow | null = null

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
    // 兼容 baseURL/baseUrl 两种写法
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

// ─── QueryEngine 实例（全局单例） ───
let engine: QueryEngine | null = null
let engineConfig: ReturnType<typeof loadConfig> | null = null

function getEngine(): QueryEngine {
  if (!engine) {
    const config = loadConfig()
    engineConfig = config
    engine = new QueryEngine({
      model: config.model,
      systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
      maxOutputTokens: 4096,
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
          // baseUrl 可能已经是完整 URL（含 /chat/completions），避免重复拼接
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?desktop=1`)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { desktop: '1' },
    })
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' })
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
    // 提取最后一条助手消息作为回复
    const messages = result.messages as InternalMessage[]
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

ipcMain.handle('doge:get-git-diff', async (_event, cwd: string, filePath: string) => {
  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`git diff -- "${filePath}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return output || '(空 diff)'
  } catch { return '读取失败' }
})

// ─── 应用生命周期 ───
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
