import { open, readFile, stat } from 'fs/promises'
import {
  applyEdits,
  modify,
  parse as parseJsonc,
} from 'jsonc-parser/lib/esm/main.js'
import { stripBOM } from './jsonRead.js'
import { logError } from './log.js'
import { memoizeWithLRU } from './memoize.js'
import { jsonStringify } from './slowOperations.js'

type CachedParse = { ok: true; value: unknown } | { ok: false }

// Memoized inner parse. Uses a discriminated-union wrapper because:
// 1. memoizeWithLRU requires NonNullable<unknown>, but JSON.parse can return
//    null (e.g. JSON.parse("null")).
// 2. Invalid JSON must also be cached — otherwise repeated calls with the same
//    bad string re-parse and re-log every time (behavioral regression vs the
//    old lodash memoize which wrapped the entire try/catch).
// Bounded to 50 entries to prevent unbounded memory growth — previously this
// used lodash memoize which cached every unique JSON string forever (settings,
// .mcp.json, notebooks, tool results), causing a significant memory leak.
// Note: shouldLogError is intentionally excluded from the cache key (matching
// lodash memoize default resolver = first arg only).
// Skip caching above this size — the LRU stores the full string as the key,
// so a 200KB config file would pin ~10MB in #keyList across 50 slots. Large
// inputs like ~/.claude.json also change between reads (numStartups bumps on
// every CC startup), so the cache never hits anyway.
const PARSE_CACHE_MAX_KEY_BYTES = 8 * 1024

function parseJSONUncached(json: string, shouldLogError: boolean): CachedParse {
  try {
    return { ok: true, value: JSON.parse(stripBOM(json)) }
  } catch (e) {
    if (shouldLogError) {
      logError(e)
    }
    return { ok: false }
  }
}

const parseJSONCached = memoizeWithLRU(parseJSONUncached, json => json, 50)

// Important: memoized for performance (LRU-bounded to 50 entries, small inputs only).
export const safeParseJSON = Object.assign(
  function safeParseJSON(
    json: string | null | undefined,
    shouldLogError: boolean = true,
  ): unknown {
    if (!json) return null
    const result =
      json.length > PARSE_CACHE_MAX_KEY_BYTES
        ? parseJSONUncached(json, shouldLogError)
        : parseJSONCached(json, shouldLogError)
    return result.ok ? result.value : null
  },
  { cache: parseJSONCached.cache },
)

/**
 * Safely parse JSON with comments (jsonc).
 * This is useful for VS Code configuration files like keybindings.json
 * which support comments and other jsonc features.
 */
export function safeParseJSONC(json: string | null | undefined): unknown {
  if (!json) {
    return null
  }
  try {
    // Strip BOM before parsing - PowerShell 5.x adds BOM to UTF-8 files
    return parseJsonc(stripBOM(json))
  } catch (e) {
    logError(e)
    return null
  }
}

/**
 * Modify a jsonc string by adding a new item to an array, preserving comments and formatting.
 * @param content The jsonc string to modify
 * @param newItem The new item to add to the array
 * @returns The modified jsonc string
 */
/**
 * Bun.JSONL.parseChunk if available, false otherwise.
 * Supports both strings and Buffers, minimizing memory usage and copies.
 * Also handles BOM stripping internally.
 */
type BunJSONLParseChunk = (
  data: string | Buffer,
  offset?: number,
) => { values: unknown[]; error: null | Error; read: number; done: boolean }

const bunJSONLParse: BunJSONLParseChunk | false = (() => {
  if (typeof Bun === 'undefined') return false
  const b = Bun as Record<string, unknown>
  const jsonl = b.JSONL as Record<string, unknown> | undefined
  if (!jsonl?.parseChunk) return false
  return jsonl.parseChunk as BunJSONLParseChunk
})()

function parseJSONLBun<T>(data: string | Buffer): T[] {
  const parse = bunJSONLParse as BunJSONLParseChunk
  const len = data.length
  const result = parse(data)
  if (!result.error || result.done || result.read >= len) {
    return result.values as T[]
  }
  // Had an error mid-stream — collect what we got and keep going
  let values = result.values as T[]
  let offset = result.read
  while (offset < len) {
    const newlineIndex =
      typeof data === 'string'
        ? data.indexOf('\n', offset)
        : data.indexOf(0x0a, offset)
    if (newlineIndex === -1) break
    offset = newlineIndex + 1
    const next = parse(data, offset)
    if (next.values.length > 0) {
      values = values.concat(next.values as T[])
    }
    if (!next.error || next.done || next.read >= len) break
    offset = next.read
  }
  return values
}

