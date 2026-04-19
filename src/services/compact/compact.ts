import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'

 
const sessionTranscriptModule = feature('KAIROS')
  ? (require('../../sessionTranscript/sessionTranscript.js') as typeof import('../../sessionTranscript/sessionTranscript.js'))
  : null

import { APIUserAbortError } from '@anthropic-ai/sdk'
import { markPostCompaction } from '../../bootstrap/state.js'
import { getInvokedSkillsForAgent } from '../../bootstrap/state.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { Tool, ToolUseContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js'
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '../../tools/FileReadTool/prompt.js'
import { ToolSearchTool } from '../../tools/ToolSearchTool/ToolSearchTool.js'
import type { AgentId } from '../../types/ids.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  HookResultMessage,
  Message,
  PartialCompactDirection,
  SystemCompactBoundaryMessage,
  SystemMessage,
  UserMessage,
} from '../../types/message.js'
import {
  createAttachmentMessage,
  generateFileAttachment,
  getAgentListingDeltaAttachment,
  getDeferredToolsDeltaAttachment,
  getMcpInstructionsDeltaAttachment,
} from '../../utils/attachments.js'
import { getMemoryPath } from '../../utils/config.js'
import { COMPACT_MAX_OUTPUT_TOKENS } from '../../utils/context.js'
import {
  analyzeContext,
  tokenStatsToStatsigMetrics,
} from '../../utils/contextAnalysis.js'
import { logForDebugging } from '../../utils/debug.js'
import { hasExactErrorMessage } from '../../utils/errors.js'
import { cacheToObject } from '../../utils/fileStateCache.js'
import {
  type CacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import {
  executePostCompactHooks,
  executePreCompactHooks,
} from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import { MEMORY_TYPE_VALUES } from '../../utils/memory/types.js'
import {
  createCompactBoundaryMessage,
  createUserMessage,
  getAssistantMessageText,
  getLastAssistantMessage,
  getMessagesAfterCompactBoundary,
  isCompactBoundaryMessage,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import { expandPath } from '../../utils/path.js'
import { getPlan, getPlanFilePath } from '../../utils/plans.js'
import {
  isSessionActivityTrackingActive,
  sendSessionActivitySignal,
} from '../../utils/sessionActivity.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  getTranscriptPath,
  reAppendSessionMetadata,
} from '../../utils/sessionStorage.js'
import { sleep } from '../../utils/sleep.js'
import { jsonStringify } from '../../utils/slowOperations.js'
 
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import {
  getTokenUsage,
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation,
} from '../../utils/tokens.js'
import {
  extractDiscoveredToolNames,
  isToolSearchEnabled,
} from '../../utils/toolSearch.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  getMaxOutputTokensForModel,
  queryModelWithStreaming,
} from '../api/claude.js'
import {
  getPromptTooLongTokenGap,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
} from '../api/errors.js'
import { notifyCompaction } from '../api/promptCacheBreakDetection.js'
import { getRetryDelay } from '../api/withRetry.js'
import { logPermissionContextForAnts } from '../internalLogging.js'
import {
  roughTokenCountEstimation,
  roughTokenCountEstimationForMessages,
} from '../tokenEstimation.js'
import { groupMessagesByApiRound } from './grouping.js'
import {
  getCompactPrompt,
  getCompactUserSummaryMessage,
  getPartialCompactPrompt,
} from './prompt.js'

export const POST_COMPACT_MAX_FILES_TO_RESTORE = 5
export const POST_COMPACT_TOKEN_BUDGET = 50_000
export const POST_COMPACT_MAX_TOKENS_PER_FILE = 5_000
// 技能可能很大（verify=18.7KB, claude-api=20.1KB）。之前每次压缩都无限制地重新注入，导致每次压缩额外消耗 5-10K token。
// 按技能截断比丢弃技能更好——技能文件顶部的指令通常是关键部分。
// 预算设置为可容纳约 5 个技能（每个技能按上限计算）。
export const POST_COMPACT_MAX_TOKENS_PER_SKILL = 5_000
export const POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000
const MAX_COMPACT_STREAMING_RETRIES = 2

/**
 * 在发送给压缩之前，从用户消息中剥离图像块。
 * 图像对于生成对话摘要是多余的，并且可能导致压缩 API 调用本身达到提示词过长限制，
 * 尤其是在用户频繁附加图像的 CCD 会话中。
 * 将图像块替换为文本标记，以便摘要仍能记录有图像被分享。
 *
 * 注意：仅用户消息包含图像（要么是直接附加的，要么是工具调用结果中的图像）。
 * 助手消息包含文本、tool_use 和思考块，但不包含图像。
 */
export function stripImagesFromMessages(messages: Message[]): Message[] {
  return messages.map(message => {
    if (message.type !== 'user') {
      return message
    }

    const content = message.message.content
    if (!Array.isArray(content)) {
      return message
    }

    let hasMediaBlock = false
    const newContent = content.flatMap(block => {
      if (block.type === 'image') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[image]' }]
      }
      if (block.type === 'document') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[document]' }]
      }
      // 同时剥离嵌套在 tool_result 内容数组中的图像/文档
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        let toolHasMedia = false
        const newToolContent = block.content.map(item => {
          if (item.type === 'image') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[image]' }
          }
          if (item.type === 'document') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[document]' }
          }
          return item
        })
        if (toolHasMedia) {
          hasMediaBlock = true
          return [{ ...block, content: newToolContent }]
        }
      }
      return [block]
    })

    if (!hasMediaBlock) {
      return message
    }

    return {
      ...message,
      message: {
        ...message.message,
        content: newContent,
      },
    } as typeof message
  })
}

/**
 * 剥离那些在压缩后反正会重新注入的附件类型。
 * skill_discovery/skill_listing 会被 resetSentSkillNames() 和下一轮的发现信号重新呈现，
 * 因此将它们喂给摘要器会浪费 token 并用过时的技能建议污染摘要。
 *
 * 当 EXPERIMENTAL_SKILL_SEARCH 关闭时，此函数为空操作（外部构建中不存在这些附件类型）。
 */
export function stripReinjectedAttachments(messages: Message[]): Message[] {
  if (feature('EXPERIMENTAL_SKILL_SEARCH')) {
    return messages.filter(
      m =>
        !(
          m.type === 'attachment' &&
          (m.attachment.type === 'skill_discovery' ||
            m.attachment.type === 'skill_listing')
        ),
    )
  }
  return messages
}

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =
  '消息数量不足，无法进行压缩。'
const MAX_PTL_RETRIES = 3
const PTL_RETRY_MARKER = '[earlier conversation truncated for compaction retry]'

