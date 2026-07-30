/**
 * desktop-electron/launch-electron.ts — 启动 Electron 桌面应用
 *
 * 此文件在 Node.js/Bun 进程中运行，负责：
 * 1. 设置 Electron 所需的运行时环境变量
 * 2. Spawn Electron 进程加载 entrypoint.ts
 * 3. 传递配置给 Electron 主进程
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

// 桌面源码在 src/desktop-electron/，构建产物在 desktop/dist/
const desktopDir = path.resolve(projectRoot, 'desktop')
const distEntry = path.join(desktopDir, 'dist', 'main', 'index.mjs')

function resolveElectronExecutable(): string {
  // 优先使用 desktop 目录下的 electron
  const desktopElectron = path.join(desktopDir, 'node_modules', 'electron', 'dist', 'electron.exe')
  if (fs.existsSync(desktopElectron)) return desktopElectron
  // 回退：全局 electron
  try { return require.resolve('electron') } catch { /* ignore */ }
  throw new Error('找不到 electron 可执行文件，请先在 desktop/ 目录运行 bun install')
}

function loadConfig() {
  const configPath = process.env.DOGE_API_JSON
    ? path.resolve(process.env.DOGE_API_JSON)
    : path.join(projectRoot, '.doge', 'api.json')
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
      workingDir: projectRoot,
    }
  } catch {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', workingDir: projectRoot }
  }
}

export function launchDesktop(): void {
  const electronExe = resolveElectronExecutable()
  const config = loadConfig()

  // 将配置通过环境变量传递给 Electron 主进程
  const env = {
    ...process.env,
    DOGE_DESKTOP: '1',
    ELECTRON_RUN_AS_NODE: '0',
    __DOGE_CONFIG__: JSON.stringify(config),
    // 禁用 GPU 加速（避免某些 Windows 环境下的渲染问题）
    ELECTRON_DISABLE_GPU: '1',
    // electron-vite 构建产物的路径
    DESKTOP_DIST_DIR: distEntry,
  }

  // Spawn Electron，加载构建后的入口点
  const child = spawn(electronExe, [distEntry], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    detached: false,
    windowsHide: true,
  })

  child.on('error', (err) => {
    console.error(`启动 Electron 失败: ${err.message}`)
    process.exit(1)
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  process.on('SIGINT', () => child.kill('SIGTERM'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}
