/**
 * Model deprecation utilities
 *
 * Contains information about deprecated models and their retirement dates.
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
  /** Human-readable model name */
  modelName: string
  /** Retirement dates by provider (null = not deprecated for that provider) */
  retirementDates: Record<APIProvider, string | null>
}

/**
 * Deprecated models and their retirement dates by provider.
 * Keys are substrings to match in model IDs (case-insensitive).
 * To add a new deprecated model, add an entry to this object.
 */
const DEPRECATED_MODELS: Record<string, DeprecationEntry> = {
  'claude-3-opus': {
    modelName: 'Claude 3 Opus',
    retirementDates: {
      firstParty: '2026 å¹?1 æœ?5 æ—?,
      bedrock: '2026 å¹?1 æœ?15 æ—?,
      vertex: '2026 å¹?1 æœ?5 æ—?,
      foundry: '2026 å¹?1 æœ?5 æ—?,
    },
  },
  'claude-3-7-sonnet': {
    modelName: 'Claude 3.7 Sonnet',
    retirementDates: {
      firstParty: '2026 å¹?2 æœ?19 æ—?,
      bedrock: '2026 å¹?4 æœ?28 æ—?,
      vertex: '2026 å¹?5 æœ?11 æ—?,
      foundry: '2026 å¹?2 æœ?19 æ—?,
    },
  },
  'claude-3-5-haiku': {
    modelName: 'Claude 3.5 Haiku',
    retirementDates: {
      firstParty: '2026 å¹?2 æœ?19 æ—?,
      bedrock: null,
      vertex: null,
      foundry: null,
    },
  },
}

/**
 * Check if a model is deprecated and get its deprecation info
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
 * Get a deprecation warning message for a model, or null if not deprecated
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

  return `âš?${info.modelName} will be retired on ${info.retirementDate}. Consider switching to a newer model.`
}
