import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/index.js'
import { logEvent } from '../services/analytics/index.js'
import { setHasUnknownModelCost } from '../bootstrap/state.js'
import { isFastModeEnabled } from './fastMode.js'
import {
  CLAUDE_3_5_HAIKU_CONFIG,
  CLAUDE_3_5_V2_SONNET_CONFIG,
  CLAUDE_3_7_SONNET_CONFIG,
  CLAUDE_HAIKU_4_5_CONFIG,
  CLAUDE_OPUS_4_1_CONFIG,
  CLAUDE_OPUS_4_5_CONFIG,
  CLAUDE_OPUS_4_6_CONFIG,
  CLAUDE_OPUS_4_CONFIG,
  CLAUDE_SONNET_4_5_CONFIG,
  CLAUDE_SONNET_4_6_CONFIG,
  CLAUDE_SONNET_4_CONFIG,
} from './model/configs.js'
import {
  firstPartyNameToCanonical,
  getCanonicalName,
  getDefaultMainLoopModelSetting,
  type ModelShortName,
} from './model/model.js'

/**
 * 模型各项计费单价（美元）。
 * @see https://platform.claude.com/docs/en/about-claude/pricing
 */
export type ModelCosts = {
  inputTokens: number                // 输入 token 单价（每百万 token）
  outputTokens: number               // 输出 token 单价（每百万 token）
  promptCacheWriteTokens: number     // 提示缓存写入单价（每百万 token）
  promptCacheReadTokens: number      // 提示缓存读取单价（每百万 token）
  webSearchRequests: number          // 每次网络搜索请求单价
}

/** 标准 Sonnet 计费层级：输入 $3 / 输出 $15 每百万 token */
export const COST_TIER_3_15 = {
  inputTokens: 3,
  outputTokens: 15,
  promptCacheWriteTokens: 3.75,
  promptCacheReadTokens: 0.3,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** Opus 4 / 4.1 计费层级：输入 $15 / 输出 $75 每百万 token */
export const COST_TIER_15_75 = {
  inputTokens: 15,
  outputTokens: 75,
  promptCacheWriteTokens: 18.75,
  promptCacheReadTokens: 1.5,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** Opus 4.5 计费层级：输入 $5 / 输出 $25 每百万 token */
export const COST_TIER_5_25 = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheWriteTokens: 6.25,
  promptCacheReadTokens: 0.5,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** Opus 4.6 快速模式计费层级：输入 $30 / 输出 $150 每百万 token */
export const COST_TIER_30_150 = {
  inputTokens: 30,
  outputTokens: 150,
  promptCacheWriteTokens: 37.5,
  promptCacheReadTokens: 3,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** Haiku 3.5 计费层级：输入 $0.80 / 输出 $4 每百万 token */
export const COST_HAIKU_35 = {
  inputTokens: 0.8,
  outputTokens: 4,
  promptCacheWriteTokens: 1,
  promptCacheReadTokens: 0.08,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** Haiku 4.5 计费层级：输入 $1 / 输出 $5 每百万 token */
export const COST_HAIKU_45 = {
  inputTokens: 1,
  outputTokens: 5,
  promptCacheWriteTokens: 1.25,
  promptCacheReadTokens: 0.1,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

/** 未知模型回退默认计费（采用 Opus 4.5 的 $5/$25 层级） */
const DEFAULT_UNKNOWN_MODEL_COST = COST_TIER_5_25

/**
 * 获取 Opus 4.6 在当前模式下的计费单价。
 * 若快速模式启用且请求标记为快速速度，则返回高倍率定价；否则返回标准定价。
 */
export function getOpus46CostTier(fastMode: boolean): ModelCosts {
  if (isFastModeEnabled() && fastMode) {
    return COST_TIER_30_150
  }
  return COST_TIER_5_25
}

/**
 * 模型短名到计费单价的映射表。
 * 网络搜索费用：每千次请求 $10 = 每次 $0.01。
 * // @[MODEL LAUNCH]: 新增模型时请在下方添加对应的定价条目。
 * // 定价数据来源：https://platform.claude.com/docs/en/about-claude/pricing
 */
export const MODEL_COSTS: Record<ModelShortName, ModelCosts> = {
  [firstPartyNameToCanonical(CLAUDE_3_5_HAIKU_CONFIG.firstParty)]:
    COST_HAIKU_35,
  [firstPartyNameToCanonical(CLAUDE_HAIKU_4_5_CONFIG.firstParty)]:
    COST_HAIKU_45,
  [firstPartyNameToCanonical(CLAUDE_3_5_V2_SONNET_CONFIG.firstParty)]:
    COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_3_7_SONNET_CONFIG.firstParty)]:
    COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_CONFIG.firstParty)]:
    COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_5_CONFIG.firstParty)]:
    COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_SONNET_4_6_CONFIG.firstParty)]:
    COST_TIER_3_15,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_CONFIG.firstParty)]: COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_1_CONFIG.firstParty)]:
    COST_TIER_15_75,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_5_CONFIG.firstParty)]:
    COST_TIER_5_25,
  [firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)]:
    COST_TIER_5_25,
}