/**
 * 从消息中丢弃最早的 API 轮次组，直到覆盖 tokenGap。
 * 当无法解析 tokenGap 时（某些 Vertex/Bedrock 错误格式），回退到丢弃 20% 的组。
 * 如果丢弃后没有留下任何可总结的内容，则返回 null。
 *
 * 这是 CC-1180 的最后手段逃生舱——当压缩请求本身遇到提示词过长时，用户本来会陷入僵局。
 * 丢弃最早的上下文是有损的，但能解除阻塞。reactive-compact 路径（compactMessages.ts）
 * 有正确的从尾部剥离的重试循环；此辅助函数是为在 bfdb472f 统一重构中未迁移的主动/手动路径提供的简单但安全的回退。
 */
export function truncateHeadForPTLRetry(
  messages: Message[],
  ptlResponse: AssistantMessage,
): Message[] | null {
  // 在分组前剥离我们自己的合成标记（来自之前的重试）。
  // 否则它将成为自己的第 0 组，20% 的回退会卡住（只丢弃标记，重新添加，重试 2+ 次毫无进展）。
  const input =
    messages[0]?.type === 'user' &&
    messages[0].isMeta &&
    messages[0].message.content === PTL_RETRY_MARKER
      ? messages.slice(1)
      : messages

  const groups = groupMessagesByApiRound(input)
  if (groups.length < 2) return null

  const tokenGap = getPromptTooLongTokenGap(ptlResponse)
  let dropCount: number
  if (tokenGap !== undefined) {
    let acc = 0
    dropCount = 0
    for (const g of groups) {
      acc += roughTokenCountEstimationForMessages(g)
      dropCount++
      if (acc >= tokenGap) break
    }
  } else {
    dropCount = Math.max(1, Math.floor(groups.length * 0.2))
  }

  // 保留至少一组以便有内容可总结。
  dropCount = Math.min(dropCount, groups.length - 1)
  if (dropCount < 1) return null

  const sliced = groups.slice(dropCount).flat()
  // groupMessagesByApiRound 将前言放入组 0，每个后续组以 assistant 消息开头。
  // 丢弃组 0 会留下以 assistant 开头的序列，API 会拒绝（第一条消息必须是 role=user）。
  // 添加一个合成用户标记——ensureToolResultPairing 已经处理了这产生的任何孤立 tool_result。
  if (sliced[0]?.type === 'assistant') {
    return [
      createUserMessage({ content: PTL_RETRY_MARKER, isMeta: true }),
      ...sliced,
    ]
  }
  return sliced
}

export const ERROR_MESSAGE_PROMPT_TOO_LONG =
  '对话过长。按两次 Esc 上翻几条消息并重试。'
export const ERROR_MESSAGE_USER_ABORT = 'API 错误：请求已中止。'
export const ERROR_MESSAGE_INCOMPLETE_RESPONSE =
  '压缩中断 · 可能是网络问题——请重试。'

export interface CompactionResult {
  boundaryMarker: SystemMessage
  summaryMessages: UserMessage[]
  attachments: AttachmentMessage[]
  hookResults: HookResultMessage[]
  messagesToKeep?: Message[]
  userDisplayMessage?: string
  preCompactTokenCount?: number
  postCompactTokenCount?: number
  truePostCompactTokenCount?: number
  compactionUsage?: ReturnType<typeof getTokenUsage>
}

/**
 * 从 autoCompactIfNeeded 传入 compactConversation 的诊断上下文。
 * 使 tengu_compact 事件能够区分同链循环（H2）与跨代理（H1/H5）以及手动与自动（H3）压缩，而无需联表查询。
 */
export type RecompactionInfo = {
  isRecompactionInChain: boolean
  turnsSincePreviousCompact: number
  previousCompactTurnId?: string
  autoCompactThreshold: number
  querySource?: QuerySource
}

/**
 * 从 CompactionResult 构建基础的后压缩消息数组。
 * 确保所有压缩路径的顺序一致。
 * 顺序：boundaryMarker、summaryMessages、messagesToKeep、attachments、hookResults
 */
export function buildPostCompactMessages(result: CompactionResult): Message[] {
  return [
    result.boundaryMarker,
    ...result.summaryMessages,
    ...(result.messagesToKeep ?? []),
    ...result.attachments,
    ...result.hookResults,
  ]
}

/**
 * 为 messagesToKeep 的压缩边界标注重链元数据。
 * 保留的消息在磁盘上保留其原始 parentUuids（去重跳过）；
 * 加载器使用此信息将 head→anchor 和 anchor 的其他子节点→tail 进行修补。
 *
 * `anchorUuid` = 在期望链中紧邻 keep[0] 之前的消息：
 *   - 保留后缀（reactive/session-memory）：最后一条摘要消息
 *   - 保留前缀（部分压缩）：边界本身
 */
export function annotateBoundaryWithPreservedSegment(
  boundary: SystemCompactBoundaryMessage,
  anchorUuid: UUID,
  messagesToKeep: readonly Message[] | undefined,
): SystemCompactBoundaryMessage {
  const keep = messagesToKeep ?? []
  if (keep.length === 0) return boundary
  return {
    ...boundary,
    compactMetadata: {
      ...boundary.compactMetadata,
      preservedSegment: {
        headUuid: keep[0]!.uuid,
        anchorUuid,
        tailUuid: keep.at(-1)!.uuid,
      },
    },
  }
}

/**
 * 合并用户提供的自定义指令与钩子提供的指令。
 * 用户指令在前，钩子指令追加在后。
 * 空字符串规范化为 undefined。
 */
export function mergeHookInstructions(
  userInstructions: string | undefined,
  hookInstructions: string | undefined,
): string | undefined {
  if (!hookInstructions) return userInstructions || undefined
  if (!userInstructions) return hookInstructions
  return `${userInstructions}\n\n${hookInstructions}`
}

/**
 * 通过总结较早的消息并保留最近的对话历史，创建对话的压缩版本。
 */
