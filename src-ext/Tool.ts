import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  ElicitRequestURLParams,
  ElicitResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { UUID } from 'crypto'
import type { z } from 'zod/v4'
import type { Command } from './commands.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { ThinkingConfig } from './utils/thinking.js'

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

import type { Notification } from './context/notifications.js'
import type {
  MCPServerConnection,
  ServerResource,
} from './services/mcp/types.js'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from './tools/AgentTool/loadAgentsDir.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
} from './types/message.js'
// 从集中位置导入权限类型以打破导入循环
// 从集中位置导入 PermissionResult 以打破导入循环
import type {
  AdditionalWorkingDirectory,
  PermissionMode,
  PermissionResult,
} from './types/permissions.js'
// 从集中位置导入工具进度类型以打破导入循环
import type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  ToolProgressData,
  WebSearchProgress,
} from './types/tools.js'
import type { FileStateCache } from './utils/fileStateCache.js'
import type { DenialTrackingState } from './utils/permissions/denialTracking.js'
import type { SystemPrompt } from './utils/systemPromptType.js'
import type { ContentReplacementState } from './utils/toolResultStorage.js'

// 重新导出进度类型以保持向后兼容
export type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  WebSearchProgress,
}

import type { SpinnerMode } from './components/Spinner.js'
import type { QuerySource } from './constants/querySource.js'
import type { SDKStatus } from './entrypoints/agentSdkTypes.js'
import type { AppState } from './state/AppState.js'
import type {
  HookProgress,
  PromptRequest,
  PromptResponse,
} from './types/hooks.js'
import type { AgentId } from './types/ids.js'
import type { DeepImmutable } from './types/utils.js'
import type { AttributionState } from './utils/commitAttribution.js'
import type { FileHistoryState } from './utils/fileHistory.js'
import type { Theme, ThemeName } from './utils/theme.js'

export type QueryChainTracking = {
  chainId: string
  depth: number
}

export type ValidationResult =
  | { result: true }
  | {
      result: false
      message: string
      errorCode: number
    }

export type SetToolJSXFn = (
  args: {
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
    /** 设置为 true 以清除本地 JSX 命令（例如，从其 onDone 回调中） */
    clearLocalJSX?: boolean
  } | null,
) => void

// 从集中位置导入工具权限类型以打破导入循环
import type { ToolPermissionRulesBySource } from './types/permissions.js'

// 重新导出以保持向后兼容
export type { ToolPermissionRulesBySource }

// 对导入的类型应用 DeepImmutable
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
  isBypassPermissionsModeAvailable: boolean
  isAutoModeAvailable?: boolean
  strippedDangerousRules?: ToolPermissionRulesBySource
  /** 当为 true 时，权限提示会自动拒绝（例如，无法显示 UI 的后台代理） */
  shouldAvoidPermissionPrompts?: boolean
  /** 当为 true 时，在显示权限对话框之前等待自动检查（分类器、钩子）完成（协调器工作线程） */
  awaitAutomatedChecksBeforeDialog?: boolean
  /** 存储模型启动计划模式进入前的权限模式，以便在退出时恢复 */
  prePlanMode?: PermissionMode
}>

export const getEmptyToolPermissionContext: () => ToolPermissionContext =
  () => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  })

export type CompactProgressEvent =
  | {
      type: 'hooks_start'
      hookType: 'pre_compact' | 'post_compact' | 'session_start'
    }
  | { type: 'compact_start' }
  | { type: 'compact_end' }

