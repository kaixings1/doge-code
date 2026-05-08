import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk'
import type {
  BetaMessage,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { AFK_MODE_BETA_HEADER } from '../../constants/betas.js'
import type { SDKAssistantMessageError } from '../../entrypoints/agentSdkTypes.js'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from '../../types/message.js'
import {
  getAnthropicApiKeyWithSource,
  getClaudeAIOAuthTokens,
  getOauthAccountInfo,
  isClaudeAISubscriber,
} from '../../utils/auth.js'
import {
  createAssistantAPIErrorMessage,
  NO_RESPONSE_REQUESTED,
} from '../../utils/messages.js'
import { getGlobalConfig } from '../../utils/config.js'
import {
  getDefaultMainLoopModelSetting,
  isNonCustomOpusModel,
} from '../../utils/model/model.js'
import { getModelStrings } from '../../utils/model/modelStrings.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import {
  API_PDF_MAX_PAGES,
  PDF_TARGET_RAW_SIZE,
} from '../../constants/apiLimits.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { formatFileSize } from '../../utils/format.js'
import { ImageResizeError } from '../../utils/imageResizer.js'
import { ImageSizeError } from '../../utils/imageValidation.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  type ClaudeAILimits,
  getRateLimitErrorMessage,
  type OverageDisabledReason,
} from '../claudeAiLimits.js'
import { shouldProcessRateLimits } from '../rateLimitMocking.js' // 用于 /mock-limits 命令
import { extractConnectionErrorDetails, formatAPIError } from './errorUtils.js'

export const API_ERROR_MESSAGE_PREFIX = 'API 错误'

export function startsWithApiErrorPrefix(text: string): boolean {
  return (
    text.startsWith(API_ERROR_MESSAGE_PREFIX) ||
    text.startsWith(`请运行 /login · ${API_ERROR_MESSAGE_PREFIX}`)
  )
}
export const PROMPT_TOO_LONG_ERROR_MESSAGE = '提示词过长'

export function isPromptTooLongMessage(msg: AssistantMessage): boolean {
  if (!msg.isApiErrorMessage) {
    return false
  }
  const content = msg.message.content
  if (!Array.isArray(content)) {
    return false
  }
  return content.some(
    block =>
      block.type === 'text' &&
      block.text.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE),
  )
}

/**
 * 从原始的提示词过长 API 错误信息（如 "prompt is too long: 137500 tokens > 135000 maximum"）中解析实际 token 数和上限 token 数。
 * 原始字符串可能被 SDK 前缀或 JSON 封装，也可能大小写不同（Vertex），因此本函数有意写得宽松。
 */
export function parsePromptTooLongTokenCounts(rawMessage: string): {
  actualTokens: number | undefined
  limitTokens: number | undefined
} {
  const match = rawMessage.match(
    /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i,
  )
  return {
    actualTokens: match ? parseInt(match[1]!, 10) : undefined,
    limitTokens: match ? parseInt(match[2]!, 10) : undefined,
  }
}

/**
 * 返回提示词过长错误报告的超限 token 数，若信息非提示词过长或无法解析则返回 undefined。
 * 反应式压缩利用此差值在一次重试中跨越多组，而非逐组剥离。
 */
export function getPromptTooLongTokenGap(
  msg: AssistantMessage,
): number | undefined {
  if (!isPromptTooLongMessage(msg) || !msg.errorDetails) {
    return undefined
  }
  const { actualTokens, limitTokens } = parsePromptTooLongTokenCounts(
    msg.errorDetails,
  )
  if (actualTokens === undefined || limitTokens === undefined) {
    return undefined
  }
  const gap = actualTokens - limitTokens
  return gap > 0 ? gap : undefined
}

/**
 * 此原始 API 错误文本是否为可通过 stripImagesFromMessages 修复的媒体尺寸拒绝错误？
 * 反应式压缩的摘要重试利用此判断决定是剥离后重试（媒体错误）还是放弃（其他错误）。
 *
 * 模式必须与填充 errorDetails 的 getAssistantMessageFromError 分支保持同步
 * （~L523 PDF、~L560 图片、~L573 多图片）以及 classifyAPIError 分支（~L929-946）。
 * 闭环：errorDetails 仅在这些分支已匹配相同子串后才设置，因此 isMediaSizeError(errorDetails)
 * 对于该路径恒为真。API 措辞变化会导致优雅降级（errorDetails 保持 undefined，调用方短路），而非假阴性。
 */
export function isMediaSizeError(raw: string): boolean {
  return (
    (raw.includes('image exceeds') && raw.includes('maximum')) ||
    (raw.includes('image dimensions exceed') && raw.includes('many-image')) ||
    /maximum of \d+ PDF pages/.test(raw)
  )
}

/**
 * 消息级断言：此助手消息是否为媒体尺寸拒绝错误？
 * 与 isPromptTooLongMessage 并行。检查 errorDetails（由 ~L523/560/573 处的 getAssistantMessageFromError 分支填充的原始 API 错误字符串）
 * 而非内容文本，因为媒体错误具有按变体而异的内容字符串。
 */