export async function compactConversation(
  messages: Message[],
  context: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  suppressFollowUpQuestions: boolean,
  customInstructions?: string,
  isAutoCompact: boolean = false,
  recompactionInfo?: RecompactionInfo,
): Promise<CompactionResult> {
  try {
    if (messages.length === 0) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
    }

    const preCompactTokenCount = tokenCountWithEstimation(messages)

    const appState = context.getAppState()
    void logPermissionContextForAnts(appState.toolPermissionContext, 'summary')

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'pre_compact',
    })

    // 执行 PreCompact 钩子
    context.setSDKStatus?.('compacting')
    const hookResult = await executePreCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        customInstructions: customInstructions ?? null,
      },
      context.abortController.signal,
    )
    customInstructions = mergeHookInstructions(
      customInstructions,
      hookResult.newCustomInstructions,
    )
    const userDisplayMessage = hookResult.userDisplayMessage

    // 用向上箭头和自定义消息显示请求模式
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    // 第三方默认：true——分叉代理路径复用主对话的 prompt cache。
    // 实验（2026 年 1 月）证实：false 路径有 98% 的缓存未命中，消耗了约 0.76% 的总缓存创建 token（~38B tok/天），
    // 集中在具有冷 GB 缓存的临时环境（CCR/GHA/SDK）以及禁用 GB 的第三方提供商中。保留 GB 开关作为终止开关。
    const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_compact_cache_prefix',
      true,
    )

    const compactPrompt = getCompactPrompt(customInstructions)
    const summaryRequest = createUserMessage({
      content: compactPrompt,
    })

    let messagesToSummarize = messages
    let retryCacheSafeParams = cacheSafeParams
    let summaryResponse: AssistantMessage
    let summary: string | null
    let ptlAttempts = 0
    for (;;) {
      summaryResponse = await streamCompactSummary({
        messages: messagesToSummarize,
        summaryRequest,
        appState,
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
      })
      summary = getAssistantMessageText(summaryResponse)
      if (!summary?.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) break

      // CC-1180: 压缩请求本身遇到提示词过长。截断最早的 API 轮次组并重试，而不是让用户卡住。
      ptlAttempts++
      const truncated =
        ptlAttempts <= MAX_PTL_RETRIES
          ? truncateHeadForPTLRetry(messagesToSummarize, summaryResponse)
          : null
      if (!truncated) {
        logEvent('tengu_compact_failed', {
          reason:
            'prompt_too_long' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
          promptCacheSharingEnabled,
          ptlAttempts,
        })
        throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
      }
      logEvent('tengu_compact_ptl_retry', {
        attempt: ptlAttempts,
        droppedMessages: messagesToSummarize.length - truncated.length,
        remainingMessages: truncated.length,
      })
      messagesToSummarize = truncated
      // 分叉代理路径从 cacheSafeParams.forkContextMessages 读取，而非 messages 参数——将截断后的集合同时传递给两条路径。
      retryCacheSafeParams = {
        ...retryCacheSafeParams,
        forkContextMessages: truncated,
      }
    }

    if (!summary) {
      logForDebugging(
        `压缩失败：响应中没有摘要文本。响应内容：${jsonStringify(summaryResponse)}`,
        { level: 'error' },
      )
      logEvent('tengu_compact_failed', {
        reason:
          'no_summary' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        promptCacheSharingEnabled,
      })
      throw new Error(
        `生成对话摘要失败 - 响应不包含有效的文本内容`,
      )
    } else if (startsWithApiErrorPrefix(summary)) {
      logEvent('tengu_compact_failed', {
        reason:
          'api_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        promptCacheSharingEnabled,
      })
      throw new Error(summary)
    }

    // 在清除之前存储当前文件状态
    const preCompactReadFileState = cacheToObject(context.readFileState)

    // 清除缓存
    context.readFileState.clear()
    context.loadedNestedMemoryPaths?.clear()

    // 故意不重置 sentSkillNames：压缩后重新注入完整的 skill_listing（~4K token）纯粹是缓存创建开销，边际收益很小。
    // 模型在其 schema 中仍然有 SkillTool，并且 invoked_skills 附件（见下）保留了已使用技能的内容。
    // 具有 EXPERIMENTAL_SKILL_SEARCH 的 Ants 已通过 getSkillListingAttachments 中的提前返回跳过了重新注入。

    // 并行运行异步附件生成
    const [fileAttachments, asyncAgentAttachments] = await Promise.all([
      createPostCompactFileAttachments(
        preCompactReadFileState,
        context,
        POST_COMPACT_MAX_FILES_TO_RESTORE,
      ),
      createAsyncAgentAttachmentsIfNeeded(context),
    ])

    const postCompactFileAttachments: AttachmentMessage[] = [
      ...fileAttachments,
      ...asyncAgentAttachments,
    ]
    const planAttachment = createPlanAttachmentIfNeeded(context.agentId)
    if (planAttachment) {
      postCompactFileAttachments.push(planAttachment)
    }

    // 如果当前处于计划模式，添加计划模式指令，以便模型在压缩后继续以计划模式运行
    const planModeAttachment = await createPlanModeAttachmentIfNeeded(context)
    if (planModeAttachment) {
      postCompactFileAttachments.push(planModeAttachment)
    }

    // 如果本次会话中调用了技能，添加技能附件
    const skillAttachment = createSkillAttachmentIfNeeded(context.agentId)
    if (skillAttachment) {
      postCompactFileAttachments.push(skillAttachment)
    }

    // 压缩会消耗掉之前的增量附件。根据当前状态重新通告，以便模型在压缩后的第一个轮次拥有工具/指令上下文。
    // 空消息历史 → 与空 diff → 通告完整集合。
    for (const att of getDeferredToolsDeltaAttachment(
      context.options.tools,
      context.options.mainLoopModel,
      [],
      { callSite: 'compact_full' },
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getAgentListingDeltaAttachment(context, [])) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getMcpInstructionsDeltaAttachment(
      context.options.mcpClients,
      context.options.tools,
      context.options.mainLoopModel,
      [],
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'session_start',
    })
    // 压缩成功后执行 SessionStart 钩子
    const hookMessages = await processSessionStartHooks('compact', {
      model: context.options.mainLoopModel,
    })

    // 在事件之前创建压缩边界标记和摘要消息，以便计算真实的结果上下文大小。
    const boundaryMarker = createCompactBoundaryMessage(
      isAutoCompact ? 'auto' : 'manual',
      preCompactTokenCount ?? 0,
      messages.at(-1)?.uuid,
    )
    // 携带已加载的工具状态——摘要不会保留 tool_reference 块，因此压缩后的模式过滤器需要此信息以继续向 API 发送已加载的延迟工具模式。
    const preCompactDiscovered = extractDiscoveredToolNames(messages)
    if (preCompactDiscovered.size > 0) {
      boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
        ...preCompactDiscovered,
      ].sort()
    }

    const transcriptPath = getTranscriptPath()
    const summaryMessages: UserMessage[] = [
      createUserMessage({
        content: getCompactUserSummaryMessage(
          summary,
          suppressFollowUpQuestions,
          transcriptPath,
        ),
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
      }),
    ]

    // 之前叫 "postCompactTokenCount"——重命名是因为这是压缩 API 调用的总用量（input_tokens ≈ preCompactTokenCount），
    // 而非结果上下文的大小。保留此字段以维持事件字段的连续性。
    const compactionCallTotalTokens = tokenCountFromLastAPIResponse([
      summaryResponse,
    ])

    // 结果上下文的消息负载估算值。下一轮迭代的 shouldAutoCompact 会看到这个值加上约 20-40K 的系统提示词 + 工具 + userContext（通过 API usage.input_tokens）。
    // 因此 `willRetriggerNextTurn: true` 是一个强信号；`false` 可能仍会在接近阈值时重新触发。
    const truePostCompactTokenCount = roughTokenCountEstimationForMessages([
      boundaryMarker,
      ...summaryMessages,
      ...postCompactFileAttachments,
      ...hookMessages,
    ])

    // 提取压缩 API 用量指标
    const compactionUsage = getTokenUsage(summaryResponse)

    const querySourceForEvent =
      recompactionInfo?.querySource ?? context.options.querySource ?? 'unknown'

    logEvent('tengu_compact', {
      preCompactTokenCount,
      // 为保持连续性保留——语义上是压缩 API 调用的总用量
      postCompactTokenCount: compactionCallTotalTokens,
      truePostCompactTokenCount,
      autoCompactThreshold: recompactionInfo?.autoCompactThreshold ?? -1,
      willRetriggerNextTurn:
        recompactionInfo !== undefined &&
        truePostCompactTokenCount >= recompactionInfo.autoCompactThreshold,
      isAutoCompact,
      querySource:
        querySourceForEvent as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryChainId: (context.queryTracking?.chainId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: context.queryTracking?.depth ?? -1,
      isRecompactionInChain: recompactionInfo?.isRecompactionInChain ?? false,
      turnsSincePreviousCompact:
        recompactionInfo?.turnsSincePreviousCompact ?? -1,
      previousCompactTurnId: (recompactionInfo?.previousCompactTurnId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      compactionInputTokens: compactionUsage?.input_tokens,
      compactionOutputTokens: compactionUsage?.output_tokens,
      compactionCacheReadTokens: compactionUsage?.cache_read_input_tokens ?? 0,
      compactionCacheCreationTokens:
        compactionUsage?.cache_creation_input_tokens ?? 0,
      compactionTotalTokens: compactionUsage
        ? compactionUsage.input_tokens +
          (compactionUsage.cache_creation_input_tokens ?? 0) +
          (compactionUsage.cache_read_input_tokens ?? 0) +
          compactionUsage.output_tokens
        : 0,
      promptCacheSharingEnabled,
      // analyzeContext 遍历每个内容块（在一个 4.5K 消息的会话上约 11ms），纯粹用于此遥测细分。
      // 在此处计算，在压缩 API await 之后，以便同步遍历不会在压缩开始之前饿死渲染循环。与 reactiveCompact.ts 中的延迟模式相同。
      ...(() => {
        try {
          return tokenStatsToStatsigMetrics(analyzeContext(messages))
        } catch (error) {
          logError(error as Error)
          return {}
        }
      })(),
    })

    // 重置缓存读取基线，以便压缩后的下降不被标记为中断
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(
        context.options.querySource ?? 'compact',
        context.agentId,
      )
    }
    markPostCompaction()

    // 重新追加会话元数据（自定义标题、标签），使其保持在 readLiteMetadata 读取的 16KB 尾部窗口内，用于 --resume 显示。
    // 没有这个，足够多的压缩后消息会将元数据条目推出窗口，导致 --resume 显示自动生成的标题而非用户设置的会话名称。
    reAppendSessionMetadata()

    // 为压缩前的消息写入精简的转录片段（仅助手模式）。Fire-and-forget——内部记录错误。
    if (feature('KAIROS')) {
      void sessionTranscriptModule?.writeSessionTranscriptSegment(messages)
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'post_compact',
    })
    const postCompactHookResult = await executePostCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        compactSummary: summary,
      },
      context.abortController.signal,
    )

    const combinedUserDisplayMessage = [
      userDisplayMessage,
      postCompactHookResult.userDisplayMessage,
    ]
      .filter(Boolean)
      .join('\n')

    return {
      boundaryMarker,
      summaryMessages,
      attachments: postCompactFileAttachments,
      hookResults: hookMessages,
      userDisplayMessage: combinedUserDisplayMessage || undefined,
      preCompactTokenCount,
      postCompactTokenCount: compactionCallTotalTokens,
      truePostCompactTokenCount,
      compactionUsage,
    }
  } catch (error) {
    // 仅为手动 /compact 显示错误通知。
    // 自动压缩失败会在下一轮重试，如果压缩最终成功，显示通知反而会令人困惑。
    if (!isAutoCompact) {
      addErrorNotificationIfNeeded(error, context)
    }
    throw error
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.(null)
  }
}

