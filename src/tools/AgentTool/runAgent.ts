import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'
import { logForDebugging } from '../../utils/debug.js'
import { getProjectRoot, getSessionId } from '../../bootstrap/state.js'
import { getCommand, getSkillToolCommands, hasCommand } from '../../commands.js'
import {
  DEFAULT_AGENT_PROMPT,
  enhanceSystemPromptWithEnvDetails,
} from '../../constants/prompts.js'
import type { QuerySource } from '../../constants/querySource.js'
import { getSystemContext, getUserContext } from '../../context.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { query } from '../../query.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getDumpPromptsPath } from '../../services/api/dumpPrompts.js'
import { cleanupAgentTracking } from '../../services/api/promptCacheBreakDetection.js'
import {
  connectToServer,
  fetchToolsForClient,
} from '../../services/mcp/client.js'
import { getMcpConfigByName } from '../../services/mcp/config.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'
import type { Tool, Tools, ToolUseContext } from '../../Tool.js'
import { killShellTasksForAgent } from '../../tasks/LocalShellTask/killShellTasks.js'
import type { Command } from '../../types/command.js'
import type { AgentId } from '../../types/ids.js'
import type {
  AssistantMessage,
  Message,
  ProgressMessage,
  RequestStartEvent,
  StreamEvent,
  SystemCompactBoundaryMessage,
  TombstoneMessage,
  ToolUseSummaryMessage,
  UserMessage,
} from '../../types/message.js'
import { createAttachmentMessage } from '../../utils/attachments.js'
import { AbortError } from '../../utils/errors.js'
import { getDisplayPath } from '../../utils/file.js'
import {
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from '../../utils/fileStateCache.js'
import {
  type CacheSafeParams,
  createSubagentContext,
} from '../../utils/forkedAgent.js'
import { registerFrontmatterHooks } from '../../utils/hooks/registerFrontmatterHooks.js'
import { clearSessionHooks } from '../../utils/hooks/sessionHooks.js'
import { executeSubagentStartHooks } from '../../utils/hooks.js'
import { createUserMessage } from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import type { ModelAlias } from '../../utils/model/aliases.js'
import {
  clearAgentTranscriptSubdir,
  recordSidechainTranscript,
  setAgentTranscriptSubdir,
  writeAgentMetadata,
} from '../../utils/sessionStorage.js'
import {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted,
} from '../../utils/settings/pluginOnlyPolicy.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from '../../utils/systemPromptType.js'
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent,
} from '../../utils/telemetry/perfettoTracing.js'
import type { ContentReplacementState } from '../../utils/toolResultStorage.js'
import { createAgentId } from '../../utils/uuid.js'
import { resolveAgentTools } from './agentToolUtils.js'
import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'

/**
 * 初始化代理专用的 MCP 服务器
 * 代理可以在其 frontmatter 中定义自己的 MCP 服务器，这些服务器是对父级 MCP 客户端的补充。
 * 这些服务器在代理启动时连接，并在代理完成时清理。
 *
 * @param agentDefinition 代理定义，可包含可选的 mcpServers
 * @param parentClients 从父上下文继承的 MCP 客户端
 * @returns 合并后的客户端（父级 + 代理专用）、代理 MCP 工具和清理函数
 */