export function isMediaSizeErrorMessage(msg: AssistantMessage): boolean {
  return (
    msg.isApiErrorMessage === true &&
    msg.errorDetails !== undefined &&
    isMediaSizeError(msg.errorDetails)
  )
}
export const CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = '账户余额过低'
export const INVALID_API_KEY_ERROR_MESSAGE = '未登录 · 请运行 /login'
export const INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL =
  'API 密钥无效 · 请修正外部 API 密钥'
export const ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH =
  '您的 DOGE_API_KEY 属于已禁用的组织 · 请取消设置环境变量以改用订阅'
export const ORG_DISABLED_ERROR_MESSAGE_ENV_KEY =
  '您的 DOGE_API_KEY 属于已禁用的组织 · 请更新或取消设置环境变量'
export const TOKEN_REVOKED_ERROR_MESSAGE =
  'OAuth 令牌已撤销 · 请运行 /login'
export const CCR_AUTH_ERROR_MESSAGE =
  '认证错误 · 可能是临时网络问题，请重试'
export const REPEATED_529_ERROR_MESSAGE = '重复出现 529 过载错误'
export const CUSTOM_OFF_SWITCH_MESSAGE =
  'Opus 当前负载较高，请使用 /model 切换到 Sonnet'
export const API_TIMEOUT_ERROR_MESSAGE = '请求超时'
export function getPdfTooLargeErrorMessage(): string {
  const limits = `最多 ${API_PDF_MAX_PAGES} 页，${formatFileSize(PDF_TARGET_RAW_SIZE)}`
  return getIsNonInteractiveSession()
    ? `PDF 过大（${limits}）。请尝试其他方式读取文件（例如用 pdftotext 提取文本）。`
    : `PDF 文件过大（${limits}）。双击 Esc 返回后重试，或使用 pdftotext 转换为文本后重试。`
}
export function getPdfPasswordProtectedErrorMessage(): string {
  return getIsNonInteractiveSession()
    ? 'PDF 有密码保护。请使用命令行工具提取或转换 PDF。'
    : 'PDF 文件受密码保护。请双击 Esc 编辑消息后重试。'
}
export function getPdfInvalidErrorMessage(): string {
  return getIsNonInteractiveSession()
    ? 'PDF 文件无效。请先将其转换为文本（例如 pdftotext）。'
    : 'PDF 文件无效。双击 Esc 返回并使用其他文件重试。'
}
export function getImageTooLargeErrorMessage(): string {
  return getIsNonInteractiveSession()
    ? '图片过大。请调整图片尺寸或尝试其他方式。'
    : '图片过大。双击 Esc 返回并换用较小的图片重试。'
}
export function getRequestTooLargeErrorMessage(): string {
  const limits = `最大 ${formatFileSize(PDF_TARGET_RAW_SIZE)}`
  return getIsNonInteractiveSession()
    ? `请求过大（${limits}）。请使用较小的文件。`
    : `请求过大（${limits}）。双击 Esc 返回并使用较小的文件重试。`
}
export const OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE =
  '您的账户无权访问 Claude Code。请运行 /login。'

export function getTokenRevokedErrorMessage(): string {
  return getIsNonInteractiveSession()
    ? '您的账户无权访问 Claude。请重新登录或联系管理员。'
    : TOKEN_REVOKED_ERROR_MESSAGE
}

export function getOauthOrgNotAllowedErrorMessage(): string {
  return getIsNonInteractiveSession()
    ? '您的组织无权访问 Claude。请重新登录或联系管理员。'
    : OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE
}

/**
 * 检查是否处于 CCR（Claude Code Remote）模式。
 * 在 CCR 模式下，认证通过基础设施提供的 JWT 处理，而非 /login。
 * 临时认证错误应提示重试而非登录。
 */
function isCCRMode(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
}