/**
 * 围绕选定的消息索引执行部分压缩。
 * 方向 'from'：总结索引之后的消息，保留较早的消息。
 *   保留消息（较早部分）的 prompt cache 得以保留。
 * 方向 'up_to'：总结索引之前的消息，保留较晚的消息。
 *   由于摘要位于保留消息之前，prompt cache 会失效。
 */
export async function partialCompactConversation(
  allMessages: Message[],
  pivotIndex: number,
  context: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  userFeedback?: string,
  direction: PartialCompactDirection = 'from',
): Promise<CompactionResult> {
  try {
    const messagesToSummarize =
      direction === 'up_to'
        ? allMessages.slice(0, pivotIndex)
        : allMessages.slice(pivotIndex)
    // 'up_to' 必须剥离旧的压缩边界/摘要：对于 'up_to'，summary_B 位于保留消息之前，因此保留部分中陈旧的 boundary_A 会通过 findLastCompactBoundaryIndex 的反向扫描胜出，导致 summary_B 被丢弃。
    // 'from' 保留它们：summary_B 位于保留消息之后（反向扫描仍有效），删除旧的摘要会丢失其覆盖的历史记录。
    const messagesToKeep =
      direction === 'up_to'
        ? allMessages
            .slice(pivotIndex)
            .filter(
              m =>
                m.type !== 'progress' &&
                !isCompactBoundaryMessage(m) &&
                !(m.type === 'user' && m.isCompactSummary),
            )
        : allMessages.slice(0, pivotIndex).filter(m => m.type !== 'progress')

    if (messagesToSummarize.length === 0) {
      throw new Error(
        direction === 'up_to'
          ? '所选消息之前没有可总结的内容。'
          : '所选消息之后没有可总结的内容。',
      )
    }

    const preCompactTokenCount = tokenCountWithEstimation(allMessages)

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'pre_compact',
    })

    context.setSDKStatus?.('compacting')
    const hookResult = await executePreCompactHooks(
      {
        trigger: 'manual',
        customInstructions: null,
      },
      context.abortController.signal,
    )

    // 合并钩子指令与用户反馈
    let customInstructions: string | undefined
    if (hookResult.newCustomInstructions && userFeedback) {
      customInstructions = `${hookResult.newCustomInstructions}\n\n用户上下文：${userFeedback}`
    } else if (hookResult.newCustomInstructions) {
      customInstructions = hookResult.newCustomInstructions
    } else if (userFeedback) {
      customInstructions = `用户上下文：${userFeedback}`
    }

    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    const compactPrompt = getPartialCompactPrompt(customInstructions, direction)
    const summaryRequest = createUserMessage({
      content: compactPrompt,
    })

    const failureMetadata = {
      preCompactTokenCount,
      direction:
        direction as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      messagesSummarized: messagesToSummarize.length,
    }

    // 'up_to' 前缀直接命中缓存；'from' 发送全部（尾部无法缓存）。
    // PTL 重试会破坏缓存前缀，但能解除用户阻塞（CC-1180）。
    let apiMessages = direction === 'up_to' ? messagesToSummarize : allMessages
    let retryCacheSafeParams =
      direction === 'up_to'
        ? { ...cacheSafeParams, forkContextMessages: messagesToSummarize }
        : cacheSafeParams
    let summaryResponse: AssistantMessage
    let summary: string | null
    let ptlAttempts = 0
    for (;;) {
      summaryResponse = await streamCompactSummary({
        messages: apiMessages,
        summaryRequest,
        appState: context.getAppState(),
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
      })
      summary = getAssistantMessageText(summaryResponse)
      if (!summary?.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) break

      ptlAttempts++
      const truncated =
        ptlAttempts <= MAX_PTL_RETRIES
          ? truncateHeadForPTLRetry(apiMessages, summaryResponse)
          : null
      if (!truncated) {
        logEvent('tengu_partial_compact_failed', {
          reason:
            'prompt_too_long' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          ...failureMetadata,
          ptlAttempts,
        })
        throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
      }
      logEvent('tengu_compact_ptl_retry', {
        attempt: ptlAttempts,
        droppedMessages: apiMessages.length - truncated.length,
        remainingMessages: truncated.length,
        path: 'partial' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      apiMessages = truncated
      retryCacheSafeParams = {
        ...retryCacheSafeParams,
        forkContextMessages: truncated,
      }
    }
    if (!summary) {
      logEvent('tengu_partial_compact_failed', {
        reason:
          'no_summary' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...failureMetadata,
      })
      throw new Error(
        '生成对话摘要失败 - 响应不包含有效的文本内容',
      )
    } else if (startsWithApiErrorPrefix(summary)) {
      logEvent('tengu_partial_compact_failed', {
        reason:
          'api_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...failureMetadata,
      })
      throw new Error(summary)
    }

    // 在清除之前存储当前文件状态
    const preCompactReadFileState = cacheToObject(context.readFileState)
    context.readFileState.clear()
    context.loadedNestedMemoryPaths?.clear()
    // 故意不重置 sentSkillNames——理由参见 compactConversation()（每次压缩节省约 4K token）。

    const [fileAttachments, asyncAgentAttachments] = await Promise.all([
      createPostCompactFileAttachments(
        preCompactReadFileState,
        context,
        POST_COMPACT_MAX_FILES_TO_RESTORE,
        messagesToKeep,
      ),
      createAsyncAgentAttachmentsIfNeeded(context),
    ])

    const postCompactFileAttachments: AttachmentMessage[] = [
      ...fileAttachments,
      ...asyncAgentAttachments,
    ]
    const planAttachment = createPlanAttachmentIfNeeded(context.agentId)
    if (planAttachment) {
      postCompactFileAttachments.push(planAttachment)
    }

    // 如果当前处于计划模式，添加计划模式指令
    const planModeAttachment = await createPlanModeAttachmentIfNeeded(context)
    if (planModeAttachment) {
      postCompactFileAttachments.push(planModeAttachment)
    }

    const skillAttachment = createSkillAttachmentIfNeeded(context.agentId)
    if (skillAttachment) {
      postCompactFileAttachments.push(skillAttachment)
    }

    // 仅重新通告已被总结部分中的内容——messagesToKeep 被扫描，因此其中已通告的内容会被跳过。
    for (const att of getDeferredToolsDeltaAttachment(
      context.options.tools,
      context.options.mainLoopModel,
      messagesToKeep,
      { callSite: 'compact_partial' },
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getAgentListingDeltaAttachment(context, messagesToKeep)) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getMcpInstructionsDeltaAttachment(
      context.options.mcpClients,
      context.options.tools,
      context.options.mainLoopModel,
      messagesToKeep,
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'session_start',
    })
    const hookMessages = await processSessionStartHooks('compact', {
      model: context.options.mainLoopModel,
    })

    const postCompactTokenCount = tokenCountFromLastAPIResponse([
      summaryResponse,
    ])
    const compactionUsage = getTokenUsage(summaryResponse)

    logEvent('tengu_partial_compact', {
      preCompactTokenCount,
      postCompactTokenCount,
      messagesKept: messagesToKeep.length,
      messagesSummarized: messagesToSummarize.length,
      direction:
        direction as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      hasUserFeedback: !!userFeedback,
      trigger:
        'message_selector' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      compactionInputTokens: compactionUsage?.input_tokens,
      compactionOutputTokens: compactionUsage?.output_tokens,
      compactionCacheReadTokens: compactionUsage?.cache_read_input_tokens ?? 0,
      compactionCacheCreationTokens:
        compactionUsage?.cache_creation_input_tokens ?? 0,
    })

    // 进度消息不可记录，因此 forkSessionImpl 会将对它们的 logicalParentUuid 设为 null。两种方向都跳过它们。
    const lastPreCompactUuid =
      direction === 'up_to'
        ? allMessages.slice(0, pivotIndex).findLast(m => m.type !== 'progress')
            ?.uuid
        : messagesToKeep.at(-1)?.uuid
    const boundaryMarker = createCompactBoundaryMessage(
      'manual',
      preCompactTokenCount ?? 0,
      lastPreCompactUuid,
      userFeedback,
      messagesToSummarize.length,
    )
    // 使用 allMessages 而非 messagesToSummarize——集合合并是幂等的，比跟踪每半部分中工具所在位置更简单。
    const preCompactDiscovered = extractDiscoveredToolNames(allMessages)
    if (preCompactDiscovered.size > 0) {
      boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
        ...preCompactDiscovered,
      ].sort()
    }

    const transcriptPath = getTranscriptPath()
    const summaryMessages: UserMessage[] = [
      createUserMessage({
        content: getCompactUserSummaryMessage(summary, false, transcriptPath),
        isCompactSummary: true,
        ...(messagesToKeep.length > 0
          ? {
              summarizeMetadata: {
                messagesSummarized: messagesToSummarize.length,
                userContext: userFeedback,
                direction,
              },
            }
          : { isVisibleInTranscriptOnly: true as const }),
      }),
    ]

    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(
        context.options.querySource ?? 'compact',
        context.agentId,
      )
    }
    markPostCompaction()

    // 重新追加会话元数据（自定义标题、标签），使其保持在 readLiteMetadata 读取的 16KB 尾部窗口内，用于 --resume 显示。
    reAppendSessionMetadata()

    if (feature('KAIROS')) {
      void sessionTranscriptModule?.writeSessionTranscriptSegment(
        messagesToSummarize,
      )
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'post_compact',
    })
    const postCompactHookResult = await executePostCompactHooks(
      {
        trigger: 'manual',
        compactSummary: summary,
      },
      context.abortController.signal,
    )

    // 'from'：保留前缀 → 边界；'up_to'：保留后缀 → 最后一条摘要
    const anchorUuid =
      direction === 'up_to'
        ? (summaryMessages.at(-1)?.uuid ?? boundaryMarker.uuid)
        : boundaryMarker.uuid
    return {
      boundaryMarker: annotateBoundaryWithPreservedSegment(
        boundaryMarker,
        anchorUuid,
        messagesToKeep,
      ),
      summaryMessages,
      messagesToKeep,
      attachments: postCompactFileAttachments,
      hookResults: hookMessages,
      userDisplayMessage: postCompactHookResult.userDisplayMessage,
      preCompactTokenCount,
      postCompactTokenCount,
      compactionUsage,
    }
  } catch (error) {
    addErrorNotificationIfNeeded(error, context)
    throw error
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.(null)
  }
}

