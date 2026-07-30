/**
 * desktop-electron/entrypoint.ts — 桌面模式入口点
 *
 * 两种启动方式：
 * 1. 通过 Electron 加载（production/dev 模式）：Electron 主进程直接 import 此文件
 * 2. 通过 CLI 参数：doge --desktop → bootstrap-entry.ts 检测后启动 Electron
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// ─── 路径 ───
// 构建后 __dirname 指向 src/desktop-electron/，构建产物在 desktop/dist/main/
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')
const DIST_MAIN = path.join(DESKTOP_ROOT, 'dist', 'main', 'index.mjs')

// ─── 配置 ───
function loadConfig() {
  const configPath = process.env.DOGE_API_JSON
    ? path.resolve(process.env.DOGE_API_JSON)
    : path.join(PROJECT_ROOT, '.doge', 'api.json')
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
// 使用动态导入以避免循环依赖
// electron-vite 将 main/index.ts 打包为 dist/main/index.mjs
async function bootstrapDesktop() {
  const config = loadConfig()

  // 将配置注入到全局
  ;(globalThis as Record<string, unknown>).__DOGE_CONFIG__ = config

  await app.whenReady()

  const { bootDesktop } = await import(DIST_MAIN)

  bootDesktop()
}

// 只在 Electron 主进程中运行
if (process.type === 'browser' || process.env.ELECTRON_RUN_AS_NODE !== '1') {
  void bootstrapDesktop().catch(console.error)
}
