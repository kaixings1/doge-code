import { logEvent } from '../services/analytics/index.js';
import { setHasUnknownModelCost } from '../bootstrap/state.js';
import { isFastModeEnabled } from './fastMode.js';
import { CLAUDE_3_5_HAIKU_CONFIG, CLAUDE_3_5_V2_SONNET_CONFIG, CLAUDE_3_7_SONNET_CONFIG, CLAUDE_HAIKU_4_5_CONFIG, CLAUDE_OPUS_4_1_CONFIG, CLAUDE_OPUS_4_5_CONFIG, CLAUDE_OPUS_4_6_CONFIG, CLAUDE_OPUS_4_CONFIG, CLAUDE_SONNET_4_5_CONFIG, CLAUDE_SONNET_4_6_CONFIG, CLAUDE_SONNET_4_CONFIG, } from './model/configs.js';
import { firstPartyNameToCanonical, getCanonicalName, getDefaultMainLoopModelSetting, } from './model/model.js';
// ============================================================================
// 非 Anthropic 厂商模型定价（扩展支持）
// ============================================================================
//
// 定价来源：
// - OpenAI: https://platform.openai.com/docs/pricing
// - Google: https://ai.google.dev/pricing
// - Groq: https://groq.com/pricing/
// - xAI: https://x.ai/api/pricing
// - Together AI: https://docs.together.ai/docs/pricing
//
// 所有价格均为每百万 token 单价（美元），无缓存费用按输入价计算。
// ============================================================================
/** GPT-4o 计费层级：输入 $2.50 / 输出 $10 每百万 token */
export const COST_TIER_GPT4O = {
    inputTokens: 2.5,
    outputTokens: 10,
    promptCacheWriteTokens: 2.5,
    promptCacheReadTokens: 2.5,
    webSearchRequests: 0,
};
/** GPT-4o-mini 计费层级：输入 $0.15 / 输出 $0.6 每百万 token */
export const COST_TIER_GPT4O_MINI = {
    inputTokens: 0.15,
    outputTokens: 0.6,
    promptCacheWriteTokens: 0.15,
    promptCacheReadTokens: 0.15,
    webSearchRequests: 0,
};
/** GPT-4 Turbo 计费层级：输入 $10 / 输出 $30 每百万 token */
export const COST_TIER_GPT4_TURBO = {
    inputTokens: 10,
    outputTokens: 30,
    promptCacheWriteTokens: 10,
    promptCacheReadTokens: 10,
    webSearchRequests: 0,
};
/** GPT-4.1 系列计费层级：输入 $2 / 输出 $8 每百万 token */
export const COST_TIER_GPT4_1 = {
    inputTokens: 2,
    outputTokens: 8,
    promptCacheWriteTokens: 2,
    promptCacheReadTokens: 2,
    webSearchRequests: 0,
};
/** o3 计费层级：输入 $10 / 输出 $40 每百万 token */
export const COST_TIER_O3 = {
    inputTokens: 10,
    outputTokens: 40,
    promptCacheWriteTokens: 10,
    promptCacheReadTokens: 10,
    webSearchRequests: 0,
};
/** o4-mini 计费层级：输入 $1.1 / 输出 $4.4 每百万 token */
export const COST_TIER_O4_MINI = {
    inputTokens: 1.1,
    outputTokens: 4.4,
    promptCacheWriteTokens: 1.1,
    promptCacheReadTokens: 1.1,
    webSearchRequests: 0,
};
/** Gemini 2.0 Flash 计费层级：输入 $0.10 / 输出 $0.4 每百万 token */
export const COST_TIER_GEMINI_2_FLASH = {
    inputTokens: 0.1,
    outputTokens: 0.4,
    promptCacheWriteTokens: 0.1,
    promptCacheReadTokens: 0.01,
    webSearchRequests: 0,
};
/** Gemini 2.0 Pro 计费层级：输入 $1.25 / 输出 $5 每百万 token */
export const COST_TIER_GEMINI_2_PRO = {
    inputTokens: 1.25,
    outputTokens: 5,
    promptCacheWriteTokens: 1.25,
    promptCacheReadTokens: 0.02,
    webSearchRequests: 0,
};
/** Gemini 1.5 Flash 计费层级：输入 $0.075 / 输出 $0.3 每百万 token */
export const COST_TIER_GEMINI_1_5_FLASH = {
    inputTokens: 0.075,
    outputTokens: 0.3,
    promptCacheWriteTokens: 0.075,
    promptCacheReadTokens: 0.00875,
    webSearchRequests: 0,
};
/** Groq Llama 4 系列计费层级：输入 $0.05 / 输出 $0.08 每百万 token（Groq 按 token 计费但速率极快） */
export const COST_TIER_GROQ_LLAMA4 = {
    inputTokens: 0.05,
    outputTokens: 0.08,
    promptCacheWriteTokens: 0.05,
    promptCacheReadTokens: 0.05,
    webSearchRequests: 0,
};
/** xAI Grok-3 计费层级：输入 $3 / 输出 $15 每百万 token */
export const COST_TIER_GROK3 = {
    inputTokens: 3,
    outputTokens: 15,
    promptCacheWriteTokens: 3,
    promptCacheReadTokens: 3,
    webSearchRequests: 0,
};
/** DeepSeek V3 计费层级：输入 $0.27 / 输出 $1.1 每百万 token */
export const COST_TIER_DEEPSEEK_V3 = {
    inputTokens: 0.27,
    outputTokens: 1.1,
    promptCacheWriteTokens: 0.27,
    promptCacheReadTokens: 0.27,
    webSearchRequests: 0,
};
/** DeepSeek R1 计费层级：输入 $0.55 / 输出 $2.19 每百万 token */
export const COST_TIER_DEEPSEEK_R1 = {
    inputTokens: 0.55,
    outputTokens: 2.19,
    promptCacheWriteTokens: 0.55,
    promptCacheReadTokens: 0.55,
    webSearchRequests: 0,
};
/** 未知 OpenAI 模型回退（采用 GPT-4o 定价） */
const DEFAULT_UNKNOWN_OPENAI_COST = COST_TIER_GPT4O;
/** 未知 Gemini 模型回退（采用 Gemini 2.0 Flash 定价） */
const DEFAULT_UNKNOWN_GEMINI_COST = COST_TIER_GEMINI_2_FLASH;
/** 标准 Sonnet 计费层级：输入 $3 / 输出 $15 每百万 token */
export const COST_TIER_3_15 = {
    inputTokens: 3,
    outputTokens: 15,
    promptCacheWriteTokens: 3.75,
    promptCacheReadTokens: 0.3,
    webSearchRequests: 0.01,
};
/** Opus 4 / 4.1 计费层级：输入 $15 / 输出 $75 每百万 token */
export const COST_TIER_15_75 = {
    inputTokens: 15,
    outputTokens: 75,
    promptCacheWriteTokens: 18.75,
    promptCacheReadTokens: 1.5,
    webSearchRequests: 0.01,
};
/** Opus 4.5 计费层级：输入 $5 / 输出 $25 每百万 token */
export const COST_TIER_5_25 = {
    inputTokens: 5,
    outputTokens: 25,
    promptCacheWriteTokens: 6.25,
    promptCacheReadTokens: 0.5,
    webSearchRequests: 0.01,
};
/** Opus 4.6 快速模式计费层级：输入 $30 / 输出 $150 每百万 token */
export const COST_TIER_30_150 = {
    inputTokens: 30,
    outputTokens: 150,
    promptCacheWriteTokens: 37.5,
    promptCacheReadTokens: 3,
    webSearchRequests: 0.01,
};
/** Haiku 3.5 计费层级：输入 $0.80 / 输出 $4 每百万 token */
export const COST_HAIKU_35 = {
    inputTokens: 0.8,
    outputTokens: 4,
    promptCacheWriteTokens: 1,
    promptCacheReadTokens: 0.08,
    webSearchRequests: 0.01,
};
/** Haiku 4.5 计费层级：输入 $1 / 输出 $5 每百万 token */
export const COST_HAIKU_45 = {
    inputTokens: 1,
    outputTokens: 5,
    promptCacheWriteTokens: 1.25,
    promptCacheReadTokens: 0.1,
    webSearchRequests: 0.01,
};
/**
 * 获取 Opus 4.6 在当前模式下的计费单价。
 * 若快速模式启用且请求标记为快速速度，则返回高倍率定价；否则返回标准定价。
 */