function parseJSONLBuffer<T>(buf: Buffer): T[] {
  const bufLen = buf.length
  let start = 0

  // Strip UTF-8 BOM (EF BB BF)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3
  }

  const results: T[] = []
  while (start < bufLen) {
    let end = buf.indexOf(0x0a, start)
    if (end === -1) end = bufLen

    const line = buf.toString('utf8', start, end).trim()
    start = end + 1
    if (!line) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      // Skip malformed lines
    }
  }
  return results
}

function parseJSONLString<T>(data: string): T[] {
  const stripped = stripBOM(data)
  const len = stripped.length
  let start = 0

  const results: T[] = []
  while (start < len) {
    let end = stripped.indexOf('\n', start)
    if (end === -1) end = len

    const line = stripped.substring(start, end).trim()
    start = end + 1
    if (!line) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      // Skip malformed lines
    }
  }
  return results
}

/**
 * Parses JSONL data from a string or Buffer, skipping malformed lines.
 * Uses Bun.JSONL.parseChunk when available for better performance,
 * falls back to indexOf-based scanning otherwise.
 */
export function parseJSONL<T>(data: string | Buffer): T[] {
  if (bunJSONLParse) {
    return parseJSONLBun<T>(data)
  }
  if (typeof data === 'string') {
    return parseJSONLString<T>(data)
  }
  return parseJSONLBuffer<T>(data)
}

const MAX_JSONL_READ_BYTES = 100 * 1024 * 1024

/**
 * Reads and parses a JSONL file, reading at most the last 100 MB.
 * For files larger than 100 MB, reads the tail and skips the first partial line.
 *
 * 100 MB is more than sufficient since the longest context window we support
 * is ~2M tokens, which is well under 100 MB of JSONL.
 */
export async function readJSONLFile<T>(filePath: string): Promise<T[]> {
  const { size } = await stat(filePath)
  if (size <= MAX_JSONL_READ_BYTES) {
    return parseJSONL<T>(await readFile(filePath))
  }
  await using fd = await open(filePath, 'r')
  const buf = Buffer.allocUnsafe(MAX_JSONL_READ_BYTES)
  let totalRead = 0
  const fileOffset = size - MAX_JSONL_READ_BYTES
  while (totalRead < MAX_JSONL_READ_BYTES) {
    const { bytesRead } = await fd.read(
      buf,
      totalRead,
      MAX_JSONL_READ_BYTES - totalRead,
      fileOffset + totalRead,
    )
    if (bytesRead === 0) break
    totalRead += bytesRead
  }
  // Skip the first partial line
  const newlineIndex = buf.indexOf(0x0a)
  if (newlineIndex !== -1 && newlineIndex < totalRead - 1) {
    return parseJSONL<T>(buf.subarray(newlineIndex + 1, totalRead))
  }
  return parseJSONL<T>(buf.subarray(0, totalRead))
}

// ==================== JSON 文件读写 ====================

/**
 * 自定义 JSON 编码器，支持 Date 对象序列化为 ISO 字符串。
 */
class CustomJSONEncoder extends JSON {
  static encode(obj: unknown, space = 0): string {
    return JSON.stringify(obj, CustomJSONEncoder.replacer, space)
  }

  private static replacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  }
}

/**
 * 读取 JSON 文件。
 * @returns 解析后的对象，文件不存在或解析失败返回 null
 */
export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * 写入 JSON 文件（原子化写入）。
 * @param filePath 目标文件路径
 * @param data 要序列化的数据
 * @param space 缩进空格数，默认 4
 */
export function writeJsonFile(filePath: string, data: unknown, space = 4): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const json = CustomJSONEncoder.encode(data, space)
  writeFileSync(filePath, json, 'utf8')
}

export function addItemToJSONCArray(content: string, newItem: unknown): string {
  try {
    if (!content || content.trim() === '') {
      return JSON.stringify([newItem], null, 4)
    }
    const cleanContent = stripBOM(content)
    const parsedContent = parseJsonc(cleanContent)
    if (Array.isArray(parsedContent)) {
      const arrayLength = parsedContent.length
      const isEmpty = arrayLength === 0
      const insertPath = isEmpty ? [0] : [arrayLength]
      const edits = modify(cleanContent, insertPath, newItem, {
        formattingOptions: { insertSpaces: true, tabSize: 4 },
        isArrayInsertion: true,
      })
      if (!edits || edits.length === 0) {
        return JSON.stringify([...parsedContent, newItem], null, 4)
      }
      return applyEdits(cleanContent, edits)
    }
    return JSON.stringify([newItem], null, 4)
  } catch {
    return JSON.stringify([newItem], null, 4)
  }
}
