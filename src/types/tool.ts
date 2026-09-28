import type { z } from 'zod/v4'
import type { Command } from '../commands.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { ThinkingConfig } from '../utils/thinking.js'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '../tools/AgentTool/loadAgentsDir.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
} from './message.js'
import type { Notification } from './context/notifications.js'
import type {
  MCPServerConnection,
  ServerResource,
} from '../services/mcp/types.js'
import type {
  ElicitRequestURLParams,
  ElicitResult,
} from '@modelcontextprotocol/sdk/types.js'
import type {
  AdditionalWorkingDirectory,
  PermissionMode,
  PermissionResult,
  ToolPermissionRulesBySource,
} from './permissions.js'
import type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  ToolProgressData,
  WebSearchProgress,
} from './tools.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import type { DenialTrackingState } from '../utils/permissions/denialTracking.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'
import type { ContentReplacementState } from '../utils/toolResultStorage.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { QuerySource } from '../constants/querySource.js'
import type { SDKStatus } from '../entrypoints/agentSdkTypes.js'
import type { AppState } from '../state/AppState.js'
import type {
  HookProgress,
  PromptRequest,
  PromptResponse,
} from './hooks.js'
import type { AgentId } from './types/ids.js'
import type { DeepImmutable } from './types/utils.js'
import type { AttributionState } from '../utils/commitAttribution.js'
import type { FileHistoryState } from '../utils/fileHistory.js'
import type { Theme, ThemeName } from '../utils/theme.js'
import type { UUID } from 'crypto'

/**
 * 标准化工具元信息，对齐 OpenCode (Go) 的 ToolInfo。
 * 用于：LLM 工具列表生成、权限系统参数级检查、MCP 自动注册。
 */
export type ToolInfo = {
  name: string
  description: string
  parameters: Record<string, unknown>
  required: string[]
}

/**
 * 任何输出具有字符串键的对象的 schema 类型
 */
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

/**
 * 工具集合。使用此类型而不是 `Tool[]`，以便更容易地跟踪工具集在整个代码库中的组装、传递和过滤位置。
 */
export type Tools = readonly Tool[]

export type QueryChainTracking = {
  chainId: string
  depth: number
}

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

