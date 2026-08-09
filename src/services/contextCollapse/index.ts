/**
 * services/contextCollapse/index.ts — 上下文折叠服务（吸收自 zhikuncode ContextCollapse）
 *
 * ContextCollapse 三级渐进折叠系统：
 *   Stage 1: IncrementalCollapse — 每 10 轮对话触发一次增量折叠
 *   Stage 2: ProgressiveCollapse — 渐进折叠中间层（90% → 80% 上下文）
 *   Stage 3: EmergencyCollapse — 紧急折叠（仅保留最近 1 轮）
 *
 * 激活条件：feature('CONTEXT_COLLAPSE') && isContextCollapseEnabled() && isAutoCompactEnabled()
 */

import type { InternalMessage } from "../../engine/messageNormalizer.ts"

// ============ 类型定义 ============

export interface CollapsePreview {
  spansToCollapse: number
  spansStaged: number
  estimatedTokensFreed: number
}

export interface CollapseResult {
  committed: number
  preview: CollapsePreview
}

export type Message = InternalMessage

// ============ 统计 ============

type Stats = {
  collapsedSpans: number
  stagedSpans: number
  health: {
    totalErrors: number
    totalEmptySpawns: number
    emptySpawnWarningEmitted: boolean
  }
}

const stats: Stats = {
  collapsedSpans: 0,
  stagedSpans: 0,
  health: {
    totalErrors: 0,
    totalEmptySpawns: 0,
    emptySpawnWarningEmitted: false,
  },
}

const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStats(): Stats {
  return stats
}

// ============ 配置读取 ============

let _enabled = false

export function isContextCollapseEnabled(): boolean {
  return _enabled
}

export function setContextCollapseEnabled(value: boolean): void {
  _enabled = value
}

// ============ 折叠操作（吸收自 zhikuncode ContextCollapseService） ============

/**
 * Stage 1: 增量折叠 — 每 10 轮对话触发一次。
 * 将中间层消息压缩为更紧凑的形式。
 */
export function incrementalCollapse(messages: InternalMessage[]): { messages: InternalMessage[]; collapsed: number } {
  if (messages.length < 20) return { messages, collapsed: 0 }

  // 保留首尾，折叠中间
  const keepHead = 3
  const keepTail = 5
  const midStart = keepHead
  const midEnd = messages.length - keepTail

  if (midEnd <= midStart) return { messages, collapsed: 0 }

  let collapsed = 0
  const result: InternalMessage[] = [...messages.slice(0, keepHead)]

  for (let i = midStart; i < midEnd; i++) {
    const msg = messages[i]
    if (msg.role === "system") {
      result.push(msg)
      continue
    }
    if (msg.role === "tool") {
      // 工具结果：截断为摘要
      const content = typeof msg.content === "string" ? msg.content : String(msg.content)
      if (content.length > 200) {
        result.push({
          ...msg,
          content: `[折叠] ${content.slice(0, 100)}... (${content.length} chars)`,
        })
        collapsed++
      } else {
        result.push(msg)
      }
    } else if (msg.role === "assistant") {
      // 助手消息：保留首条文本，工具调用保留但简化
      if (typeof msg.content === "string") {
        if (msg.content.length > 500) {
          result.push({
            ...msg,
            content: `[折叠] ${msg.content.slice(0, 200)}... (${msg.content.length} chars)`,
          })
          collapsed++
        } else {
          result.push(msg)
        }
      } else {
        result.push(msg)
      }
    } else {
      result.push(msg)
    }
  }

  result.push(...messages.slice(midEnd))
  stats.collapsedSpans += collapsed
  return { messages: result, collapsed }
}

/**
 * Stage 2: 渐进折叠 — 当上下文达到 90% 阈值时触发。
 * 保留最近 2 轮完整对话，其余折叠。
 */
