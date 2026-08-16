/**
 * JSON 修复与安全序列化工具
 * 吸收自 cline SDK (sdk/packages/shared/src/parse/)
 *
 * - parseJsonStream: 修复 LLM 输出的破损 JSON（如未加引号的 value）
 * - safeJsonStringify: 处理循环引用 + bigint 的安全 JSON.stringify
 * - maskSecret: 凭证掩码显示（保留首尾 4 位）
 */

// ==================== JSON 修复 ====================

const BARE_OBJECT_RE = /^\{\s*"([A-Za-z0-9_.$-]+)"\s*:\s*([\s\S]+?)\s*\}$/

/**
 * 尝试修复 `{"key": 未加引号的 value}`，将 value 包裹在引号中。
 * 当输入不匹配或 value 已经是合法的 JSON token 时返回 undefined。
 */
function repairBareObjectValue(text: string): Record<string, string> | undefined {
  const match = text.match(BARE_OBJECT_RE)
  if (!match) return undefined

  const [, key, rawValue] = match
  const value = rawValue.trim()
  if (!value) return undefined

  // 跳过已是合法 JSON token 的值
  const ch = value[0]
  if (
    ch === '"' ||
    ch === '{' ||
    ch === '[' ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    Number.isFinite(Number(value))
  ) {
    return undefined
  }

  return JSON.parse(`{"${key}":${JSON.stringify(value)}}`)
}

/**
 * 按顺序应用的解析策略 — 第一个成功者获胜。
 */
const strategies: Array<(text: string) => unknown> = [
  (text) => JSON.parse(text),
  (text) => {
    // 如果可用，使用 doge-code 自带的 jsonrepair
    try {
      const { jsonrepair } = require('jsonrepair')
      return JSON.parse(jsonrepair(text))
    } catch {
      return undefined as unknown
    }
  },
  repairBareObjectValue,
]

/**
 * 尝试解析可能格式错误的 JSON 字符串。
 * 按顺序应用修复策略：严格解析 → jsonrepair → 裸对象值修复。
 * 所有策略都失败时返回原始字符串。
 *
 * 适用于解析可能包含未加引号值或尾随逗号的 LLM 工具输出。
 */
export function parseJsonStream(input: unknown): unknown {
  if (typeof input !== 'string') return input

  const text = input.trimStart()
  if (text[0] !== '{' && text[0] !== '[') return input

  for (const strategy of strategies) {
    try {
      const result = strategy(text)
      if (result !== undefined) return result
    } catch {
      // 策略失败 — 尝试下一个
    }
  }
  return input
}

// ==================== 安全 JSON 序列化 ====================

/**
 * 安全地将任意值序列化为 JSON，处理：
 * - 循环引用 → `[Circular]`
 * - BigInt → 字符串表示
 * - 其他任何错误 → `String(input)`
 */
export function safeJsonStringify(input: unknown): string {
  const seen = new WeakSet<object>()

  try {
    const result = JSON.stringify(input, (_key, value) => {
      if (typeof value === 'bigint') return value.toString()

      if (value && typeof value === 'object') {
        if (seen.has(value as object)) return '[Circular]'
        seen.add(value as object)
      }

      return value
    })

    return result ?? 'null'
  } catch {
    return String(input)
  }
}

// ==================== 凭证掩码 ====================

/**
 * 安全显示凭证值的掩码。
 * 长度 <= 8 字符 → `****`
 * 更长值 → 前 4 位 + `...` + 后 4 位
 *
 * @example maskSecret("sk-ant-abc123xyz") → "sk-a...23xyz"
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '****'
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
