// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { getInitialMainLoopModel } from '../../bootstrap/state.js'
import {
  isClaudeAISubscriber,
  isMaxSubscriber,
  isTeamPremiumSubscriber,
} from '../auth.js'
import { getModelStrings } from './modelStrings.js'
import {
  COST_TIER_3_15,
  COST_HAIKU_35,
  COST_HAIKU_45,
  formatModelPricing,
} from '../modelCost.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import { checkOpus1mAccess, checkSonnet1mAccess } from './check1mAccess.js'
import { getAPIProvider } from './providers.js'
import { isModelAllowed } from './modelAllowlist.js'
import {
  getCanonicalName,
  getClaudeAiUserDefaultModelDescription,
  getDefaultSonnetModel,
  getDefaultOpusModel,
  getDefaultHaikuModel,
  getDefaultMainLoopModelSetting,
  getMarketingNameForModel,
  getUserSpecifiedModelSetting,
  isOpus1mMergeEnabled,
  getOpus46PricingSuffix,
  renderDefaultModelSetting,
  type ModelSetting,
} from './model.js'
import { has1mContext } from '../context.js'
import { getGlobalConfig } from '../config.js'

// @[MODEL LAUNCH]: 更新下方所有可用和默认的模型选项字符串。

export type ModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

export function getDefaultOptionForUser(fastMode = false): ModelOption {
  if (process.env.USER_TYPE === 'ant') {
    const currentModel = renderDefaultModelSetting(
      getDefaultMainLoopModelSetting(),
    )
    return {
      value: null,
      label: '默认（推荐）',
      description: `使用 Ants 的默认模型（当前为 ${currentModel}）`,
      descriptionForModel: `Default model (currently ${currentModel})`,
    }
  }

  // 订阅用户
  if (isClaudeAISubscriber()) {
    return {
      value: null,
      label: '默认（推荐）',
      description: getClaudeAiUserDefaultModelDescription(fastMode),
    }
  }

  // 即用即付用户（PAYG）
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: null,
    label: '默认（推荐）',
    description: `使用默认模型 ( 当前为 ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())}) ${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
  }
}

function getAntModels(): Array<{
  alias: ModelSetting
  label: string
  description?: string
  model?: string
}> {
  return []
}

function getCustomSonnetOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customSonnetModel = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  // 当第三方用户拥有自定义 Sonnet 模型字符串时，直接显示它
  if (is3P && customSonnetModel) {
    const is1m = has1mContext(customSonnetModel)
    return {
      value: 'sonnet',
      label:
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME ?? customSonnetModel,
      description:
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ??
        `自定义 Sonnet 模型${is1m ? '( 1M 上下文 )' : ''}`,
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ?? `自定义 Sonnet 模型${is1m ? '（1M 上下文）' : ''}`} (${customSonnetModel})`,
    }
  }
}

// @[MODEL LAUNCH]: 使用新模型的标签和描述更新或添加模型选项函数（如 getSonnetXXOption、getOpusXXOption 等）。
// 这些将出现在 /model 选择器中。
function getSonnet46Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet46 : 'sonnet',
    label: 'Sonnet',
    description: `Sonnet 4.6 · 适合日常任务${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 4.6 - 适合日常任务。通常推荐用于大多数编码任务',
  }
}

function getCustomOpusOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customOpusModel = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  // 当第三方用户拥有自定义 Opus 模型字符串时，直接显示它
  if (is3P && customOpusModel) {
    const is1m = has1mContext(customOpusModel)
    return {
      value: 'opus',
      label: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME ?? customOpusModel,
      description:
        process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ??
        `自定义 Opus 模型${is1m ? '（1M 上下文）' : ''}`,
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ?? `自定义 Opus 模型${is1m ? '（1M 上下文）' : ''}`} (${customOpusModel})`,
    }
  }
}

function getOpus41Option(): ModelOption {
  return {
    value: 'opus',
    label: 'Opus 4.1',
    description: `Opus 4.1 · 旧版`,
    descriptionForModel: 'Opus 4.1 - 旧版本',
  }
}

function getOpus46Option(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus46 : 'opus',
    label: 'Opus',
    description: `Opus 4.6 · 最适合复杂工作${getOpus46PricingSuffix(fastMode)}`,
    descriptionForModel: 'Opus 4.6 - 最适合复杂工作',
  }
}

