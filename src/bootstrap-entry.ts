import { ensureBootstrapMacro } from './bootstrapMacro'
import * as fs from 'fs'
import * as path from 'path'

ensureBootstrapMacro();

const apiJsonPath = path.join(process.cwd(), '.doge', 'api.json');
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
  process.env.DOGE_API_KEY = activeConfig.apiKey ?? '';
  process.env.ANTHROPIC_MODEL = activeConfig.model || '';
  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = activeConfig.provider || 'openai';
} else {
  process.env.ANTHROPIC_BASE_URL = 'http://0.0.0.0:1';
  process.env.DOGE_API_KEY = 'DOGE_FAKE_KEY';
  process.env.ANTHROPIC_MODEL = 'claude-dummy';
  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = 'openai';
}

await import('./entrypoints/cli.tsx')