// 临时辅助函数：记录 tool_use 与 tool_result 不匹配的错误
function logToolUseToolResultMismatch(
  toolUseId: string,
  messages: Message[],
  messagesForAPI: (UserMessage | AssistantMessage)[],
): void {
  try {
    // 在规范化后的消息中查找 tool_use
    let normalizedIndex = -1
    for (let i = 0; i < messagesForAPI.length; i++) {
      const msg = messagesForAPI[i]
      if (!msg) continue
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block.type === 'tool_use' &&
            'id' in block &&
            block.id === toolUseId
          ) {
            normalizedIndex = i
            break
          }
        }
      }
      if (normalizedIndex !== -1) break
    }

    // 在原始消息中查找 tool_use
    let originalIndex = -1
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg) continue
      if (msg.type === 'assistant' && 'message' in msg) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block.type === 'tool_use' &&
              'id' in block &&
              block.id === toolUseId
            ) {
              originalIndex = i
              break
            }
          }
        }
      }
      if (originalIndex !== -1) break
    }

    // 构建规范化后的序列
    const normalizedSeq: string[] = []
    for (let i = normalizedIndex + 1; i < messagesForAPI.length; i++) {
      const msg = messagesForAPI[i]
      if (!msg) continue
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          const role = msg.message.role
          if (block.type === 'tool_use' && 'id' in block) {
            normalizedSeq.push(`${role}:tool_use:${block.id}`)
          } else if (block.type === 'tool_result' && 'tool_use_id' in block) {
            normalizedSeq.push(`${role}:tool_result:${block.tool_use_id}`)
          } else if (block.type === 'text') {
            normalizedSeq.push(`${role}:text`)
          } else if (block.type === 'thinking') {
            normalizedSeq.push(`${role}:thinking`)
          } else if (block.type === 'image') {
            normalizedSeq.push(`${role}:image`)
          } else {
            normalizedSeq.push(`${role}:${block.type}`)
          }
        }
      } else if (typeof content === 'string') {
        normalizedSeq.push(`${msg.message.role}:string_content`)
      }
    }

    // 构建规范化前的序列
    const preNormalizedSeq: string[] = []
    for (let i = originalIndex + 1; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg) continue

      switch (msg.type) {
        case 'user':
        case 'assistant': {
          if ('message' in msg) {
            const content = msg.message.content
            if (Array.isArray(content)) {
              for (const block of content) {
                const role = msg.message.role
                if (block.type === 'tool_use' && 'id' in block) {
                  preNormalizedSeq.push(`${role}:tool_use:${block.id}`)
                } else if (
                  block.type === 'tool_result' &&
                  'tool_use_id' in block
                ) {
                  preNormalizedSeq.push(
                    `${role}:tool_result:${block.tool_use_id}`,
                  )
                } else if (block.type === 'text') {
                  preNormalizedSeq.push(`${role}:text`)
                } else if (block.type === 'thinking') {
                  preNormalizedSeq.push(`${role}:thinking`)
                } else if (block.type === 'image') {
                  preNormalizedSeq.push(`${role}:image`)
                } else {
                  preNormalizedSeq.push(`${role}:${block.type}`)
                }
              }
            } else if (typeof content === 'string') {
              preNormalizedSeq.push(`${msg.message.role}:string_content`)
            }
          }
          break
        }
        case 'attachment':
          if ('attachment' in msg) {
            preNormalizedSeq.push(`attachment:${msg.attachment.type}`)
          }
          break
        case 'system':
          if ('subtype' in msg) {
            preNormalizedSeq.push(`system:${msg.subtype}`)
          }
          break
        case 'progress':
          if (
            'progress' in msg &&
            msg.progress &&
            typeof msg.progress === 'object' &&
            'type' in msg.progress
          ) {
            preNormalizedSeq.push(`progress:${msg.progress.type ?? 'unknown'}`)
          } else {
            preNormalizedSeq.push('progress:unknown')
          }
          break
      }
    }

    // 记录到 Statsig
    logEvent('tengu_tool_use_tool_result_mismatch_error', {
      toolUseId:
        toolUseId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      normalizedSequence: normalizedSeq.join(
        ', ',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      preNormalizedSequence: preNormalizedSeq.join(
        ', ',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      normalizedMessageCount: messagesForAPI.length,
      originalMessageCount: messages.length,
      normalizedToolUseIndex: normalizedIndex,
      originalToolUseIndex: originalIndex,
    })
  } catch (_) {
    // 忽略调试日志中的错误
  }
}

/**
 * 类型守卫：检查值是否为来自 API 的有效 Message 响应
 */
export function isValidAPIMessage(value: unknown): value is BetaMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    'model' in value &&
    'usage' in value &&
    Array.isArray((value as BetaMessage).content) &&
    typeof (value as BetaMessage).model === 'string' &&
    typeof (value as BetaMessage).usage === 'object'
  )
}

/** AWS 可能返回的底层错误。 */
type AmazonError = {
  Output?: {
    __type?: string
  }
  Version?: string
}

/**
 * 给定一个看起来不太对劲的响应，检查其是否包含任何已知的错误类型，以便提取。
 */
export function extractUnknownErrorFormat(value: unknown): string | undefined {
  // 首先检查值是否为有效对象
  if (!value || typeof value !== 'object') {
    return undefined
  }

  // Amazon Bedrock 路由错误
  if ((value as AmazonError).Output?.__type) {
    return (value as AmazonError).Output!.__type
  }

  return undefined
}

