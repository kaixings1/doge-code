// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { MODEL_ALIASES } from './aliases.js'
import { isModelAllowed } from './modelAllowlist.js'
import { getAPIProvider } from './providers.js'
import { sideQuery } from '../sideQuery.js'
import {
  NotFoundError,
  APIError,
  APIConnectionError,
  AuthenticationError,
} from '@anthropic-ai/sdk'
import { getModelStrings } from './modelStrings.js'
import { getGlobalConfig } from '../config.js'

// 缓存有效模型以避免重复的 API 调用
const validModelCache = new Map<string, boolean>()

/**
 * 通过尝试实际的 API 调用来验证模型。
 */
export async function validateModel(
  model: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalizedModel = model.trim()
  const customBaseURL = getGlobalConfig().customApiEndpoint?.baseURL

  // 空模型无效
  if (!normalizedModel) {
    return { valid: false, error: '模型名称不能为空' }
  }

  // 在进行任何 API 调用之前，先检查 availableModels 允许列表
  if (!isModelAllowed(normalizedModel)) {
    return {
      valid: false,
      error: `模型“${normalizedModel}”不在可用模型列表中`,
    }
  }

  // 检查是否为已知别名（这些始终有效）
  const lowerModel = normalizedModel.toLowerCase()
  if ((MODEL_ALIASES as readonly string[]).includes(lowerModel)) {
    return { valid: true }
  }

  // 检查是否匹配 ANTHROPIC_CUSTOM_MODEL_OPTION（用户已预先验证）
  if (normalizedModel === process.env.ANTHROPIC_CUSTOM_MODEL_OPTION) {
    return { valid: true }
  }

  // 对于自定义的与 Anthropic 兼容的网关，允许任意模型字符串。
  // 许多 OpenAI 兼容/中继提供商在仍遵循 Anthropic 线格式的同时，暴露了非 Claude 标识符，
  // 例如 gpt-5.4。
  if (customBaseURL && customBaseURL.trim() !== '') {
    validModelCache.set(normalizedModel, true)
    return { valid: true }
  }

  // 先检查缓存
  if (validModelCache.has(normalizedModel)) {
    return { valid: true }
  }

  // 尝试以最小参数进行实际的 API 调用
  try {
    await sideQuery({
      model: normalizedModel,
      max_tokens: 1,
      maxRetries: 0,
      querySource: 'model_validation',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '你好',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
    })

    // 如果成功执行到这里，模型有效
    validModelCache.set(normalizedModel, true)
    return { valid: true }
  } catch (error) {
    return handleValidationError(error, normalizedModel)
  }
}

function handleValidationError(
  error: unknown,
  modelName: string,
): { valid: boolean; error: string } {
  // NotFoundError（404）意味着模型不存在
  if (error instanceof NotFoundError) {
    const fallback = get3PFallbackSuggestion(modelName)
    const suggestion = fallback ? `。请尝试改用“${fallback}”` : ''
    return {
      valid: false,
      error: `模型“${modelName}”未找到${suggestion}`,
    }
  }

  // 对于其他 API 错误，提供上下文相关的消息
  if (error instanceof APIError) {
    if (error instanceof AuthenticationError) {
      return {
        valid: false,
        error: '认证失败。请检查你的 API 凭据。',
      }
    }

    if (error instanceof APIConnectionError) {
      return {
        valid: false,
        error: '网络错误。请检查你的网络连接。',
      }
    }

    // 检查错误体中是否包含模型特定的错误
    const errorBody = error.error as unknown
    if (
      errorBody &&
      typeof errorBody === 'object' &&
      'type' in errorBody &&
      errorBody.type === 'not_found_error' &&
      'message' in errorBody &&
      typeof errorBody.message === 'string' &&
      errorBody.message.includes('model:')
    ) {
      return { valid: false, error: `模型“${modelName}”未找到` }
    }

    // 通用 API 错误
    return { valid: false, error: `API 错误：${error.message}` }
  }

  // 对于未知错误，采取安全策略并拒绝
  const errorMessage = error instanceof Error ? error.message : String(error)
  return {
    valid: false,
    error: `无法验证模型：${errorMessage}`,
  }
}

// @[MODEL LAUNCH]: 为新模型 → 上一版本添加后备建议链
/**
 * 当所选模型不可用时，为第三方用户建议一个后备模型。
 */
function get3PFallbackSuggestion(model: string): string | undefined {
  if (getAPIProvider() === 'firstParty') {
    return undefined
  }
  const lowerModel = model.toLowerCase()
  if (lowerModel.includes('opus-4-6') || lowerModel.includes('opus_4_6')) {
    return getModelStrings().opus41
  }
  if (lowerModel.includes('sonnet-4-6') || lowerModel.includes('sonnet_4_6')) {
    return getModelStrings().sonnet45
  }
  if (lowerModel.includes('sonnet-4-5') || lowerModel.includes('sonnet_4_5')) {
    return getModelStrings().sonnet40
  }
  return undefined
}