async function initializeAgentMcpServers(
  agentDefinition: AgentDefinition,
  parentClients: MCPServerConnection[],
): Promise<{
  clients: MCPServerConnection[]
  tools: Tools
  cleanup: () => Promise<void>
}> {
  // 如果未定义代理专用服务器，则直接返回父级客户端
  if (!agentDefinition.mcpServers?.length) {
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  // 当 MCP 被锁定为仅插件时，仅对用户控制的代理跳过 frontmatter MCP 服务器。
  // 插件、内置和 policySettings 代理受管理员信任——它们的 frontmatter MCP
  // 是管理员批准的一部分。阻止它们（如最初的做法）会破坏需要 MCP 的
  // 插件代理，这与“插件提供始终加载”的原则相悖。
  const agentIsAdminTrusted = isSourceAdminTrusted(agentDefinition.source)
  if (isRestrictedToPluginOnly('mcp') && !agentIsAdminTrusted) {
    logForDebugging(
      `[Agent: ${agentDefinition.agentType}] Skipping MCP servers: strictPluginOnlyCustomization locks MCP to plugin-only (agent source: ${agentDefinition.source})`,
    )
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  const agentClients: MCPServerConnection[] = []
  // 追踪哪些客户端是新创建的（内联定义）而非从父级共享的
  // 只有在代理完成时应清理新创建的客户端
  const newlyCreatedClients: MCPServerConnection[] = []
  const agentTools: Tool[] = []

  for (const spec of agentDefinition.mcpServers) {
    let config: ScopedMcpServerConfig | null = null
    let name: string
    let isNewlyCreated = false

    if (typeof spec === 'string') {
      // 按名称引用——在现有 MCP 配置中查找
      // 这使用缓存化的 connectToServer，因此可能获取共享客户端
      name = spec
      config = getMcpConfigByName(spec)
      if (!config) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] MCP server not found: ${spec}`,
          { level: 'warn' },
        )
        continue
      }
    } else {
      // 内联定义为 { [name]: config }
      // 这些是应清理的代理专用服务器
      const entries = Object.entries(spec)
      if (entries.length !== 1) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Invalid MCP server spec: expected exactly one key`,
          { level: 'warn' },
        )
        continue
      }
      const [serverName, serverConfig] = entries[0]!
      name = serverName
      config = {
        ...serverConfig,
        scope: 'dynamic' as const,
      } as ScopedMcpServerConfig
      isNewlyCreated = true
    }

    // 连接到服务器
    const client = await connectToServer(name, config)
    agentClients.push(client)
    if (isNewlyCreated) {
      newlyCreatedClients.push(client)
    }

    // 如果已连接则获取工具
    if (client.type === 'connected') {
      const tools = await fetchToolsForClient(client)
      agentTools.push(...tools)
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Connected to MCP server '${name}' with ${tools.length} tools`,
      )
    } else {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Failed to connect to MCP server '${name}': ${client.type}`,
        { level: 'warn' },
      )
    }
  }

  // 创建代理专用服务器的清理函数
  // 仅清理新创建的客户端（内联定义），不清理共享/引用的客户端
  // 共享客户端（通过字符串名称引用）已缓存化，由父上下文使用
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      if (client.type === 'connected') {
        try {
          await client.cleanup()
        } catch (error) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Error cleaning up MCP server '${client.name}': ${error}`,
            { level: 'warn' },
          )
        }
      }
    }
  }

  // 返回合并后的客户端（父级 + 代理专用）和代理工具
  return {
    clients: [...parentClients, ...agentClients],
    tools: agentTools,
    cleanup,
  }
}

type QueryMessage =
  | StreamEvent
  | RequestStartEvent
  | Message
  | ToolUseSummaryMessage
  | TombstoneMessage

/**
 * 类型守卫，检查来自 query() 的消息是否为可记录的 Message 类型。
 * 匹配我们想要记录的类型：assistant、user、progress 或 system compact_boundary。
 */
function isRecordableMessage(
  msg: QueryMessage,
): msg is
  | AssistantMessage
  | UserMessage
  | ProgressMessage
  | SystemCompactBoundaryMessage {
  return (
    msg.type === 'assistant' ||
    msg.type === 'user' ||
    msg.type === 'progress' ||
    (msg.type === 'system' &&
      'subtype' in msg &&
      msg.subtype === 'compact_boundary')
  )
}

export async function* runAgent({
  agentDefinition,
  promptMessages,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  override,
  model,
  maxTurns,
  preserveToolUseResults,
  availableTools,
  allowedTools,
  onCacheSafeParams,
  contentReplacementState,
  useExactTools,
  worktreePath,
  description,
  transcriptSubdir,
  onQueryProgress,
}: {
  agentDefinition: AgentDefinition
  promptMessages: Message[]
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  isAsync: boolean
  /** 此代理是否可以显示权限提示。默认为 !isAsync。
   * 对于进程内协作者（异步但共享终端）设置为 true。 */
  canShowPermissionPrompts?: boolean
  forkContextMessages?: Message[]
  querySource: QuerySource
  override?: {
    userContext?: { [k: string]: string }
    systemContext?: { [k: string]: string }
    systemPrompt?: SystemPrompt
    abortController?: AbortController
    agentId?: AgentId
  }
  model?: ModelAlias
  maxTurns?: number
  /** 在消息上保留 toolUseResult，用于具有可视转录的子代理 */
  preserveToolUseResults?: boolean
  /** 为工作代理预计算的工具池。由调用者（AgentTool.tsx）计算，
   * 以避免 runAgent 和 tools.ts 之间的循环依赖。
   * 始终包含按工作代理自身权限模式组装的完整工具池，
   * 独立于父级的工具限制。 */
  availableTools: Tools
  /** 要添加到代理会话允许规则中的工具权限规则。
   * 当提供时，替换所有允许规则，使代理仅拥有
   * 显式列出的内容（父级批准不会泄漏）。 */
  allowedTools?: string[]
  /** 在构造代理的系统提示、上下文和工具后，使用 CacheSafeParams 调用的可选回调。
   * 由后台摘要用于分叉代理的对话以实现定期进度总结。 */
  onCacheSafeParams?: (params: CacheSafeParams) => void
  /** 从恢复的旁链转录重建的替换状态，以便相同的工具结果被重新替换
   *（提示缓存稳定性）。当省略时，createSubagentContext 克隆父级的状态。 */
  contentReplacementState?: ContentReplacementState
  /** 当为 true 时，直接使用 availableTools 而不通过 resolveAgentTools() 过滤。
   * 同时继承父级的 thinkingConfig 和 isNonInteractiveSession 而非覆盖它们。
   * 由 fork 子代理路径使用，以生成字节完全相同的 API 请求前缀，
   * 从而实现提示缓存命中。 */
  useExactTools?: boolean
  /** 如果代理以 isolation: "worktree" 方式生成，则为工作树路径。
   * 持久化到元数据，以便 resume 可以恢复正确的 cwd。 */
  worktreePath?: string
  /** 来自 AgentTool 输入的原始任务描述。持久化到元数据，
   * 以便恢复的代理通知可以显示原始描述。 */
  description?: string
  /** subagents/ 下的可选子目录，用于将代理的转录与相关转录分组
   *（例如，工作流子代理的 workflows/<runId>）。 */
  transcriptSubdir?: string
  /** 可选回调，在 query() 生成的每条消息上触发——包括 runAgent 通常丢弃的
   * stream_event 增量。用于在超过 60 秒没有 assistant 消息的长单块流
   *（例如思考过程）期间检测活跃性。 */
  onQueryProgress?: () => void
}): AsyncGenerator<Message, void> {
  // 追踪子代理使用情况以进行功能发现

  const appState = toolUseContext.getAppState()
  const permissionMode = appState.toolPermissionContext.mode
  // 始终共享到根 AppState 存储的通道。当父级本身是异步代理时（嵌套 async→async），
  // toolUseContext.setAppState 是空操作，因此会话范围写入（hooks、bash 任务）
  // 必须通过此通道进行。
  const rootSetAppState =
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState

  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    toolUseContext.options.mainLoopModel,
    model,
    permissionMode,
  )

  const agentId = override?.agentId ? override.agentId : createAgentId()

  // 如果请求，将代理的转录路由到分组子目录中
  //（例如，工作流子代理写入 subagents/workflows/<runId>/）。
  if (transcriptSubdir) {
    setAgentTranscriptSubdir(agentId, transcriptSubdir)
  }

  // 在 Perfetto 追踪中注册代理以实现层次结构可视化
  if (isPerfettoTracingEnabled()) {
    const parentId = toolUseContext.agentId ?? getSessionId()
    registerPerfettoAgent(agentId, agentDefinition.agentType, parentId)
  }

  // 记录子代理的 API 调用路径（仅 ant）
  if (process.env.USER_TYPE === 'ant') {
    logForDebugging(
      `[Subagent ${agentDefinition.agentType}] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}`,
    )
  }

  // 处理用于上下文共享的消息分叉
  // 过滤掉父消息中不完整的工具调用以避免 API 错误
  const contextMessages: Message[] = forkContextMessages
    ? filterIncompleteToolCalls(forkContextMessages)
    : []
  const initialMessages: Message[] = [...contextMessages, ...promptMessages]

  const agentReadFileState =
    forkContextMessages !== undefined
      ? cloneFileStateCache(toolUseContext.readFileState)
      : createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)

  const [baseUserContext, baseSystemContext] = await Promise.all([
    override?.userContext ?? getUserContext(),
    override?.systemContext ?? getSystemContext(),
  ])

  // 只读代理（Explore、Plan）不执行 CLAUDE.md 中的提交/PR/lint 规则——
  // 主代理拥有完整上下文并解释其结果。
  // 在此处丢弃 claudeMd 可在 3400 万+ Explore 生成中每周节省约 5-15 Gtoken。
  // 来自调用方的显式 override.userContext 保持不变。
  // 终止开关默认为 true；设置 tengu_slim_subagent_claudemd=false 可恢复。
  const shouldOmitClaudeMd =
    agentDefinition.omitClaudeMd &&
    !override?.userContext &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slim_subagent_claudemd', true)
  const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } =
    baseUserContext
  const resolvedUserContext = shouldOmitClaudeMd
    ? userContextNoClaudeMd
    : baseUserContext

  // Explore/Plan 是只读搜索代理——父会话启动时的 gitStatus（最大 40KB，
  // 明确标记为过时）是冗余负担。如果它们需要 git 信息，
  // 它们会自己运行 `git status` 获取最新数据。
  // 全集群每周节省约 1-3 Gtoken。
  const { gitStatus: _omittedGitStatus, ...systemContextNoGit } =
    baseSystemContext
  const resolvedSystemContext =
    agentDefinition.agentType === 'Explore' ||
    agentDefinition.agentType === 'Plan'
      ? systemContextNoGit
      : baseSystemContext

  // 如果代理定义了权限模式则覆盖之
  // 但如果父级处于 bypassPermissions 或 acceptEdits 模式则不覆盖——这些应始终优先
  // 对于异步代理，同时设置 shouldAvoidPermissionPrompts，因为它们无法显示 UI
  const agentPermissionMode = agentDefinition.permissionMode
  const agentGetAppState = () => {
    const state = toolUseContext.getAppState()
    let toolPermissionContext = state.toolPermissionContext

    // 如果代理定义了权限模式则覆盖（除非父级为 bypassPermissions、acceptEdits 或 auto）
    if (
      agentPermissionMode &&
      state.toolPermissionContext.mode !== 'bypassPermissions' &&
      state.toolPermissionContext.mode !== 'acceptEdits' &&
      !(
        feature('TRANSCRIPT_CLASSIFIER') &&
        state.toolPermissionContext.mode === 'auto'
      )
    ) {
      toolPermissionContext = {
        ...toolPermissionContext,
        mode: agentPermissionMode,
      }
    }

    // 设置为无法显示 UI 的代理设置自动拒绝提示标志
    // 如果提供了显式的 canShowPermissionPrompts 则使用，否则：
    //   - bubble 模式：始终显示提示（冒泡到父终端）
    //   - 默认：!isAsync（同步代理显示提示，异步代理不显示）
    const shouldAvoidPrompts =
      canShowPermissionPrompts !== undefined
        ? !canShowPermissionPrompts
        : agentPermissionMode === 'bubble'
          ? false
          : isAsync
    if (shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        shouldAvoidPermissionPrompts: true,
      }
    }

    // 对于可以显示提示的后台代理，在显示权限对话框之前等待自动检查
    //（分类器、权限 hooks）。由于这些是后台代理，等待是可以的——
    // 用户只应在自动检查无法解决权限时才被中断。
    // 这适用于 bubble 模式（始终）和显式的 canShowPermissionPrompts。
    if (isAsync && !shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        awaitAutomatedChecksBeforeDialog: true,
      }
    }

    // 限定工具权限范围：当提供了 allowedTools 时，将其用作会话规则。
    // 重要：保留 cliArg 规则（来自 SDK 的 --allowedTools），因为它们是
    // 来自 SDK 消费者的显式权限，应适用于所有代理。
    // 仅清除来自父级的会话级规则以防止意外泄露。
    if (allowedTools !== undefined) {
      toolPermissionContext = {
        ...toolPermissionContext,
        alwaysAllowRules: {
          // 保留来自 --allowedTools 的 SDK 级权限
          cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
          // 使用提供的 allowedTools 作为会话级权限
          session: [...allowedTools],
        },
      }
    }

    // 如果代理定义了 effort 级别则覆盖之
    const effortValue =
      agentDefinition.effort !== undefined
        ? agentDefinition.effort
        : state.effortValue

    if (
      toolPermissionContext === state.toolPermissionContext &&
      effortValue === state.effortValue
    ) {
      return state
    }
    return {
      ...state,
      toolPermissionContext,
      effortValue,
    }
  }

  const resolvedTools = useExactTools
    ? availableTools
    : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools

  const additionalWorkingDirectories = Array.from(
    appState.toolPermissionContext.additionalWorkingDirectories.keys(),
  )

  const agentSystemPrompt = override?.systemPrompt
    ? override.systemPrompt
    : asSystemPrompt(
        await getAgentSystemPrompt(
          agentDefinition,
          toolUseContext,
          resolvedAgentModel,
          additionalWorkingDirectories,
          resolvedTools,
        ),
      )

  // 确定 abortController：
  // - Override 优先
  // - 异步代理获取新的独立控制器（独立运行）
  // - 同步代理共享父级的控制器
  const agentAbortController = override?.abortController
    ? override.abortController
    : isAsync
      ? new AbortController()
      : toolUseContext.abortController

  // 执行 SubagentStart hooks 并收集额外的上下文
  const additionalContexts: string[] = []
  for await (const hookResult of executeSubagentStartHooks(
    agentId,
    agentDefinition.agentType,
    agentAbortController.signal,
  )) {
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      additionalContexts.push(...hookResult.additionalContexts)
    }
  }

  // 将 SubagentStart hook 上下文添加为用户消息（与 SessionStart/UserPromptSubmit 一致）
  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: 'hook_additional_context',
      content: additionalContexts,
      hookName: 'SubagentStart',
      toolUseID: randomUUID(),
      hookEvent: 'SubagentStart',
    })
    initialMessages.push(contextMessage)
  }

  // 注册代理的 frontmatter hooks（限定于代理生命周期）
  // 传递 isAgent=true 以将 Stop hooks 转换为 SubagentStop（因为子代理触发 SubagentStop）
  // 相同的管理员信任门控用于 frontmatter hooks：仅在 ["hooks"] 单独锁定
  //（skills/agents 未锁定时），用户代理仍加载——在此处（已知 source）阻止它们的
  // frontmatter-hook 注册，而不是在执行时全面阻止所有会话 hooks（这也会杀死
  // 插件代理的 hooks）。
  const hooksAllowedForThisAgent =
    !isRestrictedToPluginOnly('hooks') ||
    isSourceAdminTrusted(agentDefinition.source)
  if (agentDefinition.hooks && hooksAllowedForThisAgent) {
    registerFrontmatterHooks(
      rootSetAppState,
      agentId,
      agentDefinition.hooks,
      `agent '${agentDefinition.agentType}'`,
      true, // isAgent — 将 Stop 转换为 SubagentStop
    )
  }

  // 从代理 frontmatter 预加载技能
  const skillsToPreload = agentDefinition.skills ?? []
  if (skillsToPreload.length > 0) {
    const allSkills = await getSkillToolCommands(getProjectRoot())

    // 过滤有效技能并警告缺失项
    const validSkills: Array<{
      skillName: string
      skill: (typeof allSkills)[0] & { type: 'prompt' }
    }> = []

    for (const skillName of skillsToPreload) {
      // 解析技能名称，尝试多种策略：
      // 1. 精确匹配（hasCommand 检查 name、userFacingName、aliases）
      // 2. 使用代理的插件前缀完全限定（例如 "my-skill" → "plugin:my-skill"）
      // 3. 对插件命名空间的技能进行 ":skillName" 后缀匹配
      const resolvedName = resolveSkillName(
        skillName,
        allSkills,
        agentDefinition,
      )
      if (!resolvedName) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' specified in frontmatter was not found`,
          { level: 'warn' },
        )
        continue
      }

      const skill = getCommand(resolvedName, allSkills)
      if (skill.type !== 'prompt') {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' is not a prompt-based skill`,
          { level: 'warn' },
        )
        continue
      }
      validSkills.push({ skillName, skill })
    }

    // 并发加载所有技能内容并添加到初始消息中
    const { formatSkillLoadingMetadata } = await import(
      '../../utils/processUserInput/processSlashCommand.js'
    )
    const loaded = await Promise.all(
      validSkills.map(async ({ skillName, skill }) => ({
        skillName,
        skill,
        content: await skill.getPromptForCommand('', toolUseContext),
      })),
    )
    for (const { skillName, skill, content } of loaded) {
      logForDebugging(
        `[Agent: ${agentDefinition.agentType}] Preloaded skill '${skillName}'`,
      )

      // 添加命令消息元数据，以便 UI 显示正在加载的技能
      const metadata = formatSkillLoadingMetadata(
        skillName,
        skill.progressMessage,
      )

      initialMessages.push(
        createUserMessage({
          content: [{ type: 'text', text: metadata }, ...content],
          isMeta: true,
        }),
      )
    }
  }

  // 初始化代理专用的 MCP 服务器（对父级服务器的补充）
  const {
    clients: mergedMcpClients,
    tools: agentMcpTools,
    cleanup: mcpCleanup,
  } = await initializeAgentMcpServers(
    agentDefinition,
    toolUseContext.options.mcpClients,
  )

  // 将代理 MCP 工具与解析后的代理工具合并，按名称去重。
  // resolvedTools 已经去重（参见 resolveAgentTools），因此当没有代理专用 MCP 工具时，
  // 跳过展开 + uniqBy 的开销。
  const allTools =
    agentMcpTools.length > 0
      ? uniqBy([...resolvedTools, ...agentMcpTools], 'name')
      : resolvedTools

  // 构建代理专用选项
  const agentOptions: ToolUseContext['options'] = {
    isNonInteractiveSession: useExactTools
      ? toolUseContext.options.isNonInteractiveSession
      : isAsync
        ? true
        : (toolUseContext.options.isNonInteractiveSession ?? false),
    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    tools: allTools,
    commands: [],
    debug: toolUseContext.options.debug,
    verbose: toolUseContext.options.verbose,
    mainLoopModel: resolvedAgentModel,
    // 对于 fork 子代理（useExactTools），继承 thinking 配置以匹配父级的
    // API 请求前缀，实现提示缓存命中。对于常规子代理，禁用 thinking
    // 以控制输出 token 成本。
    thinkingConfig: useExactTools
      ? toolUseContext.options.thinkingConfig
      : { type: 'disabled' as const },
    mcpClients: mergedMcpClients,
    mcpResources: toolUseContext.options.mcpResources,
    agentDefinitions: toolUseContext.options.agentDefinitions,
    // Fork 子代理（useExactTools 路径）需要在 context.options 上保留 querySource
    // 用于 AgentTool.tsx call() 的递归 fork 守卫——它检查
    // options.querySource === 'agent:builtin:fork'。这能在自动压缩中存活
    //（自动压缩重写消息，而非 context.options）。没有这个，守卫
    // 会读取 undefined，只有消息扫描回退触发——而
    // 自动压缩通过替换 fork 样板消息破坏了这一机制。
    ...(useExactTools && { querySource }),
  }

  // 使用共享辅助函数创建子代理上下文
  // - 同步代理与父级共享 setAppState、setResponseLength、abortController
  // - 异步代理完全隔离（但具有显式的独立 abortController）
  const agentToolUseContext = createSubagentContext(toolUseContext, {
    options: agentOptions,
    agentId,
    agentType: agentDefinition.agentType,
    messages: initialMessages,
    readFileState: agentReadFileState,
    abortController: agentAbortController,
    getAppState: agentGetAppState,
    // 同步代理与父级共享这些回调
    shareSetAppState: !isAsync,
    shareSetResponseLength: true, // 同步和异步都对响应指标有贡献
    criticalSystemReminder_EXPERIMENTAL:
      agentDefinition.criticalSystemReminder_EXPERIMENTAL,
    contentReplacementState,
  })

  // 为具有可视转录的子代理保留工具使用结果（进程内协作者）
  if (preserveToolUseResults) {
    agentToolUseContext.preserveToolUseResults = true
  }

  // 暴露缓存安全参数以进行后台摘要（提示缓存共享）
  if (onCacheSafeParams) {
    onCacheSafeParams({
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      toolUseContext: agentToolUseContext,
      forkContextMessages: initialMessages,
    })
  }

  // 在查询循环开始前记录初始消息，同时记录 agentType
  // 以便在省略 subagent_type 时 resume 能正确路由。这两个写入
  // 都是即发即弃的——持久化失败不应阻塞代理。
  void recordSidechainTranscript(initialMessages, agentId).catch(_err =>
    logForDebugging(`Failed to record sidechain transcript: ${_err}`),
  )
  void writeAgentMetadata(agentId, {
    agentType: agentDefinition.agentType,
    ...(worktreePath && { worktreePath }),
    ...(description && { description }),
  }).catch(_err => logForDebugging(`Failed to write agent metadata: ${_err}`))

  // 追踪最后记录的消息 UUID 以实现父链连续性
  let lastRecordedUuid: UUID | null = initialMessages.at(-1)?.uuid ?? null

  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      canUseTool,
      toolUseContext: agentToolUseContext,
      querySource,
      maxTurns: maxTurns ?? agentDefinition.maxTurns,
    })) {
      onQueryProgress?.()
      // 将子代理 API 请求开始转发到父级指标显示
      // 以便 TTFT/OTPS 在子代理执行期间更新。
      if (
        message.type === 'stream_event' &&
        message.event.type === 'message_start' &&
        message.ttftMs != null
      ) {
        toolUseContext.pushApiMetricsEntry?.(message.ttftMs)
        continue
      }

      // 生成附件消息（例如 structured_output）而不记录它们
      if (message.type === 'attachment') {
        // 处理来自 query.ts 的最大轮次信号
        if (message.attachment.type === 'max_turns_reached') {
          logForDebugging(
            `[Agent
: $
{
  agentDefinition.agentType
}
] Reached max turns limit ($
{
  message.attachment.maxTurns
}
)`,
          )
          break
        }
        yield message
        continue
      }

      if (isRecordableMessage(message)) {
        // 仅记录带有正确父级的新消息（每条消息 O(1)）
        await recordSidechainTranscript(
          [message],
          agentId,
          lastRecordedUuid,
        ).catch(err =>
          logForDebugging(`Failed to record sidechain transcript: ${err}`),
        )
        if (message.type !== 'progress') {
          lastRecordedUuid = message.uuid
        }
        yield message
      }
    }

    if (agentAbortController.signal.aborted) {
      throw new AbortError()
    }

    // 如果提供了回调则运行（只有内置代理有回调）
    if (isBuiltInAgent(agentDefinition) && agentDefinition.callback) {
      agentDefinition.callback()
    }
  } finally {
    // 清理代理专用的 MCP 服务器（在正常完成、中止或出错时运行）
    await mcpCleanup()
    // 清理代理的会话 hooks
    if (agentDefinition.hooks) {
      clearSessionHooks(rootSetAppState, agentId)
    }
    // 清理此代理的提示缓存追踪状态
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      cleanupAgentTracking(agentId)
    }
    // 释放克隆的文件状态缓存内存
    agentToolUseContext.readFileState.clear()
    // 释放克隆的分叉上下文消息
    initialMessages.length = 0
    // 释放 perfetto 代理注册表项
    unregisterPerfettoAgent(agentId)
    // 释放转录子目录映射
    clearAgentTranscriptSubdir(agentId)
    // 释放此代理的待办事项条目。如果没有这个，每个调用 TodoWrite 的子代理
    // 都会在 AppState.todos 中永久留下一个键（即使所有项完成，值为 []，但键仍然存在）。
    // 大规模会话会生成数百个代理；每个孤立键都是一次小泄漏，累积起来就大了。
    rootSetAppState(prev => {
      if (!(agentId in prev.todos)) return prev
      const { [agentId]: _removed, ...todos } = prev.todos
      return { ...prev, todos }
    })
    // 杀死此代理生成的任何后台 bash 任务。如果没有这个，
    // `run_in_background` shell 循环（例如测试夹具 fake-logs.sh）
    // 会在主会话最终退出时作为 PPID=1 的僵尸进程存活。
    killShellTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState)
     
    if (feature('MONITOR_TOOL')) {
      const mcpMod =
        require('../../tasks/MonitorMcpTask/MonitorMcpTask.js') as typeof import('../../tasks/MonitorMcpTask/MonitorMcpTask.js')
      mcpMod.killMonitorMcpTasksForAgent(
        agentId,
        toolUseContext.getAppState,
        rootSetAppState,
      )
    }
     
  }
}

