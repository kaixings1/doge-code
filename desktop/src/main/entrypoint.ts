/**
 * desktop-electron/entrypoint.ts — 桌面模式入口点
 *
 * 两种启动方式：
 * 1. 通过 Electron 加载（production/dev 模式）：Electron 主进程直接 import 此文件
 * 2. 通过 CLI 参数：doge --desktop → bootstrap-entry.ts 检测后启动 Electron
 */

import './require-shim.js'
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// ─── 路径 ───
const DESKTOP_ROOT = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')

// ─── 配置 ───
function loadConfig() {
  const configPath = process.env.DOGE_API_JSON
    ? path.resolve(process.env.DOGE_API_JSON)
    : path.join(PROJECT_ROOT, '.doge', 'lc2.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw)
    const preset = data.activePreset && data.presets?.[data.activePreset]
      ? data.presets[data.activePreset]
      : data.presets?.default || {}
    return {
      provider: preset.provider || 'openai',
      apiKey: preset.apiKey || '',
      model: preset.model || 'gpt-4o',
      baseUrl: preset.baseURL || preset.baseUrl || 'https://api.openai.com/v1',
      workingDir: PROJECT_ROOT,
    }
  } catch {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', workingDir: PROJECT_ROOT }
  }
}

// ─── 导入主进程逻辑 ───
import { bootDesktop } from './index.js'

async function bootstrapDesktop() {
  const config = loadConfig()

  // 将配置注入到全局
  ;(globalThis as Record<string, unknown>).__DOGE_CONFIG__ = config

  await app.whenReady()

  bootDesktop()
}

// 只在 Electron 主进程中运行
if (process.type === 'browser' || process.env.ELECTRON_RUN_AS_NODE !== '1') {
  // ─── 全局异常处理 ───
  // 捕获 ESM 模块编译错误（如 Invalid regular expression）、未处理的 Promise 拒绝、
  // 以及其他主进程异常。Electron 默认只弹出错误对话框，进程仍会挂起无法退出，
  // 因此这里增加日志记录 + 强制退出，确保窗口关闭后进程能完整退出。
  process.on('uncaughtException', (err) => {
    const msg = err instanceof Error ? err.stack || err.message : String(err)
    console.error('[main-process:uncaughtException]', msg)
    // 等待 Electron 窗口关闭后退出
    app.quit().then(() => {
      process.exit(1)
    }).catch(() => {
      process.exit(1)
    })
  })
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason)
    console.error('[main-process:unhandledRejection]', msg)
  })

  // ─── 启动超时保护 ───
  // 如果窗口在 30 秒内未能创建完成（例如模块加载错误导致 bootDesktop 卡住），
  // 强制退出进程，避免残留无法退出的 Electron 主进程。
  let windowReady = false
  const startupTimeout = setTimeout(() => {
    if (!windowReady) {
      console.error('[main-process] 窗口创建超时（30s），强制退出进程')
      app.quit().then(() => process.exit(1)).catch(() => process.exit(1))
    }
  }, 30000)

  // 监听窗口创建完成事件
  app.on('browser-window-created', () => {
    windowReady = true
    clearTimeout(startupTimeout)
  })

  void bootstrapDesktop().catch((err) => {
    const msg = err instanceof Error ? err.stack || err.message : String(err)
    console.error('[main-process:bootstrap]', msg)
    app.quit().then(() => {
      process.exit(1)
    }).catch(() => {
      process.exit(1)
    })
  })
}
