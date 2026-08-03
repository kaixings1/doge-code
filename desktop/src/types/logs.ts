import type { UUID } from 'crypto'
import type { FileHistorySnapshot } from '../utils/fileHistory.js'
import type { ContentReplacementRecord } from '../utils/toolResultStorage.js'
import type { AgentId } from './ids.js'
import type { Message } from './message.js'
import type { QueueOperationMessage } from './messageQueueTypes.js'

export type SerializedMessage = Message & {
  cwd: string
  userType: string
  entrypoint?: string // CLAUDE_CODE_ENTRYPOINT — distinguishes cli/sdk-ts/sdk-py/etc.
  sessionId: string
  timestamp: string
  version: string
  gitBranch?: string
  slug?: string // Session slug for files like plans (used for resume)
}

/** 日志选项 */
export type LogOption = {
  date: string
  messages: SerializedMessage[]
  fullPath?: string
  value: number
  created: Date
  modified: Date
  firstPrompt: string
  messageCount: number
  fileSize?: number // File size in bytes (for display)
  isSidechain: boolean // 是否为侧链消息
  isLite?: boolean // 是否为精简日志（未加载消息）
  sessionId?: string // 精简日志的会话 ID
  teamName?: string // 团队名称（如果是派生的代理会话）
  agentName?: string // 代理的自定义名称（来自 /rename 或 swarm）
  agentColor?: string // 代理颜色（来自 /rename 或 swarm）
  agentSetting?: string // 使用的代理定义（来自 --agent 标志或 settings.agent）
  isTeammate?: boolean // 是否由群组队友创建
  leafUuid?: UUID // If given, this uuid must appear in the DB
  summary?: string // Optional conversation summary
  customTitle?: string // Optional user-set custom title
  tag?: string // Optional tag for the session (searchable in /resume)
  fileHistorySnapshots?: FileHistorySnapshot[] // Optional file history snapshots
  attributionSnapshots?: AttributionSnapshotMessage[] // Optional attribution snapshots
  contextCollapseCommits?: ContextCollapseCommitEntry[] // Ordered — commit B may reference commit A's summary
  contextCollapseSnapshot?: ContextCollapseSnapshotEntry // Last-wins — staged queue + spawn state
  gitBranch?: string // Git branch at the end of the session
  projectPath?: string // Original project directory path
  prNumber?: number // GitHub PR number linked to this session
  prUrl?: string // Full URL to the linked PR
  prRepository?: string // Repository in "owner/repo" format
  mode?: 'coordinator' | 'normal' // Session mode for coordinator/normal detection
  worktreeSession?: PersistedWorktreeSession | null // 会话结束时的工作树状态 (null = exited, undefined = never entered)
  contentReplacements?: ContentReplacementRecord[] // Replacement decisions for resume reconstruction
}

/** 摘要消息 */
export type SummaryMessage = {
  type: 'summary'
  leafUuid: UUID
  summary: string
}

/** 自定义标题消息 */
export type CustomTitleMessage = {
  type: 'custom-title'
  sessionId: UUID
  customTitle: string
}

/**
 * AI 生成的会话标题。与 CustomTitleMessage 不同，因为：
 * - 用户重命名（custom-title）总是在读取偏好中优先于 AI 标题
 * - reAppendSessionMetadata 永远不会重新附加 AI 标题（它们是临时的/可再生的；重新附加会覆盖用户重命名）
 * - VS Code 的 onlyIfNoCustomTitle CAS 检查仅匹配用户标题，允许 AI 覆盖其自身的先前 AI 标题但不能覆盖用户标题
 */
export type AiTitleMessage = {
  type: 'ai-title'
  sessionId: UUID
  aiTitle: string
}

/** 最后提示消息 */
export type LastPromptMessage = {
  type: 'last-prompt'
  sessionId: UUID
  lastPrompt: string
}

/**
 * 任务的周期性 fork 生成摘要，记录代理当前正在执行的操作。
 * 每 min(5 步, 2 分钟) 通过 fork 主线程中途写入，以便 `claude ps` 能显示
 * 比最后一条用户提示（通常是 "ok go" 或 "fix it"）更有用的信息。
 */
