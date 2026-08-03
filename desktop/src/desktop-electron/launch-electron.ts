/**
 * desktop-electron/launch-electron.ts — 启动 DogeCode Desktop
 *
 * 由 doge.exe 调用（通过 --desktop 参数），负责 spawn 同目录下的 DogeCode.exe
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 开发模式或编译后：doge.exe / DogeCode.exe 所在目录
const exeDir = path.dirname(process.execPath)

function loadConfig() {
  const configPath = process.env.DOGE_API_JSON
    ? path.resolve(process.env.DOGE_API_JSON)
    : path.join(exeDir, '.doge', 'api.json')
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
      workingDir: exeDir,
    }
  } catch {
    return { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', workingDir: exeDir }
  }
}

export function launchDesktop(): void {
  // 开发模式：doge.exe 在项目根目录，DogeCode.exe 在 desktop/release/win-unpacked/
  // 编译后：两个 exe 可能在同一目录
  const candidates = [
    path.resolve(exeDir, 'desktop', 'release', 'win-unpacked', 'DogeCode.exe'),
    path.resolve(exeDir, 'desktop', 'release-out', 'win-unpacked', 'DogeCode.exe'),
    path.join(exeDir, 'DogeCode.exe'),
  ]
  const dogeCodeExe = candidates.find(p => fs.existsSync(p))
  if (!dogeCodeExe) {
    console.error('找不到 DogeCode.exe，请先运行 cc.bat 编译 Desktop 版本')
    process.exit(1)
  }

  const config = loadConfig()

  const env = {
    ...process.env,
    DOGE_DESKTOP: '1',
    ELECTRON_RUN_AS_NODE: '0',
    __DOGE_CONFIG__: JSON.stringify(config),
    ELECTRON_DISABLE_GPU: '1',
  }

  const child = spawn(dogeCodeExe, [], {
    cwd: exeDir,
    env,
    stdio: 'inherit',
    detached: false,
    windowsHide: true,
  })

  child.on('error', (err) => {
    console.error(`启动 DogeCode Desktop 失败: ${err.message}`)
    process.exit(1)
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  process.on('SIGINT', () => child.kill('SIGTERM'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}