export function progressiveCollapse(messages: InternalMessage[]): { messages: InternalMessage[]; committed: number } {
  if (messages.length <= 8) return { messages, committed: 0 }

  const system = messages.filter((m) => m.role === "system")
  const recent = messages.filter((m) => m.role !== "system").slice(-4)
  const older = messages.filter((m) => m.role !== "system").slice(0, -4)

  if (older.length === 0) return { messages, committed: 0 }

  // 将 older 折叠为单条摘要
  const olderSummary: InternalMessage = {
    role: "system",
    content: `[渐进折叠: ${older.length} 条消息被压缩] 包含 ${older.filter(m => m.role === 'assistant').length} 轮助手回复`,
  }

  const committed = older.length
  stats.stagedSpans += committed

  return {
    messages: [...system, olderSummary, ...recent],
    committed,
  }
}

/**
 * Stage 3: 紧急折叠 — 当上下文达到 95% 阈值时触发。
 * 仅保��最近 1 轮用户消息 + 最近 1 轮助手消息。
 */
export function emergencyCollapse(messages: InternalMessage[]): { messages: InternalMessage[]; committed: number } {
  const system = messages.filter((m) => m.role === "system")
  const recentUser = messages.filter((m) => m.role === "user").slice(-1)
  const recentAssistant = messages.filter((m) => m.role === "assistant").slice(-1)

  const committed = messages.length - system.length - recentUser.length - recentAssistant.length
  stats.collapsedSpans += Math.max(0, committed)

  return {
    messages: [...system, ...recentUser, ...recentAssistant],
    committed: Math.max(0, committed),
  }
}

// ============ 对外 API ============

/**
 * 应用渐进折叠（Stage 1 + Stage 2）。
 * 被 query.ts 在 autocompact 之前调用。
 */
export async function applyCollapsesIfNeeded(
  messages: InternalMessage[],
  _toolUseContext?: unknown,
  _querySource?: string,
): Promise<{
  messages: InternalMessage[]
  changed: boolean
}> {
  if (!_enabled) return { messages, changed: false }
  if (messages.length < 20) return { messages, changed: false }

  // Stage 1: IncrementalCollapse
  const stage1 = incrementalCollapse(messages)
  let current = stage1.messages

  let changed = stage1.collapsed > 0

  // Stage 2: ProgressiveCollapse（仅当消息仍然较多时）
  if (current.length > 12) {
    const stage2 = progressiveCollapse(current)
    current = stage2.messages
    changed = changed || stage2.committed > 0
  }

  if (changed) {
    listeners.forEach((l) => l())
  }

  return { messages: current, changed }
}

/**
 * 从溢出中恢复（413 错误恢复）。
 * 被 query.ts 在 API 返回 413 时调用。
 */
export async function recoverFromOverflow(
  messages: InternalMessage[],
  _querySource?: string,
): Promise<{
  messages: InternalMessage[]
  committed: number
}> {
  if (!_enabled) return { messages, committed: 0 }

  // 使用 Stage 3 紧急折叠
  const result = emergencyCollapse(messages)

  if (result.committed > 0) {
    listeners.forEach((l) => l())
  }

  return result
}

/**
 * 检查提示词是否过长（应被隐藏）。
 */
export function isWithheldPromptTooLong(
  _message: unknown,
  _isPromptTooLongMessage: (msg: unknown) => boolean,
  _querySource?: string,
): boolean {
  if (!_enabled) return false
  // 简化实现：如果 contextCollapse 启用，则允许 query.ts 处理 413
  return false
}

/**
 * 重置上下文折叠状态。
 */
export function resetContextCollapse(): void {
  stats.collapsedSpans = 0
  stats.stagedSpans = 0
  stats.health.totalErrors = 0
  stats.health.totalEmptySpawns = 0
  stats.health.emptySpawnWarningEmitted = false
}

/**
 * 摘要上下文折叠状态。
 */
export function summarizeContextCollapseState() {
  return {
    collapsedSpans: stats.collapsedSpans,
    stagedSpans: stats.stagedSpans,
    health: { ...stats.health },
  }
}

/**
 * 获取折叠预览。
 */
export function getContextCollapsePreview(): CollapsePreview[] {
  return []
}