export type ToolUseContext = {
  options: {
    commands: Command[]
    debug: boolean
    mainLoopModel: string
    tools: Tools
    verbose: boolean
    thinkingConfig: ThinkingConfig
    mcpClients: MCPServerConnection[]
    mcpResources: Record<string, ServerResource[]>
    isNonInteractiveSession: boolean
    agentDefinitions: AgentDefinitionsResult
    maxBudgetUsd?: number
    /** 替换默认系统提示的自定义系统提示 */
    customSystemPrompt?: string
    /** 追加在主系统提示之后的额外系统提示 */
    appendSystemPrompt?: string
    /** 覆盖用于分析跟踪的 querySource */
    querySource?: QuerySource
    /** 可选回调，用于获取最新的工具（例如，在 MCP 服务器中途连接时） */
    refreshTools?: () => Tools
  }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(f: (prev: AppState) => AppState): void
  /**
   * 用于会话范围基础设施（后台任务、会话钩子）的始终共享的 setAppState。
   * 与 setAppState 不同，setAppState 对于异步代理是无操作（参见 createSubagentContext），
   * 而这个函数总是到达根存储，因此任何嵌套深度的代理都可以注册/清理超出单个轮次的基础设施。
   * 仅由 createSubagentContext 设置；主线程上下文回退到 setAppState。
   */
  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void
  /**
   * 可选的处理程序，用于处理由工具调用错误（-32042）触发的 URL 启发。
   * 在打印/SDK 模式下，此处理程序委托给 structuredIO.handleElicitation。
   * 在 REPL 模式下，此值为 undefined，并使用基于队列的 UI 路径。
   */
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
  setToolJSX?: SetToolJSXFn
  addNotification?: (notif: Notification) => void
  /** 将仅用于 UI 的系统消息追加到 REPL 消息列表中。在 normalizeMessagesForAPI 边界处剥离 ——
   *  Exclude<> 使此操作受到类型强制。 */
  appendSystemMessage?: (
    msg: Exclude<SystemMessage, SystemLocalCommandMessage>,
  ) => void
  /** 发送操作系统级别的通知（iTerm2、Kitty、Ghostty、响铃等） */
  sendOSNotification?: (opts: {
    message: string
    notificationType: string
  }) => void
  nestedMemoryAttachmentTriggers?: Set<string>
  /**
   * 此会话中已作为 nested_memory 附件注入的 CLAUDE.md 路径。
   * 用于 memoryFilesToAttachments 的去重 —— readFileState 是一个 LRU 缓存，
   * 在繁忙的会话中会驱逐条目，因此仅靠它的 .has() 检查可能会数十次重复注入同一个 CLAUDE.md。
   */
  loadedNestedMemoryPaths?: Set<string>
  dynamicSkillDirTriggers?: Set<string>
  /** 此会话中通过 skill_discovery 显现的技能名称。仅用于遥测（填充 was_discovered）。 */
  discoveredSkillNames?: Set<string>
  userModified?: boolean
  setInProgressToolUseIDs: (f: (prev: Set<string>) => Set<string>) => void
  /** 仅在交互式（REPL）上下文中连接；SDK/QueryEngine 不设置此项。 */
  setHasInterruptibleToolInProgress?: (v: boolean) => void
  setResponseLength: (f: (prev: number) => number) => void
  /** 仅 Ant 使用：为 OTPS 跟踪推送新的 API 指标条目。
   *  当子代理流式传输启动新的 API 请求时调用。 */
  pushApiMetricsEntry?: (ttftMs: number) => void
  setStreamMode?: (mode: SpinnerMode) => void
  onCompactProgress?: (event: CompactProgressEvent) => void
  setSDKStatus?: (status: SDKStatus) => void
  openMessageSelector?: () => void
  updateFileHistoryState: (
    updater: (prev: FileHistoryState) => FileHistoryState,
  ) => void
  updateAttributionState: (
    updater: (prev: AttributionState) => AttributionState,
  ) => void
  setConversationId?: (id: UUID) => void
  agentId?: AgentId // 仅对子代理设置；使用 getSessionId() 获取会话 ID。钩子使用此项来区分子代理调用。
  agentType?: string // 子代理类型名称。对于主线程的 --agent 类型，钩子回退到 getMainThreadAgentType()。
  /** 当为 true 时，即使钩子自动批准，也必须始终调用 canUseTool。
   *  用于推测中的覆盖文件路径重写。 */
  requireCanUseTool?: boolean
  messages: Message[]
  fileReadingLimits?: {
    maxTokens?: number
    maxSizeBytes?: number
  }
  globLimits?: {
    maxResults?: number
  }
  toolDecisions?: Map<
    string,
    {
      source: string
      decision: 'accept' | 'reject'
      timestamp: number
    }
  >
  queryTracking?: QueryChainTracking
  /** 用于向用户请求交互式提示的回调工厂。
   * 返回一个绑定到给定源名称的提示回调。
   * 仅在交互式（REPL）上下文中可用。 */
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>
  toolUseId?: string
  criticalSystemReminder_EXPERIMENTAL?: string
  /** 当为 true 时，即使对于子代理也保留消息上的 toolUseResult。
   *  用于其对话记录可被用户查看的进程内队友。 */
  preserveToolUseResults?: boolean
  /** 异步子代理的本地拒绝跟踪状态，其 setAppState 是无操作。
   *  如果没有此项，拒绝计数器永远不会累积，并且回退到提示的阈值永远不会达到。
   *  可变的 —— 权限代码会原地更新它。 */
  localDenialTracking?: DenialTrackingState
  /**
   * 每个对话线程的内容替换状态，用于工具结果预算。
   * 当存在时，query.ts 会应用聚合的工具结果预算。
   * 主线程：REPL 提供一次（永不重置 —— 陈旧的 UUID 键是惰性的）。
   * 子代理：createSubagentContext 默认克隆父状态（缓存共享的分支需要相同的决策），
   * 或者 resumeAgentBackground 线程从侧链记录重建一个。
   */
  contentReplacementState?: ContentReplacementState
  /**
   * 父代理渲染的系统提示字节数，在回合开始时冻结。
   * 由分支子代理用于共享父代理的提示缓存 —— 在分支生成时重新调用 getSystemPrompt()
   * 可能会偏离（GrowthBook 冷→热）并破坏缓存。参见 forkSubagent.ts。
   */
  renderedSystemPrompt?: SystemPrompt
}

