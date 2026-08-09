/**
 * engine/imageBudgetGuard.ts — 图片预算守卫（吸收自 zhikuncode TokenBudgetGuard + ImageRefInjector）
 *
 * 两阶段预算保护：
 *   Phase 1: 清理历史 Base64 — 在 API 调用前清除消息中的图片引用
 *   Phase 2: 梯度降级 — 当预算超限时：缩略图 → 文本替换 → 移除
 *
 * 同时识别两种图片表示：
 *   - 结构化图片块：content 数组中的 { type: 'image', source: { type: 'base64', data } }
 *   - 内联字符串：content 字符串中的 data:image/...;base64,xxx
 *
 * 依赖现有 readImageWithTokenBudget 和 maybeResizeAndDownsampleImageBlock。
 */

import type { InternalMessage } from "./messageNormalizer.ts"

// ============ 配置 ============

export interface ImageBudgetConfig {
  /** 单张图片最大尺寸（字节），默认 1.5MB */
  maxSingleImageBytes: number
  /** 会话中图片总预算（字节），默认 2MB */
  maxTotalImageBytes: number
  /** 最大并发图片数 */
  maxConcurrentImages: number
  /** Phase 1: 历史 Base64 清理的 token 阈值 */
  historyBase64TokenThreshold: number
}

export const DEFAULT_IMAGE_BUDGET_CONFIG: ImageBudgetConfig = {
  maxSingleImageBytes: 1.5 * 1024 * 1024,
  maxTotalImageBytes: 2 * 1024 * 1024,
  maxConcurrentImages: 5,
  historyBase64TokenThreshold: 50_000,
}

// ============ 预算检查结果 ============

export interface BudgetCheckResult {
  withinBudget: boolean
  totalImageBytes: number
  imageCount: number
  phase1Cleared: number
  phase2Degraded: string[]
  action: "none" | "phase1_cleanup" | "phase2_degrade" | "reject"
}

// ============ 图片提取辅助 ============

interface Base64ImageRef {
  /** 消息索引 */
  msgIndex: number
  /** 结构化块在 content 数组中的索引；内联字符串时为 null */
  blockIndex: number | null
  /** base64 数据 */
  data: string
  /** 解码后近似字节数 */
  bytes: number
}

const INLINE_BASE64_RE = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/g

function isBase64ImageBlock(
  block: unknown,
): block is { type: 'image'; source: { type: 'base64'; data: string } } {
  if (typeof block !== 'object' || block === null) return false
  const b = block as Record<string, unknown>
  if (b.type !== 'image') return false
  if (typeof b.source !== 'object' || b.source === null) return false
  const source = b.source as Record<string, unknown>
  return source.type === 'base64' && typeof source.data === 'string'
}

/** 从消息中提取所有 base64 图片引用（结构化块 + 内联字符串两种格式）。 */
function extractBase64Images(messages: InternalMessage[]): Base64ImageRef[] {
  const refs: Base64ImageRef[] = []

  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const content = messages[msgIndex]!.content

    if (Array.isArray(content)) {
      content.forEach((block, blockIndex) => {
        if (isBase64ImageBlock(block)) {
          refs.push({
            msgIndex,
            blockIndex,
            data: block.source.data,
            bytes: Math.ceil((block.source.data.length * 3) / 4),
          })
        }
      })
      continue
    }

    if (typeof content === 'string') {
      INLINE_BASE64_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = INLINE_BASE64_RE.exec(content)) !== null) {
        const data = match[1]!
        refs.push({
          msgIndex,
          blockIndex: null,
          data,
          bytes: Math.ceil((data.length * 3) / 4),
        })
      }
    }
  }

  return refs
}

// ============ Phase 1: 历史 Base64 清理 ============

/**
 * 扫描消息历史，清理过大的 Base64 图片引用（结构化块 + 内联字符串）。
 * 吸收自 zhikuncode TokenBudgetGuard Phase1。
 */