/**
 * 过滤掉包含不完整工具调用（无结果的工具使用）的 assistant 消息。
 * 这可以防止在发送包含孤立工具调用的消息时出现 API 错误。
 */
export function filterIncompleteToolCalls(messages: Message[]): Message[] {
  // 构建一个有结果的工具使用 ID 集合
  const toolUseIdsWithResults = new Set<string>()

  for (const message of messages) {
    if (message?.type === 'user') {
      const userMessage = message as UserMessage
      const content = userMessage.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolUseIdsWithResults.add(block.tool_use_id)
          }
        }
      }
    }
  }

  // 过滤掉包含无结果工具调用的 assistant 消息
  return messages.filter(message => {
    if (message?.type === 'assistant') {
      const assistantMessage = message as AssistantMessage
      const content = assistantMessage.message.content
      if (Array.isArray(content)) {
        // 检查此 assistant 消息是否有任何无结果的工具使用
        const hasIncompleteToolCall = content.some(
          block =>
            block.type === 'tool_use' &&
            block.id &&
            !toolUseIdsWithResults.has(block.id),
        )
        // 排除包含不完整工具调用的消息
        return !hasIncompleteToolCall
      }
    }
    // 保留所有非 assistant 消息以及没有工具调用的 assistant 消息
    return true
  })
}

