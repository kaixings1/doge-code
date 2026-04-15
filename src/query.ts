// biome-ignore-all assist/source/organizeImports: 仅 ANT 的导入标记不得重新排序
import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { FallbackTriggeredError } from './services/api/withRetry.js'
import {
  calculateTokenWarningState,
  isAutoCompactEnabled,
  type AutoCompactTrackingState,
} from './services/compact/autoCompact.js'
import { buildPostCompactMessages } from './services/compact/compact.js'
 
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? (require('./services/compact/reactiveCompact.js') as typeof import('./services/compact/reactiveCompact.js'))
  : null
const contextCollapse = feature('CONTEXT_COLLAPSE')
  ? (require('./services/contextCollapse/index.js') as typeof import('./services/contextCollapse/index.js'))
  : null
 
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from './services/analytics/index.js'
import { ImageSizeError } from './utils/imageValidation.js'
import { ImageResizeError } from './utils/imageResizer.js'
import { findToolByName, type ToolUseContext } from './Tool.js'
import { asSystemPrompt, type SystemPrompt } from './utils/systemPromptType.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  RequestStartEvent,
  StreamEvent,
  ToolUseSummaryMessage,
  UserMessage,
  TombstoneMessage,
} from './types/message.js'
import { logError } from './utils/log.js'
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  isPromptTooLongMessage,
} from './services/api/errors.js'
import { logAntError, logForDebugging } from './utils/debug.js'
import {
  createUserMessage,
  createUserInterruptionMessage,
  normalizeMessagesForAPI,
  createSystemMessage,
  createAssistantAPIErrorMessage,
  getMessagesAfterCompactBoundary,
  createToolUseSummaryMessage,
  createMicrocompactBoundaryMessage,
  stripSignatureBlocks,
} from './utils/messages.js'
import { generateToolUseSummary } from './services/toolUseSummary/toolUseSummaryGenerator.js'
import { prependUserContext, appendSystemContext } from './utils/api.js'
import {
  createAttachmentMessage,
  filterDuplicateMemoryAttachments,
  getAttachmentMessages,
  startRelevantMemoryPrefetch,
} from './utils/attachments.js'
 
const skillPrefetch = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (require('./services/skillSearch/prefetch.js') as typeof import('./services/skillSearch/prefetch.js'))
  : null
const jobClassifier = feature('TEMPLATES')
  ? (require('./jobs/classifier.js') as typeof import('./jobs/classifier.js'))
  : null
 
import {
  remove as removeFromQueue,
  getCommandsByMaxPriority,
  isSlashCommand,
} from './utils/messageQueueManager.js'
import { notifyCommandLifecycle } from './utils/commandLifecycle.js'
import { headlessProfilerCheckpoint } from './utils/headlessProfiler.js'
import {
  getRuntimeMainLoopModel,
  renderModelName,
} from './utils/model/model.js'
import {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  tokenCountWithEstimation,
} from './utils/tokens.js'
import { ESCALATED_MAX_TOKENS } from './utils/context.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './services/analytics/growthbook.js'
import { SLEEP_TOOL_NAME } from './tools/SleepTool/prompt.js'
import { executePostSamplingHooks } from './utils/hooks/postSamplingHooks.js'
import { executeStopFailureHooks } from './utils/hooks.js'
import type { QuerySource } from './constants/querySource.js'
import { createDumpPromptsFetch } from './services/api/dumpPrompts.js'
import { StreamingToolExecutor } from './services/tools/StreamingToolExecutor.js'
import { queryCheckpoint } from './utils/queryProfiler.js'
import { runTools } from './services/tools/toolOrchestration.js'
import { applyToolResultBudget } from './utils/toolResultStorage.js'
import { recordContentReplacement } from './utils/sessionStorage.js'
import { handleStopHooks } from './query/stopHooks.js'
import { buildQueryConfig } from './query/config.js'
import { productionDeps, type QueryDeps } from './query/deps.js'
import { handleEmptyContentResponse } from './query/emptyContentHandler.js'
import { playTaskCompleteSound } from './utils/soundNotification.js'
import type { Terminal, Continue } from './query/transitions.js'
import { feature } from 'bun:bundle'
import {
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  incrementBudgetContinuationCount,
} from './bootstrap/state.js'
import { createBudgetTracker, checkTokenBudget } from './query/tokenBudget.js'
import { count } from './utils/array.js'

 
const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null
const taskSummaryModule = feature('BG_SESSIONS')
  ? (require('./utils/taskSummary.js') as typeof import('./utils/taskSummary.js'))
  : null
 

/**
 * 为缺失工具结果的助手消息生成合成工具结果消息。
 * 用于异常恢复场景，例如模型回退或错误终止时。
 */
function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
) {
  for (const assistantMessage of assistantMessages) {
    // 从当前助手消息中提取所有工具调用块
    const toolUseBlocks = assistantMessage.message.content.filter(
      content => content.type === 'tool_use',
    ) as ToolUseBlock[]

    // 为每个工具调用生成一个中断消息
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id,
          },
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
  }
}

/**
 * 思考规则繁复而玄妙，需要长时间的深思熟虑和深度冥想，方能令巫师领悟其中奥秘。
 *
 * 规则如下：
 * 1. 包含思考或脱敏思考块的消息必须来自 max_thinking_length > 0 的查询
 * 2. 思考块不能是消息块中的最后一项内容
 * 3. 在助手轨迹的持续时间内（单次轮次，或若该轮次包含工具使用块，则还包括其后续的工具结果及下一条助手消息），必须保留思考块
 *
 * 年轻的巫师，务必谨记这些规则。因为思考规则即是宇宙的法则。若不遵守，你将面临整日的调试与抓狂。
 */
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

/**
 * 判断是否为 max_output_tokens 错误消息。若是，则流式循环应在明确恢复循环是否能继续之前
 * 对 SDK 调用方隐藏该消息。过早产出会向 SDK 调用方（如 cowork/desktop）泄露中间错误，
 * 导致其在遇到任何 `error` 字段时即终止会话——恢复循环虽继续运行，却已无人监听。
 *
 * 镜像 reactiveCompact.isWithheldPromptTooLong 的逻辑。
 */
function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  // API 任务预算 (output_config.task_budget, beta task-budgets-2026-03-13)。
  // 区别于 tokenBudget +500k 自动继续特性。`total` 是整个代理轮次的预算；
  // `remaining` 在每次迭代时根据累积的 API 用量计算得出。参见 claude.ts 中的 configureTaskBudgetParams。
  taskBudget?: { total: number }
  deps?: QueryDeps
}

// -- 查询循环状态

// 循环迭代间携带的可变状态
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  // 上一次迭代为何继续。首次迭代时为 undefined。
  // 便于测试在不检查消息内容的情况下断言恢复路径是否触发。
  transition: Continue | undefined
}

export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)
  // 仅当 queryLoop 正常返回时到达。抛出错误（通过 yield* 传播）或调用 .return()（Return 完成关闭两个生成器）时跳过。
  // 这提供了与 print.ts 的 drainCommandQueue 在轮次失败时相同的不对称“已开始但未完成”信号。
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal
}