export function cleanupHistoryBase64(
  messages: InternalMessage[],
  threshold: number = DEFAULT_IMAGE_BUDGET_CONFIG.historyBase64TokenThreshold,
): { messages: InternalMessage[]; clearedCount: number } {
  let clearedCount = 0

  const cleaned = messages.map((msg, msgIndex) => {
    const content = msg.content

    // ── 结构化图片块：将超阈值的 image 块替换为文本占位 ──
    if (Array.isArray(content)) {
      let changed = false
      const newBlocks = content.map(block => {
        if (!isBase64ImageBlock(block)) return block
        if (block.source.data.length < threshold) return block
        changed = true
        clearedCount++
        return {
          type: 'text' as const,
          text: `[图片已外部化: ${(block.source.data.length / 1024).toFixed(0)}KB]`,
        }
      })
      return changed ? { ...msg, content: newBlocks } : msg
    }

    // ── 内联字符串：替换超阈值的 data URL ──
    if (typeof content === 'string') {
      const inlineRe = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/
      const match = content.match(inlineRe)
      if (!match) return msg

      const base64Length = match[0].length
      if (base64Length < threshold) return msg

      const replacement = `[图片已外部化: ${(base64Length / 1024).toFixed(0)}KB]`
      clearedCount++
      return { ...msg, content: content.replace(match[0], replacement) }
    }

    return msg
  })

  return { messages: cleaned, clearedCount }
}

// ============ Phase 2: 梯度降级 ============

export type DegradationAction =
  | { action: "none"; reason: string }
  | { action: "resize"; reason: string }
  | { action: "text_only"; reason: string }
  | { action: "remove"; reason: string }

/**
 * 对单张图片执行梯度降级决策。
 * 吸收自 zhikuncode TokenBudgetGuard Phase2。
 */
export function degradeImageIfNeeded(
  imageBytes: number,
  currentTotalBytes: number,
  config: ImageBudgetConfig = DEFAULT_IMAGE_BUDGET_CONFIG,
): DegradationAction {
  const remaining = config.maxTotalImageBytes - currentTotalBytes

  if (imageBytes <= config.maxSingleImageBytes && remaining >= imageBytes) {
    return { action: "none", reason: "within_budget" }
  }

  if (imageBytes > config.maxSingleImageBytes * 0.5) {
    return { action: "resize", reason: `图片 ${(imageBytes / 1024).toFixed(0)}KB 超过单张上限，建议缩放` }
  }

  if (currentTotalBytes + imageBytes * 0.3 <= config.maxTotalImageBytes) {
    return { action: "resize", reason: "预算紧张，建议缩略图" }
  }

  if (currentTotalBytes + imageBytes * 0.1 <= config.maxTotalImageBytes) {
    return { action: "text_only", reason: "预算严重不足，替换为文本描述" }
  }

  return { action: "remove", reason: `超出总预算 ${config.maxTotalImageBytes / 1024 / 1024}MB` }
}

/**
 * 对消息列表执行 Phase 2 梯度降级（结构化块 + 内联字符串）。
 * 返回降级后的消息列表和采取的行动。
 */
