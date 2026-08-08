// Console output gate - must be first to intercept all console calls
import './utils/consoleOverride.js'

import { ensureBootstrapMacro } from './bootstrapMacro'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

//process.env.CLAUDE_CODE_SIMPLE=1
// 🔴 清除 PATH 中的 MSYS2/Git bash 目录，防止 cmd.exe 子进程调用 MSYS2 的 grep/find 等程序触发 fork 卡死
process.env.PATH = process.env.PATH?.split(';').filter(p => !/msys2/i.test(p) && !/git\\bin/i.test(p) && !/git\\usr\\bin/i.test(p) && !/^F:\\bin$/i.test(p)).join(';')
// Shell 配置：保留 bash，通过 shim 拦截有问题的工具（grep/find/rg）
// 将 .tools/ 加入 PATH 前端，确保安全 shim 优先于 MSYS2 工具
// 编译为 exe 后，__dirname 可能指向虚拟路径，改用 process.execPath 的目录
const exeDir = path.dirname(process.execPath)
const computedToolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tools')
const toolsDir = fs.existsSync(path.join(exeDir, '.tools'))
  ? path.join(exeDir, '.tools')
  : computedToolsDir
process.env.PATH = toolsDir + ';' + process.env.PATH
ensureBootstrapMacro()

// 优先使用环境变量 DOGE_API_JSON 指定自定义配置路径（进程隔离用）
const apiJsonPath = (() => {
  const envPath = process.env.DOGE_API_JSON;
  if (envPath && typeof envPath === 'string' && envPath.trim()) {
    return path.resolve(envPath.trim());
  }
  return path.join(process.cwd(), '.doge', 'api.json');
})();
let activeConfig = null;
if (fs.existsSync(apiJsonPath)) {
  const data = JSON.parse(fs.readFileSync(apiJsonPath, 'utf-8'));
  const presetName = data.activePreset;
  if (presetName && data.presets && data.presets[presetName]) {
    activeConfig = data.presets[presetName];
  }
}

if (activeConfig?.baseURL && !activeConfig.baseURL.startsWith('http://0.0.0.0')) {
  const rawBase = activeConfig.baseURL.replace(/\/+$/, '');
  // 对于 Anthropic 协议，直接设置完整的 /v1/messages 地址，SDK 就不会再追加了
  if (activeConfig.provider === 'anthropic') {
    process.env.ANTHROPIC_BASE_URL = rawBase ;//+ '/v1/messages';
  } else {
    process.env.ANTHROPIC_BASE_URL = rawBase;
  }
  if (activeConfig.apiKey) process.env.DOGE_API_KEY = activeConfig.apiKey; else delete process.env.DOGE_API_KEY;
  process.env.ANTHROPIC_MODEL = activeConfig.model || '';
  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = activeConfig.provider || 'openai';
} else {
  process.env.ANTHROPIC_BASE_URL = 'http://0.0.0.0:1';
  process.env.DOGE_API_KEY = 'DOGE_FAKE_KEY';
  process.env.ANTHROPIC_MODEL = 'claude-dummy';
  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = 'openai';
}

async function main(): Promise<void> {
  // 桌面模式：DOGE_DESKTOP=1 时通过 launch-electron.ts spawn Electron 进程
  if (process.env.DOGE_DESKTOP === '1') {
    const { launchDesktop } = await import('./desktop-electron/launch-electron.ts')
    launchDesktop()
    return
  }

  await import('./entrypoints/cli.tsx')
}

void main()