// 从集中位置重新导出 ToolProgressData
export type { ToolProgressData }

export type Progress = ToolProgressData | HookProgress

export type ToolProgress<P extends ToolProgressData> = {
  toolUseID: string
  data: P
}

export function filterToolProgressMessages(
  progressMessagesForMessage: ProgressMessage[],
): ProgressMessage<ToolProgressData>[] {
  return progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      msg.data?.type !== 'hook_progress',
  )
}

export type ToolResult<T> = {
  data: T
  newMessages?: (
    | UserMessage
    | AssistantMessage
    | AttachmentMessage
    | SystemMessage
  )[]
  // contextModifier 仅对非并发安全的工具有效。
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  /** 要传递给 SDK 消费者的 MCP 协议元数据（structuredContent、_meta） */
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: ToolProgress<P>,
) => void

// 任何输出具有字符串键的对象的 schema 类型
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

/**
 * 检查工具是否与给定名称匹配（主名称或别名）。
 */
export function toolMatchesName(
  tool: { name: string; aliases?: string[] },
  name: string,
): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

/**
 * 从工具列表中按名称或别名查找工具。
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  /**
   * 可选别名，用于工具重命名时的向后兼容。
   * 除了主名称外，还可以通过这些名称查找工具。
   */
  aliases?: string[]
  /**
   * ToolSearch 用于关键字匹配的单行能力短语。
   * 当工具被延迟加载时，帮助模型通过关键字搜索找到它。
   * 3–10 个单词，无句号结尾。
   * 优先使用工具名称中未出现的术语（例如，为 NotebookEdit 使用 'jupyter'）。
   */
  searchHint?: string
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>
  description(
    input: z.infer<Input>,
    options: {
      isNonInteractiveSession: boolean
      toolPermissionContext: ToolPermissionContext
      tools: Tools
    },
  ): Promise<string>
  readonly inputSchema: Input
  // 用于 MCP 工具的类型，可以直接以 JSON Schema 格式指定其输入 schema，
  // 而不是从 Zod schema 转换
  readonly inputJSONSchema?: ToolInputJSONSchema
  // 可选，因为 TungstenTool 没有定义此项。TODO：将其设为必需。
  // 当我们这样做时，我们也可以改进此处的类型安全性。
  outputSchema?: z.ZodType<unknown>
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  /** 默认为 false。仅在工具执行不可逆操作（删除、覆盖、发送）时设置。 */
  isDestructive?(input: z.infer<Input>): boolean
  /**
   * 当用户在此工具运行时提交新消息时应采取的措施。
   *
   * - `'cancel'` — 停止工具并丢弃其结果
   * - `'block'`  — 继续运行；新消息等待
   *
   * 未实现时默认为 `'block'`。
   */
  interruptBehavior?(): 'cancel' | 'block'
  /**
   * 返回此工具使用是否为应在 UI 中折叠显示为精简视图的搜索或读取操作的信息。
   * 例如文件搜索（Grep、Glob）、文件读取（Read）以及诸如 find、grep、wc 等 bash 命令。
   *
   * 返回一个指示操作是否为搜索或读取操作的对象：
   * - `isSearch: true` 用于搜索操作（grep、find、glob 模式）
   * - `isRead: true` 用于读取操作（cat、head、tail、文件读取）
   * - `isList: true` 用于目录列表操作（ls、tree、du）
   * - 如果操作不应被折叠，则所有值均可为 false
   */
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean
    isRead: boolean
    isList?: boolean
  }
  isOpenWorld?(input: z.infer<Input>): boolean
  requiresUserInteraction?(): boolean
  isMcp?: boolean
  isLsp?: boolean
  /**
   * 当为 true 时，此工具将被延迟（以 defer_loading: true 发送），
   * 并且在可调用之前需要使用 ToolSearch。
   */
  readonly shouldDefer?: boolean
  /**
   * 当为 true 时，此工具永不被延迟 —— 即使在启用 ToolSearch 时，
   * 其完整的 schema 也会出现在初始提示中。对于 MCP 工具，通过
   * `_meta['anthropic/alwaysLoad']` 设置。用于模型必须在第一回合看到
   * 而无需 ToolSearch 往返的工具。
   */
  readonly alwaysLoad?: boolean
  /**
   * 对于 MCP 工具：从 MCP 服务器接收到的服务器和工具名称（未规范化）。
   * 无论 `name` 是否带有前缀（mcp__server__tool）还是无前缀（CLAUDE_AGENT_SDK_MCP_NO_PREFIX 模式），
   * 所有 MCP 工具上都存在此项。
   */
  mcpInfo?: { serverName: string; toolName: string }
  readonly name: string
  /**
   * 工具结果在被持久化到磁盘之前的最大字符大小。
   * 超过时，结果将保存到文件中，Claude 将收到包含文件路径的预览，而不是完整内容。
   *
   * 对于其输出绝不能持久化的工具（例如 Read，持久化会造成循环的 Read→文件→Read 循环，
   * 且该工具已通过其自身限制进行了自界），设置为 Infinity。
   */
  maxResultSizeChars: number
  /**
   * 当为 true 时，为此工具启用严格模式，这会使 API 更严格地遵循工具指令和参数模式。
   * 仅在启用 tengu_tool_pear 时应用。
   */
  readonly strict?: boolean

  /**
   * 在观察者（SDK 流、记录、canUseTool、PreToolUse/PostToolUse 钩子）看到 tool_use 输入的副本之前调用。
   * 原地修改以添加旧版/派生字段。必须是幂等的。原始的 API 绑定输入永远不会被修改（保留提示缓存）。
   * 当钩子/权限返回新的 updatedInput 时不会重新应用 —— 这些输入拥有自己的形状。
   */
  backfillObservableInput?(input: Record<string, unknown>): void

  /**
   * 确定是否允许此工具在当前上下文中以该输入运行。
   * 它告知模型工具使用失败的原因，并且不直接显示任何 UI。
   * @param input
   * @param context
   */
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>

  /**
   * 确定是否询问用户权限。仅在 validateInput() 通过后调用。
   * 通用权限逻辑位于 permissions.ts 中。此方法包含工具特定的逻辑。
   * @param input
   * @param context
   */
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>

  // 用于对文件路径进行操作的工具的可选方法
  getPath?(input: z.infer<Input>): string

  /**
   * 为钩子的 `if` 条件（权限规则模式，如来自 "Bash(git *)" 的 "git *"）准备匹配器。
   * 每个钩子-输入对调用一次；任何昂贵的解析在此发生。
   * 返回一个闭包，该闭包将针对每个钩子模式被调用。
   * 如果未实现，则仅支持工具名称级别的匹配。
   */
  preparePermissionMatcher?(
    input: z.infer<Input>,
  ): Promise<(pattern: string) => boolean>

  prompt(options: {
    getToolPermissionContext: () => Promise<ToolPermissionContext>
    tools: Tools
    agents: AgentDefinition[]
    allowedAgentTypes?: string[]
  }): Promise<string>
  userFacingName(input: Partial<z.infer<Input>> | undefined): string
  userFacingNameBackgroundColor?(
    input: Partial<z.infer<Input>> | undefined,
  ): keyof Theme | undefined
  /**
   * 透明包装器（例如 REPL）将所有渲染委托给其进度处理程序，
   * 该处理程序为每个内部工具调用发出看起来原生的块。
   * 包装器本身不显示任何内容。
   */
  isTransparentWrapper?(): boolean
  /**
   * 返回此工具使用的简短字符串摘要，以便在紧凑视图中显示。
   * @param input 工具输入
   * @returns 简短字符串摘要，或 null 表示不显示
   */
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  /**
   * 返回人类可读的现在时活动描述，用于旋转指示器显示。
   * 例如：“正在读取 src/foo.ts”、“正在运行 bun test”、“正在搜索模式”
   * @param input 工具输入
   * @returns 活动描述字符串，或 null 表示回退到工具名称
   */
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined,
  ): string | null
  /**
   * 返回此工具使用的紧凑表示，用于自动模式安全分类器。
   * 例如：`ls -la` 用于 Bash，`/tmp/x: new content` 用于 Edit。
   * 返回 '' 可在分类器记录中跳过此工具（例如，无安全相关性的工具）。
   * 当调用者需要 JSON 包装值时，可以返回对象以避免双重编码。
   */
  toAutoClassifierInput(input: z.infer<Input>): unknown
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam
  /**
   * 可选。如果省略，工具结果不渲染任何内容（等同于返回 null）。
   * 对于其结果在其他地方显示的工具（例如，TodoWrite 更新待办面板而不是记录），应省略此项。
   */
  renderToolResultMessage?(
    content: Output,
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
      isBriefOnly?: boolean
      /** 原始的 tool_use 输入，当可用时。用于引用所请求内容的紧凑结果摘要（例如“已发送至 #foo”）。 */
      input?: unknown
    },
  ): React.ReactNode
  /**
   * renderToolResultMessage 在记录模式下（verbose=true，isTranscriptMode=true）显示的扁平化文本。
   * 用于记录搜索索引：索引统计此字符串中的出现次数，高亮覆盖层扫描实际的屏幕缓冲区。
   * 为使计数 ≡ 高亮，此方法必须返回最终可见的文本 —— 而不是来自 mapToolResultToToolResultBlockParam
   * 的面向模型的序列化（该序列化添加了系统提醒、持久化输出包装）。
   *
   * 可以跳过 Chrome（计数不足可以接受）。“在 12 毫秒内找到 3 个文件”不值得索引。
   * 幽灵文本不可接受 —— 此处声称存在但在渲染时不出现的文本会导致计数≠高亮的错误。
   *
   * 可选：省略 → transcriptSearch.ts 中的字段名称启发式。
   * 偏移由 test/utils/transcriptSearch.renderFidelity.test.tsx 捕获，
   * 该测试渲染示例输出并标记已索引但未渲染（幽灵）或已渲染但未索引（计数不足警告）的文本。
   */
  extractSearchText?(out: Output): string
  /**
   * 渲染工具使用消息。注意，`input` 是部分的，因为我们会在工具参数完全流入之前尽快渲染消息。
   */
  renderToolUseMessage(
    input: Partial<z.infer<Input>>,
    options: { theme: ThemeName; verbose: boolean; commands?: Command[] },
  ): React.ReactNode
  /**
   * 当非详细模式下的此输出被截断时返回 true（即点击展开会显示更多内容）。
   * 控制全屏中的点击展开 —— 只有详细模式实际显示更多内容的消息才会获得悬停/点击功能。
   * 未设置表示永不截断。
   */
  isResultTruncated?(output: Output): boolean
  /**
   * 渲染一个可选的标签，显示在工具使用消息之后。
   * 用于额外的元数据，如超时、模型、恢复 ID 等。
   * 返回 null 表示不显示任何内容。
   */
  renderToolUseTag?(input: Partial<z.infer<Input>>): React.ReactNode
  /**
   * 可选。如果省略，工具运行时不会显示进度 UI。
   */
  renderToolUseProgressMessage?(
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      tools: Tools
      verbose: boolean
      terminalSize?: { columns: number; rows: number }
      inProgressToolCallCount?: number
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  renderToolUseQueuedMessage?(): React.ReactNode
  /**
   * 可选。如果省略，则回退到 <FallbackToolUseRejectedMessage />。
   * 仅为需要自定义拒绝 UI 的工具定义此项（例如，显示被拒绝差异的文件编辑）。
   */
  renderToolUseRejectedMessage?(
    input: z.infer<Input>,
    options: {
      columns: number
      messages: Message[]
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      progressMessagesForMessage: ProgressMessage<P>[]
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  /**
   * 可选。如果省略，则回退到 <FallbackToolUseErrorMessage />。
   * 仅为需要自定义错误 UI 的工具定义此项（例如，显示“文件未找到”而不是原始错误的搜索工具）。
   */
  renderToolUseErrorMessage?(
    result: ToolResultBlockParam['content'],
    options: {
      progressMessagesForMessage: ProgressMessage<P>[]
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
    },
  ): React.ReactNode

  /**
   * 将此工具的多个并行实例渲染为一个组。
   * @returns 要渲染的 React 节点，或 null 表示回退到单独渲染
   */
  /**
   * 将多个工具使用渲染为一个组（仅限非详细模式）。
   * 在详细模式下，各个工具使用会在其原始位置渲染。
   * @returns 要渲染的 React 节点，或 null 表示回退到单独渲染
   */
  renderGroupedToolUse?(
    toolUses: Array<{
      param: ToolUseBlockParam
      isResolved: boolean
      isError: boolean
      isInProgress: boolean
      progressMessages: ProgressMessage<P>[]
      result?: {
        param: ToolResultBlockParam
        output: unknown
      }
    }>,
    options: {
      shouldAnimate: boolean
      tools: Tools
    },
  ): React.ReactNode | null
}

/**
 * 工具集合。使用此类型而不是 `Tool[]`，以便更容易地跟踪工具集在整个代码库中的组装、传递和过滤位置。
 */
export type Tools = readonly Tool[]

/**
 * `buildTool` 提供默认值的方法。`ToolDef` 可以省略这些方法；
 * 生成的 `Tool` 总是包含它们。
 */
type DefaultableToolKeys =
  | 'isEnabled'
  | 'isConcurrencySafe'
  | 'isReadOnly'
  | 'isDestructive'
  | 'checkPermissions'
  | 'toAutoClassifierInput'
  | 'userFacingName'

/**
 * `buildTool` 接受的工具定义。与 `Tool` 形状相同，但可默认化的方法是可选的 ——
 * `buildTool` 会填充它们，以便调用者始终看到完整的 `Tool`。
 */
export type ToolDef<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = Omit<Tool<Input, Output, P>, DefaultableToolKeys> &
  Partial<Pick<Tool<Input, Output, P>, DefaultableToolKeys>>

/**
 * 类型级展开，镜像 `{ ...TOOL_DEFAULTS, ...def }`。对于每个可默认化的键：
 * 如果 D 提供了它（必需），则使用 D 的类型；如果 D 省略了它或它是可选的（从约束中的 Partial<> 继承），
 * 则默认值填充。所有其他键直接来自 D —— 精确保留参数数量、可选存在性和字面类型，如同 `satisfies Tool` 那样。
 */
type BuiltTool<D> = Omit<D, DefaultableToolKeys> & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K]
}

