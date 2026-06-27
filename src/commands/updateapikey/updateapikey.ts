/**
 * updateapikey - 从 alistaitsacle/free-llm-api-keys 项目拉取最新免费 API Key
 * 更新到 .doge/free*.json 中
 * 
 * 用法: /updateapikey [free5|free6|...|all]
 *   /updateapikey      - 列出当前 Key 状态
 *   /updateapikey all  - 拉取最新 Key 并更新到所有 freeN.json
 *   /updateapikey free5 - 仅更新指定文件
 */
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

// 镜像源列表，按优先级尝试
const RAW_URLS = [
  'https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://raw.fastgit.org/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://gh.axlg.workers.dev/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://mirror.ghproxy.com/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
]
const BASE_URL = 'https://aiapiv2.pekpik.com/v1'
const DOGE_DIR = path.resolve(process.env.USERPROFILE || process.env.HOME || '.', '.doge')

interface ApiKeyEntry {
  key: string
  model: string
  budget: string
  expires: string
  status: string
}

/** 从 README 中解析 Key 列表 */
function parseKeys(text: string): ApiKeyEntry[] {
  const lines = text.split('\n')
  const keys: ApiKeyEntry[] = []
  for (const line of lines) {
    // 匹配表格行: | sk-xxx | model | status | budget | ...
    const match = line.match(/`(sk-[a-zA-Z0-9]{20,})`\s*\|\s*([a-zA-Z0-9_\/.-]+)/)
    if (match) {
      const cols = line.split('|').map(c => c.trim())
      keys.push({
        key: match[1],
        model: match[2],
        budget: cols[3] || '?',
        expires: cols[5] || '?',
        status: cols[6]?.includes('New') ? '🆕' : cols[6] || '',
      })
    }
  }
  return keys
}

/** 从 GitHub 拉取最新 README（自动尝试多个镜像源） */
function fetchLatestKeys(): ApiKeyEntry[] {
  for (const url of RAW_URLS) {
    try {
      const text = execSync(`curl -sL --connect-timeout 10 "${url}"`, { encoding: 'utf-8', timeout: 15000 })
      if (text && text.length > 100) {
        return parseKeys(text)
      }
    } catch {
      continue
    }
  }
  return []
}

/** 获取当前的 freeN.json 配置文件列表 */
function getExistingConfigs(): string[] {
  if (!fs.existsSync(DOGE_DIR)) return []
  try {
    return fs.readdirSync(DOGE_DIR)
      .filter(f => /^free\d+\.json$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ''))
        const nb = parseInt(b.replace(/\D/g, ''))
        return na - nb
      })
  } catch {
    return []
  }
}