async function getAgentSystemPrompt(
  agentDefinition: AgentDefinition,
  toolUseContext: Pick<ToolUseContext, 'options'>,
  resolvedAgentModel: string,
  additionalWorkingDirectories: string[],
  resolvedTools: readonly Tool[],
): Promise<string[]> {
  const enabledToolNames = new Set(resolvedTools.map(t => t.name))
  try {
    const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext })
    const prompts = [agentPrompt]

    return await enhanceSystemPromptWithEnvDetails(
      prompts,
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  } catch (_error) {
    return enhanceSystemPromptWithEnvDetails(
      [DEFAULT_AGENT_PROMPT],
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  }
}

/**
 * 将代理 frontmatter 中的技能名称解析为已注册的命令名称。
 *
 * 插件技能以带命名空间的名称注册（例如 "my-plugin:my-skill"），
 * 但代理使用裸名称引用它们（例如 "my-skill"）。此函数
 * 尝试多种解析策略：
 *
 * 1. 通过 hasCommand 精确匹配（name、userFacingName、aliases）
 * 2. 使用代理的插件名称作为前缀（例如 "my-skill" → "my-plugin:my-skill"）
 * 3. 后缀匹配——查找任何名称以 ":skillName" 结尾的命令
 */
function resolveSkillName(
  skillName: string,
  allSkills: Command[],
  agentDefinition: AgentDefinition,
): string | null {
  // 1. 直接匹配
  if (hasCommand(skillName, allSkills)) {
    return skillName
  }

  // 2. 尝试使用代理的插件名称作为前缀
  // 插件代理的 agentType 类似 "pluginName:agentName"
  const pluginPrefix = agentDefinition.agentType.split(':')[0]
  if (pluginPrefix) {
    const qualifiedName = `${pluginPrefix}:${skillName}`
    if (hasCommand(qualifiedName, allSkills)) {
      return qualifiedName
    }
  }

  // 3. 后缀匹配——查找名称以 ":skillName" 结尾的技能
  const suffix = `:${skillName}`
  const match = allSkills.find(cmd => cmd.name.endsWith(suffix))
  if (match) {
    return match.name
  }

  return null
}
