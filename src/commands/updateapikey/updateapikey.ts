/**
 * updateapikey - 从 alistaitsacle/free-llm-api-keys 项目拉取最新免费 API Key
 * 更新到 .doge/free*.json 中（free1~free4 为注册方案，本命令从 free5 开始更新）
 *
 * 用法: /updateapikey [free5|free6|...|all]
 *   /updateapikey      - 列出当前 Key 状态
 *   /updateapikey all  - 拉取最新 Key 并更新到 free5~freeN
 *   /updateapikey free5 - 仅更新指定编号的配置文件
 *
 * 日志: 每次操作记录到 updateapikey.log（位于项目根目录），
 *       包含请求/响应/耗时/错误等详细信息，用于排查问题。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import type { Message } from '../../types/message.js'

// ---------- 日志模块 ----------
const LOG_FILE = path.resolve('updateapikey.log')
const MAX_LOG_SIZE = 2 * 1024 * 1024 // 2MB 自动轮转

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: Record<string, any>): void {
  const timestamp = new Date().toISOString()
  const extraStr = extra ? ' | ' + JSON.stringify(extra) : ''
  const line = `[${timestamp}] [${level}] ${msg}${extraStr}${os.EOL}`
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE)
      if (stat.size > MAX_LOG_SIZE) {
        const content = fs.readFileSync(LOG_FILE, 'utf-8')
        const truncated = content.slice(-MAX_LOG_SIZE / 2)
        fs.writeFileSync(LOG_FILE, '[日志截断: 旧日志已清理]\n' + truncated, 'utf-8')
      }
    }
    fs.appendFileSync(LOG_FILE, line, 'utf-8')
  } catch {
    // 日志写入失败不阻塞主流程
  }
}

// ---------- 常量 ----------
const RAW_URLS = [
  'https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://raw.fastgit.org/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://gh.axlg.workers.dev/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
  'https://mirror.ghproxy.com/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
]
const BASE_OPENAI = 'https://aiapiv2.pekpik.com/v1/chat/completions'
const BASE_ANTHROPIC = 'https://aiapiv2.pekpik.com/'
/** 多端点轮换池：第一个有效端点优先，其余作为 fallback */
const OPENAI_ENDPOINTS = [
  'https://aiapiv2.pekpik.com/v1/chat/completions',
  'https://aiapiv2.pekpik.com/v1/chat/completions',
  'https://openrouter.ai/api/v1/chat/completions',
]
const ANTHROPIC_ENDPOINTS = [
  'https://aiapiv2.pekpik.com/',
]
const DOGE_DIR = path.resolve('.doge')
const TEST_TIMEOUT = 15000 // 每个 Key 测试超时 15 秒
const TEST_MAX_TOKENS = 50  // 请求 50 个 token 验证实际可用性
const SERIAL_DELAY_MS = 2000 // 串行测试时每个 Key 间隔（毫秒），防止触发限流

/** 测试结果 */
interface TestResult {
  ok: boolean
  status?: number
  message: string
  endpoint?: string  // 实际测试通过的完整 endpoint URL
}

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
    // 匹配表格行: | `sk-xxx` | model | budget | ... | expires | status
    const row = line
      .split('|')
      .map(c => c.trim().replace(/^`|`$/g, ''))
      .filter(c => c.length > 0)
    // 表格行应有至少 5 列，且第一列为 sk- 开头
    if (row.length >= 5 && row[0].startsWith('sk-')) {
      keys.push({
        key: row[0],
        model: row[1] || '?',
        budget: row[2] || '?',
        expires: row[row.length - 2] || '?',
        status: row[row.length - 1]?.includes('New') ? '🆕' : row[row.length - 1] || '',
      })
    }
  }
  return keys
}