export function getAssistantMessageFromError(
  error: unknown,
  model: string,
  options?: {
    messages?: Message[]
    messagesForAPI?: (UserMessage | AssistantMessage)[]
  },
): AssistantMessage {
  // 检查 SDK 超时错误
  if (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof APIConnectionError &&
      error.message.toLowerCase().includes('timeout'))
  ) {
    return createAssistantAPIErrorMessage({
      content: API_TIMEOUT_ERROR_MESSAGE,
      error: 'unknown',
    })
  }

  // 检查图片尺寸/调整错误（在 API 调用前的验证阶段抛出）
  // 对 CLI 用户使用 getImageTooLargeErrorMessage() 显示 "Esc Esc" 提示，
  // 对 SDK 用户（非交互模式）则显示通用消息
  if (error instanceof ImageSizeError || error instanceof ImageResizeError) {
    return createAssistantAPIErrorMessage({
      content: getImageTooLargeErrorMessage(),
    })
  }

  // 检查针对 Opus PAYG 用户的紧急容量关闭开关
  if (
    error instanceof Error &&
    error.message.includes(CUSTOM_OFF_SWITCH_MESSAGE)
  ) {
    return createAssistantAPIErrorMessage({
      content: CUSTOM_OFF_SWITCH_MESSAGE,
      error: 'rate_limit',
    })
  }

  if (
    error instanceof APIError &&
    error.status === 429 &&
    shouldProcessRateLimits(isClaudeAISubscriber())
  ) {
    // 检查是否为新版 API 包含多个限流头
    const rateLimitType = error.headers?.get?.(
      'anthropic-ratelimit-unified-representative-claim',
    ) as 'five_hour' | 'seven_day' | 'seven_day_opus' | null

    const overageStatus = error.headers?.get?.(
      'anthropic-ratelimit-unified-overage-status',
    ) as 'allowed' | 'allowed_warning' | 'rejected' | null

    // 如果存在新版标头，则使用新消息生成逻辑
    if (rateLimitType || overageStatus) {
      // 根据错误标头构建限流对象，以确定合适的消息
      const limits: ClaudeAILimits = {
        status: 'rejected',
        unifiedRateLimitFallbackAvailable: false,
        isUsingOverage: false,
      }

      // 从标头中提取限流信息
      const resetHeader = error.headers?.get?.(
        'anthropic-ratelimit-unified-reset',
      )
      if (resetHeader) {
        limits.resetsAt = Number(resetHeader)
      }

      if (rateLimitType) {
        limits.rateLimitType = rateLimitType
      }

      if (overageStatus) {
        limits.overageStatus = overageStatus
      }

      const overageResetHeader = error.headers?.get?.(
        'anthropic-ratelimit-unified-overage-reset',
      )
      if (overageResetHeader) {
        limits.overageResetsAt = Number(overageResetHeader)
      }

      const overageDisabledReason = error.headers?.get?.(
        'anthropic-ratelimit-unified-overage-disabled-reason',
      ) as OverageDisabledReason | null
      if (overageDisabledReason) {
        limits.overageDisabledReason = overageDisabledReason
      }

      // 对所有新版 API 限流使用新消息格式
      const specificErrorMessage = getRateLimitErrorMessage(limits, model)
      if (specificErrorMessage) {
        return createAssistantAPIErrorMessage({
          content: specificErrorMessage,
          error: 'rate_limit',
        })
      }

      // 如果 getRateLimitErrorMessage 返回 null，表示将由后备机制静默处理
      //（例如为符合条件的用户将 Opus 降级到 Sonnet）。
      // 返回 NO_RESPONSE_REQUESTED 以不向用户显示错误，但仍将消息记录在对话历史中供 Claude 查看。
      return createAssistantAPIErrorMessage({
        content: NO_RESPONSE_REQUESTED,
        error: 'rate_limit',
      })
    }

    // 无配额标头 —— 这不是配额限制。直接显示 API 实际返回的内容，
    // 而非通用的“达到频率限制”。权限拒绝（例如无额外用量的 1M 上下文）和基础设施容量 429 均会落入此处。
    if (error.message.includes('Extra usage is required for long context')) {
      const hint = getIsNonInteractiveSession()
        ? '请在 claude.ai/settings/usage 启用额外用量，或使用 --model 切换到标准上下文'
        : '运行 /extra-usage 启用，或 /model 切换到标准上下文'
      return createAssistantAPIErrorMessage({
        content: `${API_ERROR_MESSAGE_PREFIX}：1M 上下文需要额外用量 · ${hint}`,
        error: 'rate_limit',
      })
    }
    // SDK 的 APIError.makeMessage 在顶层无 .message 时会前置 "429 " 并 JSON 字符串化主体，
    // 提取内部的 error.message。
    const stripped = error.message.replace(/^429\s+/, '')
    const innerMessage = stripped.match(/"message"\s*:\s*"([^"]*)"/)?.[1]
    const detail = innerMessage || stripped
    return createAssistantAPIErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}：请求被拒绝（429）· ${detail || '可能是临时容量问题 —— 请查看 status.anthropic.com'}`,
      error: 'rate_limit',
    })
  }

  // 处理提示词过长错误（Vertex 返回 413，直连 API 返回 400）
  // 使用不区分大小写的检查，因为 Vertex 返回 "Prompt is too long"（首字母大写）
  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('prompt is too long')
  ) {
    // 内容保持通用（UI 根据精确字符串匹配）。包含 token 计数的原始错误存入 errorDetails，
    // 反应式压缩的重试循环通过 getPromptTooLongTokenGap 从中解析差值。
    return createAssistantAPIErrorMessage({
      content: PROMPT_TOO_LONG_ERROR_MESSAGE,
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  // 检查 PDF 页数限制错误
  if (
    error instanceof Error &&
    /maximum of \d+ PDF pages/.test(error.message)
  ) {
    return createAssistantAPIErrorMessage({
      content: getPdfTooLargeErrorMessage(),
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  // 检查密码保护的 PDF 错误
  if (
    error instanceof Error &&
    error.message.includes('The PDF specified is password protected')
  ) {
    return createAssistantAPIErrorMessage({
      content: getPdfPasswordProtectedErrorMessage(),
      error: 'invalid_request',
    })
  }

  // 检查无效 PDF 错误（例如将 HTML 文件重命名为 .pdf）
  // 若无此处理器，无效的 PDF 文档块会保留在对话上下文中，导致后续每次 API 调用均因 400 失败。
  if (
    error instanceof Error &&
    error.message.includes('The PDF specified was not valid')
  ) {
    return createAssistantAPIErrorMessage({
      content: getPdfInvalidErrorMessage(),
      error: 'invalid_request',
    })
  }

  // 检查图片尺寸错误（例如 "image exceeds 5 MB maximum: 5316852 bytes > 5242880 bytes"）
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image exceeds') &&
    error.message.includes('maximum')
  ) {
    return createAssistantAPIErrorMessage({
      content: getImageTooLargeErrorMessage(),
      errorDetails: error.message,
    })
  }

  // 检查多图片尺寸错误（API 对多图片请求强制执行更严格的 2000px 限制）
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image dimensions exceed') &&
    error.message.includes('many-image')
  ) {
    return createAssistantAPIErrorMessage({
      content: getIsNonInteractiveSession()
        ? '对话中的某张图片超过了多图片请求的尺寸限制（2000px）。请使用更少的图片开启新会话。'
        : '对话中的某张图片超过了多图片请求的尺寸限制（2000px）。请运行 /compact 移除上下文中的旧图片，或开启新会话。',
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  // 服务器拒绝了 afk-mode beta 标头（套餐不包含自动模式）。
  // 在非 TRANSCRIPT_CLASSIFIER 构建中 AFK_MODE_BETA_HEADER 为 ''，因此此处的真值守卫使其在这些构建中保持无效。
  if (
    AFK_MODE_BETA_HEADER &&
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(AFK_MODE_BETA_HEADER) &&
    error.message.includes('anthropic-beta')
  ) {
    return createAssistantAPIErrorMessage({
      content: '您的套餐不支持自动模式',
      error: 'invalid_request',
    })
  }

  // 检查请求过大错误（413 状态码）
  // 通常在大型 PDF 加对话上下文超过 32MB API 限制时发生
  if (error instanceof APIError && error.status === 413) {
    return createAssistantAPIErrorMessage({
      content: getRequestTooLargeErrorMessage(),
      error: 'invalid_request',
    })
  }

  // 检查 tool_use/tool_result 并发错误
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(
      '`tool_use` ids were found without `tool_result` blocks immediately after',
    )
  ) {
    // 如果有消息上下文则记录到 Statsig
    if (options?.messages && options?.messagesForAPI) {
      const toolUseIdMatch = error.message.match(/toolu_[a-zA-Z0-9]+/)
      const toolUseId = toolUseIdMatch ? toolUseIdMatch[0] : null
      if (toolUseId) {
        logToolUseToolResultMismatch(
          toolUseId,
          options.messages,
          options.messagesForAPI,
        )
      }
    }

    if (process.env.USER_TYPE === 'ant') {
      const baseMessage = `API 错误：400 ${error.message}\n\n请运行 /share 并将 JSON 文件发布至 ${MACRO.FEEDBACK_CHANNEL}。`
      const rewindInstruction = getIsNonInteractiveSession()
        ? ''
        : ' 然后，使用 /rewind 恢复对话。'
      return createAssistantAPIErrorMessage({
        content: baseMessage + rewindInstruction,
        error: 'invalid_request',
      })
    } else {
      const baseMessage = 'API 错误：400 工具使用并发问题。'
      const rewindInstruction = getIsNonInteractiveSession()
        ? ''
        : ' 运行 /rewind 恢复对话。'
      return createAssistantAPIErrorMessage({
        content: baseMessage + rewindInstruction,
        error: 'invalid_request',
      })
    }
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('unexpected `tool_use_id` found in `tool_result`')
  ) {
    logEvent('tengu_unexpected_tool_result', {})
  }

  // 重复的 tool_use ID（CC-1212）。ensureToolResultPairing 在发送前会剥离这些，
  // 因此触发此处意味着出现了新的破坏路径。记录以便追根溯源，并为用户提供恢复路径而非死锁。
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('`tool_use` ids must be unique')
  ) {
    logEvent('tengu_duplicate_tool_use_id', {})
    const rewindInstruction = getIsNonInteractiveSession()
      ? ''
      : ' 运行 /rewind 恢复对话。'
    return createAssistantAPIErrorMessage({
      content: `API 错误：400 对话历史中工具使用 ID 重复。${rewindInstruction}`,
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  // 检查订阅用户尝试使用 Opus 时的无效模型名称错误
  if (
    isClaudeAISubscriber() &&
    error instanceof APIError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('invalid model name') &&
    (isNonCustomOpusModel(model) || model === 'opus')
  ) {
    return createAssistantAPIErrorMessage({
      content:
        'Claude Opus 不适用于 Claude Pro 套餐。如果您最近更新了订阅套餐，请运行 /logout 和 /login 以使套餐生效。',
      error: 'invalid_request',
    })
  }

  // 检查 Ant 用户的无效模型名称错误。Claude Code 可能默认为 Ant 使用了仅限内部的定制模型，
  // 且可能存在使用未纳入许可的新组织 ID 或未知组织 ID 的 Ant 用户。
  if (
    process.env.USER_TYPE === 'ant' &&
    !process.env.ANTHROPIC_MODEL &&
    error instanceof Error &&
    error.message.toLowerCase().includes('invalid model name')
  ) {
    // 从配置中获取组织 ID - 仅在主动使用 OAuth 时使用 OAuth 账户数据
    const orgId = getOauthAccountInfo()?.organizationUuid
    const baseMsg = `[仅限内部] 您的组织未被授权使用 \`${model}\` 模型。请运行 \`claude\` 并设置 \`ANTHROPIC_MODEL=${getDefaultMainLoopModelSetting()}\``
    const msg = orgId
      ? `${baseMsg}，或将您的组织 ID（${orgId}）分享至 ${MACRO.FEEDBACK_CHANNEL} 以获取访问帮助。`
      : `${baseMsg}，或通过 ${MACRO.FEEDBACK_CHANNEL} 联系获取访问帮助。`

    return createAssistantAPIErrorMessage({
      content: msg,
      error: 'invalid_request',
    })
  }

  if (
    error instanceof Error &&
    error.message.includes('Your credit balance is too low')
  ) {
    return createAssistantAPIErrorMessage({
      content: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
      error: 'billing_error',
    })
  }
  // "Organization has been disabled" —— 常见于来自前雇主/项目的过期 DOGE_API_KEY 覆盖了订阅认证。
  // 仅处理环境变量情况；apiKeyHelper 和 /login 管理的密钥意味着当前认证的组织确实已被禁用，且无可用的休眠后备方案。
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('organization has been disabled')
  ) {
    const { source } = getAnthropicApiKeyWithSource()
    // getAnthropicApiKeyWithSource 将环境变量与 FD 传递的密钥归入同一来源值，
    // 且在 CCR 模式下即使有环境变量 OAuth 仍保持活跃。以下三个守卫确保我们仅在环境变量确实设置且确实在线路上时才归咎于它。
    if (
      source === 'DOGE_API_KEY' &&
      process.env.DOGE_API_KEY &&
      !isClaudeAISubscriber()
    ) {
      const hasStoredOAuth = getClaudeAIOAuthTokens()?.accessToken != null
      // 不是 'authentication_failed' —— 这会触发 VS Code 的 showLogin()，但登录无法解决此问题（已批准的环境变量会持续覆盖 OAuth）。
      // 解决方案基于配置（取消设置变量），因此 invalid_request 是正确的。
      return createAssistantAPIErrorMessage({
        error: 'invalid_request',
        content: hasStoredOAuth
          ? ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH
          : ORG_DISABLED_ERROR_MESSAGE_ENV_KEY,
      })
    }
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('x-api-key')
  ) {
    // 在 CCR 模式下，认证通过 JWT 进行 —— 这很可能是临时网络问题
    if (isCCRMode()) {
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: CCR_AUTH_ERROR_MESSAGE,
      })
    }

    // 检查 API 密钥是否来自外部来源
    const { source } = getAnthropicApiKeyWithSource()
    const isExternalSource =
      source === 'DOGE_API_KEY' || source === 'apiKeyHelper'

    return createAssistantAPIErrorMessage({
      error: 'authentication_failed',
      content: isExternalSource
        ? INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL
        : INVALID_API_KEY_ERROR_MESSAGE,
    })
  }

  // 检查 OAuth 令牌撤销错误
  if (
    error instanceof APIError &&
    error.status === 403 &&
    error.message.includes('OAuth token has been revoked')
  ) {
    return createAssistantAPIErrorMessage({
      error: 'authentication_failed',
      content: getTokenRevokedErrorMessage(),
    })
  }

  // 检查 OAuth 组织不被允许错误
  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403) &&
    error.message.includes(
      'OAuth authentication is currently not allowed for this organization',
    )
  ) {
    return createAssistantAPIErrorMessage({
      error: 'authentication_failed',
      content: getOauthOrgNotAllowedErrorMessage(),
    })
  }

  // 其他 401/403 认证错误的通用处理器
  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403)
  ) {
    // 在 CCR 模式下，认证通过 JWT 进行 —— 这很可能是临时网络问题
    if (isCCRMode()) {
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: CCR_AUTH_ERROR_MESSAGE,
      })
    }

    return createAssistantAPIErrorMessage({
      error: 'authentication_failed',
      content: getIsNonInteractiveSession()
        ? `认证失败。${API_ERROR_MESSAGE_PREFIX}：${error.message}`
        : `请运行 /login · ${API_ERROR_MESSAGE_PREFIX}：${error.message}`,
    })
  }

  // Bedrock 错误如 "403 You don't have access to the model with the specified model ID."
  // 不包含实际的模型 ID
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) &&
    error instanceof Error &&
    error.message.toLowerCase().includes('model id')
  ) {
    const switchCmd = getIsNonInteractiveSession() ? '--model' : '/model'
    const fallbackSuggestion = get3PModelFallbackSuggestion(model)
    return createAssistantAPIErrorMessage({
      content: fallbackSuggestion
        ? `${API_ERROR_MESSAGE_PREFIX} (${model})：${error.message}。请尝试 ${switchCmd} 切换到 ${fallbackSuggestion}。`
        : `${API_ERROR_MESSAGE_PREFIX} (${model})：${error.message}。请运行 ${switchCmd} 选择其他模型。`,
      error: 'invalid_request',
    })
  }

  // 404 Not Found —— 通常意味着所选模型不存在或不可用。引导用户使用 /model 以选取有效模型。
  // 对于第三方用户，建议一个可尝试的具体后备模型。
  if (error instanceof APIError && error.status === 404) {
    if (getGlobalConfig().customApiEndpoint?.baseURL) {
      return createAssistantAPIErrorMessage({
        content: `自定义网关对模型 ${model} 的请求失败，返回 404。这通常意味着中继端点与 Claude Code 当前的请求格式不兼容，而非模型名称本身的问题。当前网关：${process.env.ANTHROPIC_BASE_URL}。`,
        error: 'invalid_request',
      })
    }
    const switchCmd = getIsNonInteractiveSession() ? '--model' : '/model'
    const fallbackSuggestion = get3PModelFallbackSuggestion(model)
    const customGatewayHint = process.env.ANTHROPIC_BASE_URL
      ? ` 当前网关：${process.env.ANTHROPIC_BASE_URL}。若此为转发/代理，请保留该服务提供的自定义模型名称。`
      : ''
    return createAssistantAPIErrorMessage({
      content: fallbackSuggestion
        ? `模型 ${model} 在您的 ${getAPIProvider()} 部署中不可用。请尝试 ${switchCmd} 切换到 ${fallbackSuggestion}，或联系管理员启用此模型。${customGatewayHint}`
        : `所选模型 (${model}) 存在问题。它可能不存在或您无权访问。请运行 ${switchCmd} 选择其他模型。${customGatewayHint}`,
      error: 'invalid_request',
    })
  }

  // 连接错误（非超时）—— 使用 formatAPIError 提供详细消息
  if (error instanceof APIConnectionError) {
    return createAssistantAPIErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}：${formatAPIError(error)}`,
      error: 'unknown',
    })
  }

  if (error instanceof Error) {
    return createAssistantAPIErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}：${error.message}`,
      error: 'unknown',
    })
  }
  return createAssistantAPIErrorMessage({
    content: API_ERROR_MESSAGE_PREFIX,
    error: 'unknown',
  })
}

