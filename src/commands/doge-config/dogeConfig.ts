import type { LocalCommandCall } from '../../types/command.js'
import {
  getDogeConfig,
  loadDogeConfig,
  setDogeConfig,
} from '../../utils/config/dogeConfig.js'

const SENSITIVE_KEYS = new Set(['apiKey', 'api_key', 'secret', 'password', 'token'])

const call: LocalCommandCall = async (args: string) => {
  const trimmed = (args || '').trim()
  const parts = trimmed.split(/\s+/)
  const action = parts[0]?.toLowerCase() || 'list'

  switch (action) {
    case 'list':
    case 'ls':
      return handleList()
    case 'get':
      return handleGet(parts[1])
    case 'set':
      return handleSet(parts[1], parts.slice(2).join(' '))
    case 'help':
    case '--help':
    case '-h':
    default:
      return { type: 'text' as const, value: getHelpText() }
  }
}

function maskValue(key: string, value: unknown): string {
  if (SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
    if (value.length <= 8) {
      return value.slice(0, 2) + '••••' + value.slice(-2)
    }
    return value.slice(0, 4) + '••••' + value.slice(-4)
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value ?? '(空)')
}

function handleList(): { type: 'text'; value: string } {
  const config = loadDogeConfig()
  const entries = Object.entries(config)

  if (entries.length === 0) {
    return {
      type: 'text' as const,
      value: '⚙️ doge 配置为空\n\n使用 /doge-config set <key> <value> 设置配置\n或直接编辑 ~/.doge/config.json',
    }
  }

  const lines = ['⚙️ doge 配置', '']
  for (const [key, value] of entries) {
    lines.push(`  ${key}: ${maskValue(key, value)}`)
  }
  lines.push('')
  lines.push('使用 /doge-config get <key> 查看单个值')
  lines.push('使用 /doge-config set <key> <value> 修改值')

  return { type: 'text' as const, value: lines.join('\n') }
}

function handleGet(key?: string): { type: 'text'; value: string } {
  if (!key) {
    return {
      type: 'text' as const,
      value: '用法: /doge-config get <key>\n\n示例:\n  /doge-config get baseURL\n  /doge-config get apiKey',
    }
  }

  const value = getDogeConfig(key as keyof ReturnType<typeof loadDogeConfig>)
  if (value === undefined) {
    return {
      type: 'text' as const,
      value: `❌ 未找到配置项: ${key}\n使用 /doge-config list 查看所有配置`,
    }
  }

  return {
    type: 'text' as const,
    value: `⚙️ ${key}: ${maskValue(key, value)}`,
  }
}

function handleSet(key?: string, value?: string): { type: 'text'; value: string } {
  if (!key || value === undefined) {
    return {
      type: 'text' as const,
      value: '用法: /doge-config set <key> <value>\n\n示例:\n  /doge-config set baseURL https://api.example.com\n  /doge-config set model gpt-4',
    }
  }

  // Try to parse as JSON if it looks like an object/array
  let parsedValue: unknown = value
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      parsedValue = JSON.parse(value)
    } catch {
      // keep as string
    }
  }

  const oldValue = getDogeConfig(key as keyof ReturnType<typeof loadDogeConfig>)
  setDogeConfig(key as keyof ReturnType<typeof loadDogeConfig>, parsedValue)

  return {
    type: 'text' as const,
    value: `✅ 已设置 ${key}: ${maskValue(key, parsedValue)}${oldValue !== undefined ? `\n   (原值: ${maskValue(key, oldValue)})` : ''}`,
  }
}

function getHelpText(): string {
  return [
    '⚙️ doge 配置管理',
    '',
    '📖 用法: ',
    '  /doge-config list                  - 列出所有配置',
    '  /doge-config get <key>             - 查看单个配置',
    '  /doge-config set <key> <value>     - 设置配置值',
    '',
    '说明:',
    '  - 配置存储在 ~/.doge/config.json',
    '  - API Key 等敏感值会自动掩码显示',
    '  - 支持 JSON 格式的对象值',
  ].join('\n')
}

export default call
