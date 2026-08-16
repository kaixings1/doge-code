/**
 * 通用工具函数
 * 吸收自 langchain_core/utils/strings.py, iter.py, env.py
 * 以及 OpenManus, agno, MetaGPT, Graphiti
 *
 * - stringifyValue / stringifyDict: 任意值转字符串
 * - commaList: 数组转逗号分隔字符串
 * - sanitizeForPostgres: 移除 NUL 字节
 * - batchIterate: 迭代器分批
 * - shouldExcludeFile: 文件排除判断
 * - cleanPath: 路径清理
 * - envVarIsSet: 环境变量真值检查
 * - getFromDictOrEnv: 从 dict 或环境变量获取值
 * - isValidUUID: UUID 格式校验
 * - urlSafeString: 字符串转为 URL 安全格式
 * - hashStringSha256: SHA-256 哈希
 * - extractJsonObjects: 从文本提取 JSON 对象
 * - parseDatetimeUtc: 解析时间戳为 UTC
 * - toEpochS: 各种时间表示转 epoch 秒
 * - nowEpochS: 当前 epoch 秒
 * - ensureUtc: 确保 datetime 为 UTC
 * - convertDatetimesToStrings: 递归 Date 转 ISO 字符串
 * - isEmpty: 判断值是否为空
 */

import { createHash } from 'crypto'

// ==================== 值序列化 ====================

/**
 * 将任意值转为字符串。
 * - string: 原样返回
 * - object/dict: 每行 key: value
 * - array: 每行一项
 */
export function stringifyValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    return val.map(v => stringifyValue(v)).join('\n')
  }
  if (val !== null && typeof val === 'object') {
    return '\n' + stringifyDict(val as Record<string, unknown>)
  }
  return String(val)
}

/**
 * 将对象转为 key: value 格式的多行字符串。
 */