/**
 * 对于第三方用户，当所选模型不可用时建议一个后备模型。
 * 返回模型名称建议，若无适用建议则返回 undefined。
 */
function get3PModelFallbackSuggestion(model: string): string | undefined {
  if (getAPIProvider() === 'firstParty') {
    return undefined
  }
  // @[模型发布]：为新模型添加指向上一版本的后备建议链（针对第三方）
  const m = model.toLowerCase()
  // 如果失败的模型看起来像 Opus 4.6 变体，建议默认的 Opus（对第三方为 4.1）
  if (m.includes('opus-4-6') || m.includes('opus_4_6')) {
    return getModelStrings().opus41
  }
  // 如果失败的模型看起来像 Sonnet 4.6 变体，建议 Sonnet 4.5
  if (m.includes('sonnet-4-6') || m.includes('sonnet_4_6')) {
    return getModelStrings().sonnet45
  }
  // 如果失败的模型看起来像 Sonnet 4.5 变体，建议 Sonnet 4
  if (m.includes('sonnet-4-5') || m.includes('sonnet_4_5')) {
    return getModelStrings().sonnet40
  }
  return undefined
}

/**
 * 将 API 错误分类为特定的错误类型，用于分析追踪。
 * 返回适合 Datadog 标记的标准化错误类型字符串。
 */