function addErrorNotificationIfNeeded(
  error: unknown,
  context: Pick<ToolUseContext, 'addNotification'>,
) {
  if (
    !hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT) &&
    !hasExactErrorMessage(error, ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
  ) {
    context.addNotification?.({
      key: 'error-compacting-conversation',
      text: '压缩对话时出错',
      priority: 'immediate',
      color: 'error',
    })
  }
}

export function createCompactCanUseTool(): CanUseToolFn {
  return async () => ({
    behavior: 'deny' as const,
    message: '压缩期间不允许使用工具',
    decisionReason: {
      type: 'other' as const,
      reason: '压缩代理应仅生成文本摘要',
    },
  })
}

async function streamCompactSummary({
  messages,
  summaryRequest,
  appState,
  context,
  preCompactTokenCount,
  cacheSafeParams,
}: {
  messages: Message[]
  summaryRequest: UserMessage
  appState: Awaited<ReturnType<ToolUseContext['getAppState']>>
  context: ToolUseContext
  preCompactTokenCount: number
  cacheSafeParams: CacheSafeParams
}): Promise<AssistantMessage> {
  // 当 prompt cache 共享启用时，使用分叉代理以复用主对话的已缓存前缀（系统提示词、工具、上下文消息）。
  // 失败时回退到常规流式路径。
  // 第三方默认：true——参见上面另一处 tengu_compact_cache_prefix 读取的注释。
  const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_compact_cache_prefix',
    true,
  )
  // 在压缩期间发送保活信号，防止远程会话的 WebSocket 空闲超时断开桥接连接。
  // 压缩 API 调用可能需要 5-10 秒以上，在此期间没有其他消息流经传输层——没有保活信号，服务端可能因不活跃而关闭 WebSocket。
  // 两种信号：(1) 通过 sessionActivity 发送 PUT /worker 心跳，以及 (2) 重新发送 'compacting' 状态，
  // 使 SDK 事件流保持活跃，服务端不会认为会话已陈旧。
  const activityInterval = isSessionActivityTrackingActive()
    ? setInterval(
        (statusSetter?: (status: 'compacting' | null) => void) => {
          sendSessionActivitySignal()
          statusSetter?.('compacting')
        },
        30_000,
        context.setSDKStatus,
      )
    : undefined

  try {
    if (promptCacheSharingEnabled) {
      try {
        // 此处不要设置 maxOutputTokens。分叉通过发送与主线程相同的缓存键参数（系统、工具、模型、消息前缀、思考配置）来复用主线程的 prompt cache。
        // 设置 maxOutputTokens 会通过 claude.ts 中的 Math.min(budget, maxOutputTokens-1) 限制 budget_tokens，
        // 导致思考配置不匹配，从而使缓存失效。
        // 流式回退路径（见下）可以安全地设置 maxOutputTokensOverride，因为它不与主线程共享缓存。
        const result = await runForkedAgent({
          promptMessages: [summaryRequest],
          cacheSafeParams,
          canUseTool: createCompactCanUseTool(),
          querySource: 'compact',
          forkLabel: 'compact',
          maxTurns: 1,
          skipCacheWrite: true,
          // 传递压缩上下文的 abortController，以便用户按 Esc 中止分叉——与下面流式回退中使用的 `signal: context.abortController.signal` 信号相同。
          overrides: { abortController: context.abortController },
        })
        const assistantMsg = getLastAssistantMessage(result.messages)
        const assistantText = assistantMsg
          ? getAssistantMessageText(assistantMsg)
          : null
        // 防护 isApiErrorMessage：query() 捕获 API 错误（包括 ESC 上的 APIUserAbortError）并将其作为合成助手消息生成。
        // 没有这个检查，一个被中止的压缩会“成功”，并以“请求已中止”作为摘要——文本不以“API 错误”开头，因此调用方的 startsWithApiErrorPrefix 守卫会遗漏。
        if (assistantMsg && assistantText && !assistantMsg.isApiErrorMessage) {
          // 跳过 PTL 错误文本的成功日志——它被返回以便调用方的重试循环捕获，但它不是成功的摘要。
          if (!assistantText.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
            logEvent('tengu_compact_cache_sharing_success', {
              preCompactTokenCount,
              outputTokens: result.totalUsage.output_tokens,
              cacheReadInputTokens: result.totalUsage.cache_read_input_tokens,
              cacheCreationInputTokens:
                result.totalUsage.cache_creation_input_tokens,
              cacheHitRate:
                result.totalUsage.cache_read_input_tokens > 0
                  ? result.totalUsage.cache_read_input_tokens /
                    (result.totalUsage.cache_read_input_tokens +
                      result.totalUsage.cache_creation_input_tokens +
                      result.totalUsage.input_tokens)
                  : 0,
            })
          }
          return assistantMsg
        }
        logForDebugging(
          `压缩缓存共享：响应中没有文本，回退。响应内容：${jsonStringify(assistantMsg)}`,
          { level: 'warn' },
        )
        logEvent('tengu_compact_cache_sharing_fallback', {
          reason:
            'no_text_response' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
        })
      } catch (error) {
        logError(error)
        logEvent('tengu_compact_cache_sharing_fallback', {
          reason:
            'error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
        })
      }
    }

    // 常规流式路径（缓存共享失败或禁用时的回退）
    const retryEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_compact_streaming_retry',
      false,
    )
    const maxAttempts = retryEnabled ? MAX_COMPACT_STREAMING_RETRIES : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 重置状态以便重试
      let hasStartedStreaming = false
      let response: AssistantMessage | undefined
      context.setResponseLength?.(() => 0)

      // 使用主循环的工具列表检查是否启用了工具搜索。
      // context.options.tools 包含通过 useMergedTools 合并的 MCP 工具。
      const useToolSearch = await isToolSearchEnabled(
        context.options.mainLoopModel,
        context.options.tools,
        async () => appState.toolPermissionContext,
        context.options.agentDefinitions.activeAgents,
        'compact',
      )

      // 当工具搜索启用时，包含 ToolSearchTool 和 MCP 工具。它们获得 defer_loading: true 且不计入上下文——API 在 token 计数前将其从 system_prompt_tools 中过滤掉（参见 api/token_count_api/counting.py:188 和 api/public_api/messages/handler.py:324）。
      // 从 context.options.tools 而非 appState.mcp.tools 中过滤 MCP 工具，以便我们获得与上面 isToolSearchEnabled 和下面 normalizeMessagesForAPI 相同的、经过权限过滤的集合。
      // 按名称去重，避免当 MCP 工具与内置工具同名时引发 API 错误。
      const tools: Tool[] = useToolSearch
        ? uniqBy(
            [
              FileReadTool,
              ToolSearchTool,
              ...context.options.tools.filter(t => t.isMcp),
            ],
            'name',
          )
        : [FileReadTool]

      const streamingGen = queryModelWithStreaming({
        messages: normalizeMessagesForAPI(
          stripImagesFromMessages(
            stripReinjectedAttachments([
              ...getMessagesAfterCompactBoundary(messages),
              summaryRequest,
            ]),
          ),
          context.options.tools,
        ),
        systemPrompt: asSystemPrompt([
          '你是一个有用的 AI 助手，负责总结对话内容。',
        ]),
        thinkingConfig: { type: 'disabled' as const },
        tools,
        signal: context.abortController.signal,
        options: {
          async getToolPermissionContext() {
            const appState = context.getAppState()
            return appState.toolPermissionContext
          },
          model: context.options.mainLoopModel,
          toolChoice: undefined,
          isNonInteractiveSession: context.options.isNonInteractiveSession,
          hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
          maxOutputTokensOverride: Math.min(
            COMPACT_MAX_OUTPUT_TOKENS,
            getMaxOutputTokensForModel(context.options.mainLoopModel),
          ),
          querySource: 'compact',
          agents: context.options.agentDefinitions.activeAgents,
          mcpTools: [],
          effortValue: appState.effortValue,
        },
      })
      const streamIter = streamingGen[Symbol.asyncIterator]()
      let next = await streamIter.next()

      while (!next.done) {
        const event = next.value

        if (
          !hasStartedStreaming &&
          event.type === 'stream_event' &&
          event.event.type === 'content_block_start' &&
          event.event.content_block.type === 'text'
        ) {
          hasStartedStreaming = true
          context.setStreamMode?.('responding')
        }

        if (
          event.type === 'stream_event' &&
          event.event.type === 'content_block_delta' &&
          event.event.delta.type === 'text_delta'
        ) {
          const charactersStreamed = event.event.delta.text.length
          context.setResponseLength?.(length => length + charactersStreamed)
        }

        if (event.type === 'assistant') {
          response = event
        }

        next = await streamIter.next()
      }

      if (response) {
        return response
      }

      if (attempt < maxAttempts) {
        logEvent('tengu_compact_streaming_retry', {
          attempt,
          preCompactTokenCount,
          hasStartedStreaming,
        })
        await sleep(getRetryDelay(attempt), context.abortController.signal, {
          abortError: () => new APIUserAbortError(),
        })
        continue
      }

      logForDebugging(
        `压缩流式处理在 ${attempt} 次尝试后失败。hasStartedStreaming=${hasStartedStreaming}`,
        { level: 'error' },
      )
      logEvent('tengu_compact_failed', {
        reason:
          'no_streaming_response' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        hasStartedStreaming,
        retryEnabled,
        attempts: attempt,
        promptCacheSharingEnabled,
      })
      throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
    }

    // 由于上面有 throw，这永远不会被到达，但 TypeScript 需要它
    throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
  } finally {
    clearInterval(activityInterval)
  }
}