async function* queryLoop(
  params: QueryParams,
  consumedCommandUuids: string[],
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  // 不可变参数 — 在查询循环期间永不重新赋值。
  const {
    systemPrompt,
    userContext,
    systemContext,
    canUseTool,
    fallbackModel,
    querySource,
    maxTurns,
    skipCacheWrite,
  } = params
  const deps = params.deps ?? productionDeps()

  // 跨迭代的可变状态。循环体在每次迭代顶部解构此状态，以便读取时使用裸名称（`messages`、`toolUseContext`）。
  // 继续站点写入 `state = { ... }` 而非 9 次独立赋值。
  let state: State = {
    messages: params.messages,
    toolUseContext: params.toolUseContext,
    maxOutputTokensOverride: params.maxOutputTokensOverride,
    autoCompactTracking: undefined,
    stopHookActive: undefined,
    maxOutputTokensRecoveryCount: 0,
    hasAttemptedReactiveCompact: false,
    turnCount: 1,
    pendingToolUseSummary: undefined,
    transition: undefined,
  }
  const budgetTracker = feature('TOKEN_BUDGET') ? createBudgetTracker() : null

  // 跨压缩边界的 task_budget.remaining 追踪。首次压缩触发前为 undefined ——
  // 当上下文未被压缩时，服务端能看见完整历史并自行从 {total} 递减计数（参见 api/api/sampling/prompt/renderer.py:292）。
  // 压缩后，服务端仅能看到摘要，会少计消耗量；remaining 告知服务端压缩前被摘要化的最终窗口量。
  // 跨多次压缩累积：每次减去该次压缩触发点的最终上下文量。循环局部变量（不在 State 上），避免触及 7 处继续站点。
  let taskBudgetRemaining: number | undefined = undefined

  // 在入口处一次性快照不可变的环境/statsig/会话状态。参见 QueryConfig 了解包含内容及为何故意排除 feature() 门控。
  const config = buildQueryConfig()

  // 每个用户轮次仅触发一次 — 提示在循环迭代间保持不变，因此每次迭代触发会导致 sideQuery 重复询问相同问题。
  // 消费点轮询 settledAt（永不阻塞）。`using` 在所有生成器退出路径上释放 — 参见 MemoryPrefetch 了解释放/遥测语义。
  using pendingMemoryPrefetch = startRelevantMemoryPrefetch(
    state.messages,
    state.toolUseContext,
  )

   
  while (true) {
    // 在每次迭代顶部解构状态。toolUseContext 单独在迭代内重新赋值（queryTracking、messages 更新）；
    // 其余变量在继续站点间为只读。
    let { toolUseContext } = state
    const {
      messages,
      autoCompactTracking,
      maxOutputTokensRecoveryCount,
      hasAttemptedReactiveCompact,
      maxOutputTokensOverride,
      pendingToolUseSummary,
      stopHookActive,
      turnCount,
    } = state

    // 技能发现预取 — 每次迭代运行（内部使用 findWritePivot 守卫在非写入迭代时提前返回）。
    // 发现过程在模型流式输出和工具执行期间运行；在工具后与内存预取消费一同等待。
    // 替代了原先在 getAttachmentMessages 内部运行的阻塞式 assistant_turn 路径（生产环境中 97% 的调用未找到任何内容）。
    // 第 0 轮用户输入发现仍在 userInputAttachments 中阻塞 — 这是唯一一个没有前期工作可隐藏的信号。
    const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
      null,
      messages,
      toolUseContext,
    )

    yield { type: 'stream_request_start' }

    queryCheckpoint('query_fn_entry')

    // 为无头延迟追踪记录查询开始时间（子代理跳过）
    if (!toolUseContext.agentId) {
      headlessProfilerCheckpoint('query_started')
    }

    // 初始化或递增查询链追踪
    const queryTracking = toolUseContext.queryTracking
      ? {
          chainId: toolUseContext.queryTracking.chainId,
          depth: toolUseContext.queryTracking.depth + 1,
        }
      : {
          chainId: deps.uuid(),
          depth: 0,
        }

    const queryChainIdForAnalytics =
      queryTracking.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    toolUseContext = {
      ...toolUseContext,
      queryTracking,
    }

    let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)]

    let tracking = autoCompactTracking

    // 对聚合工具结果大小强制执行每条消息的预算限制。在微压缩之前运行 —— 缓存 MC 纯粹基于 tool_use_id 操作（从不检查内容），
    // 因此内容替换对其不可见，二者可以干净地组合。当 contentReplacementState 为 undefined（功能关闭）时无操作。
    // 仅对会从记录中读取恢复的 querySource 持久化：agentId 路由至 sidechain 文件（AgentTool 恢复）或会话文件（/resume）。
    // 短暂的 runForkedAgent 调用方（agent_summary 等）不持久化。
    const persistReplacements =
      querySource.startsWith('agent:') ||
      querySource.startsWith('repl_main_thread')
    messagesForQuery = await applyToolResultBudget(
      messagesForQuery,
      toolUseContext.contentReplacementState,
      persistReplacements
        ? records =>
            void recordContentReplacement(
              records,
              toolUseContext.agentId,
            ).catch(logError)
        : undefined,
      new Set(
        toolUseContext.options.tools
          .filter(t => !Number.isFinite(t.maxResultSizeChars))
          .map(t => t.name),
      ),
    )

    // 在微压缩之前应用 snip（两者均可运行 —— 并非互斥）。
    // snipTokensFreed 被传递给 autocompact，使其阈值检查能反映 snip 移除的内容；
    // tokenCountWithEstimation 本身无法察觉（它读取的用量来自受保护尾部的助手消息，该消息在 snip 后保持不变）。
    let snipTokensFreed = 0
    if (feature('HISTORY_SNIP')) {
      queryCheckpoint('query_snip_start')
      const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
      messagesForQuery = snipResult.messages
      snipTokensFreed = snipResult.tokensFreed
      if (snipResult.boundaryMessage) {
        yield snipResult.boundaryMessage
      }
      queryCheckpoint('query_snip_end')
    }

    // 在自动压缩之前应用微压缩
    queryCheckpoint('query_microcompact_start')
    const microcompactResult = await deps.microcompact(
      messagesForQuery,
      toolUseContext,
      querySource,
    )
    messagesForQuery = microcompactResult.messages
    // 对于缓存的微压缩（缓存编辑），将边界消息延迟至 API 响应之后，以便使用实际的 cache_deleted_input_tokens。
    // 通过 feature() 门控，确保该字符串在外部构建中被消除。
    const pendingCacheEdits = feature('CACHED_MICROCOMPACT')
      ? microcompactResult.compactionInfo?.pendingCacheEdits
      : undefined
    queryCheckpoint('query_microcompact_end')

    // 投影折叠后的上下文视图，并可能提交更多折叠。
    // 在自动压缩之前运行，以便如果折叠能将我们降至自动压缩阈值以下，自动压缩将成为空操作，
    // 而我们保留细粒度的上下文而非单一摘要。
    //
    // 不产出任何内容 —— 折叠视图是对 REPL 完整历史的读取时投影。
    // 摘要消息存在于折叠存储中，而非 REPL 数组中。这正是折叠能跨轮次持久化的原因：
    // projectView() 在每次入口时重放提交日志。在同一轮次内，视图通过继续站点（query.ts:1192）的 state.messages 向前流动，
    // 而下一次 projectView() 成为空操作，因为已归档的消息已从其输入中消失。
    if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
      const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
        messagesForQuery,
        toolUseContext,
        querySource,
      )
      messagesForQuery = collapseResult.messages
    }

    const fullSystemPrompt = asSystemPrompt(
      appendSystemContext(systemPrompt, systemContext),
    )

    queryCheckpoint('query_autocompact_start')
    const { compactionResult, consecutiveFailures } = await deps.autocompact(
      messagesForQuery,
      toolUseContext,
      {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        forkContextMessages: messagesForQuery,
      },
      querySource,
      tracking,
      snipTokensFreed,
    )
    queryCheckpoint('query_autocompact_end')

    if (compactionResult) {
      const {
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionUsage,
      } = compactionResult

      logEvent('tengu_auto_compact_succeeded', {
        originalMessageCount: messages.length,
        compactedMessageCount:
          compactionResult.summaryMessages.length +
          compactionResult.attachments.length +
          compactionResult.hookResults.length,
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionInputTokens: compactionUsage?.input_tokens,
        compactionOutputTokens: compactionUsage?.output_tokens,
        compactionCacheReadTokens:
          compactionUsage?.cache_read_input_tokens ?? 0,
        compactionCacheCreationTokens:
          compactionUsage?.cache_creation_input_tokens ?? 0,
        compactionTotalTokens: compactionUsage
          ? compactionUsage.input_tokens +
            (compactionUsage.cache_creation_input_tokens ?? 0) +
            (compactionUsage.cache_read_input_tokens ?? 0) +
            compactionUsage.output_tokens
          : 0,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // task_budget：在下文用 postCompactMessages 替换 messagesForQuery 之前，
      // 捕获压缩前的最终上下文窗口。iterations[-1] 是权威的最终窗口（服务端工具循环之后）；参见 #304930。
      if (params.taskBudget) {
        const preCompactContext =
          finalContextTokensFromLastResponse(messagesForQuery)
        taskBudgetRemaining = Math.max(
          0,
          (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext,
        )
      }

      // 每次压缩后重置，使 turnCounter/turnId 反映最近一次压缩。
      // recompactionInfo（autoCompact.ts:190）已在调用前捕获旧值用于 turnsSincePreviousCompact/previousCompactTurnId，
      // 因此此重置不会丢失这些信息。
      tracking = {
        compacted: true,
        turnId: deps.uuid(),
        turnCounter: 0,
        consecutiveFailures: 0,
      }

      const postCompactMessages = buildPostCompactMessages(compactionResult)

      for (const message of postCompactMessages) {
        yield message
      }

      // 使用压缩后的消息继续当前查询调用
      messagesForQuery = postCompactMessages
    } else if (consecutiveFailures !== undefined) {
      // 自动压缩失败 — 传播失败计数，以便熔断器在下次迭代时停止重试。
      tracking = {
        ...(tracking ?? { compacted: false, turnId: '', turnCounter: 0 }),
        consecutiveFailures,
      }
    }

    // TODO: 设置期间无需设置 toolUseContext.messages，因为此处已更新
    toolUseContext = {
      ...toolUseContext,
      messages: messagesForQuery,
    }

    const assistantMessages: AssistantMessage[] = []
    const toolResults: (UserMessage | AttachmentMessage)[] = []
    // @see https://docs.claude.com/en/docs/build-with-claude/tool-use
    // 注意：stop_reason === 'tool_use' 不可靠 —— 并非总是正确设置。
    // 在流式传输期间，每当有 tool_use 块到达时设置 —— 唯一的循环退出信号。
    // 若流式传输后为 false，则已完成（除 stop-hook 重试外）。
    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false

    queryCheckpoint('query_setup_start')
    const useStreamingToolExecution = config.gates.streamingToolExecution
    let streamingToolExecutor = useStreamingToolExecution
      ? new StreamingToolExecutor(
          toolUseContext.options.tools,
          canUseTool,
          toolUseContext,
        )
      : null

    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode
    let currentModel = getRuntimeMainLoopModel({
      permissionMode,
      mainLoopModel: toolUseContext.options.mainLoopModel,
      exceeds200kTokens:
        permissionMode === 'plan' &&
        doesMostRecentAssistantMessageExceed200k(messagesForQuery),
    })

    queryCheckpoint('query_setup_end')

    // 每个查询会话创建一次 fetch 包装器，避免内存滞留。
    // 每次调用 createDumpPromptsFetch 都会创建一个捕获请求体的闭包。
    // 仅创建一次意味着仅保留最新的请求体（约 700KB），而非会话中的所有请求体（长会话约 500MB）。
    // 注意：agentId 在 query() 调用期间实际上是常量 —— 仅在查询之间变化（例如 /clear 命令或会话恢复）。
    const dumpPromptsFetch = config.gates.isAnt
      ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)
      : undefined

    // 若已达硬性阻塞限制则阻止（仅当自动压缩关闭时适用）
    // 此举保留空间，以便用户仍可手动运行 /compact
    // 若刚刚发生压缩则跳过此检查 —— 压缩结果已验证低于阈值，且 tokenCountWithEstimation 会使用来自保留消息的陈旧 input_tokens，
    // 其反映的是压缩前的上下文大小。snip 同理：减去 snipTokensFreed（否则会在 snip 已将我们降至自动压缩阈值以下，
    // 但陈旧用量仍高于阻塞限制的窗口中错误地阻止 —— 在此 PR 之前该窗口从未存在，因为自动压缩始终基于陈旧计数触发）。
    // 对于 compact/session_memory 查询也跳过 —— 这些是继承了完整对话的分叉代理，若在此处阻止会死锁（压缩代理需要运行以降低令牌计数）。
    // 当响应式压缩启用且允许自动压缩时也跳过 —— 抢占式合成错误会在 API 调用前返回，因此响应式压缩将永远看不到可响应的 prompt-too-long。
    // 扩展至 walrus，以便 RC 在主动式失败时充当后备。
    //
    // 上下文折叠同理：其 recoverFromOverflow 在实际 API 413 时排空暂存折叠，然后回退至 reactiveCompact。
    // 在此处的合成抢占会在 API 调用前返回，使两条恢复路径都无法运行。isAutoCompactEnabled() 连接保留了用户明确的“不自动执行任何操作”配置 ——
    // 若用户设置了 DISABLE_AUTO_COMPACT，则会触发抢占。
    let collapseOwnsIt = false
    if (feature('CONTEXT_COLLAPSE')) {
      collapseOwnsIt =
        (contextCollapse?.isContextCollapseEnabled() ?? false) &&
        isAutoCompactEnabled()
    }
    // 每轮次提升一次媒体恢复门控。流内隐藏（stream loop 中）和恢复（之后）必须一致；
    // CACHED_MAY_BE_STALE 可能在 5-30 秒的流式传输期间翻转，隐藏而不恢复会丢弃消息。
    // PTL 不提升，因为其隐藏无门控 —— 它早于实验且已是控制臂基线。
    const mediaRecoveryEnabled =
      reactiveCompact?.isReactiveCompactEnabled() ?? false
    if (
      !compactionResult &&
      querySource !== 'compact' &&
      querySource !== 'session_memory' &&
      !(
        reactiveCompact?.isReactiveCompactEnabled() && isAutoCompactEnabled()
      ) &&
      !collapseOwnsIt
    ) {
      const { isAtBlockingLimit } = calculateTokenWarningState(
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed,
        toolUseContext.options.mainLoopModel,
      )
      if (isAtBlockingLimit) {
        yield createAssistantAPIErrorMessage({
          content: PROMPT_TOO_LONG_ERROR_MESSAGE,
          error: 'invalid_request',
        })
        return { reason: 'blocking_limit' }
      }
    }

    let attemptWithFallback = true

    queryCheckpoint('query_api_loop_start')
    try {
      while (attemptWithFallback) {
        attemptWithFallback = false
        try {
          let streamingFallbackOccured = false
          queryCheckpoint('query_api_streaming_start')
          for await (const message of deps.callModel({
            messages: prependUserContext(messagesForQuery, userContext),
            systemPrompt: fullSystemPrompt,
            thinkingConfig: toolUseContext.options.thinkingConfig,
            tools: toolUseContext.options.tools,
            signal: toolUseContext.abortController.signal,
            options: {
              async getToolPermissionContext() {
                const appState = toolUseContext.getAppState()
                return appState.toolPermissionContext
              },
              model: currentModel,
              ...(config.gates.fastModeEnabled && {
                fastMode: appState.fastMode,
              }),
              toolChoice: undefined,
              isNonInteractiveSession:
                toolUseContext.options.isNonInteractiveSession,
              fallbackModel,
              onStreamingFallback: () => {
                streamingFallbackOccured = true
              },
              querySource,
              agents: toolUseContext.options.agentDefinitions.activeAgents,
              allowedAgentTypes:
                toolUseContext.options.agentDefinitions.allowedAgentTypes,
              hasAppendSystemPrompt:
                !!toolUseContext.options.appendSystemPrompt,
              maxOutputTokensOverride,
              fetchOverride: dumpPromptsFetch,
              mcpTools: appState.mcp.tools,
              hasPendingMcpServers: appState.mcp.clients.some(
                c => c.type === 'pending',
              ),
              queryTracking,
              effortValue: appState.effortValue,
              advisorModel: appState.advisorModel,
              skipCacheWrite,
              agentId: toolUseContext.agentId,
              addNotification: toolUseContext.addNotification,
              ...(params.taskBudget && {
                taskBudget: {
                  total: params.taskBudget.total,
                  ...(taskBudgetRemaining !== undefined && {
                    remaining: taskBudgetRemaining,
                  }),
                },
              }),
            },
          })) {
            // 我们不会使用首次尝试中的 tool_calls
            // 也可以使用，但那样就得合并具有不同 ID 的助手消息，并加倍处理完整的 tool_results
            if (streamingFallbackOccured) {
              // 为孤立消息产出墓碑，使其从 UI 和记录中移除。
              // 这些部分消息（尤其是思考块）具有无效签名，会导致“思考块不可修改”的 API 错误。
              for (const msg of assistantMessages) {
                yield { type: 'tombstone' as const, message: msg }
              }
              logEvent('tengu_orphaned_messages_tombstoned', {
                orphanedMessageCount: assistantMessages.length,
                queryChainId: queryChainIdForAnalytics,
                queryDepth: queryTracking.depth,
              })

              assistantMessages.length = 0
              toolResults.length = 0
              toolUseBlocks.length = 0
              needsFollowUp = false

              // 丢弃失败流式尝试的待处理结果，并创建新的执行器。
              // 防止孤立的 tool_results（带有旧的 tool_use_ids）在回退响应到达后被产出。
              if (streamingToolExecutor) {
                streamingToolExecutor.discard()
                streamingToolExecutor = new StreamingToolExecutor(
                  toolUseContext.options.tools,
                  canUseTool,
                  toolUseContext,
                )
              }
            }
            // 在产出前，在克隆的消息上回填 tool_use 输入，以便 SDK 流输出和记录序列化能看到遗留/派生字段。
            // 原始 `message` 保持不变，用于下方的 assistantMessages.push —— 它流回 API，
            // 修改它会破坏提示缓存（字节不匹配）。
            let yieldMessage: typeof message = message
            if (message.type === 'assistant') {
              let clonedContent: typeof message.message.content | undefined
              for (let i = 0; i < message.message.content.length; i++) {
                const block = message.message.content[i]!
                if (
                  block.type === 'tool_use' &&
                  typeof block.input === 'object' &&
                  block.input !== null
                ) {
                  const tool = findToolByName(
                    toolUseContext.options.tools,
                    block.name,
                  )
                  if (tool?.backfillObservableInput) {
                    const originalInput = block.input as Record<string, unknown>
                    const inputCopy = { ...originalInput }
                    tool.backfillObservableInput(inputCopy)
                    // 仅当回填添加了字段时才产出克隆；若仅覆盖现有字段（例如文件工具扩展 file_path）则跳过。
                    // 覆盖会改变序列化的记录并破坏恢复时的 VCR 固定哈希，同时 SDK 流无需任何额外内容 ——
                    // 钩子通过 toolExecution.ts 单独获取扩展后的路径。
                    const addedFields = Object.keys(inputCopy).some(
                      k => !(k in originalInput),
                    )
                    if (addedFields) {
                      clonedContent ??= [...message.message.content]
                      clonedContent[i] = { ...block, input: inputCopy }
                    }
                  }
                }
              }
              if (clonedContent) {
                yieldMessage = {
                  ...message,
                  message: { ...message.message, content: clonedContent },
                }
              }
            }
            // 隐藏可恢复错误（prompt-too-long、max-output-tokens），直到明确恢复（折叠排空 / 响应式压缩 / 截断重试）能否成功。
            // 仍推入 assistantMessages，以便下方的恢复检查能找到它们。
            // 任一子系统的隐藏都足够 —— 它们是独立的，关闭其中一个不会破坏另一个的恢复路径。
            //
            // feature() 仅适用于 if/ternary 条件（bun:bundle 摇树约束），因此折叠检查采用嵌套而非组合。
            let withheld = false
            if (feature('CONTEXT_COLLAPSE')) {
              if (
                contextCollapse?.isWithheldPromptTooLong(
                  message,
                  isPromptTooLongMessage,
                  querySource,
                )
              ) {
                withheld = true
              }
            }
            if (reactiveCompact?.isWithheldPromptTooLong(message)) {
              withheld = true
            }
            if (
              mediaRecoveryEnabled &&
              reactiveCompact?.isWithheldMediaSizeError(message)
            ) {
              withheld = true
            }
            if (isWithheldMaxOutputTokens(message)) {
              withheld = true
            }
            if (!withheld) {
              yield yieldMessage
            }
            if (message.type === 'assistant') {
              assistantMessages.push(message)

              const msgToolUseBlocks = message.message.content.filter(
                content => content.type === 'tool_use',
              ) as ToolUseBlock[]
              if (msgToolUseBlocks.length > 0) {
                toolUseBlocks.push(...msgToolUseBlocks)
                needsFollowUp = true
              }

              if (
                streamingToolExecutor &&
                !toolUseContext.abortController.signal.aborted
              ) {
                for (const toolBlock of msgToolUseBlocks) {
                  streamingToolExecutor.addTool(toolBlock, message)
                }
              }
            }

            if (
              streamingToolExecutor &&
              !toolUseContext.abortController.signal.aborted
            ) {
              for (const result of streamingToolExecutor.getCompletedResults()) {
                if (result.message) {
                  yield result.message
                  toolResults.push(
                    ...normalizeMessagesForAPI(
                      [result.message],
                      toolUseContext.options.tools,
                    ).filter(_ => _.type === 'user'),
                  )
                }
              }
            }
          }
          queryCheckpoint('query_api_streaming_end')

          // 使用 API 报告的实际令牌删除数产出延迟的微压缩边界消息，而非客户端估算值。
          // 整个代码块通过 feature() 门控，确保被排除的字符串在外部构建中被消除。
          if (feature('CACHED_MICROCOMPACT') && pendingCacheEdits) {
            const lastAssistant = assistantMessages.at(-1)
            // API 字段是跨请求累积/粘滞的，因此我们减去本次请求前捕获的基线以得到增量。
            const usage = lastAssistant?.message.usage
            const cumulativeDeleted = usage
              ? ((usage as unknown as Record<string, number>)
                  .cache_deleted_input_tokens ?? 0)
              : 0
            const deletedTokens = Math.max(
              0,
              cumulativeDeleted - pendingCacheEdits.baselineCacheDeletedTokens,
            )
            if (deletedTokens > 0) {
              yield createMicrocompactBoundaryMessage(
                pendingCacheEdits.trigger,
                0,
                deletedTokens,
                pendingCacheEdits.deletedToolIds,
                [],
              )
            }
          }
        } catch (innerError) {
          if (innerError instanceof FallbackTriggeredError && fallbackModel) {
            // 回退已触发 - 切换模型并重试
            currentModel = fallbackModel
            attemptWithFallback = true

            // 清除助手消息，因为我们将重试整个请求
            yield* yieldMissingToolResultBlocks(
              assistantMessages,
              '模型回退已触发',
            )
            assistantMessages.length = 0
            toolResults.length = 0
            toolUseBlocks.length = 0
            needsFollowUp = false

            // 丢弃失败尝试的待处理结果，并创建新的执行器。
            // 防止孤立的 tool_results（带有旧的 tool_use_ids）泄露到重试中。
            if (streamingToolExecutor) {
              streamingToolExecutor.discard()
              streamingToolExecutor = new StreamingToolExecutor(
                toolUseContext.options.tools,
                canUseTool,
                toolUseContext,
              )
            }

            // 使用新模型更新工具使用上下文
            toolUseContext.options.mainLoopModel = fallbackModel

            // 思考签名与模型绑定：将受保护思考块（如 capybara）重放给未受保护的回退模型（如 opus）会导致 400 错误。
            // 重试前剥离，以便回退模型获得干净的历史记录。
            if (process.env.USER_TYPE === 'ant') {
              messagesForQuery = stripSignatureBlocks(messagesForQuery)
            }

            // 记录回退事件
            logEvent('tengu_model_fallback_triggered', {
              original_model:
                innerError.originalModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fallback_model:
                fallbackModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              entrypoint:
                'cli' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              queryChainId: queryChainIdForAnalytics,
              queryDepth: queryTracking.depth,
            })

            // 产出关于回退的系统消息 —— 使用 'warning' 级别，以便用户无需 verbose 模式即可看到通知
            yield createSystemMessage(
              `由于 ${renderModelName(innerError.originalModel)} 需求过高，已切换至 ${renderModelName(innerError.fallbackModel)}`,
              'warning',
            )

            continue
          }
          throw innerError
        }
      }
    } catch (error) {
      logError(error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logEvent('tengu_query_error', {
        assistantMessages: assistantMessages.length,
        toolUses: assistantMessages.flatMap(_ =>
          _.message.content.filter(content => content.type === 'tool_use'),
        ).length,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // 用友好的消息处理图像大小/调整错误
      if (
        error instanceof ImageSizeError ||
        error instanceof ImageResizeError
      ) {
        yield createAssistantAPIErrorMessage({
          content: error.message,
        })
        return { reason: 'image_error' }
      }

      // 通常 queryModelWithStreaming 不应抛出错误，而是将其作为合成的助手消息产出。
      // 但若因 bug 导致抛出，我们可能处于已产出 tool_use 块但会在产出 tool_result 前停止的状态。
      yield* yieldMissingToolResultBlocks(assistantMessages, errorMessage)

      // 展示真实错误，而非误导性的“[请求被用户中断]”——此路径是模型/运行时故障，而非用户操作。
      // SDK 消费者在例如 Node 18 缺少 Array.prototype.with() 时看到的是虚假中断，掩盖了实际原因。
      yield createAssistantAPIErrorMessage({
        content: errorMessage,
      })

      // 为帮助追踪 bug，对蚂蚁大声记录
      logAntError('查询错误', error)
      return { reason: 'model_error', error }
    }

    // 模型响应完成后执行后采样钩子
    if (assistantMessages.length > 0) {
      void executePostSamplingHooks(
        [...messagesForQuery, ...assistantMessages],
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
      )
    }

    // 我们需要在其他操作之前处理流式中止。
    // 使用 streamingToolExecutor 时，必须消费 getRemainingResults()，以便执行器能为排队/进行中的工具生成合成 tool_result 块。
    // 否则 tool_use 块将缺少匹配的 tool_result 块。
    if (toolUseContext.abortController.signal.aborted) {
      if (streamingToolExecutor) {
        // 消费剩余结果 —— 执行器会为中途中止的工具生成合成 tool_results，因为它在 executeTool() 中检查中止信号
        for await (const update of streamingToolExecutor.getRemainingResults()) {
          if (update.message) {
            yield update.message
          }
        }
      } else {
        yield* yieldMissingToolResultBlocks(
          assistantMessages,
          '被用户中断',
        )
      }
      // chicago MCP：中断时自动取消隐藏 + 释放锁。与 stopHooks.ts 中的自然轮次结束路径相同的清理逻辑。
      // 仅主线程 —— 关于子代理释放主线程锁的理由参见 stopHooks.ts。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 失败时静默 —— 这是内部试用清理，非关键路径
        }
      }

      // 对于提交中断跳过中断消息 —— 紧随其后的排队用户消息已提供足够上下文。
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: false,
        })
      }
      return { reason: 'aborted_streaming' }
    }

    // 产出上一轮次的工具使用摘要 —— haiku 调用（约 1 秒）在模型流式输出期间（5-30 秒）已解析完成
    if (pendingToolUseSummary) {
      const summaryStart = Date.now()
      const summary = await pendingToolUseSummary
      const summaryDuration = Date.now() - summaryStart
      
      if (summaryDuration > 1000) {
        logEvent('tengu_slow_tool_summary', {
          duration_ms: summaryDuration,
        })
      }
      
      if (summary) {
        yield summary
      }
    }

    if (!needsFollowUp) {
      const lastMessage = assistantMessages.at(-1)

      // 检测模型返回空内容的情况
      if (lastMessage?.type === 'assistant' && !lastMessage.isApiErrorMessage) {
        const emptyContentResult = handleEmptyContentResponse(
          lastMessage,
          queryChainIdForAnalytics,
          queryTracking.depth,
        )

        if (emptyContentResult.isEmptyContent) {
          // 向用户显示警告信息和选择提示
          for (const warning of emptyContentResult.warnings) {
            yield warning
          }

          // 返回特殊状态，标记需要用户确认是否重试
          return { 
            reason: 'empty_content', 
            finishReason: emptyContentResult.finishReason,
            canRetry: true 
          }
        }
      }

      // 提示过长恢复：流式循环隐藏了错误（参见上方 withheldByCollapse / withheldByReactive）。
      // 先尝试折叠排空（廉价，保留细粒度上下文），然后尝试响应式压缩（完整摘要）。
      // 每种仅尝试一次 —— 若重试仍返回 413，下一阶段处理或错误浮出。
      const isWithheld413 =
        lastMessage?.type === 'assistant' &&
        lastMessage.isApiErrorMessage &&
        isPromptTooLongMessage(lastMessage)
      // 媒体大小拒绝（图像/PDF/多图像）可通过响应式压缩的剥离重试恢复。
      // 与 PTL 不同，媒体错误跳过折叠排空 —— 折叠不会剥离图像。mediaRecoveryEnabled 是流循环前提升的门控
      // （与隐藏检查的值相同 —— 二者必须一致，否则隐藏的消息会丢失）。
      // 若超大媒体位于保留尾部中，压缩后的轮次仍会再次触发媒体错误；hasAttemptedReactiveCompact 防止螺旋并使错误浮出。
      const isWithheldMedia =
        mediaRecoveryEnabled &&
        reactiveCompact?.isWithheldMediaSizeError(lastMessage)
      if (isWithheld413) {
        // 第一步：排空所有暂存的上下文折叠。通过检查上一次转换不是 collapse_drain_retry 进行门控 ——
        // 若已排空且重试仍返回 413，则落入响应式压缩。
        if (
          feature('CONTEXT_COLLAPSE') &&
          contextCollapse &&
          state.transition?.reason !== 'collapse_drain_retry'
        ) {
          const drained = contextCollapse.recoverFromOverflow(
            messagesForQuery,
            querySource,
          )
          if (drained.committed > 0) {
            const next: State = {
              messages: drained.messages,
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount,
              transition: {
                reason: 'collapse_drain_retry',
                committed: drained.committed,
              },
            }
            state = next
            continue
          }
        }
      }
      if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
        const compacted = await reactiveCompact.tryReactiveCompact({
          hasAttempted: hasAttemptedReactiveCompact,
          querySource,
          aborted: toolUseContext.abortController.signal.aborted,
          messages: messagesForQuery,
          cacheSafeParams: {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
          },
        })

        if (compacted) {
          // task_budget：与上方主动路径相同的结转逻辑。
          // messagesForQuery 在此处仍持有压缩前的数组（413 失败尝试的输入）。
          if (params.taskBudget) {
            const preCompactContext =
              finalContextTokensFromLastResponse(messagesForQuery)
            taskBudgetRemaining = Math.max(
              0,
              (taskBudgetRemaining ?? params.taskBudget.total) -
                preCompactContext,
            )
          }

          const postCompactMessages = buildPostCompactMessages(compacted)
          for (const msg of postCompactMessages) {
            yield msg
          }
          const next: State = {
            messages: postCompactMessages,
            toolUseContext,
            autoCompactTracking: undefined,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact: true,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'reactive_compact_retry' },
          }
          state = next
          continue
        }

        // 无法恢复 —— 现在浮出隐藏的错误并退出。不要落入停止钩子：
        // 模型从未产生有效响应，因此钩子无任何有意义的内容可评估。
        // 在提示过长时运行停止钩子会造成死亡螺旋：错误 → 钩子阻塞 → 重试 → 错误 → …（钩子每周期注入更多令牌）。
        yield lastMessage
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: isWithheldMedia ? 'image_error' : 'prompt_too_long' }
      } else if (feature('CONTEXT_COLLAPSE') && isWithheld413) {
        // reactiveCompact 被编译剔除，但 contextCollapse 隐藏了且无法恢复（暂存队列空/过时）。浮出错误。
        // 相同的提前返回理由 —— 不要落入停止钩子。
        yield lastMessage
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: 'prompt_too_long' }
      }

      // 检查 max_output_tokens 并注入恢复消息。该错误已在流中隐藏；仅在恢复耗尽时浮出。
      if (isWithheldMaxOutputTokens(lastMessage)) {
        // 递增重试：若我们使用了受限的 8k 默认值并触及上限，则以 64k 重试**相同**请求 ——
        // 无元消息，无多轮次舞蹈。此操作每轮次触发一次（由覆盖检查保护），
        // 然后若 64k 仍触及上限，则落入多轮次恢复。
        // 3P 默认：false（未在 Bedrock/Vertex 上验证）
        const capEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_otk_slot_v1',
          false,
        )
        if (
          capEnabled &&
          maxOutputTokensOverride === undefined &&
          !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
        ) {
          logEvent('tengu_max_tokens_escalate', {
            escalatedTo: ESCALATED_MAX_TOKENS,
          })
          const next: State = {
            messages: messagesForQuery,
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'max_output_tokens_escalate' },
          }
          state = next
          continue
        }

        if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
          const recoveryMessage = createUserMessage({
            content:
              `已达到输出令牌限制。请直接继续 —— 无需道歉，也无需重述你正在做什么。` +
              `若截断发生在思考中途，请从中断处继续。将剩余工作拆分为更小的部分。`,
            isMeta: true,
          })

          const next: State = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              recoveryMessage,
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: {
              reason: 'max_output_tokens_recovery',
              attempt: maxOutputTokensRecoveryCount + 1,
            },
          }
          state = next
          continue
        }

        // 恢复耗尽 —— 现在浮出隐藏的错误。
        yield lastMessage
      }

      // 当最后一条消息为 API 错误时跳过停止钩子（速率限制、提示过长、认证失败等）。
      // 模型从未产生真实响应 —— 对其评估的钩子会造成死亡螺旋：错误 → 钩子阻塞 → 重试 → 错误 → …
      if (lastMessage?.isApiErrorMessage) {
        void executeStopFailureHooks(lastMessage, toolUseContext)
        // 播放错误提示音
        playTaskCompleteSound()
        return { reason: 'completed' }
      }

      const stopHookResult = yield* handleStopHooks(
        messagesForQuery,
        assistantMessages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
        stopHookActive,
      )

      if (stopHookResult.preventContinuation) {
        return { reason: 'stop_hook_prevented' }
      }

      if (stopHookResult.blockingErrors.length > 0) {
        const next: State = {
          messages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...stopHookResult.blockingErrors,
          ],
          toolUseContext,
          autoCompactTracking: tracking,
          maxOutputTokensRecoveryCount: 0,
          // 保留响应式压缩守卫 —— 若压缩已运行且无法从提示过长恢复，
          // 在停止钩子阻塞错误后重试将产生相同结果。将此处置为 false 曾导致无限循环：
          // 压缩 → 仍过长 → 错误 → 停止钩子阻塞 → 压缩 → … 消耗数千次 API 调用。
          hasAttemptedReactiveCompact,
          maxOutputTokensOverride: undefined,
          pendingToolUseSummary: undefined,
          stopHookActive: true,
          turnCount,
          transition: { reason: 'stop_hook_blocking' },
        }
        state = next
        continue
      }

      if (feature('TOKEN_BUDGET')) {
        const decision = checkTokenBudget(
          budgetTracker!,
          toolUseContext.agentId,
          getCurrentTurnTokenBudget(),
          getTurnOutputTokens(),
        )

        if (decision.action === 'continue') {
          incrementBudgetContinuationCount()
          logForDebugging(
            `令牌预算续期 #${decision.continuationCount}: ${decision.pct}% (${decision.turnTokens.toLocaleString()} / ${decision.budget.toLocaleString()})`,
          )
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              createUserMessage({
                content: decision.nudgeMessage,
                isMeta: true,
              }),
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'token_budget_continuation' },
          }
          continue
        }

        if (decision.completionEvent) {
          if (decision.completionEvent.diminishingReturns) {
            logForDebugging(
              `令牌预算提前停止: 在 ${decision.completionEvent.pct}% 处收益递减`,
            )
          }
          logEvent('tengu_token_budget_completed', {
            ...decision.completionEvent,
            queryChainId: queryChainIdForAnalytics,
            queryDepth: queryTracking.depth,
          })
        }
      }

      // 任务正常完成，播放完成提示音
      playTaskCompleteSound()
      return { reason: 'completed' }
    }

    let shouldPreventContinuation = false
    let updatedToolUseContext = toolUseContext

    queryCheckpoint('query_tool_execution_start')


    if (streamingToolExecutor) {
      logEvent('tengu_streaming_tool_execution_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    } else {
      logEvent('tengu_streaming_tool_execution_not_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    const toolUpdates = streamingToolExecutor
      ? streamingToolExecutor.getRemainingResults()
      : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

    for await (const update of toolUpdates) {
      if (update.message) {
        yield update.message

        if (
          update.message.type === 'attachment' &&
          update.message.attachment.type === 'hook_stopped_continuation'
        ) {
          shouldPreventContinuation = true
        }

        toolResults.push(
          ...normalizeMessagesForAPI(
            [update.message],
            toolUseContext.options.tools,
          ).filter(_ => _.type === 'user'),
        )
      }
      if (update.newContext) {
        updatedToolUseContext = {
          ...update.newContext,
          queryTracking,
        }
      }
    }
    queryCheckpoint('query_tool_execution_end')

    // 工具批次完成后生成工具使用摘要 — 传递给下一次递归调用
    let nextPendingToolUseSummary:
      | Promise<ToolUseSummaryMessage | null>
      | undefined
    if (
      config.gates.emitToolUseSummaries &&
      toolUseBlocks.length > 0 &&
      !toolUseContext.abortController.signal.aborted &&
      !toolUseContext.agentId // 子代理不在移动 UI 中显示 — 跳过 Haiku 调用
    ) {
      // 提取最后一条助手文本块作为上下文
      const lastAssistantMessage = assistantMessages.at(-1)
      let lastAssistantText: string | undefined
      if (lastAssistantMessage) {
        const textBlocks = lastAssistantMessage.message.content.filter(
          block => block.type === 'text',
        )
        if (textBlocks.length > 0) {
          const lastTextBlock = textBlocks.at(-1)
          if (lastTextBlock && 'text' in lastTextBlock) {
            lastAssistantText = lastTextBlock.text
          }
        }
      }

      // 收集工具信息用于生成摘要
      const toolUseIds = toolUseBlocks.map(block => block.id)
      const toolInfoForSummary = toolUseBlocks.map(block => {
        // 查找对应的工具结果
        const toolResult = toolResults.find(
          result =>
            result.type === 'user' &&
            Array.isArray(result.message.content) &&
            result.message.content.some(
              content =>
                content.type === 'tool_result' &&
                content.tool_use_id === block.id,
            ),
        )
        const resultContent =
          toolResult?.type === 'user' &&
          Array.isArray(toolResult.message.content)
            ? toolResult.message.content.find(
                (c): c is ToolResultBlockParam =>
                  c.type === 'tool_result' && c.tool_use_id === block.id,
              )
            : undefined
        return {
          name: block.name,
          input: block.input,
          output:
            resultContent && 'content' in resultContent
              ? resultContent.content
              : null,
        }
      })

      // 启动摘要生成，不阻塞下一次 API 调用
      nextPendingToolUseSummary = generateToolUseSummary({
        tools: toolInfoForSummary,
        signal: toolUseContext.abortController.signal,
        isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
        lastAssistantText,
      })
        .then(summary => {
          if (summary) {
            return createToolUseSummaryMessage(summary, toolUseIds)
          }
          return null
        })
        .catch(() => null)
    }

    // 在工具调用期间被中止
    if (toolUseContext.abortController.signal.aborted) {
      // chicago MCP：在工具调用中途被中止时自动取消隐藏 + 释放锁。
      // 这是 CU 最可能的 Ctrl+C 路径（例如截图缓慢）。仅主线程 — 子代理理由见 stopHooks.ts。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 失败时静默 — 这是内部试用清理，非关键路径
        }
      }
      // 对于提交中断跳过中断消息 — 紧随其后的排队用户消息已提供足够上下文。
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: true,
        })
      }
      // 中止时检查 maxTurns 再返回
      const nextTurnCountOnAbort = turnCount + 1
      if (maxTurns && nextTurnCountOnAbort > maxTurns) {
        yield createAttachmentMessage({
          type: 'max_turns_reached',
          maxTurns,
          turnCount: nextTurnCountOnAbort,
        })
      }
      return { reason: 'aborted_tools' }
    }

    // 若钩子指示阻止继续，则在此停止
    if (shouldPreventContinuation) {
      return { reason: 'hook_stopped' }
    }

    if (tracking?.compacted) {
      tracking.turnCounter++
      logEvent('tengu_post_autocompact_turn', {
        turnId:
          tracking.turnId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        turnCounter: tracking.turnCounter,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    // 注意在工具调用完成后再做此操作，因为 API 会在 tool_result 消息与常规用户消息交错时报错。

    // 埋点：附件添加前跟踪消息数量
    logEvent('tengu_query_before_attachments', {
      messagesForQueryCount: messagesForQuery.length,
      assistantMessagesCount: assistantMessages.length,
      toolResultsCount: toolResults.length,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 在附件处理前获取排队命令快照。
    // 这些命令将作为附件发送，以便 Claude 在当前轮次中响应。
    //
    // 排空待处理通知。LocalShellTask 完成时为 'next'（当 MONITOR_TOOL 开启时），且无需 Sleep 即可排空。
    // 其他任务类型（agent/workflow/framework）仍默认为 'later' — Sleep 冲刷会覆盖这些。
    // 若所有任务类型都迁移至 'next'，此分支可能被移除。
    //
    // 斜杠命令被排除在轮次中途排空之外 — 它们必须通过轮次结束后的 processSlashCommand 处理（经由 useQueueProcessor），
    // 而非作为文本发送给模型。Bash 模式命令已通过 getQueuedCommandAttachments 中的 INLINE_NOTIFICATION_MODES 被排除。
    //
    // 代理作用域：队列是协调器及所有进程内子代理共享的进程全局单例。
    // 每个循环仅排空发送给自身的命令 — 主线程排空 agentId===undefined，子代理排空各自的 agentId。
    // 用户提示（mode:'prompt'）仍仅发送给主线程；子代理永远看不到提示流。
    // eslint-disable-next-line custom-rules/require-tool-match-name -- ToolUseBlock.name 无别名
    const sleepRan = toolUseBlocks.some(b => b.name === SLEEP_TOOL_NAME)
    const isMainThread =
      querySource.startsWith('repl_main_thread') || querySource === 'sdk'
    const currentAgentId = toolUseContext.agentId
    const queuedCommandsSnapshot = getCommandsByMaxPriority(
      sleepRan ? 'later' : 'next',
    ).filter(cmd => {
      if (isSlashCommand(cmd)) return false
      if (isMainThread) return cmd.agentId === undefined
      // 子代理仅排空发送给它们的任务通知 — 即使用户提示被标记了 agentId 也绝不处理。
      return cmd.mode === 'task-notification' && cmd.agentId === currentAgentId
    })

    for await (const attachment of getAttachmentMessages(
      null,
      updatedToolUseContext,
      null,
      queuedCommandsSnapshot,
      [...messagesForQuery, ...assistantMessages, ...toolResults],
      querySource,
    )) {
      yield attachment
      toolResults.push(attachment)
    }

    // 内存预取消费：仅当已解决且未在较早迭代中被消费时进行。
    // 若尚未解决，则跳过（零等待）并在下一次迭代重试 — 预取有与轮次结束前迭代次数一样多的机会。
    // readFileState（跨迭代累积）会过滤掉模型已读取/写入/编辑的内存 — 包括较早迭代中的，
    // 这是每迭代的 toolUseBlocks 数组无法覆盖的。
    if (
      pendingMemoryPrefetch &&
      pendingMemoryPrefetch.settledAt !== null &&
      pendingMemoryPrefetch.consumedOnIteration === -1
    ) {
      const memoryPrefetchStart = Date.now()
      const memoryAttachments = filterDuplicateMemoryAttachments(
        await pendingMemoryPrefetch.promise,
        toolUseContext.readFileState,
      )
      const memoryPrefetchDuration = Date.now() - memoryPrefetchStart
      
      if (memoryPrefetchDuration > 1000) {
        logEvent('tengu_slow_memory_prefetch', {
          duration_ms: memoryPrefetchDuration,
        })
      }
      
      for (const memAttachment of memoryAttachments) {
        const msg = createAttachmentMessage(memAttachment)
        yield msg
        toolResults.push(msg)
      }
      pendingMemoryPrefetch.consumedOnIteration = turnCount - 1
    }


    // 注入预取的技能发现。collectSkillDiscoveryPrefetch 发出 hidden_by_main_turn —
    // 当预取在此点之前解析时为 true（在 AKI@250ms / Haiku@573ms 对比 2-30 秒的轮次持续时间下应 >98%）。
    if (skillPrefetch && pendingSkillPrefetch) {
      const skillAttachments =
        await skillPrefetch.collectSkillDiscoveryPrefetch(pendingSkillPrefetch)
      for (const att of skillAttachments) {
        const msg = createAttachmentMessage(att)
        yield msg
        toolResults.push(msg)
      }
    }

    // 仅移除实际作为附件被消费的命令。
    // 提示和任务通知命令在上方被转换为附件。
    const consumedCommands = queuedCommandsSnapshot.filter(
      cmd => cmd.mode === 'prompt' || cmd.mode === 'task-notification',
    )
    if (consumedCommands.length > 0) {
      for (const cmd of consumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(consumedCommands)
    }

    // 埋点：附件添加后跟踪文件变更附件数量
    const fileChangeAttachmentCount = count(
      toolResults,
      tr =>
        tr.type === 'attachment' && tr.attachment.type === 'edited_text_file',
    )

    logEvent('tengu_query_after_attachments', {
      totalToolResultsCount: toolResults.length,
      fileChangeAttachmentCount,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 在轮次之间刷新工具，使新连接的 MCP 服务器变为可用
    if (updatedToolUseContext.options.refreshTools) {
      const refreshedTools = updatedToolUseContext.options.refreshTools()
      if (refreshedTools !== updatedToolUseContext.options.tools) {
        updatedToolUseContext = {
          ...updatedToolUseContext,
          options: {
            ...updatedToolUseContext.options,
            tools: refreshedTools,
          },
        }
      }
    }

    const toolUseContextWithQueryTracking = {
      ...updatedToolUseContext,
      queryTracking,
    }

    // 每次有工具结果并准备递归时，即为一次轮次
    const nextTurnCount = turnCount + 1

    // 为 `claude ps` 生成定期任务摘要 — 在轮次中途触发，以便长时间运行的代理仍能刷新其工作内容。
    // 仅对 !agentId 进行门控，因此每个顶级对话（REPL、SDK、HFI、远程）都会生成摘要；子代理/分叉不生成。
    if (feature('BG_SESSIONS')) {
      if (
        !toolUseContext.agentId &&
        taskSummaryModule!.shouldGenerateTaskSummary()
      ) {
        taskSummaryModule!.maybeGenerateTaskSummary({
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          forkContextMessages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...toolResults,
          ],
        })
      }
    }

    // 检查是否已达最大轮数限制
    if (maxTurns && nextTurnCount > maxTurns) {
      yield createAttachmentMessage({
        type: 'max_turns_reached',
        maxTurns,
        turnCount: nextTurnCount,
      })
      return { reason: 'max_turns', turnCount: nextTurnCount }
    }

    queryCheckpoint('query_recursive_call')
    const next: State = {
      messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
      toolUseContext: toolUseContextWithQueryTracking,
      autoCompactTracking: tracking,
      turnCount: nextTurnCount,
      maxOutputTokensRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
      pendingToolUseSummary: nextPendingToolUseSummary,
      maxOutputTokensOverride: undefined,
      stopHookActive,
      transition: { reason: 'next_turn' },
    }
    state = next
  } // while (true)
}