export type TaskSummaryMessage = {
  type: 'task-summary'
  sessionId: UUID
  summary: string
  timestamp: string
}

/** 标签消息 */
export type TagMessage = {
  type: 'tag'
  sessionId: UUID
  tag: string
}

/** 代理名称消息 */
export type AgentNameMessage = {
  type: 'agent-name'
  sessionId: UUID
  agentName: string
}

/** 代理颜色消息 */
export type AgentColorMessage = {
  type: 'agent-color'
  sessionId: UUID
  agentColor: string
}

/** 代理设置消息 */
export type AgentSettingMessage = {
  type: 'agent-setting'
  sessionId: UUID
  agentSetting: string
}

/**
 * PR 链接消息，存储在会话记录中。
 * 将会话链接到 GitHub 拉取请求以供跟踪和导航。
 */
export type PRLinkMessage = {
  type: 'pr-link'
  sessionId: UUID
  prNumber: number
  prUrl: string
  prRepository: string // 例如 "owner/repo"
  timestamp: string // 关联时的 ISO 时间戳
}

/** 模式条目 */
export type ModeEntry = {
  type: 'mode'
  sessionId: UUID
  mode: 'coordinator' | 'normal'
}

/**
 * 持久化到会话记录中的工作树状态，用于恢复。
 * WorktreeSession 的子集（来自 utils/worktree.ts），排除临时字段
 *（creationDurationMs、usedSparsePaths），这些字段仅用于首次运行分析。
 */
export type PersistedWorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * 记录会话当前是否位于 EnterWorktree 或 --worktree 创建的工作树中。
 * 最后写入的生效：进入时写入会话，退出时写入 null。
 * 在 --resume 时，仅当 worktreePath 仍存在于磁盘上时才恢复（/exit 对话框可能已将其删除）。
 */
export type WorktreeStateEntry = {
  type: 'worktree-state'
  sessionId: UUID
  worktreeSession: PersistedWorktreeSession | null
}

/**
 * 记录上下文中被替换为较小存根的内容块（完整内容已持久化到其他位置）。
 * 在恢复时重放以保持提示缓存的稳定性。每次强制执行通过替换至少一个块时写入一次。
 * 当设置了 agentId 时，记录属于子代理侧链（AgentTool 恢复时读取）；未设置时属于主线程（/resume 读取）。
 */
export type ContentReplacementEntry = {
  type: 'content-replacement'
  sessionId: UUID
  agentId?: AgentId
  replacements: ContentReplacementRecord[]
}

/** 文件历史快照消息 */
export type FileHistorySnapshotMessage = {
  type: 'file-history-snapshot'
  messageId: UUID
  snapshot: FileHistorySnapshot
  isSnapshotUpdate: boolean
}

/** 按文件跟踪 Claude 字符贡献的归属状态 */

/** 文件归属状态 */
export type FileAttributionState = {
  contentHash: string // 文件内容的 SHA-256 哈希
  claudeContribution: number // Claude 写入的字符数
  mtime: number // 文件修改时间
}

/**
 * 归属快照消息，存储在会话记录中。
 * 跟踪 Claude 的字符级贡献，用于提交归属。
 */
export type AttributionSnapshotMessage = {
  type: 'attribution-snapshot'
  messageId: UUID
  surface: string // 客户端来源 (cli, ide, web, api)
  fileStates: Record<string, FileAttributionState>
  promptCount?: number // 会话中的总提示数
  promptCountAtLastCommit?: number // 上次提交时的提示数
  permissionPromptCount?: number // 显示的权限提示总数
  permissionPromptCountAtLastCommit?: number // 上次提交时的权限提示数
  escapeCount?: number // ESC 按键总数（取消的权限提示）
  escapeCountAtLastCommit?: number // 上次提交时的 ESC 按键数
}

/** 会话记录消息 */