export function getOpus46CostTier(fastMode) {
    if (isFastModeEnabled() && fastMode) {
        return COST_TIER_30_150;
    }
    return COST_TIER_5_25;
}
/**
 * 模型短名到计费单价的映射表。
 * 网络搜索费用：每千次请求 $10 = 每次 $0.01。
 * // @[MODEL LAUNCH]: 新增模型时请在下方添加对应的定价条目。
 * // 定价数据来源：
 * //   - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * //   - OpenAI: https://platform.openai.com/docs/pricing
 * //   - Google: https://ai.google.dev/pricing
 * //   - Groq: https://groq.com/pricing/
 * //   - xAI: https://x.ai/api/pricing
 * //   - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 */
export const MODEL_COSTS = {
    // --- Anthropic Claude 系列 ---
    [firstPartyNameToCanonical(CLAUDE_3_5_HAIKU_CONFIG.firstParty)]: COST_HAIKU_35,
    [firstPartyNameToCanonical(CLAUDE_HAIKU_4_5_CONFIG.firstParty)]: COST_HAIKU_45,
    [firstPartyNameToCanonical(CLAUDE_3_5_V2_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
    [firstPartyNameToCanonical(CLAUDE_3_7_SONNET_CONFIG.firstParty)]: COST_TIER_3_15,
    [firstPartyNameToCanonical(CLAUDE_SONNET_4_CONFIG.firstParty)]: COST_TIER_3_15,
    [firstPartyNameToCanonical(CLAUDE_SONNET_4_5_CONFIG.firstParty)]: COST_TIER_3_15,
    [firstPartyNameToCanonical(CLAUDE_SONNET_4_6_CONFIG.firstParty)]: COST_TIER_3_15,
    [firstPartyNameToCanonical(CLAUDE_OPUS_4_CONFIG.firstParty)]: COST_TIER_15_75,
    [firstPartyNameToCanonical(CLAUDE_OPUS_4_1_CONFIG.firstParty)]: COST_TIER_15_75,
    [firstPartyNameToCanonical(CLAUDE_OPUS_4_5_CONFIG.firstParty)]: COST_TIER_5_25,
    [firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)]: COST_TIER_5_25,
    // --- OpenAI 系列 ---
    'gpt-4o': COST_TIER_GPT4O,
    'gpt-4o-2024-08-06': COST_TIER_GPT4O,
    'gpt-4o-2024-05-13': COST_TIER_GPT4O,
    'gpt-4o-mini': COST_TIER_GPT4O_MINI,
    'gpt-4o-mini-2024-07-18': COST_TIER_GPT4O_MINI,
    'gpt-4-turbo': COST_TIER_GPT4_TURBO,
    'gpt-4-turbo-2024-04-09': COST_TIER_GPT4_TURBO,
    'gpt-4-1106-preview': COST_TIER_GPT4_TURBO,
    'gpt-4.1': COST_TIER_GPT4_1,
    'gpt-4.1-mini': COST_TIER_GPT4_1,
    'gpt-4.1-nano': COST_TIER_GPT4_1,
    'o3': COST_TIER_O3,
    'o3-mini': COST_TIER_O3,
    'o4-mini': COST_TIER_O4_MINI,
    // --- Google Gemini 系列 ---
    'gemini-2.0-flash': COST_TIER_GEMINI_2_FLASH,
    'gemini-2.0-flash-001': COST_TIER_GEMINI_2_FLASH,
    'gemini-2.0-pro': COST_TIER_GEMINI_2_PRO,
    'gemini-2.0-pro-001': COST_TIER_GEMINI_2_PRO,
    'gemini-1.5-flash': COST_TIER_GEMINI_1_5_FLASH,
    'gemini-1.5-flash-001': COST_TIER_GEMINI_1_5_FLASH,
    'gemini-1.5-flash-002': COST_TIER_GEMINI_1_5_FLASH,
    'gemini-1.5-pro': COST_TIER_GEMINI_2_PRO,
    'gemini-1.5-pro-001': COST_TIER_GEMINI_2_PRO,
    'gemini-1.5-pro-002': COST_TIER_GEMINI_2_PRO,
    // --- Groq 系列（Llama 4） ---
    'meta-llama/llama-4-scout-17b-16e-instruct': COST_TIER_GROQ_LLAMA4,
    'meta-llama/llama-4-maverick-17b-128e-instruct': COST_TIER_GROQ_LLAMA4,
    'llama-4-scout': COST_TIER_GROQ_LLAMA4,
    'llama-4-maverick': COST_TIER_GROQ_LLAMA4,
    // --- xAI Grok 系列 ---
    'grok-3': COST_TIER_GROK3,
    'grok-3-beta': COST_TIER_GROK3,
    'grok-3-mini': COST_TIER_GROK3,
    'grok-2-1212': COST_TIER_GROK3,
    'grok-2-vision-1212': COST_TIER_GROK3,
    // --- DeepSeek 系列 ---
    'deepseek-chat': COST_TIER_DEEPSEEK_V3,
    'deepseek-reasoner': COST_TIER_DEEPSEEK_R1,
    'deepseek-v3': COST_TIER_DEEPSEEK_V3,
    'deepseek-r1': COST_TIER_DEEPSEEK_R1,
};
/**
 * 根据 token 用量与模型计费配置计算美元成本。
 */
function tokensToUSDCost(modelCosts, usage) {
    return ((usage.input_tokens / 1000000) * modelCosts.inputTokens +
        (usage.output_tokens / 1000000) * modelCosts.outputTokens +
        ((usage.cache_read_input_tokens ?? 0) / 1000000) *
            modelCosts.promptCacheReadTokens +
        ((usage.cache_creation_input_tokens ?? 0) / 1000000) *
            modelCosts.promptCacheWriteTokens +
        (usage.server_tool_use?.web_search_requests ?? 0) *
            modelCosts.webSearchRequests);
}
/**
 * 获取指定模型在给定使用情况下的计费单价。
 * 若模型未知，则记录事件并回退至默认主循环模型的计费，或使用默认未知模型计费。
 */
export function getModelCosts(model, _usage) {
    const shortName = getCanonicalName(model);
    // 检查是否为启用了快速模式的 Opus 4.6 模型
    if (shortName === firstPartyNameToCanonical(CLAUDE_OPUS_4_6_CONFIG.firstParty)) {
        const isFastMode = _usage.speed === 'fast';
        return getOpus46CostTier(isFastMode);
    }
    const costs = MODEL_COSTS[shortName];
    if (!costs) {
        trackUnknownModelCost(model, shortName);
        return (MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
            DEFAULT_UNKNOWN_MODEL_COST);
    }
    return costs;
}
/**
 * 记录未知模型计费事件，并标记存在未知模型成本。
 */
function trackUnknownModelCost(model, shortName) {
    logEvent('tengu_unknown_model_cost', {
        model: model,
        shortName: shortName,
    });
    setHasUnknownModelCost();
}
/**
 * 计算单次查询的美元成本。
 * 若未找到模型对应的计费信息，则使用默认模型的计费。
 */
export function calculateUSDCost(resolvedModel, usage) {
    const modelCosts = getModelCosts(resolvedModel, usage);
    return tokensToUSDCost(modelCosts, usage);
}
/**
 * 根据原始 token 数量计算成本，无需完整的 BetaUsage 对象。
 * 适用于侧查询（如分类器）独立追踪 token 消耗的场景。
 */
export function calculateCostFromTokens(model, tokens) {
    const usage = {
        input_tokens: tokens.inputTokens,
        output_tokens: tokens.outputTokens,
        cache_read_input_tokens: tokens.cacheReadInputTokens,
        cache_creation_input_tokens: tokens.cacheCreationInputTokens,
    };
    return calculateUSDCost(model, usage);
}
/**
 * 格式化单价显示：整数无小数位，非整数保留两位小数。
 * 例如 3 → "$3"，0.8 → "$0.80"，22.5 → "$22.50"。
 */
function formatPrice(price) {
    if (Number.isInteger(price)) {
        return `$${price}`;
    }
    return `$${price.toFixed(2)}`;
}
/**
 * 将模型计费格式化为显示用字符串。
 * 例如 "$3/$15 per Mtok"。
 */
export function formatModelPricing(costs) {
    return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`;
}
/**
 * 获取指定模型的格式化定价字符串。
 * 参数可为模型短名或完整名称。
 * 若模型未找到则返回 undefined。
 */
export function getModelPricingString(model) {
    const shortName = getCanonicalName(model);
    const costs = MODEL_COSTS[shortName];
    if (!costs)
        return undefined;
    return formatModelPricing(costs);
}
