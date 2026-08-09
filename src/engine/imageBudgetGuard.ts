/**
 * engine/imageBudgetGuard.ts — 图片预算守卫（吸收自 zhikuncode TokenBudgetGuard + ImageRefInjector）
 *
 * 两阶段预算保护：
 *   Phase 1: 清理历史 Base64 — 在 API 调用前清除消息中的内联 Base64 图片
 *   Phase 2: 梯度降级 — 当预算超限时：缩略图 → 文本替换 → 移除
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

// ============ Phase 1: 历史 Base64 清理 ============

/**
 * 扫描消息历史，清理过大的内联 Base64 图片引用。
 * 吸收自 zhikuncode TokenBudgetGuard Phase1。
 */
export function cleanupHistoryBase64(
  messages: InternalMessage[],
  threshold: number = DEFAULT_IMAGE_BUDGET_CONFIG.historyBase64TokenThreshold,
): { messages: InternalMessage[]; clearedCount: number } {
  let clearedCount = 0

  const cleaned = messages.map((msg) => {
    const content = typeof msg.content === "string" ? msg.content : null
    if (!content) return msg

    // 检测 Base64 数据 URL
    const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/)
    if (!base64Match) return msg

    const base64Length = base64Match[0].length
    if (base64Length < threshold) return msg

    // 替换为轻量引用标记
    const replacement = `[图片已外部化: ${(base64Length / 1024).toFixed(0)}KB]`
    const newContent = content.replace(base64Match[0], replacement)
    clearedCount++
    return { ...msg, content: newContent }
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
 * 对消息列表执行 Phase 2 梯度降级。
 * 返回降级后的消息列表和采取的行动。
 */
export function applyPhase2Degradation(
  messages: InternalMessage[],
  config: ImageBudgetConfig = DEFAULT_IMAGE_BUDGET_CONFIG,
): { messages: InternalMessage[]; degraded: string[] } {
  const degraded: string[] = []

  // 计算当前总图片大小
  let totalBytes = 0
  const imageSizes: { msgIndex: number; bytes: number }[] = []

  messages.forEach((msg, idx) => {
    const content = typeof msg.content === "string" ? msg.content : null
    if (!content) return

    const base64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/)
    if (base64Match) {
      const bytes = Math.ceil(base64Match[1].length * 3 / 4)
      imageSizes.push({ msgIndex: idx, bytes })
      totalBytes += bytes
    }
  })

  if (totalBytes <= config.maxTotalImageBytes) {
    return { messages, degraded }
  }

  // 从最新到最旧执行降级
  const degradedIndices = new Set<number>()
  for (let i = imageSizes.length - 1; i >= 0; i--) {
    const { msgIndex, bytes } = imageSizes[i]
    if (totalBytes <= config.maxTotalImageBytes * 0.8) break

    const decision = degradeImageIfNeeded(bytes, totalBytes - bytes, config)
    if (decision.action === "resize") {
      // 标记为需要缩略图（实际缩略图由调用方处理）
      degraded.push(`消息[${msgIndex}]: 建议缩略图 (${(bytes / 1024).toFixed(0)}KB)`)
      degradedIndices.add(msgIndex)
      totalBytes -= bytes * 0.7 // 估计缩略图大小
    } else if (decision.action === "text_only") {
      degraded.push(`消息[${msgIndex}]: 替换为文本描述`)
      degradedIndices.add(msgIndex)
      totalBytes -= bytes
    } else if (decision.action === "remove") {
      degraded.push(`消息[${msgIndex}]: 移除图片 (${(bytes / 1024).toFixed(0)}KB)`)
      degradedIndices.add(msgIndex)
      totalBytes -= bytes
    }
  }

  const cleaned = messages.map((msg, idx) => {
    if (degradedIndices.has(idx)) {
      const content = typeof msg.content === "string" ? msg.content : String(msg.content)
      return { ...msg, content: `[图片预算保护: ${content.slice(0, 50)}...]` }
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
  let totalImageBytes = 0
  let imageCount = 0
  for (const msg of phase2Result.messages) {
    const content = typeof msg.content === "string" ? msg.content : null
    if (!content) continue
    const base64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/)
    if (base64Match) {
      totalImageBytes += Math.ceil(base64Match[1].length * 3 / 4)
      imageCount++
    }
  }

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
