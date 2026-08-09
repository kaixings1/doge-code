// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
/**
 * utils/model/modelRouter.ts — 通用模型路由（吸收自 OpenClaude agent routing）
 *
 * 按任务能力需求将请求路由到合适的模型。
 * 吸收自 Gitlawb/openclaude 的 agent routing 设计：
 *   - 按模型强度路由子代理
 *   - cap sub-agent tool steps with maxSteps
 *
 * doge-code 应用：
 *   - 复杂任务（分析/重构） → Opus
 *   - 中等任务（编码/审查） → Sonnet
 *   - 简单任务（补全/格式化） → Haiku
 */

import { getModelStrings } from './modelStrings.js'
import { getDefaultSonnetModel } from './model.js'

// ─── 能力需求等级 ───

export type TaskCapability = 'minimal' | 'standard' | 'advanced' | 'expert'

/**
 * 任务能力需求枚举
 *
 * minimal   — 纯文本补全、格式化、简单搜索
 * standard  — 常规编码、代码审查、测试生成
 * advanced  — 复杂重构、架构分析、bug 诊断
 * expert    — 深度推理、多步规划、安全审计
 */

// ─── 模型能力评级 ───

/**
 * 模型能力评级映射（基于模型名称模式）
 */
const MODEL_CAPABILITY_MAP: Record<string, TaskCapability> = {
  // Opus 系列 — expert
  'claude-opus': 'expert',
  'claude-opus-4-0': 'expert',
  'claude-opus-4-1': 'expert',
  'claude-opus-4-5': 'expert',
  'claude-opus-4-6': 'expert',

  // Sonnet 系列 — advanced
  'claude-sonnet': 'advanced',
  'claude-sonnet-4-0': 'advanced',
  'claude-sonnet-4-5': 'advanced',
  'claude-sonnet-4-6': 'advanced',

  // Haiku 系列 — standard
  'claude-haiku': 'standard',
  'claude-haiku-3-5': 'standard',
  'claude-haiku-4-5': 'standard',

  // GPT 系列
  'gpt-4o': 'advanced',
  'gpt-4-turbo': 'advanced',
  'gpt-4': 'advanced',
  'gpt-3.5-turbo': 'standard',
  'o1': 'expert',
  'o3': 'expert',

  // Gemini
  'gemini-2-5-pro': 'advanced',
  'gemini-2-5-flash': 'standard',
  'gemini-1-5-pro': 'advanced',
  'gemini-1-5-flash': 'standard',

  // DeepSeek
  'deepseek-reasoner': 'expert',
  'deepseek-chat': 'standard',

  // Qwen
  'qwen-turbo': 'minimal',
  'qwen-plus': 'standard',
  'qwen-max': 'advanced',
  'qwen3': 'standard',
  'qwen3-max': 'advanced',
}

/**
 * 获取模型的能力评级
 */
export function getModelCapability(modelId: string): TaskCapability {
  const m = modelId.toLowerCase()
  for (const [pattern, capability] of Object.entries(MODEL_CAPABILITY_MAP)) {
    if (m.includes(pattern)) {
      return capability
    }
  }
  // 默认：unknown 模型视为 standard
  return 'standard'
}

// ─── 路由决策 ───

/**
 * 根据任务能力需求选择合适的模型
 *
 * @param requiredCapability 任务所需的最低能力等级
 * @param currentModel 当前模型（用于同 provider 优先）
 * @returns 目标模型 ID；如果当前模型已满足需求则返回 null
 */
export function resolveModelForCapability(
  requiredCapability: TaskCapability,
  currentModel: string,
): string | null {
  const currentCapability = getModelCapability(currentModel)

  // 当前模型已满足需求，无需路由
  const capabilityOrder: TaskCapability[] = ['minimal', 'standard', 'advanced', 'expert']
  const currentLevel = capabilityOrder.indexOf(currentCapability)
  const requiredLevel = capabilityOrder.indexOf(requiredCapability)

  if (currentLevel >= requiredLevel) {
    return null
  }

  // 需要升级：根据当前 provider 选择合适的模型
  const ms = getModelStrings()

  // 同 provider 优先
  const providerModels = [
    // Claude
    ms.opus46 || ms.opus45 || ms.opus40,
    ms.sonnet46 || ms.sonnet45 || ms.sonnet40,
    ms.haiku45 || ms.haiku35,
    // OpenAI
    'gpt-4o',
    'o1',
    'o3',
    // Gemini
    'gemini-2-5-pro',
  ].filter(Boolean) as string[]

  for (const model of providerModels) {
    const modelCapability = getModelCapability(model)
    const modelLevel = capabilityOrder.indexOf(modelCapability)
    if (modelLevel >= requiredLevel) {
      return model
    }
  }

  // 兜底：返回当前 provider 最强模型
  return providerModels[0] || getDefaultSonnetModel()
}

/**
 * 快速判断：当前模型是否能满足任务需求
 */
export function canModelHandleTask(modelId: string, requiredCapability: TaskCapability): boolean {
  const currentLevel = ['minimal', 'standard', 'advanced', 'expert'].indexOf(getModelCapability(modelId))
  const requiredLevel = ['minimal', 'standard', 'advanced', 'expert'].indexOf(requiredCapability)
  return currentLevel >= requiredLevel
}
