import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { AppState } from '../../state/AppState.js'
import type { Message } from '../../types/message.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { count } from '../../utils/array.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { toError } from '../../utils/errors.js'
import {
  type CacheSafeParams,
  createCacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import type { REPLHookContext } from '../../utils/hooks/postSamplingHooks.js'
import { logError } from '../../utils/log.js'
import {
  createUserMessage,
  getLastAssistantMessage,
} from '../../utils/messages.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { isTeammate } from '../../utils/teammate.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import { currentLimits } from '../claudeAiLimits.js'
import { isSpeculationEnabled, startSpeculation } from './speculation.js'

let currentAbortController: AbortController | null = null

export type PromptVariant = 'user_intent' | 'stated_intent'

export function getPromptVariant(): PromptVariant {
  return 'user_intent'
}

/**
 * 是否启用提示建议功能
 * 优先级：环境变量 > GrowthBook 配置 > 非交互模式 > 蜂群模式 > 用户设置
 */
export function shouldEnablePromptSuggestion(): boolean {
  // 环境变量优先，用于测试
  const envOverride = process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION
  if (isEnvDefinedFalsy(envOverride)) {
    logEvent('tengu_prompt_suggestion_init', {
      enabled: false,
      source:
        'env' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return false
  }
  if (isEnvTruthy(envOverride)) {
    logEvent('tengu_prompt_suggestion_init', {
      enabled: true,
      source:
        'env' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return true
  }

  // 与 Config.tsx 中的设置开关可见性保持一致
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_chomp_inflection', false)) {
    logEvent('tengu_prompt_suggestion_init', {
      enabled: false,
      source:
        'growthbook' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return false
  }

  // 非交互模式（打印模式、管道输入、SDK）禁用
  if (getIsNonInteractiveSession()) {
    logEvent('tengu_prompt_suggestion_init', {
      enabled: false,
      source:
        'non_interactive' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return false
  }

  // 蜂群中的队友禁用它（仅领队显示建议）
  if (isAgentSwarmsEnabled() && isTeammate()) {
    logEvent('tengu_prompt_suggestion_init', {
      enabled: false,
      source:
        'swarm_teammate' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return false
  }

  const enabled = getInitialSettings()?.promptSuggestionEnabled !== false
  logEvent('tengu_prompt_suggestion_init', {
    enabled,
    source:
      'setting' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  return enabled
}

/** 中止正在进行的提示建议请求 */
export function abortPromptSuggestion(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

/**
 * 返回不应生成建议的原因，若无抑制原因则返回 null。
 * 主路径和流水线路径共用此检查。
 */
export function getSuggestionSuppressReason(appState: AppState): string | null {
  if (!appState.promptSuggestionEnabled) return 'disabled'
  if (appState.pendingWorkerRequest || appState.pendingSandboxRequest)
    return 'pending_permission'
  if (appState.elicitation.queue.length > 0) return 'elicitation_active'
  if (appState.toolPermissionContext.mode === 'plan') return 'plan_mode'
  if (
    process.env.USER_TYPE === 'external' &&
    currentLimits.status !== 'allowed'
  )
    return 'rate_limit'
  return null
}

/**
 * 共享的守卫与生成逻辑，供 CLI TUI 和 SDK 推送路径调用。
 * 返回包含建议文本、promptId 和 generationRequestId 的对象，若被抑制或过滤则返回 null。
 */
export async function tryGenerateSuggestion(
  abortController: AbortController,
  messages: Message[],
  getAppState: () => AppState,
  cacheSafeParams: CacheSafeParams,
  source?: 'cli' | 'sdk',
): Promise<{
  suggestion: string
  promptId: PromptVariant
  generationRequestId: string | null
} | null> {
  if (abortController.signal.aborted) {
    logSuggestionSuppressed('aborted', undefined, undefined, source)
    return null
  }

  const assistantTurnCount = count(messages, m => m.type === 'assistant')
  if (assistantTurnCount < 2) {
    logSuggestionSuppressed('early_conversation', undefined, undefined, source)
    return null
  }

  const lastAssistantMessage = getLastAssistantMessage(messages)
  if (lastAssistantMessage?.isApiErrorMessage) {
    logSuggestionSuppressed('last_response_error', undefined, undefined, source)
    return null
  }
  const cacheReason = getParentCacheSuppressReason(lastAssistantMessage)
  if (cacheReason) {
    logSuggestionSuppressed(cacheReason, undefined, undefined, source)
    return null
  }

  const appState = getAppState()
  const suppressReason = getSuggestionSuppressReason(appState)
  if (suppressReason) {
    logSuggestionSuppressed(suppressReason, undefined, undefined, source)
    return null
  }

  const promptId = getPromptVariant()
  const { suggestion, generationRequestId } = await generateSuggestion(
    abortController,
    promptId,
    cacheSafeParams,
  )
  if (abortController.signal.aborted) {
    logSuggestionSuppressed('aborted', undefined, undefined, source)
    return null
  }
  if (!suggestion) {
    logSuggestionSuppressed('empty', undefined, promptId, source)
    return null
  }
  if (shouldFilterSuggestion(suggestion, promptId, source)) return null

  return { suggestion, promptId, generationRequestId }
}

/**
 * 在 REPL 上下文中执行提示建议（由主线程调用）。
 */
export async function executePromptSuggestion(
  context: REPLHookContext,
): Promise<void> {
  if (context.querySource !== 'repl_main_thread') return

  currentAbortController = new AbortController()
  const abortController = currentAbortController
  const cacheSafeParams = createCacheSafeParams(context)

  try {
    const result = await tryGenerateSuggestion(
      abortController,
      context.messages,
      context.toolUseContext.getAppState,
      cacheSafeParams,
      'cli',
    )
    if (!result) return

    context.toolUseContext.setAppState(prev => ({
      ...prev,
      promptSuggestion: {
        text: result.suggestion,
        promptId: result.promptId,
        shownAt: 0,
        acceptedAt: 0,
        generationRequestId: result.generationRequestId,
      },
    }))

    // 若启用了推测功能，则启动推测流程
    if (isSpeculationEnabled() && result.suggestion) {
      void startSpeculation(
        result.suggestion,
        context,
        context.toolUseContext.setAppState,
        false,
        cacheSafeParams,
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'APIUserAbortError')
    ) {
      logSuggestionSuppressed('aborted', undefined, undefined, 'cli')
      return
    }
    logError(toError(error))
  } finally {
    if (currentAbortController === abortController) {
      currentAbortController = null
    }
  }
}

const MAX_PARENT_UNCACHED_TOKENS = 10_000

/**
 * 检查父消息的缓存情况，若未缓存 token 过多则返回 'cache_cold'，否则返回 null。
 */
export function getParentCacheSuppressReason(
  lastAssistantMessage: ReturnType<typeof getLastAssistantMessage>,
): string | null {
  if (!lastAssistantMessage) return null

  const usage = lastAssistantMessage.message.usage
  const inputTokens = usage.input_tokens ?? 0
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
  // 分支会重新处理父消息的输出（从未缓存）加上其自身的提示词
  const outputTokens = usage.output_tokens ?? 0

  return inputTokens + cacheWriteTokens + outputTokens >
    MAX_PARENT_UNCACHED_TOKENS
    ? 'cache_cold'
    : null
}

/** 生成建议时使用的提示词（已汉化） */
const SUGGESTION_PROMPT = `[建议模式：预测用户接下来可能想输入什么。]

第一步：查看用户最近的消息和原始请求。

你的任务是预测他们本人会输入什么——而不是你认为他们应该做什么。

检验标准：他们会不会想“我刚准备打这个”？

示例：
用户要求“修复 bug 并运行测试”，bug 已修复 → “运行测试”
代码写完后 → “试试看”
Claude 提供了多个选项 → 根据对话猜测用户最可能选的那个
Claude 请求继续 → “yes”或“继续”
任务完成，明显的后续步骤 → “提交一下”或“推送”
遇到错误或误解后 → 保持静默（让他们自己判断/纠正）

要具体：“运行测试”比“继续”好。

绝不要建议：
- 评价性语句（“看起来不错”，“谢谢”）
- 疑问句（“……怎么样？”）
- Claude 的口吻（“让我……”、“我来……”、“这是……”）
- 他们没有问的新想法
- 多句话

如果基于用户说的下一步不明确，就保持静默。

格式：2-12 个词，匹配用户的风格。或什么都不输出。

只回复建议本身，不要加引号或解释。`

const SUGGESTION_PROMPTS: Record<PromptVariant, string> = {
  user_intent: SUGGESTION_PROMPT,
  stated_intent: SUGGESTION_PROMPT,
}

/**
 * 调用分叉代理生成一条建议。
 * 注意：不能通过传递空工具列表来禁止工具，这会破坏缓存；改用回调拒绝工具。
 */
export async function generateSuggestion(
  abortController: AbortController,
  promptId: PromptVariant,
  cacheSafeParams: CacheSafeParams,
): Promise<{ suggestion: string | null; generationRequestId: string | null }> {
  const prompt = SUGGESTION_PROMPTS[promptId]

  // 通过回调拒绝工具，而不是传递 tools:[] —— 后者会破坏缓存命中率
  const canUseTool = async () => ({
    behavior: 'deny' as const,
    message: '建议生成不需要工具',
    decisionReason: { type: 'other' as const, reason: '仅用于建议' },
  })

  // 不要覆盖与父请求不同的任何 API 参数。
  // 分支通过发送相同的缓存键参数来复用主线程的提示缓存。
  // 账单缓存键包含的内容比 system/tools/model/messages/thinking 更多，
  // 经验表明，在分支上设置 effortValue 或 maxOutputTokens 会破坏缓存。
  // PR #18143 曾尝试使用 effort:'low'，导致缓存写入量激增 45 倍（命中率从 92.7% 降至 61%）。
  // 唯一安全的覆盖项是：
  //   - abortController（不发送到 API）
  //   - skipTranscript（仅客户端）
  //   - skipCacheWrite（控制 cache_control 标记，不影响缓存键）
  //   - canUseTool（客户端权限检查）
  const result = await runForkedAgent({
    promptMessages: [createUserMessage({ content: prompt })],
    cacheSafeParams, // 不要覆盖 tools/thinking 设置 —— 会破坏缓存
    canUseTool,
    querySource: 'prompt_suggestion',
    forkLabel: 'prompt_suggestion',
    overrides: {
      abortController,
    },
    skipTranscript: true,
    skipCacheWrite: true,
  })

  // 检查所有消息 —— 模型可能会先尝试工具（被拒绝）再在后续消息中给出文本。
  // 同时提取第一条助手消息的 requestId，用于 RL 数据集关联。
  const firstAssistantMsg = result.messages.find(m => m.type === 'assistant')
  const generationRequestId =
    firstAssistantMsg?.type === 'assistant'
      ? (firstAssistantMsg.requestId ?? null)
      : null

  for (const msg of result.messages) {
    if (msg.type !== 'assistant') continue
    const textBlock = msg.message.content.find(b => b.type === 'text')
    if (textBlock?.type === 'text') {
      const suggestion = textBlock.text.trim()
      if (suggestion) {
        return { suggestion, generationRequestId }
      }
    }
  }

  return { suggestion: null, generationRequestId }
}

/**
 * 判断是否应过滤掉某条建议（如包含元文本、过长、太像 Claude 口吻等）。
 */
export function shouldFilterSuggestion(
  suggestion: string | null,
  promptId: PromptVariant,
  source?: 'cli' | 'sdk',
): boolean {
  if (!suggestion) {
    logSuggestionSuppressed('empty', undefined, promptId, source)
    return true
  }

  const lower = suggestion.toLowerCase()
  const wordCount = suggestion.trim().split(/\s+/).length

  const filters: Array<[string, () => boolean]> = [
    ['done', () => lower === 'done'],
    [
      'meta_text',
      () =>
        lower === 'nothing found' ||
        lower === 'nothing found.' ||
        lower.startsWith('nothing to suggest') ||
        lower.startsWith('no suggestion') ||
        // 模型会展开提示词中的“保持静默”指令
        /\bsilence is\b|\bstay(s|ing)? silent\b/.test(lower) ||
        // 模型直接输出“silence”
        /^\W*silence\W*$/.test(lower),
    ],
    [
      'meta_wrapped',
      // 模型将元推理放在括号里：(silence — ...) 或 [no suggestion]
      () => /^\(.*\)$|^\[.*\]$/.test(suggestion),
    ],
    [
      'error_message',
      () =>
        lower.startsWith('api error:') ||
        lower.startsWith('prompt is too long') ||
        lower.startsWith('request timed out') ||
        lower.startsWith('invalid api key') ||
        lower.startsWith('image was too large'),
    ],
    ['prefixed_label', () => /^\w+:\s/.test(suggestion)],
    [
      'too_few_words',
      () => {
        if (wordCount >= 2) return false
        // 允许斜杠命令
        if (suggestion.startsWith('/')) return false
        // 允许常见的单字输入
        const ALLOWED_SINGLE_WORDS = new Set([
          'yes',
          'yeah',
          'yep',
          'yea',
          'yup',
          'sure',
          'ok',
          'okay',
          'push',
          'commit',
          'deploy',
          'stop',
          'continue',
          'check',
          'exit',
          'quit',
          'no',
        ])
        return !ALLOWED_SINGLE_WORDS.has(lower)
      },
    ],
    ['too_many_words', () => wordCount > 12],
    ['too_long', () => suggestion.length >= 100],
    ['multiple_sentences', () => /[.!?]\s+[A-Z]/.test(suggestion)],
    ['has_formatting', () => /[\n*]|\*\*/.test(suggestion)],
    [
      'evaluative',
      () =>
        /thanks|thank you|looks good|sounds good|that works|that worked|that's all|nice|great|perfect|makes sense|awesome|excellent/.test(
          lower,
        ),
    ],
    [
      'claude_voice',
      () =>
        /^(let me|i'll|i've|i'm|i can|i would|i think|i notice|here's|here is|here are|that's|this is|this will|you can|you should|you could|sure,|of course|certainly)/i.test(
          suggestion,
        ),
    ],
  ]

  for (const [reason, check] of filters) {
    if (check()) {
      logSuggestionSuppressed(reason, suggestion, promptId, source)
      return true
    }
  }

  return false
}

/**
 * 记录建议的采纳/忽略情况。在 SDK 推送路径收到下一条用户消息时调用。
 */
export function logSuggestionOutcome(
  suggestion: string,
  userInput: string,
  emittedAt: number,
  promptId: PromptVariant,
  generationRequestId: string | null,
): void {
  const similarity =
    Math.round((userInput.length / (suggestion.length || 1)) * 100) / 100
  const wasAccepted = userInput === suggestion
  const timeMs = Math.max(0, Date.now() - emittedAt)

  logEvent('tengu_prompt_suggestion', {
    source: 'sdk' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    outcome: (wasAccepted
      ? 'accepted'
      : 'ignored') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    prompt_id:
      promptId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...(generationRequestId && {
      generationRequestId:
        generationRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...(wasAccepted && {
      timeToAcceptMs: timeMs,
    }),
    ...(!wasAccepted && { timeToIgnoreMs: timeMs }),
    similarity,
    ...(process.env.USER_TYPE === 'ant' && {
      suggestion:
        suggestion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      userInput:
        userInput as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
  })
}

/** 记录建议被抑制的原因（用于分析） */
export function logSuggestionSuppressed(
  reason: string,
  suggestion?: string,
  promptId?: PromptVariant,
  source?: 'cli' | 'sdk',
): void {
  const resolvedPromptId = promptId ?? getPromptVariant()
  logEvent('tengu_prompt_suggestion', {
    ...(source && {
      source:
        source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    outcome:
      'suppressed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    reason:
      reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    prompt_id:
      resolvedPromptId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...(process.env.USER_TYPE === 'ant' &&
      suggestion && {
        suggestion:
          suggestion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
  })
}