/** 读取 freeN.json 的内容 */
function readConfig(filename: string): any {
  try {
    const p = path.join(DOGE_DIR, filename)
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

/** 写入 freeN.json */
function writeConfig(filename: string, data: any): void {
  if (!fs.existsSync(DOGE_DIR)) {
    fs.mkdirSync(DOGE_DIR, { recursive: true })
  }
  fs.writeFileSync(path.join(DOGE_DIR, filename), JSON.stringify(data, null, 2), 'utf-8')
}

/** 获取可用的模型中文名 */
function modelChineseName(model: string): string {
  const names: Record<string, string> = {
    'deepseek/deepseek-v4-flash': 'DeepSeek-V4-Flash',
    'deepseek/deepseek-v4-pro': 'DeepSeek-V4-Pro',
    'openai/gpt-5.5': 'GPT-5.5',
    'openai/gpt-5.5-pro': 'GPT-5.5-Pro',
    'x-ai/grok-4.3': 'Grok-4.3',
    'google/gemini-3.1-flash-lite': 'Gemini-3.1-Flash-Lite',
    'claude-opus-4-7': 'Claude Opus 4.7',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'qwen/qwen3.5-plus-20260420': 'Qwen3.5-Plus',
    'qwen/qwen3.6-max-preview': 'Qwen3.6-Max',
  }
  return names[model] || model
}

export const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const cmd = (args || '').trim().toLowerCase()

  if (cmd === 'all' || cmd === 'update') {
    // 拉取最新 Key 并更新
    const keys = fetchLatestKeys()
    if (keys.length === 0) {
      return { type: 'text', value: '❌ 无法从 GitHub 获取最新 Key，请检查网络连接。' }
    }

    let output = `✅ 从 GitHub 获取到 ${keys.length} 个免费 Key\n`
    output += `   端点: ${BASE_URL}\n\n`

    // 只更新 free5~free10（free1~free4 是注册方案）
    let updated = 0
    let startIdx = 5

    for (const entry of keys) {
      if (startIdx > 15) break
      const filename = `free${startIdx}.json`
      // 判断是 OpenAI 还是 Anthropic 协议
      const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai')
      const config = {
        provider: isAnthropic ? 'anthropic' : 'openai',
        baseURL: BASE_URL,
        apiKey: entry.key,
        model: entry.model,
      }
      writeConfig(filename, config)
      output += `  free${startIdx}.json ← ${modelChineseName(entry.model)} (预算 ${entry.budget})\n`
      updated++
      startIdx++
    }

    output += `\n✅ 已更新 ${updated} 个配置文件`
    if (updated === 0) {
      output += '\n⚠️ 未找到新 Key，可能是 GitHub 访问受限或解析失败'
    }
    output += `\n💡 现在可以使用 d.bat free5~free${startIdx - 1} 启动`
    return { type: 'text', value: output }
  }

  else if (cmd.startsWith('free')) {
    // 更新单个文件
    const keys = fetchLatestKeys()
    if (keys.length === 0) {
      return { type: 'text', value: '❌ 无法从 GitHub 获取最新 Key。' }
    }

    const idx = parseInt(cmd.replace(/\D/g, ''))
    const localIdx = idx - 5 // free5 对应 keys[0]
    if (localIdx < 0 || localIdx >= keys.length) {
      return { type: 'text', value: `❌ free${idx} 超出范围，目前可用 Key 索引 5~${keys.length + 4}` }
    }

    const entry = keys[localIdx]
    const filename = `free${idx}.json`
    const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai')
    const config = {
      provider: isAnthropic ? 'anthropic' : 'openai',
      baseURL: BASE_URL,
      apiKey: entry.key,
      model: entry.model,
    }
    writeConfig(filename, config)

    return {
      type: 'text',
      value: `✅ free${idx}.json 已更新\n  模型: ${modelChineseName(entry.model)}\n  Key: ${entry.key.substring(0, 15)}...\n  预算: ${entry.budget}\n  过期: ${entry.expires}\n  端点: ${BASE_URL}\n\n💡 使用 d.bat free${idx} 启动`,
    }
  }

  else {
    // 默认: 列出当前状态
    const configs = getExistingConfigs()
    let output = '📋 当前免费 API 配置文件状态:\n\n'

    for (const f of configs) {
      const cfg = readConfig(f)
      if (cfg) {
        const keyMask = cfg.apiKey?.length > 15
          ? cfg.apiKey.substring(0, 10) + '...' + cfg.apiKey.slice(-5)
          : cfg.apiKey
        output += `  ${f}: ${cfg.model || '?'} | Key: ${keyMask} | ${cfg.baseURL}\n`
      } else {
        output += `  ${f}: 读取失败\n`
      }
    }

    // 如果 free5 之后没配置，显示可用的编号
    const freeFiles = configs.filter(f => /^free\d+/.test(f))
    if (freeFiles.length <= 4) {
      output += '\n⚠️ free5~freeN 尚未配置，运行 /updateapikey all 从 GitHub 拉取最新 Key\n'
    }

    output += '\n用法:\n'
    output += '  /updateapikey        - 查看当前状态\n'
    output += '  /updateapikey all    - 从 GitHub 拉取最新 Key，更新 free5~freeN\n'
    output += '  /updateapikey free5  - 仅更新指定编号的配置文件\n'

    return { type: 'text', value: output }
  }
}