export type ToolUseBlockParam = {
  id: string
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

export type ToolResultBlockParam = {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
  is_error?: boolean
}

export type ValidationResult =
  | { result: true }
  | {
      result: false
      message: string
      errorCode: number
    }

export type ToolResult<T> = {
  data: T
  newMessages?: (
    | UserMessage
    | AssistantMessage
    | AttachmentMessage
    | SystemMessage
  )[]
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: import('./toolProgress.js').ToolProgress<P>,
) => void

export type SetToolJSXFn = (
  args: {
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
    clearLocalJSX?: boolean
  } | null,
) => void

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
  shouldAvoidPermissionPrompts?: boolean
  awaitAutomatedChecksBeforeDialog?: boolean
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
    customSystemPrompt?: string
    appendSystemPrompt?: string
    querySource?: QuerySource
    refreshTools?: () => Tools
  }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(f: (prev: AppState) => AppState): void
  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
  setToolJSX?: SetToolJSXFn
  addNotification?: (notif: Notification) => void
  appendSystemMessage?: (
    msg: Exclude<SystemMessage, SystemLocalCommandMessage>,
  ) => void
  sendOSNotification?: (opts: {
    message: string
    notificationType: string
  }) => void
  nestedMemoryAttachmentTriggers?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  dynamicSkillDirTriggers?: Set<string>
  discoveredSkillNames?: Set<string>
  userModified?: boolean
  setInProgressToolUseIDs: (f: (prev: Set<string>) => Set<string>) => void
  setHasInterruptibleToolInProgress?: (v: boolean) => void
  setResponseLength: (f: (prev: number) => number) => void
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
  agentId?: AgentId
  agentType?: string
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
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>
  toolUseId?: string
  criticalSystemReminder_EXPERIMENTAL?: string
  preserveToolUseResults?: boolean
  localDenialTracking?: DenialTrackingState
  contentReplacementState?: ContentReplacementState
  renderedSystemPrompt?: SystemPrompt
}

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  aliases?: string[]
  searchHint?: string
  callOn?: string
  call(
    args: z.infer<Input>,
    context?: ToolUseContext,
    canUseTool?: CanUseToolFn,
    parentMessage?: AssistantMessage,
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
  readonly inputJSONSchema?: ToolInputJSONSchema
  outputSchema?: z.ZodType<unknown>
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  isDestructive?(input: z.infer<Input>): boolean
  interruptBehavior?(): 'cancel' | 'block'
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean
    isRead: boolean
    isList?: boolean
  }
  isOpenWorld?(input: z.infer<Input>): boolean
  requiresUserInteraction?(): boolean
  isMcp?: boolean
  isLsp?: boolean
  readonly shouldDefer?: boolean
  readonly alwaysLoad?: boolean
  mcpInfo?: { serverName: string; toolName: string; registeredAt?: number }
  readonly name: string
  info(): ToolInfo
  maxResultSizeChars: number
  readonly strict?: boolean
  backfillObservableInput?(input: Record<string, unknown>): void
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>
  getPath?(input: z.infer<Input>): string
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
  isTransparentWrapper?(): boolean
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined,
  ): string | null
  toAutoClassifierInput(input: z.infer<Input>): unknown
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam
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
      input?: unknown
    },
  ): React.ReactNode
  extractSearchText?(out: Output): string
  renderToolUseMessage(
    input: Partial<z.infer<Input>>,
    options: { theme: ThemeName; verbose: boolean; commands?: Command[] },
  ): React.ReactNode
  isResultTruncated?(output: Output): boolean
  renderToolUseTag?(input: Partial<z.infer<Input>>): React.ReactNode
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
  renderToolUseErrorMessage?(
    result: ToolResultBlockParam['content'],
    options: {
      progressMessagesForMessage: ProgressMessage<P>[]
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
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
  | 'mapToolResultToToolResultBlockParam'
  | 'info'
  | 'prompt'
  | 'description'

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
type BuiltTool<D> = D & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K]
}

/**
 * 默认值类型是 TOOL_DEFAULTS 的实际形状（可选参数，以便 0 参数和完整参数的调用点都能通过类型检查 ——
 * 存根的参数数量各异，并且测试依赖于这一点），
 * 而不是接口的严格签名。
 */
export type ToolDefaults = typeof TOOL_DEFAULTS

// D 从调用点推断具体的对象字面量类型。约束为 `any` 处于约束位置是结构性的，永远不会泄漏到返回类型中。
// BuiltTool<D> 在类型级别镜像运行时 `{...TOOL_DEFAULTS, ...def}`。
type AnyToolDef = ToolDef<any, any, any>

/**
 * 从部分定义构建完整的 `Tool`，为常用存根方法填充安全默认值。
 * 所有工具导出都应通过此函数，以便默认值位于一处，调用者永远不需要 `?.() ?? default`。
 *
 * 默认值（在重要之处失败关闭）：
 * - `isEnabled` → `true`
 * - `isConcurrencySafety` → `false`（假定不安全）
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
  prompt: async (_options?: unknown) => '默认工具提示（由 buildTool 自动生成）',
  description: async (_input?: unknown, _options?: unknown) => '默认工具描述',
  mapToolResultToToolResultBlockParam: (_content: unknown, _toolUseID: string) => ({
    type: 'tool_result' as const,
    content: '',
  }),
  info: (): ToolInfo => ({
    name: '',
    description: '未命名工具',
    parameters: { type: 'object', properties: {} },
    required: [],
  }),
}

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as BuiltTool<D>
}

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

export type Progress = ToolProgressData | HookProgress

export type ToolProgress<P extends ToolProgressData = ToolProgressData> = {
  toolUseID: string
  data: P
}

export function filterToolProgressMessages(
  progressMessagesForMessage: ProgressMessage[],
): ProgressMessage<ToolProgressData>[] {
  return progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      typeof msg.data === 'object' && msg.data !== null && (msg.data as Record<string, unknown>).type !== 'hook_progress',
  )
}

// 从集中位置重新导出 ToolProgressData
export type { ToolProgressData } from './tools.js'