/**
 * 为最近访问的文件创建附件消息，以在压缩后恢复它们。
 * 这可以防止模型不得不重新读取最近访问过的文件。
 * 使用 FileReadTool 重新读取文件以获取带有正确验证的新鲜内容。
 * 文件根据最近访问时间选择，但同时受到文件数量和 token 预算的双重约束。
 *
 * 已在 preservedMessages 中以 Read 工具结果形式存在的文件会被跳过——
 * 模型在保留尾部中已经能看到的内容，再次注入完全相同的内容纯粹是浪费（每次压缩最多可达 25K token）。
 * 与 getDeferredToolsDeltaAttachment 在相同调用点使用的 diff-against-preserved 模式一致。
 *
 * @param readFileState 跟踪最近读取文件的当前文件状态
 * @param toolUseContext 用于调用 FileReadTool 的工具使用上下文
 * @param maxFiles 最大恢复文件数（默认：5）
 * @param preservedMessages 压缩后保留的消息；其中的 Read 结果会被跳过
 * @returns 针对适应 token 预算的最近访问文件的附件消息数组
 */
export async function createPostCompactFileAttachments(
  readFileState: Record<string, { content: string; timestamp: number }>,
  toolUseContext: ToolUseContext,
  maxFiles: number,
  preservedMessages: Message[] = [],
): Promise<AttachmentMessage[]> {
  const preservedReadPaths = collectReadToolFilePaths(preservedMessages)
  const recentFiles = Object.entries(readFileState)
    .map(([filename, state]) => ({ filename, ...state }))
    .filter(
      file =>
        !shouldExcludeFromPostCompactRestore(
          file.filename,
          toolUseContext.agentId,
        ) && !preservedReadPaths.has(expandPath(file.filename)),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxFiles)

  const results = await Promise.all(
    recentFiles.map(async file => {
      const attachment = await generateFileAttachment(
        file.filename,
        {
          ...toolUseContext,
          fileReadingLimits: {
            maxTokens: POST_COMPACT_MAX_TOKENS_PER_FILE,
          },
        },
        'tengu_post_compact_file_restore_success',
        'tengu_post_compact_file_restore_error',
        'compact',
      )
      return attachment ? createAttachmentMessage(attachment) : null
    }),
  )

  let usedTokens = 0
  return results.filter((result): result is AttachmentMessage => {
    if (result === null) {
      return false
    }
    const attachmentTokens = roughTokenCountEstimation(jsonStringify(result))
    if (usedTokens + attachmentTokens <= POST_COMPACT_TOKEN_BUDGET) {
      usedTokens += attachmentTokens
      return true
    }
    return false
  })
}