export function classifyAPIError(error: unknown): string {
  // 已中止的请求
  if (error instanceof Error && error.message === '请求已中止。') {
    return 'aborted'
  }

  // 超时错误
  if (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof APIConnectionError &&
      error.message.toLowerCase().includes('timeout'))
  ) {
    return 'api_timeout'
  }

  // 检查重复的 529 错误
  if (
    error instanceof Error &&
    error.message.includes(REPEATED_529_ERROR_MESSAGE)
  ) {
    return 'repeated_529'
  }

  // 检查紧急容量关闭开关
  if (
    error instanceof Error &&
    error.message.includes(CUSTOM_OFF_SWITCH_MESSAGE)
  ) {
    return 'capacity_off_switch'
  }

  // 频率限制
  if (error instanceof APIError && error.status === 429) {
    return 'rate_limit'
  }

  // 服务器过载 (529)
  if (
    error instanceof APIError &&
    (error.status === 529 ||
      error.message?.includes('"type":"overloaded_error"'))
  ) {
    return 'server_overload'
  }

  // 提示词/内容尺寸错误
  if (
    error instanceof Error &&
    error.message
      .toLowerCase()
      .includes(PROMPT_TOO_LONG_ERROR_MESSAGE.toLowerCase())
  ) {
    return 'prompt_too_long'
  }

  // PDF 错误
  if (
    error instanceof Error &&
    /maximum of \d+ PDF pages/.test(error.message)
  ) {
    return 'pdf_too_large'
  }

  if (
    error instanceof Error &&
    error.message.includes('The PDF specified is password protected')
  ) {
    return 'pdf_password_protected'
  }

  // 图片尺寸错误
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image exceeds') &&
    error.message.includes('maximum')
  ) {
    return 'image_too_large'
  }

  // 多图片尺寸错误
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image dimensions exceed') &&
    error.message.includes('many-image')
  ) {
    return 'image_too_large'
  }

  // 工具使用错误 (400)
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(
      '`tool_use` ids were found without `tool_result` blocks immediately after',
    )
  ) {
    return 'tool_use_mismatch'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('unexpected `tool_use_id` found in `tool_result`')
  ) {
    return 'unexpected_tool_result'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('`tool_use` ids must be unique')
  ) {
    return 'duplicate_tool_use_id'
  }

  // 无效模型错误 (400)
  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('invalid model name')
  ) {
    return 'invalid_model'
  }

  // 余额/计费错误
  if (
    error instanceof Error &&
    error.message
      .toLowerCase()
      .includes(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE.toLowerCase())
  ) {
    return 'credit_balance_low'
  }

  // 认证错误
  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('x-api-key')
  ) {
    return 'invalid_api_key'
  }

  if (
    error instanceof APIError &&
    error.status === 403 &&
    error.message.includes('OAuth token has been revoked')
  ) {
    return 'token_revoked'
  }

  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403) &&
    error.message.includes(
      'OAuth authentication is currently not allowed for this organization',
    )
  ) {
    return 'oauth_org_not_allowed'
  }

  // 通用认证错误
  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403)
  ) {
    return 'auth_error'
  }

  // Bedrock 特定错误
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) &&
    error instanceof Error &&
    error.message.toLowerCase().includes('model id')
  ) {
    return 'bedrock_model_access'
  }

  // 基于状态码的回退
  if (error instanceof APIError) {
    const status = error.status
    if (status >= 500) return 'server_error'
    if (status >= 400) return 'client_error'
  }

  // 连接错误 - 首先检查 SSL/TLS 问题
  if (error instanceof APIConnectionError) {
    const connectionDetails = extractConnectionErrorDetails(error)
    if (connectionDetails?.isSSLError) {
      return 'ssl_cert_error'
    }
    return 'connection_error'
  }

  return 'unknown'
}

