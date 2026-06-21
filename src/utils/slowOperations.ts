import { feature } from 'bun:bundle'
import type { WriteFileOptions } from 'fs'
import {
  closeSync,
  writeFileSync as fsWriteFileSync,
  fsyncSync,
  openSync,
} from 'fs'
// biome-ignore lint: This file IS the cloneDeep wrapper - it must import the original 
import lodashCloneDeep from '../utils/vendor/lodash.js'
import { addSlowOperation } from '../bootstrap/state.js'
import { logForDebugging } from './debug.js'

// ============ 补充缺失的类型定义 ============
interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// ============ 增强 unescapeUnicode 健壮性 ============
/**
 * 将字符串中的 Unicode 转义序列（\uXXXX）还原为原始字符。
 * 用于避免 JSON.stringify 将非 ASCII 字符转义。
 * 【增强】添加防御性判断，防止传入非字符串导致崩溃。
 */
function unescapeUnicode(str: string): string {
  // 防御性检查：若参数不是字符串，则转换为字符串或返回空
  if (typeof str !== 'string') {
    // 如果为 undefined 或 null，返回空字符串；否则转为字符串
    return str == null ? '' : String(str)
  }
  return str.replace(/\\u([\da-fA-F]{4})/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  )
}

// ============ 原始代码（第一个 generateOpenAIFunctionCallingPayload 重命名为 Legacy） ============

/**
 * 为 OpenAI function calling 生成的工具定义。
 * OpenAI 的函数调用需要特定的工具定义格式，包括:
 * - name: 工具名称
 * - description: 工具描述
 * - parameters: 参数定义 (可选)
 *
 * 此工具兼容 OpenAI Python 和 Node.js 函数调用。
 * 
 * 【修正】此函数与后面的 generateOpenAIFunctionCallingPayload 功能类似，
 * 但此版本更早，保留作为遗留接口，重命名为 Legacy 避免冲突。
 */
export function createOpenAIToolDefinition(
  name: string,
  description?: string,
  parameters?: Record<string, unknown>,
): ToolDefinition {
  const toolDef: ToolDefinition = {
    name,
    description: description || 'No description available',
    parameters: {
      type: 'object',
      properties: parameters || {},
    },
  }

  // 可选：添加参数定义
  if (typeof parameters === 'object' && parameters !== null) {
    for (const [prop, propValue] of Object.entries(parameters.properties || {})) {
      toolDef.parameters.properties[prop] = {
        type: typeof propValue === 'string' ? 'text' : propValue,
        description: typeof propValue === 'string' ? propValue : 'No description available',
      }
    }
  }

  toolDef.parameters.required = [] // 未设置 required 表示可选参数
  return toolDef
}

/**
 * 【修正】原始的第一个 generateOpenAIFunctionCallingPayload 被重命名，以避免重复声明。
 * 保留其原有实现，以备兼容旧代码。
 * @deprecated 请使用下方的 generateOpenAIFunctionCallingPayload（新版本）
 */
export function generateOpenAIFunctionCallingPayloadLegacy(
  data: Record<string, unknown>,
): string {
  using _ = slowLogging`generateOpenAIFunctionCallingPayloadLegacy(${data})`

  // OpenAI 函数调用兼容的 payload 结构
  const payload: Record<string, unknown> = {
    arguments: {},
    tools: [],
  }

  // 为每个可调用属性添加工具
  for (const [key, value] of Object.entries(data)) {
    const toolDefinition: ToolDefinition = {
      name: key,
      description: typeof value === 'string' ? value : 'No description available',
      parameters: {
        type: 'object',
        properties: {},
      },
    }

    // 可选：添加参数定义
    if (typeof value === 'object' && value !== null) {
      for (const [prop, propValue] of Object.entries(value.properties || {})) {
        toolDefinition.parameters.properties[prop] = {
          type: typeof propValue === 'string' ? 'text' : propValue,
          description: typeof propValue === 'string' ? propValue : 'No description available',
        }
      }
    }

    toolDefinition.parameters.required = [] // 未设置 required 表示可选参数

    payload.tools.push(toolDefinition)
  }

  // 将 payload 转换为 JSON 字符串（使用 OpenAI 的 jsonStringify 工具）
  const jsonString = jsonStringify(payload)

  // 添加 OpenAI 特定的 function_calling 字段
  const finalPayload = {
    ...payload,
    function_calling: {
      arguments: payload.arguments,
      tools: payload.tools,
    },
  }

  return jsonStringify(finalPayload)
}

// Extended WriteFileOptions to include 'flush' which is available in Node.js 20.1.0+
// but not yet in @types/node
type WriteFileOptionsWithFlush =
  | WriteFileOptions
  | (WriteFileOptions & { flush?: boolean })

// --- Slow operation logging infrastructure ---

/**
 * Threshold in milliseconds for logging slow JSON/clone operations.
 * Operations taking longer than this will be logged for debugging.
 * - Override: set CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS to a number
 * - Dev builds: 20ms (lower threshold for development)
 * - Ants: 300ms (enabled for all internal users)
 */
