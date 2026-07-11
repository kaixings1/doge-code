import { ensureBootstrapMacro } from './bootstrapMacro'
import * as fs from 'fs'
import * as path from 'path'
process.env.CLAUDE_CODE_SIMPLE=1
// 🔴 清除 PATH 中的 MSYS2/Git bash 目录，防止 cmd.exe 子进程调用 MSYS2 的 grep/find 等程序触发 fork 卡死
process.env.PATH = process.env.PATH?.split(';').filter(p => !/msys2/i.test(p) && !/git\\bin/i.test(p) && !/git\\usr\\bin/i.test(p)).join(';')
// Shell 配置：默认使用 Windows 原生 cmd.exe 避免 MSYS2 多行参数转义问题
// 如需切回 MSYS2 bash，注释掉下面两行并取消注释 bash 版本:
process.env.CLAUDE_CODE_SHELL="C:/Windows/System32/cmd.exe"
process.env.SHELL="C:/Windows/System32/cmd.exe"
//process.env.CLAUDE_CODE_SHELL="C:/Program Files/Git/bin/bash.exe"
//process.env.SHELL="C:/Program Files/Git/bin/bash.exe"
ensureBootstrapMacro();

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

await import('./entrypoints/cli.tsx')