/**
 * 从部分定义构建完整的 `Tool`，为常用存根方法填充安全默认值。
 * 所有工具导出都应通过此函数，以便默认值位于一处，调用者永远不需要 `?.() ?? default`。
 *
 * 默认值（在重要之处失败关闭）：
 * - `isEnabled` → `true`
 * - `isConcurrencySafe` → `false`（假定不安全）
 * - `isReadOnly` → `false`（假定写入）
 * - `isDestructive` → `false`
 * - `checkPermissions` → `{ behavior: 'allow', updatedInput }`（遵从通用权限系统）
 * - `toAutoClassifierInput` → `''`（跳过分类器 —— 与安全相关的工具必须覆盖）
 * - `userFacingName` → `name`
 */
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (
    input: { [key: string]: unknown },
    _ctx?: ToolUseContext,
  ): Promise<PermissionResult> =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: (_input?: unknown) => '',
  userFacingName: (_input?: unknown) => '',
}

// 默认值类型是 TOOL_DEFAULTS 的实际形状（可选参数，以便 0 参数和完整参数的调用点都能通过类型检查 —— 存根的参数数量各异，并且测试依赖于这一点），
// 而不是接口的严格签名。
type ToolDefaults = typeof TOOL_DEFAULTS

// D 从调用点推断具体的对象字面量类型。约束为 `any` 处于约束位置是结构性的，永远不会泄漏到返回类型中。
// BuiltTool<D> 在类型级别镜像运行时 `{...TOOL_DEFAULTS, ...def}`。
 
type AnyToolDef = ToolDef<any, any, any>

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  // 运行时展开很简单；`as` 弥合了结构性 any 约束与精确的 BuiltTool<D> 返回之间的差距。
  // 类型语义已在所有 60 多个工具上通过零错误类型检查得到验证。
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as BuiltTool<D>
}