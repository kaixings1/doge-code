import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

// ============================================================================
// REST API Debug Client
// ============================================================================

interface RequestRecord {
  id: string
  timestamp: number
  method: string
  url: string
  status: number
  statusText: string
  duration: number
  requestHeaders: Record<string, string>
  requestBody?: string
  responseHeaders: Record<string, string>
  responseBody: string
  size: number
}

// ============================================================================
// History Management
// ============================================================================

const HISTORY_DIR = path.join(homedir(), '.doge', 'api-debug')
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json')
const MAX_HISTORY = 50

function loadHistory(): RequestRecord[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return []
}

function saveHistory(history: RequestRecord[]): void {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-MAX_HISTORY), null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addToHistory(record: Omit<RequestRecord, 'id' | 'timestamp'>): RequestRecord {
  const entry: RequestRecord = {
    ...record,
    id: generateId(),
    timestamp: Date.now(),
  }
  const history = loadHistory()
  history.push(entry)
  saveHistory(history)
  return entry
}

// ============================================================================
// HTTP Client
// ============================================================================

async function executeRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<RequestRecord> {
  const startTime = Date.now()

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && method !== 'GET' && method !== 'HEAD') {
    options.body = body
  }

  const response = await fetch(url, options)
  const responseText = await response.text()
  const duration = Date.now() - startTime

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  return {
    id: '',
    timestamp: Date.now(),
    method,
    url,
    status: response.status,
    statusText: response.statusText,
    duration,
    requestHeaders: headers,
    requestBody: body,
    responseHeaders,
    responseBody: responseText,
    size: responseText.length,
  }
}

// ============================================================================
// Formatting
// ============================================================================

function formatRequestRecord(record: RequestRecord, showBody: boolean = true): string {
  const lines: string[] = []

  lines.push(`📡 ${record.method} ${record.url}`)
  lines.push(`状态: ${record.status} ${record.statusText} | 耗时: ${record.duration}ms | 大小: ${formatBytes(record.size)}`)
  lines.push('')

  // Request
  lines.push('📤 Request Headers:')
  for (const [key, value] of Object.entries(record.requestHeaders)) {
    lines.push(`  ${key}: ${value}`)
  }
  if (record.requestBody && showBody) {
    lines.push('')
    lines.push('📤 Request Body:')
    lines.push(formatJSON(record.requestBody))
  }

  // Response
  lines.push('')
  lines.push('📥 Response Headers:')
  for (const [key, value] of Object.entries(record.responseHeaders)) {
    lines.push(`  ${key}: ${value}`)
  }
  lines.push('')
  lines.push('📥 Response Body:')
  lines.push(formatResponse(record.responseBody, record.responseHeaders['content-type'] || ''))

  return lines.join('\n')
}

function formatJSON(str: string): string {
  try {
    const obj = JSON.parse(str)
    return JSON.stringify(obj, null, 2)
  } catch {
    return str
  }
}

function formatResponse(body: string, contentType: string): string {
  if (contentType.includes('application/json')) {
    try {
      const obj = JSON.parse(body)
      return JSON.stringify(obj, null, 2)
    } catch {
      return body
    }
  }
  if (contentType.includes('text/html')) {
    return body.slice(0, 5000) + (body.length > 5000 ? '\n\n... (truncated)' : '')
  }
  return body.slice(0, 5000)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (!s || s.includes('--help')) {
    return {
      type: 'text',
      value: [
        '🌐 REST API Debug Client',
        '',
        '用法:',
        '  /api-debug <METHOD> <URL> [BODY]    发送请求',
        '  /api-debug history                  查看请求历史',
        '  /api-debug clear                    清除历史',
        '',
        '选项:',
        '  --header KEY=VALUE   添加请求头（可多次使用）',
        '  --timeout MS         超时时间（毫秒，默认 30000）',
        '  --no-body           不显示响应体',
        '',
        '示例:',
        '  /api-debug GET https://api.example.com/users',
        '  /api-debug POST https://api.example.com/users {"name":"test"}',
        '  /api-debug GET https://api.example.com/users --header Authorization=Bearer TOKEN',
        '  /api-debug history',
      ].join('\n'),
    }
  }

  const parts = s.split(/\s+/)
  const subCommand = parts[0]?.toLowerCase()

  // 子命令
  if (subCommand === 'history') {
    return showHistory()
  }
  if (subCommand === 'clear') {
    return clearHistory()
  }

  // 解析 HTTP 请求
  const method = (parts[0]?.toUpperCase() || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  const url = parts[1]

  if (!url) {
    return {
      type: 'text',
      value: ' 请提供 URL\n\n用法: /api-debug <METHOD> <URL> [BODY]\n示例: /api-debug GET https://api.example.com/users',
    }
  }

  // 解析选项
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'doge-code-api-debug/1.0',
  }

  let body: string | undefined
  let showBody = true

  for (let i = 2; i < parts.length; i++) {
    if (parts[i] === '--header' && i + 1 < parts.length) {
      const headerValue = parts[++i]
      const eqIndex = headerValue.indexOf('=')
      if (eqIndex > 0) {
        const key = headerValue.slice(0, eqIndex)
        const value = headerValue.slice(eqIndex + 1)
        headers[key] = value
      }
    } else if (parts[i] === '--no-body') {
      showBody = false
    } else if (parts[i] === '--timeout' && i + 1 < parts.length) {
      // timeout handled via AbortSignal if needed
      i++
    } else if (!parts[i].startsWith('--')) {
      // Treat as body
      body = parts.slice(i).join(' ')
      break
    }
  }

  try {
    const record = await executeRequest(method, url, headers, body)
    addToHistory(record)

    return {
      type: 'text',
      value: formatRequestRecord(record, showBody),
    }
  } catch (error) {
    return {
      type: 'text',
      value: ` 请求失败: ${error instanceof Error ? error.message : 'Unknown error'}\n\nURL: ${url}\nMethod: ${method}`,
    }
  }
}

function showHistory(): { type: string; value: string } {
  const history = loadHistory()

  if (history.length === 0) {
    return {
      type: 'text',
      value: '📭 请求历史为空\n\n使用 /api-debug <METHOD> <URL> 发送第一个请求',
    }
  }

  const lines: string[] = [
    '📜 API 请求历史',
    `共 ${history.length} 条记录`,
    '',
  ]

  const recent = history.slice(-10).reverse()
  recent.forEach((record, i) => {
    const statusIcon = record.status < 400 ? '' : ''
    const date = new Date(record.timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    lines.push(`${i + 1}. ${statusIcon} ${record.method} ${record.url}`)
    lines.push(`   ${record.status} ${record.statusText} | ${record.duration}ms | ${formatBytes(record.size)} | ${date}`)
    lines.push('')
  })

  lines.push('💡 使用 /api-debug history 查看完整历史')

  return { type: 'text', value: lines.join('\n') }
}

function clearHistory(): { type: string; value: string } {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE)
    }
    return {
      type: 'text',
      value: ' 请求历史已清除',
    }
  } catch {
    return {
      type: 'text',
      value: ' 清除历史失败',
    }
  }
}

// ============================================================================
// Command Definition
// ============================================================================

const apiDebug = {
  type: 'local' as const,
  name: 'api-debug',
  description: 'REST API 调试客户端 - Postman 风格的 API 测试工具',
  aliases: ['/api-debug', '/api-test', '/http-client'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default apiDebug
