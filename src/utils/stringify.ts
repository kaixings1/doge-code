/**
 * 通用工具函数
 * 吸收自 langchain_core/utils/strings.py, iter.py, env.py
 * 以及 OpenManus app/utils/files_utils.py
 *
 * - stringifyValue / stringifyDict: 任意值转字符串
 * - commaList: 数组转逗号分隔字符串
 * - sanitizeForPostgres: 移除 NUL 字节
 * - batchIterate: 迭代器分批
 * - shouldExcludeFile: 文件排除判断
 * - cleanPath: 路径清理
 * - envVarIsSet: 环境变量真值检查
 * - getFromDictOrEnv: 从 dict 或环境变量获取值
 */

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

/**
 * 应排除的文件名集合。
 */
const EXCLUDED_FILES = new Set([
  '.DS_Store',
  '.gitignore',
  'package-lock.json',
  'postcss.config.js',
  'postcss.config.mjs',
  'jsconfig.json',
  'components.json',
  'tsconfig.tsbuildinfo',
  'tsconfig.json',
])

/**
 * 应排除的目录名集合。
 */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
])

/**
 * 应排除的文件扩展名集合。
 */
const EXCLUDED_EXT = new Set([
  '.ico',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.webp',
  '.db',
  '.sql',
])

/**
 * 判断文件是否应被排除（基��文件名、所在目录或扩展名）。
 */
export function shouldExcludeFile(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/)
  const filename = parts[parts.length - 1] || ''
  if (EXCLUDED_FILES.has(filename)) return true

  const dirPath = relPath.slice(0, relPath.lastIndexOf(/[\\/]/))
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