export type TranscriptMessage = SerializedMessage & {
  parentUuid: UUID | null // 父消息 UUID
  logicalParentUuid?: UUID | null // 逻辑父消息 UUID // parentUuid 为 null 时保留逻辑父消息
  isSidechain: boolean
  gitBranch?: string
  agentId?: string // 代理 ID // 用于侧链记录恢复
  teamName?: string // 派生代理会话的团队名称
  agentName?: string // 代理的自定义名称（来自 /rename 或 swarm）
  agentColor?: string // 代理颜色（来自 /rename 或 swarm）
  promptId?: string // 提示 ID // 与用户提示消息的 OTel prompt.id 关联
}

/** 推测接受消息 */
export type SpeculationAcceptMessage = {
  type: 'speculation-accept' // 推测接受
  timestamp: string
  timeSavedMs: number // 节省的时间（毫秒）
}

/**
 * 持久化的上下文折叠提交。存档的消息本身并未持久化——
 * 它们已在会话记录中作为普通用户/助手消息存在。我们只持久化足够的信息来重建拼接
 * 指令（边界 UUID）和摘要占位符（该占位符不在会话记录中，
 * 因为它从未被生成到 REPL 中）。
 *
 * 恢复时，存储使用 archived=[] 重建 CommittedCollapse；
 * projectView 首次找到该跨度时惰性填充存档。
 *
 * 标识符经过混淆以匹配门控名称。sessionStorage.ts
 * 不是功能门控（它是每种条目类型使用的通用记录管道），因此这里的描述性字符串会泄露到外部构建中
 * 通过 appendEntry 调度 / loadTranscriptFile 解析器，即使外部构建中
 * 没有任何内容会写入或读取此条目。
 */
export type ContextCollapseCommitEntry = {
  type: 'marble-origami-commit'
  sessionId: UUID
  /** 16 位折叠 ID。所有条目中的最大值会重置 ID 计数器。 */
  collapseId: string
  /** 摘要占位符的 uuid — registerSummary() 需要它 */
  summaryUuid: string
  /** 占位符的完整 <collapsed id="...">text</collapsed> 字符串 */
  summaryContent: string
  /** ctx_inspect 使用的纯文本摘要 */
  summary: string
  /** 跨度边界 — projectView 在恢复的 Message[] 中查找这些 */
  firstArchivedUuid: string
  lastArchivedUuid: string
}

/**
 * 暂存队列和生成触发状态的快照。与提交不同（仅追加，全部重放），
 * 快照采用最后写入生效策略——只有最新的
 * 快照条目会在恢复时应用。在每次
 * ctx-agent 生成解析后写入（此时暂存内容可能已更改）。
 *
 * 暂存边界使用 UUID（会话级别稳定），而非折叠 ID（会
 * 随 uuidToId 双射重置）。恢复暂存跨度时会产生新的
 * 折叠 ID，但跨度本身能正确解析。
 */
export type ContextCollapseSnapshotEntry = {
  type: 'marble-origami-snapshot'
  sessionId: UUID
  staged: Array<{
    startUuid: string
    endUuid: string
    summary: string
    risk: number
    stagedAt: number
  }>
  /** 生成触发状态，以便 +interval 时钟从中断处继续 */
  armed: boolean
  lastSpawnTokens: number
}

export type Entry =
  | TranscriptMessage
  | SummaryMessage
  | CustomTitleMessage
  | AiTitleMessage
  | LastPromptMessage
  | TaskSummaryMessage
  | TagMessage
  | AgentNameMessage
  | AgentColorMessage
  | AgentSettingMessage
  | PRLinkMessage
  | FileHistorySnapshotMessage
  | AttributionSnapshotMessage
  | QueueOperationMessage
  | SpeculationAcceptMessage
  | ModeEntry
  | WorktreeStateEntry
  | ContentReplacementEntry
  | ContextCollapseCommitEntry
  | ContextCollapseSnapshotEntry

export function sortLogs(logs: LogOption[]): LogOption[] {
  return logs.sort((a, b) => {
    // 按修改日期排序（最新优先）
    const modifiedDiff = b.modified.getTime() - a.modified.getTime()
    if (modifiedDiff !== 0) {
      return modifiedDiff
    }

    // 如果修改日期相同，则按创建日期排序（最新优先）
    return b.created.getTime() - a.created.getTime()
  })
}