const SLOW_OPERATION_THRESHOLD_MS = (() => {
  const envValue = process.env.CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS
  if (envValue !== undefined) {
    const parsed = Number(envValue)
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed
    }
  }
  if (process.env.NODE_ENV === 'development') {
    return 20
  }
  if (process.env.USER_TYPE === 'ant') {
    return 300
  }
  return Infinity
})()

// Re-export for callers that still need the threshold value directly
export { SLOW_OPERATION_THRESHOLD_MS }

// Module-level re-entrancy guard. logForDebugging writes to a debug file via
// appendFileSync, which goes through slowLogging again. Without this guard,
// a slow appendFileSync → dispose → logForDebugging → appendFileSync → dispose → ...
let isLogging = false

/**
 * Extract the first stack frame outside this file, so the DevBar warning
 * points at the actual caller instead of a useless `Object{N keys}`.
 * Only called when an operation was actually slow — never on the fast path.
 */
export function callerFrame(stack: string | undefined): string {
  if (!stack) return ''
  for (const line of stack.split('\n')) {
    if (line.includes('slowOperations')) continue
    const m = line.match(/([^/\\]+?):(\d+):\d+\)?$/)
    if (m) return ` @ ${m[1]}:${m[2]}`
  }
  return ''
}

/**
 * Builds a human-readable description from tagged template arguments.
 * Only called when an operation was actually slow — never on the fast path.
 *
 * args[0] = TemplateStringsArray, args[1..n] = interpolated values
 */
function buildDescription(args: IArguments): string {
  const strings = args[0] as TemplateStringsArray
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i + 1 < args.length) {
      const v = args[i + 1]
      if (Array.isArray(v)) {
        result += `Array[${(v as unknown[]).length}]`
      } else if (v !== null && typeof v === 'object') {
        result += `Object{${Object.keys(v as Record<string, unknown>).length} keys}`
      } else if (typeof v === 'string') {
        result += v.length > 80 ? `${v.slice(0, 80)}…` : v
      } else {
        result += String(v)
      }
    }
  }
  return result
}

class AntSlowLogger {
  startTime: number
  args: IArguments
  err: Error

  constructor(args: IArguments) {
    this.startTime = performance.now()
    this.args = args
    // V8/JSC capture the stack at construction but defer the expensive string
    // formatting until .stack is read — so this stays off the fast path.
    this.err = new Error()
  }

  [Symbol.dispose](): void {
    const duration = performance.now() - this.startTime
    if (duration > SLOW_OPERATION_THRESHOLD_MS && !isLogging) {
      isLogging = true
      try {
        const description =
          buildDescription(this.args) + callerFrame(this.err.stack)
        logForDebugging(
          `[SLOW OPERATION DETECTED] ${description} (${duration.toFixed(1)}ms)`,
        )
        addSlowOperation(description, duration)
      } finally {
        isLogging = false
      }
    }
  }
}

const NOOP_LOGGER: Disposable = { [Symbol.dispose]() {} }

// Must be regular functions (not arrows) to access `arguments`
function slowLoggingAnt(
  _strings: TemplateStringsArray,
  ..._values: unknown[]
): AntSlowLogger {
  // 注意：此处使用 arguments 是故意的，以获取所有插值参数
  return new AntSlowLogger(arguments)
}

function slowLoggingExternal(): Disposable {
  return NOOP_LOGGER
}

/**
 * Tagged template for slow operation logging.
 *
 * In ANT builds: creates an AntSlowLogger that times the operation and logs
 * if it exceeds the threshold. Description is built lazily only when slow.
 *
 * In external builds: returns a singleton no-op disposable. Zero allocations,
 * zero timing. AntSlowLogger and buildDescription are dead-code-eliminated.
 *
 * @example
 * using _ = slowLogging`structuredClone(${value})`
 * const result = structuredClone(value)
 */
export const slowLogging: {
  (strings: TemplateStringsArray, ...values: unknown[]): Disposable
} = feature('SLOW_OPERATION_LOGGING') ? slowLoggingAnt : slowLoggingExternal

// --- Wrapped operations ---

/**
 * Wrapped JSON.stringify with slow operation logging.
 * Use this instead of JSON.stringify directly to detect performance issues.
 *
 * @example
 * import { jsonStringify } from './slowOperations.js'
 * const json = jsonStringify(data)
 * const prettyJson = jsonStringify(data, null, 2)
 */
export function jsonStringify(
  value: unknown,
  replacer?: (this: unknown, key: string, value: unknown) => unknown,
  space?: string | number,
): string
export function jsonStringify(
  value: unknown,
  replacer?: (number | string)[] | null,
  space?: string | number,
): string
export function jsonStringify(
  value: unknown,
  replacer?:
    | ((this: unknown, key: string, value: unknown) => unknown)
    | (number | string)[]
    | null,
  space?: string | number,
): string {
  using _ = slowLogging`JSON.stringify(${value})`
  // 【增强】捕获 JSON.stringify 可能抛出的异常（如循环引用），避免程序崩溃
  let raw: string
  try {
    raw = JSON.stringify(
      value,
      replacer as Parameters<typeof JSON.stringify>[1],
      space,
    )
  } catch (err) {
    // 返回错误信息，但保留原始内容（降级为使用默认 replacer）
    raw = JSON.stringify(value, null, space)
    // 同时记录错误（可选）
    // 这里不抛出，保持兼容
  }
  return unescapeUnicode(raw)
}