/** 从 GitHub 拉取最新 README（自动尝试多个镜像源） */
async function fetchLatestKeys(): Promise<ApiKeyEntry[]> {
  let lastError: string = ''
  log('INFO', '开始拉取免费 API Key', { totalUrls: RAW_URLS.length, urls: RAW_URLS })

  for (let i = 0; i < RAW_URLS.length; i++) {
    const url = RAW_URLS[i]
    const startTime = Date.now()
    log('INFO', `尝试镜像源 #${i + 1}`, { url })

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(url, {
        signal: controller.signal,
        // 跳过 SSL 证书验证（Windows 上 GitHub 证书链有时不完整）
        ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
      })
      clearTimeout(timeout)

      const elapsed = Date.now() - startTime
      log('INFO', `镜像源 #${i + 1} 响应`, { url, status: res.status, statusText: res.statusText, elapsedMs: elapsed })

      if (!res.ok) {
        const bodyPreview = await res.text().then(t => t.slice(0, 200)).catch(() => '')
        log('WARN', `镜像源 #${i + 1} 状态码异常`, { url, status: res.status, bodyPreview })
        continue
      }

      const text = await res.text()
      log('INFO', `镜像源 #${i + 1} 返回数据`, { url, length: text.length, elapsedMs: Date.now() - startTime })

      if (text && text.length > 100) {
        const keys = parseKeys(text)
        log('INFO', `解析成功`, { url, keyCount: keys.length, keys: keys.map(k => ({ model: k.model, budget: k.budget })) })
        return keys
      } else {
        log('WARN', `镜像源 #${i + 1} 返回数据过短`, { url, length: text.length })
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      const errMsg = err?.message || String(err)
      log('WARN', `镜像源 #${i + 1} 请求失败`, { url, error: errMsg, elapsedMs: elapsed })
      lastError = errMsg
    }
  }

  log('ERROR', '所有镜像源均失败', { lastError })
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

/** 通过多个端点轮换测试单个 Key，429 时自动切换到下一个端点 */
async function testKey(entry: ApiKeyEntry): Promise<TestResult> {
  const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai')
  const endpoints = isAnthropic ? ANTHROPIC_ENDPOINTS : OPENAI_ENDPOINTS
  const startTime = Date.now()

  for (let epIdx = 0; epIdx < endpoints.length; epIdx++) {
    const endpoint = endpoints[epIdx]
    const epLabel = endpoint.replace(/https?:\/\//, '').split('/')[0]

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT)

      let res: Response
      if (isAnthropic) {
        res = await fetch(`${endpoint}v1/messages`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': entry.key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: entry.model,
            max_tokens: TEST_MAX_TOKENS,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
        })
      } else {
        res = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${entry.key}`,
          },
          body: JSON.stringify({
            model: entry.model,
            max_tokens: TEST_MAX_TOKENS,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
        })
      }
      clearTimeout(timeout)
      const elapsed = Date.now() - startTime

      if (res.ok) {
        const providerLabel = isAnthropic ? 'Anthropic' : 'OpenAI'
        log('INFO', `Key 测试通过 (${providerLabel})`, { endpoint: epLabel, model: entry.model, elapsedMs: elapsed, keyPreview: entry.key.substring(0, 12) + '...' })
        return { ok: true, status: res.status, message: `通过 (${elapsed}ms, ${epLabel})`, endpoint }
      }

      // 429 / 403 时尝试下一个端点，其他错误直接返回
      if (res.status === 429 || res.status === 403) {
        log('WARN', `端点被限流，尝试备用端点`, { endpoint: epLabel, status: res.status, model: entry.model })
        continue
      }

      const body = await res.text().catch(() => '')
      const reason = isAnthropic
        ? (body.includes('max_tokens') || body.includes('credits') ? '额度不足' :
           body.includes('no access') ? '无权访问' :
           body.includes('expired') ? '已过期' :
           `状态码 ${res.status}`)
        : (body.includes('402') || body.includes('credits') ? '额度不足' :
           body.includes('no access') ? '无权访问' :
           body.includes('expired') ? '已过期' :
           `状态码 ${res.status}`)
      log('WARN', `Key 测试失败`, { endpoint: epLabel, model: entry.model, status: res.status, reason, elapsedMs: elapsed, keyPreview: entry.key.substring(0, 12) + '...' })
      return { ok: false, status: res.status, message: reason }
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      const errMsg = err?.message || String(err)
      log('WARN', `端点请求异常，尝试备用端点`, { endpoint: epLabel, error: errMsg, elapsedMs: elapsed })
      // 网络异常时继续尝试下一个端点
      continue
    }
  }

  const elapsed = Date.now() - startTime
  log('WARN', `所有端点均失败`, { model: entry.model, elapsedMs: elapsed })
  return { ok: false, message: '所有端点均超时/限流' }
}

export const call: LocalCommandCall = async (args: string, context): Promise<LocalCommandResult> => {
  const now = new Date()
  const timeStamp = `[${now.toLocaleString()}]`
  const cmd = (args || '').trim().toLowerCase()

  /** 通过 context.setMessages 追加或替换最后一条消息 */
  function pushProgress(text: string, replaceLast = false) {
    if (context?.setMessages) {
      context.setMessages(prev => {
        if (replaceLast && prev.length > 0) {
          const last = prev[prev.length - 1]
          if (last.type === 'assistant' && (last as any).isMeta) {
            return [
              ...prev.slice(0, -1),
              { ...last, uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, message: { content: [{ type: 'text', text }] } },
            ]
          }
        }
        return [
          ...prev,
          {
            type: 'assistant' as const,
            isMeta: true,
            uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            message: { content: [{ type: 'text', text }] },
          } as Message,
        ]
      })
    }
  }

  if (cmd === 'all' || cmd === 'update') {
    log('INFO', '开始执行全量更新', { mode: 'all' })

    pushProgress(`${timeStamp} 🚀 正在从 GitHub 获取最新 Key...`)
    const keys = await fetchLatestKeys()
    if (keys.length === 0) {
      log('ERROR', '全量更新失败：获取 Key 为空')
      return { type: 'text', value: `${timeStamp} ❌ 无法从 GitHub 获取最新 Key，请检查网络连接。\n📋 详情请查看 updateapikey.log` }
    }

    let output = `✅ 从 GitHub 获取到 ${keys.length} 个免费 Key，开始逐串行测试可用性...\n`
    output += `   端点池: ${OPENAI_ENDPOINTS.length} 个 (429/403 自动轮换) | 间隔: ${SERIAL_DELAY_MS}ms\n\n`
    pushProgress(output)

    // 更新 free5~freeN（free1~free4 为注册方案，跳过）
    const startIdx = 5
    const maxFiles = Math.min(keys.length, 32) // free5~free36，充分利用全部 Key
    let updated = 0
    let passed = 0
    let failed = 0

    for (let localIdx = 0; localIdx < maxFiles; localIdx++) {
      const entry = keys[localIdx]
      const i = startIdx + localIdx // 实际 free 编号
      const filename = `free${i}.json`
      const displayName = modelChineseName(entry.model)
      const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai')

      // 间隔延迟，防止并发触发限流
      if (localIdx > 0) {
        await new Promise(resolve => setTimeout(resolve, SERIAL_DELAY_MS))
      }

      // 先输出正在测试的提示
      pushProgress(`  ${filename} ← ${displayName} ... ⏳`)

      const testResult = await testKey(entry)

      if (testResult.ok) {
        // 测试通过，写入配置（记录实际生效的 endpoint）
        const usedEndpoint = testResult.endpoint || (isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI)
        const config = {
          provider: isAnthropic ? 'anthropic' : 'openai',
          baseURL: usedEndpoint,
          apiKey: entry.key,
          model: entry.model,
        }
        writeConfig(filename, config)
        log('INFO', `写入配置文件`, { filename, model: entry.model, budget: entry.budget, baseURL: usedEndpoint, keyPreview: entry.key.substring(0, 12) + '...' })
        output += `  ${filename} ← ${displayName} ... ✅ ${testResult.message}\n`
        passed++
        updated++
        pushProgress(`  ${filename} ← ${displayName} ... ✅ ${testResult.message}`, true)
      } else {
        output += `  ${filename} ← ${displayName} ... ❌ ${testResult.message}\n`
        failed++
        log('INFO', `跳过写入`, { filename, reason: testResult.message })
        pushProgress(`  ${filename} ← ${displayName} ... ❌ ${testResult.message}`, true)
      }
    }

    output += `\n📊 测试结果: ✅ ${passed} 个可用 | ❌ ${failed} 个不可用`
    output += `\n✅ 已更新 ${updated} 个配置文件（仅写入测试通过的 Key）`
    if (updated === 0) {
      output += '\n⚠️ 所有 Key 均不可用，可能是代理服务器或 GitHub 源有问题'
    }
    output += `\n💡 现在可以使用 d.bat free${startIdx}~free${startIdx + updated - 1} 启动`
    log('INFO', '全量更新完成', { total: maxFiles, passed, failed, updated })
    return { type: 'text', value: timeStamp + '\n' + output }
  }

  else if (cmd.startsWith('free')) {
    // 更新单个文件
    const idx = parseInt(cmd.replace(/\D/g, ''))
    if (idx < 5) {
      return { type: 'text', value: `${timeStamp} ❌ free${idx} 是注册方案，本命令仅支持更新 free5 及以上配置文件。` }
    }
    log('INFO', `开始更新单个配置文件`, { filename: `free${idx}.json` })

    pushProgress(`${timeStamp} 🚀 正在从 GitHub 获取最新 Key...`)
    const keys = await fetchLatestKeys()
    if (keys.length === 0) {
      log('ERROR', `free${idx} 更新失败：获取 Key 为空`)
      return { type: 'text', value: `${timeStamp} ❌ 无法从 GitHub 获取最新 Key。\n📋 详情请查看 updateapikey.log` }
    }

    // free5 对应 keys[0]
    const localIdx = idx - 5
    if (localIdx < 0 || localIdx >= keys.length) {
      log('WARN', `free${idx} 超出范围`, { localIdx, keyCount: keys.length })
      return { type: 'text', value: `${timeStamp} ❌ free${idx} 超出范围，目前可用免费 Key 范围 free5~free${keys.length + 4}` }
    }

    const entry = keys[localIdx]
    const filename = `free${idx}.json`
    const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai')
    const displayName = modelChineseName(entry.model)

    // 先输出正在测试的提示
    pushProgress(`📡 正在测试 ${displayName} ... ⏳`)

    // 先测试可用性
    const testResult = await testKey(entry)
    let output = `📡 测试 ${displayName} ... ${testResult.ok ? '✅' : '❌'} ${testResult.message}\n`

    if (testResult.ok) {
      // 测试通过才写入
      const config = {
        provider: isAnthropic ? 'anthropic' : 'openai',
        baseURL: isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI,
        apiKey: entry.key,
        model: entry.model,
      }
      writeConfig(filename, config)
      log('INFO', `配置文件已更新`, { filename, model: entry.model, budget: entry.budget, keyPreview: entry.key.substring(0, 12) + '...' })
      output += `\n✅ free${idx}.json 已更新\n  模型: ${displayName}\n  预算: ${entry.budget}\n  过期: ${entry.expires}\n  端点: ${isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI}\n\n💡 使用 d.bat free${idx} 启动`
      pushProgress(`📡 测试 ${displayName} ... ✅ ${testResult.message}`, true)
    } else {
      output += `\n❌ free${idx}.json 跳过更新（Key 不可用）\n  原因: ${testResult.message}`
      pushProgress(`📡 测试 ${displayName} ... ❌ ${testResult.message}`, true)
    }

    return { type: 'text', value: timeStamp + '\n' + output }
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

    output += '\n用法:\n'
    output += '  /updateapikey        - 查看当前状态\n'
    output += '  /updateapikey all    - 从 GitHub 拉取最新 Key，全部覆盖更新 free1~freeN\n'
    output += '  /updateapikey free5  - 仅更新指定编号的配置文件\n'
    output += '\n📋 详细日志已写入 updateapikey.log\n'

    return { type: 'text', value: timeStamp + '\n' + output }
  }
}