/**
 * 如果当前会话存在计划文件，则创建计划文件附件。
 * 这确保计划在压缩后得以保留。
 */
export function createPlanAttachmentIfNeeded(
  agentId?: AgentId,
): AttachmentMessage | null {
  const planContent = getPlan(agentId)

  if (!planContent) {
    return null
  }

  const planFilePath = getPlanFilePath(agentId)

  return createAttachmentMessage({
    type: 'plan_file_reference',
    planFilePath,
    planContent,
  })
}

/**
 * 为已调用的技能创建附件，以在压缩过程中保留其内容。
 * 仅包含作用域为该代理的技能（或当 agentId 为 null/undefined 时为主会话）。
 * 这确保技能指南在对话被总结后仍然可用，同时不会泄露其他代理上下文中的技能。
 */
export function createSkillAttachmentIfNeeded(
  agentId?: string,
): AttachmentMessage | null {
  const invokedSkills = getInvokedSkillsForAgent(agentId)

  if (invokedSkills.size === 0) {
    return null
  }

  // 按最近调用时间降序排列，以便预算压力下丢弃最不相关的技能。
  // 按技能截断保留每个文件的头部（通常包含设置/使用说明），而非丢弃整个技能。
  let usedTokens = 0
  const skills = Array.from(invokedSkills.values())
    .sort((a, b) => b.invokedAt - a.invokedAt)
    .map(skill => ({
      name: skill.skillName,
      path: skill.skillPath,
      content: truncateToTokens(
        skill.content,
        POST_COMPACT_MAX_TOKENS_PER_SKILL,
      ),
    }))
    .filter(skill => {
      const tokens = roughTokenCountEstimation(skill.content)
      if (usedTokens + tokens > POST_COMPACT_SKILLS_TOKEN_BUDGET) {
        return false
      }
      usedTokens += tokens
      return true
    })

  if (skills.length === 0) {
    return null
  }

  return createAttachmentMessage({
    type: 'invoked_skills',
    skills,
  })
}

