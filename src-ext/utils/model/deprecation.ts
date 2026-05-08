/**
 * 模型弃用工具函数
 *
 * 包含有关已弃用模型及其退役日期的信息。
 */

import { type APIProvider, getAPIProvider } from './providers.js'

type DeprecatedModelInfo = {
  isDeprecated: true
  modelName: string
  retirementDate: string
}

type NotDeprecatedInfo = {
  isDeprecated: false
}

type DeprecationInfo = DeprecatedModelInfo | NotDeprecatedInfo

type DeprecationEntry = {
  /** 人类可读的模型名称 */
  modelName: string
  /** 各提供商的退役日期（null 表示该提供商尚未弃用该模型） */
  retirementDates: Record<APIProvider, string | null>
}

/**
 * 已弃用的模型及其在各提供商的退役日期。
 * 键是用于在模型 ID 中匹配的子串（不区分大小写）。
 * 要添加新的已弃用模型，请向此对象添加一个条目。
 */
const DEPRECATED_MODELS: Record<string, DeprecationEntry> = {
  'claude-3-opus': {
    modelName: 'Claude 3 Opus',
    retirementDates: {
      firstParty: '2026 年 1 月 5 日',
      bedrock: '2026 年 1 月 15 日',
      vertex: '2026 年 1 月 5 日',
      foundry: '2026 年 1 月 5 日',
    },
  },
  'claude-3-7-sonnet': {
    modelName: 'Claude 3.7 Sonnet',
    retirementDates: {
      firstParty: '2026 年 2 月 19 日',
      bedrock: '2026 年 4 月 28 日',
      vertex: '2026 年 5 月 11 日',
      foundry: '2026 年 2 月 19 日',
    },
  },
  'claude-3-5-haiku': {
    modelName: 'Claude 3.5 Haiku',
    retirementDates: {
      firstParty: '2026 年 2 月 19 日',
      bedrock: null,
      vertex: null,
      foundry: null,
    },
  },
}

/**
 * 检查模型是否已弃用，并获取其弃用信息
 */
function getDeprecatedModelInfo(modelId: string): DeprecationInfo {
  const lowercaseModelId = modelId.toLowerCase()
  const provider = getAPIProvider()

  for (const [key, value] of Object.entries(DEPRECATED_MODELS)) {
    const retirementDate = value.retirementDates[provider]
    if (!lowercaseModelId.includes(key) || !retirementDate) {
      continue
    }
    return {
      isDeprecated: true,
      modelName: value.modelName,
      retirementDate,
    }
  }

  return { isDeprecated: false }
}

/**
 * 获取模型的弃用警告信息，若模型未被弃用则返回 null
 */
export function getModelDeprecationWarning(
  modelId: string | null,
): string | null {
  if (!modelId) {
    return null
  }

  const info = getDeprecatedModelInfo(modelId)
  if (!info.isDeprecated) {
    return null
  }

  return `⚠ ${info.modelName} 将于 ${info.retirementDate} 退役。请考虑切换到更新的模型。`
}