export function getSonnet46_1MOption(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet46 + '[1m]' : 'sonnet[1m]',
    label: 'Sonnet（1M 上下文）',
    description: `Sonnet 4.6 适合长时间会话${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 4.6（1M 上下文窗口）- 适合大型代码库的长时间会话',
  }
}

export function getOpus46_1MOption(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus46 + '[1m]' : 'opus[1m]',
    label: 'Opus（1M 上下文）',
    description: `Opus 4.6 适合长时间会话${getOpus46PricingSuffix(fastMode)}`,
    descriptionForModel:
      'Opus 4.6（1M 上下文窗口）- 适合大型代码库的长时间会话',
  }
}

function getCustomHaikuOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customHaikuModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  // 当第三方用户拥有自定义 Haiku 模型字符串时，直接显示它
  if (is3P && customHaikuModel) {
    return {
      value: 'haiku',
      label: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME ?? customHaikuModel,
      description:
        process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ??
        '自定义 Haiku 模型',
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ?? '自定义 Haiku 模型'} (${customHaikuModel})`,
    }
  }
}

function getHaiku45Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: 'haiku',
    label: 'Haiku',
    description: `Haiku 4.5 · 快速回答最快${is3P ? '' : ` · ${formatModelPricing(COST_HAIKU_45)}`}`,
    descriptionForModel:
      'Haiku 4.5 - 快速回答最快。成本更低，但能力不如 Sonnet 4.6。',
  }
}

function getHaiku35Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: 'haiku',
    label: 'Haiku',
    description: `Haiku 3.5 适合简单任务${is3P ? '' : ` · ${formatModelPricing(COST_HAIKU_35)}`}`,
    descriptionForModel:
      'Haiku 3.5 - 更快、成本更低，但能力不如 Sonnet。适合简单任务。',
  }
}

function getHaikuOption(): ModelOption {
  // 根据提供商返回正确的 Haiku 选项
  const haikuModel = getDefaultHaikuModel()
  return haikuModel === getModelStrings().haiku45
    ? getHaiku45Option()
    : getHaiku35Option()
}

function getMaxOpusOption(fastMode = false): ModelOption {
  return {
    value: 'opus',
    label: 'Opus',
    description: `Opus 4.6 · 最适合复杂工作${fastMode ? getOpus46PricingSuffix(true) : ''}`,
  }
}

