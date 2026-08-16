/**
 * 消息处理工具函数
 * 吸收自 headroom-main/headroom/utils.py
 *
 * 包含：
 * - 消息内容哈希（用于去重、缓存对齐）
 * - 用户查询提取
 * - 时间戳格式化
 * - 安全 JSON 解析
 * - Marker 标记生成与解析
 */

import { hashContent } from './hash.js'

// ==================== 哈希工具 ====================

/**
 * 快速非加密内容哈希（MD5），用于缓存和去重。
 * 比 SHA256 快 2-3 倍，仅用于内容寻址，不用于安全场景。
 */
export function fastHash(data: string, length = 16): string {
  const { createHash } = require('crypto')
  return createHash('md5').update(data).digest('hex').slice(0, length)
}

/**
 * 计算消息列表的哈希（用于去重）。
 * 使用确定性 JSON 序列化。
 */
export function computeMessagesHash(messages: unknown[]): string {
  const serialized = JSON.stringify(messages, Object.keys(messages[0] || {}).sort() as string[], '')
  return hashContent(serialized).slice(0, 16)
}

/**
 * 计算消息前缀的哈希（用于缓存对齐）。
 *
 * 默认包含：所有 system 消息 + 第一个非 system 消息。
 */
export function computePrefixHash(messages: unknown[], prefixCount?: number): string {
  if (!messages.length) {
    return hashContent('').slice(0, 16)
  }

  if (prefixCount === undefined) {
    prefixCount = 1
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] as Record<string, unknown>
      if (msg.role === 'system') {
        prefixCount = i + 2
      } else {
        break
      }
    }
  }

  const prefixMessages = messages.slice(0, prefixCount)
  return computeMessagesHash(prefixMessages)
}

// ==================== 消息内容提取 ====================

/**
 * 从消息列表中提取最新的用户问题。
 *
 * 支持 OpenAI 格式（content 为字符串）和 Anthropic 格式（content 为 blocks 数组）。
 */
export function extractUserQuery(messages: Array<Record<string, unknown>>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'user') continue

    const content = msg.content
    if (typeof content === 'string') {
      const trimmed = content.trim()
      if (trimmed) return trimmed
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && block.type === 'text') {
          const text = String(block.text || '').trim()
          if (text) return text
        }
      }
    }
  }
  return ''
}

// ==================== 时间戳工具 ====================

/**
 * 格式化时间戳为 ISO8601 字符串。
 */
export function formatTimestamp(d?: Date): string {
  const dt = d || new Date()
  const iso = dt.toISOString()
  // 移除毫秒部分以保持简洁
  return iso.replace(/\.\d{3}Z$/, 'Z')
}

/**
 * 解析 ISO8601 时间戳字符串。
 * 无时区后缀时按 UTC 解析，与 Python fromisoformat 行为对齐。
 */
export function parseTimestamp(ts: string): Date {
  const withoutZ = ts.replace(/Z$/, '')
  // 已有时间信息则补 Z 按 UTC 解析，否则只补日期部分
  if (withoutZ.includes('T')) {
    return new Date(withoutZ + 'Z')
  }
  return new Date(withoutZ + 'T00:00:00Z')
}

// ==================== 安全 JSON 工具 ====================

/**
 * 安全解析 JSON，返回 [result, success] 元组。
 * 不会抛出异常。
 */
export function safeJsonLoads<T = unknown>(text: string): [T | null, boolean] {
  try {
    return [JSON.parse(text) as T, true]
  } catch {
    return [null, false]
  }
}

/**
 * 安全序列化为 JSON，默认确保 ASCII 安全 + 紧凑格式。
 */
export function safeJsonDumps(obj: unknown, indent = 0): string {
  if (indent > 0) {
    return JSON.stringify(obj, null, indent)
  }
  return JSON.stringify(obj)
}

// ==================== Marker 标记工具 ====================

const MARKER_PREFIX = '<headroom:'
const MARKER_SUFFIX = '>'

/**
 * 创建 Headroom marker 字符串。
 */
export function createMarker(markerType: string, attrs?: Record<string, string>): string {
  if (attrs && Object.keys(attrs).length > 0) {
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    return `${MARKER_PREFIX}${markerType} ${attrStr}${MARKER_SUFFIX}`
  }
  return `${MARKER_PREFIX}${markerType}${MARKER_SUFFIX}`
}

/**
 * 创建 tool_digest 标记（用于压缩工具输出）。
 */
export function createToolDigestMarker(originalHash: string): string {
  return createMarker('tool_digest', { sha256: originalHash })
}

/**
 * 创建 dropped_context 标记（用于标记被丢弃的上下文）。
 */
export function createDroppedContextMarker(reason: string, count?: number): string {
  const attrs: Record<string, string> = { reason }
  if (count !== undefined) attrs.count = String(count)
  return createMarker('dropped_context', attrs)
}

/**
 * 创建 truncated 标记（用于标记被截断的内容）。
 */
export function createTruncatedMarker(originalLength: number, truncatedTo: number): string {
  return createMarker('truncated', {
    original: String(originalLength),
    truncated_to: String(truncatedTo),
  })
}

/**
 * 从文本中提取所有 Headroom markers。
 *
 * @returns 数组，每项包含 type 和 attributes
 */
export function extractMarkers(
  text: string,
): Array<{ type: string; attributes: Record<string, string> }> {
  const pattern = /<headroom:(\w+)([^>]*)>/g
  const markers: Array<{ type: string; attributes: Record<string, string> }> = []

  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const markerType = match[1]
    const attrsStr = match[2].trim()
    const attributes: Record<string, string> = {}

    if (attrsStr) {
      const attrPattern = /(\w+)="([^"]*)"/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
        attributes[attrMatch[1]] = attrMatch[2]
      }
    }

    markers.push({ type: markerType, attributes })
  }

  return markers
}
