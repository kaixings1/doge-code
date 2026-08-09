// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
/**
 * utils/model/visionModelRouter.ts — 智能视觉模型路由（吸收自 zhikuncode VisionModelRouter）
 *
 * 当用户附带图片但当前模型不支持图片时，自动选择一个支持视觉输入的目标模型
 * 用于本次请求（单次请求级别行为，不修改会话级模型选择）。
 *
 * 路由策略（按优先级）：
 *   1. 当前模型本身已支持图片：返回 null（无需路由）
 *   2. 同 Provider 下查找首个支持图片的模型
 *   3. 使用全局兜底视觉模型
 *
 * doge-code 以 Claude 模型为主（claude-* 全系支持图片），因此同 Provider 路由
 * 实际总是命中 Claude 默认模型；第三方模型（deepseek 等）不支持图片时路由到兜底。
 */
import { getModelStrings } from './modelStrings.js'
import { getDefaultSonnetModel } from './model.js'

// ─── 视觉能力判定 ───

/** 明确不支持图片的模型模式（子串匹配，不区分大小写） */
const VISION_NEGATIVE_PATTERNS: RegExp[] = [
  /deepseek/,
  /qwen-turbo/,
  /^qwen3\.7-max/,
  /^glm-5\.2/,
  /^moonshot-v1/,
  /ollama/,
  /llama/,
  /qwen2/,
  /codestral/,
  /codegeex/,
]

/** 明确支持图片的模型模式（子串匹配，不区分大小写） */
const VISION_POSITIVE_PATTERNS: RegExp[] = [
  /^claude-/,
  /^gpt-/,
  /^gemini-/,
  /^glm-5v/,
  /^glm-4\.5v/,
  /^kimi-k3/,
  /^kimi-k2\.7/,
  /^mini-max-m3/,
  /^qwen3\.8/,
  /^qwen3\.7-plus/,
  /^qwen-vl/,
  /^qwen2-vl/,
  /^grok-2-vision/,
]

/**
 * 判断模型是否支持图片输入。
 * 未知模型默认视为支持（doge-code 主用 Claude，避免误路由打断正常请求）。
 */
export function isVisionCapableModel(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (VISION_NEGATIVE_PATTERNS.some(p => p.test(m))) return false
  if (VISION_POSITIVE_PATTERNS.some(p => p.test(m))) return true
  return true
}

// ─── 路由 ───

/**
 * 为不支持图片的模型查找视觉路由目标。
 *
 * @param currentModel 当前模型 ID
 * @returns 目标视觉模型 ID；如果当前模型已支持图片则返回 null（无需路由）
 */
export function resolveVisionModel(currentModel: string): string | null {
  if (isVisionCapableModel(currentModel)) {
    return null // 当前模型已支持图片，无需路由
  }

  // 1. 同 Provider：Claude 全系支持图片 → 返回当前 provider 的默认 Sonnet
  //    （对齐 zhikuncode "同 Provider 下查找首个支持图片的模型"）
  const ms = getModelStrings()
  const sameProviderModel = ms.sonnet46 ?? ms.sonnet45 ?? ms.sonnet40
  if (sameProviderModel && isVisionCapableModel(sameProviderModel)) {
    return sameProviderModel
  }

  // 2. 全局兜底：标准 Sonnet 模型
  return getDefaultSonnetModel()
}

// ─── 图片检测 ───

/**
 * 检测消息数组中是否包含图片块。
 * 兼容两种消息格式：
 *   - 包装格式 { type: 'user', message: { role, content } }（SDKMessage）
 *   - 裸格式 { role, content }（MessageParam）
 * content 可以是字符串或 ContentBlockParam 数组（含 type: 'image'）。
 */
export function hasImagesInMessages(messages: unknown[]): boolean {
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) continue
    const m = msg as Record<string, unknown>

    // 包装格式：{ type: 'user', message: {...} }
    let content: unknown = null
    if (m.type === 'user' && typeof m.message === 'object' && m.message !== null) {
      content = (m.message as Record<string, unknown>).content
    } else if ('content' in m) {
      content = m.content
    }
    if (typeof content === 'string') {
      if (/data:image\/[^;]+;base64,/.test(content)) return true
      continue
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue
        const b = block as Record<string, unknown>
        if (b.type === 'image') return true
      }
    }
  }
  return false
}