export function getMaxSonnet46_1MOption(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  const billingInfo = isClaudeAISubscriber() ? ' · 按额外使用量计费' : ''
  return {
    value: 'sonnet[1m]',
    label: 'Sonnet（1M 上下文）',
    description: `Sonnet 4.6（1M 上下文）${billingInfo}${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
  }
}

export function getMaxOpus46_1MOption(fastMode = false): ModelOption {
  const billingInfo = isClaudeAISubscriber() ? ' · 按额外使用量计费' : ''
  return {
    value: 'opus[1m]',
    label: 'Opus（1M 上下文）',
    description: `Opus 4.6（1M 上下文）${billingInfo}${getOpus46PricingSuffix(fastMode)}`,
  }
}

function getMergedOpus1MOption(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus46 + '[1m]' : 'opus[1m]',
    label: 'Opus（1M 上下文）',
    description: `Opus 4.6（1M 上下文）· 最适合复杂工作${!is3P && fastMode ? getOpus46PricingSuffix(fastMode) : ''}`,
    descriptionForModel: 'Opus 4.6（1M 上下文）- 最适合复杂工作',
  }
}

const MaxSonnet46Option: ModelOption = {
  value: 'sonnet',
  label: 'Sonnet',
  description: 'Sonnet 4.6 · 适合日常任务',
}

const MaxHaiku45Option: ModelOption = {
  value: 'haiku',
  label: 'Haiku',
  description: 'Haiku 4.5 · 快速回答最快',
}

function getOpusPlanOption(): ModelOption {
  return {
    value: 'opusplan',
    label: 'Opus Plan 模式',
    description: '在 Plan 模式下使用 Opus 4.6，其他模式使用 Sonnet 4.6',
  }
}

// @[MODEL LAUNCH]: 更新下方模型选择器列表，为新模型添加或调整选项顺序。
// 每种用户等级（ant、Max/Team Premium、Pro/Team Standard/Enterprise、PAYG 1P、PAYG 3P）都有各自的列表。
function getModelOptionsBase(fastMode = false): ModelOption[] {
  const customConfiguredModel =
    getGlobalConfig().customApiEndpoint?.model?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim()
  const savedModels = (getGlobalConfig().customApiEndpoint?.savedModels ?? [])
    .map(model => model.trim())
    .filter(Boolean)

  if (customConfiguredModel || savedModels.length > 0) {
    const orderedModels = [
      ...(customConfiguredModel ? [customConfiguredModel] : []),
      ...savedModels.filter(model => model !== customConfiguredModel),
    ]
    return [
      ...orderedModels.map(model => ({
        value: model,
        label: model,
        description: '自定义模型',
      })),
    ]
  }
  if (process.env.USER_TYPE === 'ant') {
    // 从 antModels 配置构建选项
    const antModelOptions: ModelOption[] = getAntModels().map(m => ({
      value: m.alias,
      label: m.label,
      description: m.description ?? `[ANT-ONLY] ${m.label} (${m.model})`,
    }))

    return [
      getDefaultOptionForUser(),
      ...antModelOptions,
      getMergedOpus1MOption(fastMode),
      getSonnet46Option(),
      getSonnet46_1MOption(),
      getHaiku45Option(),
    ]
  }

  if (isClaudeAISubscriber()) {
    if (isMaxSubscriber() || isTeamPremiumSubscriber()) {
      // Max 和 Team Premium 用户：默认使用 Opus，将 Sonnet 作为备选展示
      const premiumOptions = [getDefaultOptionForUser(fastMode)]
      if (!isOpus1mMergeEnabled() && checkOpus1mAccess()) {
        premiumOptions.push(getMaxOpus46_1MOption(fastMode))
      }

      premiumOptions.push(MaxSonnet46Option)
      if (checkSonnet1mAccess()) {
        premiumOptions.push(getMaxSonnet46_1MOption())
      }

      premiumOptions.push(MaxHaiku45Option)
      return premiumOptions
    }

    // Pro/Team Standard/Enterprise 用户：默认使用 Sonnet，将 Opus 作为备选展示
    const standardOptions = [getDefaultOptionForUser(fastMode)]
    if (checkSonnet1mAccess()) {
      standardOptions.push(getMaxSonnet46_1MOption())
    }

    if (isOpus1mMergeEnabled()) {
      standardOptions.push(getMergedOpus1MOption(fastMode))
    } else {
      standardOptions.push(getMaxOpusOption(fastMode))
      if (checkOpus1mAccess()) {
        standardOptions.push(getMaxOpus46_1MOption(fastMode))
      }
    }

    standardOptions.push(MaxHaiku45Option)
    return standardOptions
  }

  // PAYG 1P API：默认（Sonnet）+ Sonnet 1M + Opus 4.6 + Opus 1M + Haiku
  if (getAPIProvider() === 'firstParty') {
    const payg1POptions = [getDefaultOptionForUser(fastMode)]
    if (checkSonnet1mAccess()) {
      payg1POptions.push(getSonnet46_1MOption())
    }
    if (isOpus1mMergeEnabled()) {
      payg1POptions.push(getMergedOpus1MOption(fastMode))
    } else {
      payg1POptions.push(getOpus46Option(fastMode))
      if (checkOpus1mAccess()) {
        payg1POptions.push(getOpus46_1MOption(fastMode))
      }
    }
    payg1POptions.push(getHaiku45Option())
    return payg1POptions
  }

  // PAYG 3P：默认（Sonnet 4.5）+ Sonnet（3P 自定义）或 Sonnet 4.6/1M + Opus（3P 自定义）或 Opus 4.1/Opus 4.6/Opus1M + Haiku + Opus 4.1
  const payg3pOptions = [getDefaultOptionForUser(fastMode)]

  const customSonnet = getCustomSonnetOption()
  if (customSonnet !== undefined) {
    payg3pOptions.push(customSonnet)
  } else {
    // 由于 Sonnet 4.5 是默认值，这里添加 Sonnet 4.6
    payg3pOptions.push(getSonnet46Option())
    if (checkSonnet1mAccess()) {
      payg3pOptions.push(getSonnet46_1MOption())
    }
  }

  const customOpus = getCustomOpusOption()
  if (customOpus !== undefined) {
    payg3pOptions.push(customOpus)
  } else {
    // 添加 Opus 4.1、Opus 4.6 和 Opus 4.6 1M
    payg3pOptions.push(getOpus41Option()) // 这是默认的 opus
    payg3pOptions.push(getOpus46Option(fastMode))
    if (checkOpus1mAccess()) {
      payg3pOptions.push(getOpus46_1MOption(fastMode))
    }
  }
  const customHaiku = getCustomHaikuOption()
  if (customHaiku !== undefined) {
    payg3pOptions.push(customHaiku)
  } else {
    payg3pOptions.push(getHaikuOption())
  }
  return payg3pOptions
}

// @[MODEL LAUNCH]: 在下方对应的模型族模式中添加新模型 ID，
// 以便“有更新版本可用”提示正常工作。
/**
 * 将完整的模型名称映射到其族别名以及该别名当前解析到的版本的营销名称。
 * 用于检测用户是否固定使用了较旧的特定版本，以及是否有较新版本可用。
 */
function getModelFamilyInfo(
  model: string,
): { alias: string; currentVersionName: string } | null {
  const canonical = getCanonicalName(model)

  // Sonnet 族
  if (
    canonical.includes('claude-sonnet-4-6') ||
    canonical.includes('claude-sonnet-4-5') ||
    canonical.includes('claude-sonnet-4-') ||
    canonical.includes('claude-3-7-sonnet') ||
    canonical.includes('claude-3-5-sonnet')
  ) {
    const currentName = getMarketingNameForModel(getDefaultSonnetModel())
    if (currentName) {
      return { alias: 'Sonnet', currentVersionName: currentName }
    }
  }

  // Opus 族
  if (canonical.includes('claude-opus-4')) {
    const currentName = getMarketingNameForModel(getDefaultOpusModel())
    if (currentName) {
      return { alias: 'Opus', currentVersionName: currentName }
    }
  }

  // Haiku 族
  if (
    canonical.includes('claude-haiku') ||
    canonical.includes('claude-3-5-haiku')
  ) {
    const currentName = getMarketingNameForModel(getDefaultHaikuModel())
    if (currentName) {
      return { alias: 'Haiku', currentVersionName: currentName }
    }
  }

  return null
}

/**
 * 为已知的 Anthropic 模型返回一个带有易读标签的 ModelOption，
 * 如果通过别名有更新版本可用，则附上升级提示。
 * 如果模型无法识别，则返回 null。
 */
function getKnownModelOption(model: string): ModelOption | null {
  const marketingName = getMarketingNameForModel(model)
  if (!marketingName) return null

  const familyInfo = getModelFamilyInfo(model)
  if (!familyInfo) {
    return {
      value: model,
      label: marketingName,
      description: model,
    }
  }

  // 检查该别名当前是否解析到其他（较新的）版本
  if (marketingName !== familyInfo.currentVersionName) {
    return {
      value: model,
      label: marketingName,
      description: `有更新的版本可用 · 选择 ${familyInfo.alias} 以获取 ${familyInfo.currentVersionName}`,
    }
  }

  // 与别名版本相同 —— 仅显示友好名称
  return {
    value: model,
    label: marketingName,
    description: model,
  }
}

export function getModelOptions(fastMode = false): ModelOption[] {
  const options = getModelOptionsBase(fastMode)

  // 添加来自 ANTHROPIC_CUSTOM_MODEL_OPTION 环境变量的自定义模型
  const envCustomModel = process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  if (
    envCustomModel &&
    !options.some(existing => existing.value === envCustomModel)
  ) {
    options.push({
      value: envCustomModel,
      label: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME ?? envCustomModel,
      description:
        process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION ??
        `自定义模型 (${envCustomModel})`,
    })
  }

  // 追加在引导过程中获取的其他模型选项
  for (const opt of getGlobalConfig().additionalModelOptionsCache ?? []) {
    if (!options.some(existing => existing.value === opt.value)) {
      options.push(opt)
    }
  }

  // 如果当前模型值或初始值不在选项中，则将其作为自定义模型添加
  let customModel: ModelSetting = null
  const currentMainLoopModel = getUserSpecifiedModelSetting()
  const initialMainLoopModel = getInitialMainLoopModel()
  if (currentMainLoopModel !== undefined && currentMainLoopModel !== null) {
    customModel = currentMainLoopModel
  } else if (initialMainLoopModel !== null) {
    customModel = initialMainLoopModel
  }
  if (customModel === null || options.some(opt => opt.value === customModel)) {
    return filterModelOptionsByAllowlist(options)
  } else if (customModel === 'opusplan') {
    return filterModelOptionsByAllowlist([...options, getOpusPlanOption()])
  } else if (customModel === 'opus' && getAPIProvider() === 'firstParty') {
    return filterModelOptionsByAllowlist([
      ...options,
      getMaxOpusOption(fastMode),
    ])
  } else if (customModel === 'opus[1m]' && getAPIProvider() === 'firstParty') {
    return filterModelOptionsByAllowlist([
      ...options,
      getMergedOpus1MOption(fastMode),
    ])
  } else {
    // 尝试为已知 Anthropic 模型显示易读标签，如果别名解析到更新版本则附上升级提示
    const knownOption = getKnownModelOption(customModel)
    if (knownOption) {
      options.push(knownOption)
    } else {
      options.push({
        value: customModel,
        label: customModel,
        description: '自定义模型',
      })
    }
    return filterModelOptionsByAllowlist(options)
  }
}

/**
 * 根据 availableModels 允许列表过滤模型选项。
 * 始终保留“默认”选项（value: null）。
 */
function filterModelOptionsByAllowlist(options: ModelOption[]): ModelOption[] {
  const settings = getSettings_DEPRECATED() || {}
  if (!settings.availableModels) {
    return options // 无限制
  }
  return options.filter(
    opt =>
      opt.value === null || (opt.value !== null && isModelAllowed(opt.value)),
  )
}