export function categorizeRetryableAPIError(
  error: APIError,
): SDKAssistantMessageError {
  if (
    error.status === 529 ||
    error.message?.includes('"type":"overloaded_error"')
  ) {
    return 'rate_limit'
  }
  if (error.status === 429) {
    return 'rate_limit'
  }
  if (error.status === 401 || error.status === 403) {
    return 'authentication_failed'
  }
  if (error.status !== undefined && error.status >= 408) {
    return 'server_error'
  }
  return 'unknown'
}

export function getErrorMessageIfRefusal(
  stopReason: BetaStopReason | null,
  model: string,
): AssistantMessage | undefined {
  if (stopReason !== 'refusal') {
    return
  }

  logEvent('tengu_refusal_api_response', {})

  const baseMessage = getIsNonInteractiveSession()
    ? `${API_ERROR_MESSAGE_PREFIX}：Claude Code 无法响应此请求，该请求似乎违反了我们的使用政策（https://www.anthropic.com/legal/aup）。请尝试重新表述请求或采用其他方式。`
    : `${API_ERROR_MESSAGE_PREFIX}：Claude Code 无法响应此请求，该请求似乎违反了我们的使用政策（https://www.anthropic.com/legal/aup）。请双击 Esc 编辑最后一条消息或开始新会话以便 Claude Code 协助其他任务。`

  const modelSuggestion =
    model !== 'claude-sonnet-4-20250514'
      ? ' 如果您反复遇到此拒绝提示，请尝试运行 /model claude-sonnet-4-20250514 切换模型。'
      : ''

  return createAssistantAPIErrorMessage({
    content: baseMessage + modelSuggestion,
    error: 'invalid_request',
  })
}