export function applyPhase2Degradation(
  messages: InternalMessage[],
  config: ImageBudgetConfig = DEFAULT_IMAGE_BUDGET_CONFIG,
): { messages: InternalMessage[]; degraded: string[] } {
  const degraded: string[] = []

  // 收集所有图片引用并按消息索引排序（从旧到新）
  const refs = extractBase64Images(messages)
  const totalBytes = refs.reduce((sum, r) => sum + r.bytes, 0)

  if (totalBytes <= config.maxTotalImageBytes) {
    return { messages, degraded }
  }

  // 从最新到最旧执行降级。用 `${msgIndex}:${blockIndex ?? 'inline'}:${data前12位}` 作为
  // 稳定标识（Set 引用相等无法命中重建对象，须用字符串键）。
  const degradedKeys = new Set<string>()
  const keyOf = (r: Base64ImageRef): string =>
    `${r.msgIndex}:${r.blockIndex ?? 'inline'}:${r.data.slice(0, 12)}`

  let runningTotal = totalBytes
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i]!
    if (runningTotal <= config.maxTotalImageBytes * 0.8) break

    const decision = degradeImageIfNeeded(ref.bytes, runningTotal - ref.bytes, config)
    if (decision.action === "resize") {
      degraded.push(`消息[${ref.msgIndex}]: 建议缩略图 (${(ref.bytes / 1024).toFixed(0)}KB)`)
      degradedKeys.add(keyOf(ref))
      runningTotal -= ref.bytes * 0.7 // 估计缩略图大小
    } else if (decision.action === "text_only") {
      degraded.push(`消息[${ref.msgIndex}]: 替换为文本描述`)
      degradedKeys.add(keyOf(ref))
      runningTotal -= ref.bytes
    } else if (decision.action === "remove") {
      degraded.push(`消息[${ref.msgIndex}]: 移除图片 (${(ref.bytes / 1024).toFixed(0)}KB)`)
      degradedKeys.add(keyOf(ref))
      runningTotal -= ref.bytes
    }
  }

  if (degradedKeys.size === 0) return { messages, degraded }

  // 按消息索引分组，逐条替换
  const cleaned = messages.map((msg, msgIndex) => {
    const content = msg.content

    // 结构化块：将降级的 image 块替换为文本占位
    if (Array.isArray(content)) {
      let changed = false
      const newBlocks = content.map((block, blockIndex) => {
        if (!isBase64ImageBlock(block)) return block
        const isTarget = degradedKeys.has(
          `${msgIndex}:${blockIndex}:${block.source.data.slice(0, 12)}`,
        )
        if (!isTarget) return block
        changed = true
        return {
          type: 'text' as const,
          text: `[图片预算保护: ${(block.source.data.length / 1024).toFixed(0)}KB]`,
        }
      })
      return changed ? { ...msg, content: newBlocks } : msg
    }

    // 内联字符串：将降级的 data URL 替换为文本占位
    if (typeof content === 'string') {
      const inlineRefs = refs.filter(r => r.msgIndex === msgIndex && r.blockIndex === null)
      const targets = inlineRefs.filter(r => degradedKeys.has(keyOf(r)))
      if (targets.length === 0) return msg

      let newContent = content
      for (const ref of targets) {
        newContent = newContent.replace(
          new RegExp(`data:image/[^;]+;base64,${ref.data.slice(0, 8)}[A-Za-z0-9+/=]*`),
          `[图片预算保护: ${(ref.bytes / 1024).toFixed(0)}KB]`,
        )
      }
      return newContent === content ? msg : { ...msg, content: newContent }
    }

    return msg
  })

  return { messages: cleaned, degraded }
}

// ============ 综合预算检查 ============

/**
 * 执行完整的图片预算检查（Phase 1 + Phase 2）。
 * 应在每次 API 调用前执行。
 */
export function checkImageBudget(
  messages: InternalMessage[],
  config: Partial<ImageBudgetConfig> = {},
): BudgetCheckResult {
  const cfg = { ...DEFAULT_IMAGE_BUDGET_CONFIG, ...config }

  // Phase 1: 清理历史 Base64
  const phase1Result = cleanupHistoryBase64(messages, cfg.historyBase64TokenThreshold)

  // Phase 2: 梯度降级检查
  const phase2Result = applyPhase2Degradation(phase1Result.messages, cfg)

  // 计算剩余预算
  const remainingRefs = extractBase64Images(phase2Result.messages)
  const totalImageBytes = remainingRefs.reduce((sum, r) => sum + r.bytes, 0)
  const imageCount = remainingRefs.length

  const withinBudget = totalImageBytes <= cfg.maxTotalImageBytes && imageCount <= cfg.maxConcurrentImages

  return {
    withinBudget,
    totalImageBytes,
    imageCount,
    phase1Cleared: phase1Result.clearedCount,
    phase2Degraded: phase2Result.degraded,
    action: withinBudget ? "none" : phase2Result.degraded.length > 0 ? "phase2_degrade" : "phase1_cleanup",
  }
}