/**
 * Wrapped JSON.parse with slow operation logging.
 * Use this instead of JSON.parse directly to detect performance issues.
 *
 * @example
 * import { jsonParse } from './slowOperations.js'
 * const data = jsonParse(jsonString)
 */
export const jsonParse: typeof JSON.parse = (text, reviver) => {
  using _ = slowLogging`JSON.parse(${text})`
  // V8 de-opts JSON.parse when a second argument is passed, even if undefined.
  // Branch explicitly so the common (no-reviver) path stays on the fast path.
  return typeof reviver === 'undefined'
    ? JSON.parse(text)
    : JSON.parse(text, reviver)
}

/**
 * Wrapped structuredClone with slow operation logging.
 * Use this instead of structuredClone directly to detect performance issues.
 *
 * @example
 * import { clone } from './slowOperations.js'
 * const copy = clone(originalObject)
 */
export function clone<T>(value: T, options?: StructuredSerializeOptions): T {
  using _ = slowLogging`structuredClone(${value})`
  return structuredClone(value, options)
}

/**
 * Wrapped cloneDeep with slow operation logging.
 * Use this instead of lodash cloneDeep directly to detect performance issues.
 *
 * @example
 * import { cloneDeep } from './slowOperations.js'
 * const copy = cloneDeep(originalObject)
 */
export function cloneDeep<T>(value: T): T {
  using _ = slowLogging`cloneDeep(${value})`
  return lodashCloneDeep(value)
}

/**
 * 为 OpenAI function calling 生成的 JSON 数据包。
 *
 * OpenAI 的 function calling 需要特定的工具定义格式，包括:
 * - "name": 工具名称
 * - "description": 工具描述
 * - "parameters": 参数定义 (可选)
 *
 * 此工具兼容 OpenAI Python 和 Node.js 函数调用。
 * 
 * 【修正】此为第二个定义，保持原样，与上面的 Legacy 版本共存。
 */
export function generateOpenAIFunctionCallingPayload(
  data: Record<string, unknown>
): string {
  using _ = slowLogging`generateOpenAIFunctionCallingPayload(${data})`

  // OpenAI 函数调用兼容的 payload 结构
  const payload: Record<string, unknown> = {
    arguments: {},
    tools: [],
  }

  // 为每个可调用属性添加工具
  for (const [key, value] of Object.entries(data)) {
    const toolDefinition: ToolDefinition = {
      name: key,
      description: typeof value === 'string' ? value : 'No description available',
      parameters: {
        type: 'object',
        properties: {},
      },
    }

    // 可选：添加参数定义
    if (typeof value === 'object' && value !== null) {
      for (const [prop, propValue] of Object.entries(value.properties || {})) {
        toolDefinition.parameters.properties[prop] = {
          type: typeof propValue === 'string' ? 'text' : propValue,
          description: typeof propValue === 'string' ? propValue : 'No description available',
        }
      }
    }

    toolDefinition.parameters.required = [] // 未设置 required 表示可选参数

    payload.tools.push(toolDefinition)
  }

  // 将 payload 转换为 JSON 字符串（使用 OpenAI 的 jsonStringify 工具）
  const jsonString = jsonStringify(payload)

  // 添加 OpenAI 特定的 function_calling 字段
  const finalPayload = {
    ...payload,
    function_calling: {
      arguments: payload.arguments,
      tools: payload.tools,
    },
  }

  return jsonStringify(finalPayload)
}

/**
 * Wrapper around fs.writeFileSync with slow operation logging.
 * Supports flush option to ensure data is written to disk before returning.
 * @param filePath The path to the file to write to
 * @param data The data to write (string or Buffer)
 * @param options Optional write options (encoding, mode, flag, flush)
 * @deprecated Use `fs.promises.writeFile` instead for non-blocking writes.
 * Sync file writes block the event loop and cause performance issues.
 */
export function writeFileSync_DEPRECATED(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  options?: WriteFileOptionsWithFlush,
): void {
  using _ = slowLogging`fs.writeFileSync(${filePath}, ${data})`

  // Check if flush is requested (for object-style options)
  const needsFlush =
    options !== null &&
    typeof options === 'object' &&
    'flush' in options &&
    options.flush === true

  if (needsFlush) {
    // Manual flush: open file, write, fsync, close
    const encoding =
      typeof options === 'object' && 'encoding' in options
        ? options.encoding
        : undefined
    const mode =
      typeof options === 'object' && 'mode' in options
        ? options.mode
        : undefined
    let fd: number | undefined
    try {
      fd = openSync(filePath, 'w', mode)
      fsWriteFileSync(fd, data, { encoding: encoding ?? undefined })
      fsyncSync(fd)
    } finally {
      if (fd !== undefined) {
        closeSync(fd)
      }
    }
  } else {
    // No flush needed, use standard writeFileSync
    fsWriteFileSync(filePath, data, options as WriteFileOptions)
  }
}