/**
 * 如果用户当前处于计划模式，则创建 plan_mode 附件。
 * 这确保模型在压缩后继续以计划模式运行（否则会丢失计划模式指令，因为那些指令通常仅在使用工具的轮次通过 getAttachmentMessages 注入）。
 */
export async function createPlanModeAttachmentIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage | null> {
  const appState = context.getAppState()
  if (appState.toolPermissionContext.mode !== 'plan') {
    return null
  }

  const planFilePath = getPlanFilePath(context.agentId)
  const planExists = getPlan(context.agentId) !== null

  return createAttachmentMessage({
    type: 'plan_mode',
    reminderType: 'full',
    isSubAgent: !!context.agentId,
    planFilePath,
    planExists,
  })
}

/**
 * 为异步代理创建附件，以便模型在压缩后知晓它们的存在。
 * 覆盖仍在后台运行的代理（防止模型生成重复的代理）以及已完成但结果尚未被获取的代理。
 */
export async function createAsyncAgentAttachmentsIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage[]> {
  const appState = context.getAppState()
  const asyncAgents = Object.values(appState.tasks).filter(
    (task): task is LocalAgentTaskState => task.type === 'local_agent',
  )

  return asyncAgents.flatMap(agent => {
    if (
      agent.retrieved ||
      agent.status === 'pending' ||
      agent.agentId === context.agentId
    ) {
      return []
    }
    return [
      createAttachmentMessage({
        type: 'task_status',
        taskId: agent.agentId,
        taskType: 'local_agent',
        description: agent.description,
        status: agent.status,
        deltaSummary:
          agent.status === 'running'
            ? (agent.progress?.summary ?? null)
            : (agent.error ?? null),
        outputFilePath: getTaskOutputPath(agent.agentId),
      }),
    ]
  })
}

/**
 * 扫描消息中的 Read tool_use 块，收集其 file_path 输入（通过 expandPath 规范化）。
 * 用于将压缩后文件恢复与保留尾部中已有的内容进行去重。
 *
 * 跳过 tool_result 为去重存根的 Read——存根指向可能已被压缩掉的更早的完整 Read，因此我们希望 createPostCompactFileAttachments 重新注入真实内容。
 */
function collectReadToolFilePaths(messages: Message[]): Set<string> {
  const stubIds = new Set<string>()
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (
        block.type === 'tool_result' &&
        typeof block.content === 'string' &&
        block.content.startsWith(FILE_UNCHANGED_STUB)
      ) {
        stubIds.add(block.tool_use_id)
      }
    }
  }

  const paths = new Set<string>()
  for (const message of messages) {
    if (
      message.type !== 'assistant' ||
      !Array.isArray(message.message.content)
    ) {
      continue
    }
    for (const block of message.message.content) {
      if (
        block.type !== 'tool_use' ||
        block.name !== FILE_READ_TOOL_NAME ||
        stubIds.has(block.id)
      ) {
        continue
      }
      const input = block.input
      if (
        input &&
        typeof input === 'object' &&
        'file_path' in input &&
        typeof input.file_path === 'string'
      ) {
        paths.add(expandPath(input.file_path))
      }
    }
  }
  return paths
}

const SKILL_TRUNCATION_MARKER =
  '\n\n[... 技能内容因压缩而截断；如需完整文本，请对该技能路径使用 Read]'

/**
 * 将内容大致截断到 maxTokens，保留头部。roughTokenCountEstimation 使用约 4 字符/ token（其默认 bytesPerToken），因此字符预算 = maxTokens * 4 减去标记长度，以确保结果在预算内。
 * 标记告知模型如有需要可以 Read 完整文件。
 */
function truncateToTokens(content: string, maxTokens: number): string {
  if (roughTokenCountEstimation(content) <= maxTokens) {
    return content
  }
  const charBudget = maxTokens * 4 - SKILL_TRUNCATION_MARKER.length
  return content.slice(0, charBudget) + SKILL_TRUNCATION_MARKER
}

function shouldExcludeFromPostCompactRestore(
  filename: string,
  agentId?: AgentId,
): boolean {
  const normalizedFilename = expandPath(filename)
  // 排除计划文件
  try {
    const planFilePath = expandPath(getPlanFilePath(agentId))
    if (normalizedFilename === planFilePath) {
      return true
    }
  } catch {
    // 如果无法获取计划文件路径，继续其他检查
  }

  // 排除所有类型的 claude.md 文件
  // TODO: 重构为使用 claudemd.ts 中的 isMemoryFilePath() 以保持一致，
  // 并同样匹配子目录内存文件（.claude/rules/*.md 等）
  try {
    const normalizedMemoryPaths = new Set(
      MEMORY_TYPE_VALUES.map(type => expandPath(getMemoryPath(type))),
    )

    if (normalizedMemoryPaths.has(normalizedFilename)) {
      return true
    }
  } catch {
    // 如果无法获取内存路径，继续
  }

  return false
}