/**
 * 根据 token 用量与模型计费配置计算美元成本。
 */
function tokensToUSDCost(modelCosts: ModelCosts, usage: Usage): number {
  return (
    (usage.input_tokens / 1_000_000) * modelCosts.inputTokens +
    (usage.output_tokens / 1_000_000) * modelCosts.outputTokens +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) *
      modelCosts.promptCacheReadTokens +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) *
      modelCosts.promptCacheWriteTokens +
    (usage.server_tool_use?.web_search_requests ?? 0) *
      modelCosts.webSearchRequests
  )
}

/**
 * 获取指定模型在给定使用情况下的计费单价。
 * 若模型未知，则记录事件并回退至默认主循环模型的计费，或使用默认未知模型计费。
 */
export function getModelCosts(model: string, usage: Usage): ModelCosts {
  const shortName = getCanonicalName(model)

  // 检查是否为启用了快速模式的 Opus 4.6 模型
  if (
    shortName === firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)
  ) {
    const isFastMode = usage.speed === 'fast'
    return getOpus46CostTier(isFastMode)
  }

  const costs = MODEL_COSTS[shortName]
  if (!costs) {
    trackUnknownModelCost(model, shortName)
    return (
      MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
      DEFAULT_UNKNOWN_MODEL_COST
    )
  }
  return costs
}

/**
 * 记录未知模型计费事件，并标记存在未知模型成本。
 */
function trackUnknownModelCost(model: string, shortName: ModelShortName): void {
  logEvent('tengu_unknown_model_cost', {
    model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    shortName:
      shortName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  setHasUnknownModelCost()
}

/**
 * 计算单次查询的美元成本。
 * 若未找到模型对应的计费信息，则使用默认模型的计费。
 */
export function calculateUSDCost(resolvedModel: string, usage: Usage): number {
  const modelCosts = getModelCosts(resolvedModel, usage)
  return tokensToUSDCost(modelCosts, usage)
}

/**
 * 根据原始 token 数量计算成本，无需完整的 BetaUsage 对象。
 * 适用于侧查询（如分类器）独立追踪 token 消耗的场景。
 */
export function calculateCostFromTokens(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  },
): number {
  const usage: Usage = {
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cache_read_input_tokens: tokens.cacheReadInputTokens,
    cache_creation_input_tokens: tokens.cacheCreationInputTokens,
  } as Usage
  return calculateUSDCost(model, usage)
}

/**
 * 格式化单价显示：整数无小数位，非整数保留两位小数。
 * 例如 3 → "$3"，0.8 → "$0.80"，22.5 → "$22.50"。
 */
function formatPrice(price: number): string {
  if (Number.isInteger(price)) {
    return `$${price}`
  }
  return `$${price.toFixed(2)}`
}

/**
 * 将模型计费格式化为显示用字符串。
 * 例如 "$3/$15 per Mtok"。
 */
export function formatModelPricing(costs: ModelCosts): string {
  return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`
}

/**
 * 获取指定模型的格式化定价字符串。
 * 参数可为模型短名或完整名称。
 * 若模型未找到则返回 undefined。
 */
export function getModelPricingString(model: string): string | undefined {
  const shortName = getCanonicalName(model)
  const costs = MODEL_COSTS[shortName]
  if (!costs) return undefined
  return formatModelPricing(costs)
}