export function stringifyDict(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${stringifyValue(value)}`)
    .join('\n')
}

/**
 * 将数组转为逗号分隔的字符串。
 */
export function commaList(items: unknown[]): string {
  return items.map(item => String(item)).join(', ')
}

// ==================== 数据清洗 ====================

const FALSY_ENV_VALUES = new Set(['', '0', 'false', 'False'])

/**
 * 移除字符串中的 NUL 字节（\x00），防止 PostgreSQL 写入报错。
 */
export function sanitizeForPostgres(text: string, replacement = ''): string {
  return text.replace(/\x00/g, replacement)
}

/**
 * 判断环境变量是否被视为"已设置"（存在且值不为空、0、false）。
 */
export function envVarIsSet(envVar: string): boolean {
  const val = process.env[envVar]
  return val !== undefined && !FALSY_ENV_VALUES.has(val)
}

/**
 * 递归清理数据结构中所有字符串的 NUL 字节。
 */
export function sanitizePostgresStrings(data: unknown): unknown {
  if (typeof data === 'string') {
    return sanitizeForPostgres(data)
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizePostgresStrings(item))
  }
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = sanitizePostgresStrings(value)
    }
    return result
  }
  return data
}

// ==================== 迭代分批 ====================

/**
 * 将可迭代对象按固定大小分批产出。
 * 如果 size 为 null，产出整个可迭代对象作为单个批次。
 */
export function* batchIterate<T>(size: number | null, iterable: Iterable<T>): IterableIterator<T[]> {
  const it = iterable[Symbol.iterator]()
  if (size === null) {
    yield Array.from(it)
    return
  }
  while (true) {
    const chunk: T[] = []
    for (let i = 0; i < size; i++) {
      const next = it.next()
      if (next.done) break
      chunk.push(next.value)
    }
    if (chunk.length === 0) return
    yield chunk
  }
}

// ==================== 文件路径工具 ====================

const EXCLUDED_FILES = new Set([
  '.DS_Store', '.gitignore', 'package-lock.json',
  'postcss.config.js', 'postcss.config.mjs', 'jsconfig.json',
  'components.json', 'tsconfig.tsbuildinfo', 'tsconfig.json',
])

const EXCLUDED_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git',
])

const EXCLUDED_EXT = new Set([
  '.ico', '.svg', '.png', '.jpg', '.jpeg', '.gif',
  '.bmp', '.tiff', '.webp', '.db', '.sql',
])

/**
 * 判断文件是否应被排除（基于文件名、所在目录或扩展名）。
 */
export function shouldExcludeFile(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/)
  const filename = parts[parts.length - 1] || ''
  if (EXCLUDED_FILES.has(filename)) return true

  const lastSep = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'))
  const dirPath = lastSep >= 0 ? relPath.slice(0, lastSep) : ''
  for (const excluded of EXCLUDED_DIRS) {
    if (dirPath.includes(excluded)) return true
  }

  const ext = relPath.slice(relPath.lastIndexOf('.'))
  if (EXCLUDED_EXT.has(ext.toLowerCase())) return true

  return false
}

/**
 * 清理路径：去掉前导斜杠和 /workspace 前缀，转为相对路径。
 */
export function cleanPath(path: string, workspacePath = '/workspace'): string {
  let result = path.replace(/^\/+/, '')
  const wsNoSlash = workspacePath.replace(/^\/+/, '')
  if (result.startsWith(wsNoSlash)) {
    result = result.slice(wsNoSlash.length)
  }
  if (result.startsWith('workspace/')) {
    result = result.slice(9)
  }
  return result.replace(/^\/+/, '')
}

// ==================== 环境变量工具 ====================

/**
 * 从字典或环境变量获取值。
 * 先在 data 中查找 key，找不到则查找环境变量 envKey。
 */
export function getFromDictOrEnv(
  data: Record<string, unknown>,
  key: string | string[],
  envKey: string,
  defaultVal: string | undefined = undefined,
): string {
  const keys = Array.isArray(key) ? key : [key]
  for (const k of keys) {
    const v = data[k]
    if (v !== undefined && v !== null && String(v) !== '') {
      return String(v)
    }
  }
  const envVal = process.env[envKey]
  if (envVal !== undefined) return envVal
  if (defaultVal !== undefined) return defaultVal
  const keyStr = Array.isArray(key) ? key[0] : key
  throw new Error(
    `Did not find ${keyStr}, please add an environment variable \`${envKey}\` which contains it, or pass \`${keyStr}\` as a named parameter.`,
  )
}

// ==================== UUID 与标识符 ====================

/**
 * 检查字符串是否为合法的 UUID 格式。
 */
export function isValidUUID(uuidStr: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidStr)
}

/**
 * 将字符串转为 URL 安全格式（小写、连字符分隔、去除特殊字符）。
 */
export function urlSafeString(input: string): string {
  let result = input.replace(/ /g, '-')
  result = result.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  result = result.replace(/_/g, '-')
  result = result.replace(/[^\w\-.]/g, '')
  result = result.replace(/-+/g, '-')
  return result
}

/**
 * 计算字符串的 SHA-256 哈希十六进制值。
 */
export function hashStringSha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// ==================== JSON 提取 ====================

/**
 * 从文本中提取顶层 JSON 对象字符串列表（追踪花括号深度，不依赖正则）。
 */
export function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  let braceDepth = 0
  let startIdx: number | null = null
  let inString = false
  let escape = false

  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' && braceDepth === 0) {
      startIdx = idx
    }
    if (ch === '{') {
      braceDepth++
    } else if (ch === '}') {
      braceDepth--
      if (braceDepth === 0 && startIdx !== null) {
        objects.push(text.slice(startIdx, idx + 1))
        startIdx = null
      }
    }
  }
  return objects
}

/**
 * 清洗 LLM 输出中的 JSON 内容：移除代码块标记、控制字符、Markdown 格式。
 * 吸收自 agno (agno/utils/string.py)
 */
export function cleanJsonContent(content: string): string {
  // Handle code blocks
  if (content.includes('```json')) {
    content = content.split('```json').pop()?.trim() ?? content
    const parts = content.split('```')
    if (parts.length > 1) {
      parts.pop()
      content = parts.join('```')
    }
  } else if (content.includes('```')) {
    const parts = content.split('```')
    if (parts.length > 1) {
      content = parts[1].trim()
    }
  }

  // Replace markdown formatting like *"name"* or `"name"` with "name"
  content = content.replace(/[*`#]?"([A-Za-z0-9_]+)"[*`#]?/g, '"$1"')

  // Handle newlines and control characters
  content = content.replace(/\n/g, ' ').replace(/\r/g, '')
  content = content.replace(/[\x00-\x1F\x7F]/g, '')

  // Escape quotes only in values, not keys
  content = content.replace(
    /"([^"]+)"\s*:\s*"(.*?)"(?=\s*(?:,|\}))/g,
    (match, key, value) => {
      const escapedValue = value.replace(/"/g, '\\"')
      return `"${key}": "${escapedValue}"`
    },
  )

  return content
}

/**
 * 解析可能不完整的 JSON 字符串（缺失闭合花括号/方括号、字符串未闭合）。
 * 吸收自 langchain_core/utils/json.py
 */
export function parsePartialJson(s: string): unknown {
  // First try direct parse
  try {
    return JSON.parse(s)
  } catch {
    // continue with repair
  }

  const stack: string[] = []
  let inString = false
  let escaped = false
  const result: string[] = []

  for (const char of s) {
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
    } else {
      if (char === '"') {
        inString = true
      } else if (char === '{') {
        stack.push('}')
      } else if (char === '[') {
        stack.push(']')
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop()
        }
      }
    }
    result.push(char)
  }

  // Close unclosed string
  if (inString) {
    if (escaped) result.pop()
    result.push('"')
  }

  // Append closing brackets in reverse order
  const closing = stack.reverse().join('')

  // Try with all closings, then progressively remove chars
  const attempts = [
    result.join('') + closing,
  ]

  for (let i = result.length - 1; i >= 0; i--) {
    attempts.push(result.slice(0, i).join('') + closing)
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt)
    } catch {
      // try next
    }
  }

  throw new Error('Unable to parse partial JSON')
}

// ==================== 时间工具 ====================

/**
 * 将各种时间表示归一化为 epoch 秒（UTC）。
 */
export function toEpochS(value: Date | string | number): number {
  if (typeof value === 'number') {
    return Math.floor(value)
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }
  const s = (value as string).trim()
  if (s.endsWith('Z')) {
    return Math.floor(new Date(s).getTime() / 1000)
  }
  return Math.floor(new Date(s + 'Z').getTime() / 1000)
}

/**
 * 获取当前 UTC 时间的 epoch 秒。
 */
export function nowEpochS(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * 将 ISO 8601 字符串解析为 UTC 时间。
 */
export function parseDatetimeUtc(value: string | Date): Date {
  let s: string
  if (value instanceof Date) {
    const d = value
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
  }
  s = (value as string).trim()
  let isoStr = s
  if (s.endsWith('Z')) {
    isoStr = s.slice(0, -1) + '+00:00'
  }
  const dt = new Date(isoStr)
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),
    dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds()))
}

/**
 * 确保 datetime 为 UTC 时区。
 * - null 输入返回 null
 * - 无效 Date 原样返回
 * JavaScript Date 内部始终存 UTC 时间戳，直接返回即可。
 */
export function ensureUtc(dt: Date | null | undefined): Date | null {
  if (dt === null || dt === undefined) return null
  if (Number.isNaN(dt.getTime())) return dt
  return dt
}

/**
 * 递归将对象中的 Date 转为 ISO 8601 字符串。
 */
export function convertDatetimesToStrings(data: unknown): unknown {
  if (data instanceof Date) {
    return data.toISOString()
  }
  if (Array.isArray(data)) {
    return data.map(item => convertDatetimesToStrings(item))
  }
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = convertDatetimesToStrings(value)
    }
    return result
  }
  return data
}

// ==================== 通用检查 ====================

/**
 * 判断值是否为 null、空字符串或空集合。
 */
export function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true
  if (typeof val === 'string' && val.length === 0) return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && Object.keys(val as object).length === 0) return true
  return false
}
