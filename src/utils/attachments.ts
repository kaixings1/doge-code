// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from '../services/analytics/index.js'
import {
  toolMatchesName,
  type Tools,
  type ToolUseContext,
  type ToolPermissionContext,
} from '../Tool.js'
import {
  FileReadTool,
  MaxFileReadTokenExceededError,
  type Output as FileReadToolOutput,
  readImageWithTokenBudget,
} from '../tools/FileReadTool/FileReadTool.js'
import { FileTooLargeError, readFileInRange } from './readFileInRange.js'
import { expandPath } from './path.js'
import { countCharInString } from './stringUtils.js'
import { count, uniq } from './array.js'
import { getFsImplementation } from './fsOperations.js'
import { readdir, stat } from 'fs/promises'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import { TODO_WRITE_TOOL_NAME } from '../tools/TodoWriteTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '../tools/TaskCreateTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '../tools/TaskUpdateTool/constants.js'
import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js'
import { SKILL_TOOL_NAME } from '../tools/SkillTool/constants.js'
import type { TodoList } from './todo/types.js'
import {
  type Task,
  listTasks,
  getTaskListId,
  isTodoV2Enabled,
} from './tasks.js'
import { getPlanFilePath, getPlan } from './plans.js'
import { getConnectedIdeName } from './ide.js'
import {
  filterInjectedMemoryFiles,
  getManagedAndUserConditionalRules,
  getMemoryFiles,
  getMemoryFilesForNestedDirectory,
  getConditionalRulesForCwdLevelDirectory,
  type MemoryFileInfo,
} from './claudemd.js'
import { dirname, parse, relative, resolve } from 'path'
import { getCwd } from '../utils/cwd.js'
import { getViewedTeammateTask } from '../state/selectors.js'
import { logError } from './log.js'
import { logAntError } from './debug.js'
import { isENOENT, toError } from './errors.js'
import type { DiagnosticFile } from '../services/diagnosticTracking.js'
import { diagnosticTracker } from '../services/diagnosticTracking.js'
import type {
  AttachmentMessage,
  Message,
  MessageOrigin,
} from '../types/message.js'
import {
  type QueuedCommand,
  getImagePasteIds,
  isValidImagePaste,
} from '../types/textInputTypes.js'
import { randomUUID, type UUID } from 'crypto'
import { getSettings_DEPRECATED } from './settings/settings.js'
import { getSnippetForTwoFileDiff } from '../tools/FileEditTool/utils.js'
import type {
  ContentBlockParam,
  ImageBlockParam,
  Base64ImageSource,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import { maybeResizeAndDownsampleImageBlock } from './imageResizer.js'
import type { PastedContent } from './config.js'
import { getGlobalConfig } from './config.js'
import {
  getDefaultSonnetModel,
  getDefaultHaikuModel,
  getDefaultOpusModel,
} from './model/model.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { getSkillToolCommands, getMcpSkillCommands } from '../commands.js'
import type { Command } from '../types/command.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { formatCommandsWithinBudget } from '../tools/SkillTool/prompt.js'
import { getContextWindowForModel } from './context.js'
import type { DiscoverySignal } from '../services/skillSearch/signals.js'
// 条件性 require 用于 DCE。所有 skill-search 字符串字面量
// 否则会泄露到外部构建中的字符串位于这些模块中。唯一
// 在此文件中的表现是：maybe() 调用（通过下方的 spread 门控）和
// skill_listing 抑制检查（使用相同的 skillSearchModules null
// 检查）。上面的类型限定 DiscoverySignal 导入在编译时被擦除。
 
const skillSearchModules = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? {
      featureCheck:
        require('../services/skillSearch/featureCheck.js') as typeof import('../services/skillSearch/featureCheck.js'),
      prefetch:
        require('../services/skillSearch/prefetch.js') as typeof import('../services/skillSearch/prefetch.js'),
    }
  : null
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./permissions/autoModeState.js') as typeof import('./permissions/autoModeState.js'))
  : null
 
import {
  MAX_LINES_TO_READ,
  FILE_READ_TOOL_NAME,
} from '../tools/FileReadTool/prompt.js'
import { getDefaultFileReadingLimits } from '../tools/FileReadTool/limits.js'
import { cacheKeys, type FileStateCache } from './fileStateCache.js'
import {
  createAbortController,
  createChildAbortController,
} from './abortController.js'
import { isAbortError } from './errors.js'
import {
  getFileModificationTimeAsync,
  isFileWithinReadSizeLimit,
} from './file.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { filterAgentsByMcpRequirements } from '../tools/AgentTool/loadAgentsDir.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import {
  formatAgentLine,
  shouldInjectAgentListInMessages,
} from '../tools/AgentTool/prompt.js'
import { filterDeniedAgents } from './permissions/permissions.js'
import { getSubscriptionType } from './auth.js'
import { mcpInfoFromString } from '../services/mcp/mcpStringUtils.js'
import {
  matchingRuleForInput,
  pathInAllowedWorkingPath,
} from './permissions/filesystem.js'
import {
  generateTaskAttachments,
  applyTaskOffsetsAndEvictions,
} from './task/framework.js'
import { getTaskOutputPath } from './task/diskOutput.js'
import { drainPendingMessages } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskType, TaskStatus } from '../Task.js'
import {
  getOriginalCwd,
  getSessionId,
  getSdkBetas,
  getTotalCostUSD,
  getTotalOutputTokens,
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  needsPlanModeExitAttachment,
  setNeedsPlanModeExitAttachment,
  needsAutoModeExitAttachment,
  setNeedsAutoModeExitAttachment,
  getLastEmittedDate,
  setLastEmittedDate,
  getKairosActive,
} from '../bootstrap/state.js'
import type { QuerySource } from '../constants/querySource.js'
import {
  getDeferredToolsDelta,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabledOptimistic,
  isToolSearchToolAvailable,
  modelSupportsToolReference,
  type DeferredToolsDeltaScanContext,
} from './toolSearch.js'
import {
  getMcpInstructionsDelta,
  isMcpInstructionsDeltaEnabled,
  type ClientSideInstruction,
} from './mcpInstructionsDelta.js'
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from './claudeInChrome/common.js'
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from './claudeInChrome/prompt.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type {
  HookEvent,
  SyncHookJSONOutput,
} from '../entrypoints/agentSdkTypes.js'
import {
  checkForAsyncHookResponses,
  removeDeliveredAsyncHooks,
} from './hooks/AsyncHookRegistry.js'
import {
  checkForLSPDiagnostics,
  clearAllLSPDiagnostics,
} from '../services/lsp/LSPDiagnosticRegistry.js'
import { logForDebugging } from './debug.js'
import {
  extractTextContent,
  getUserMessageText,
  isThinkingMessage,
} from './messages.js'
import { isHumanTurn } from './messagePredicates.js'
import { isEnvTruthy, getClaudeConfigHomeDir } from './envUtils.js'
import { feature } from 'bun:bundle'
 
const BRIEF_TOOL_NAME: string | null =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (
        require('../tools/BriefTool/prompt.js') as typeof import('../tools/BriefTool/prompt.js')
      ).BRIEF_TOOL_NAME
    : null
const sessionTranscriptModule = feature('KAIROS')
  ? (require('../services/sessionTranscript/sessionTranscript.js') as typeof import('../services/sessionTranscript/sessionTranscript.js'))
  : null

import { hasUltrathinkKeyword, isUltrathinkEnabled } from './thinking.js'
import {
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation,
} from './tokens.js'
import {
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
} from '../services/compact/autoCompact.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  hasInstructionsLoadedHook,
  executeInstructionsLoadedHooks,
  type HookBlockingError,
  type InstructionsMemoryType,
} from './hooks.js'
import { jsonStringify } from './slowOperations.js'
import { isPDFExtension } from './pdfUtils.js'
import { getLocalISODate } from '../constants/common.js'
import { getPDFPageCount } from './pdf.js'
import { PDF_AT_MENTION_INLINE_THRESHOLD } from '../constants/apiLimits.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'
import { findRelevantMemories } from '../memdir/findRelevantMemories.js'
import { memoryAge, memoryFreshnessText } from '../memdir/memoryAge.js'
import { getAutoMemPath, isAutoMemoryEnabled } from '../memdir/paths.js'
import { getAgentMemoryDir } from '../tools/AgentTool/agentMemory.js'
import {
  readUnreadMessages,
  markMessagesAsReadByPredicate,
  isShutdownApproved,
  isStructuredProtocolMessage,
  isIdleNotification,
} from './teammateMailbox.js'
import {
  getAgentName,
  getAgentId,
  getTeamName,
  isTeamLead,
} from './teammate.js'
import { isInProcessTeammate } from './teammateContext.js'
import { removeTeammateFromTeamFile } from './swarm/teamHelpers.js'
import { unassignTeammateTasks } from './tasks.js'
import { getCompanionIntroAttachment } from '../buddy/prompt.js'

export const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 10,
  TURNS_BETWEEN_REMINDERS: 10,
} as const

export const PLAN_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
} as const

export const AUTO_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
} as const

const MAX_MEMORY_LINES = 200
// 行数上限本身无法限制大小（200 × 500字符的行 = 100KB）。
// 注入器每回合通过 <system-reminder> 最多注入 5 个文件，绕过了每条消息的工具结果预算，
// 因此严格的每文件字节上限可以将总注入量控制在合理范围内（5 × 4KB = 20KB/回合）。
// 通过 readFileInRange 的 truncateOnByteLimit 选项强制执行。截断意味着
// 最相关的内容仍然会显示：通常是 frontmatter + 开头上下文。
const MAX_MEMORY_BYTES = 4096

export const RELEVANT_MEMORIES_CONFIG = {
  // 每回合上限（5 × 4KB = 20KB）限制单次注入，但长时间会话中选择器会不断显示不同文件
  // — 生产环境中约 26K tokens/会话。限制累积字节数：达到上限后完全停止预取。
  // 预算约为 3 次完整注入；超过这个量后最相关的内容已经在上下文中了。
  // 扫描消息（而非在 toolUseContext 中跟踪）意味着 compact 会自然重置计数器
  // — 旧的附件从上下文中移除后，重新显示是有效的。
  MAX_SESSION_BYTES: 60 * 1024,
} as const

export const VERIFY_PLAN_REMINDER_CONFIG = {
  TURNS_BETWEEN_REMINDERS: 10,
} as const

// 文件附件类型定义

export type FileAttachment = {
  type: 'file'
  filename: string
  content: FileReadToolOutput
  /**
   * 文件是否因大小限制而被截断
   */
  truncated?: boolean
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type CompactFileReferenceAttachment = {
  type: 'compact_file_reference'
  filename: string
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type PDFReferenceAttachment = {
  type: 'pdf_reference'
  filename: string
  pageCount: number
  fileSize: number
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type AlreadyReadFileAttachment = {
  type: 'already_read_file'
  filename: string
  content: FileReadToolOutput
  /**
   * 文件是否因大小限制而被截断
   */
  truncated?: boolean
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

// 智能体提及附件
export type AgentMentionAttachment = {
  type: 'agent_mention'
  agentType: string
}

// 异步钩子响应附件
export type AsyncHookResponseAttachment = {
  type: 'async_hook_response'
  processId: string
  hookName: string
  hookEvent: HookEvent | 'StatusLine' | 'FileSuggestion'
  toolName?: string
  response: SyncHookJSONOutput
  stdout: string
  stderr: string
  exitCode?: number
}

// 钩子附件联合类型
export type HookAttachment =
  | HookCancelledAttachment
  | {
      type: 'hook_blocking_error'
      blockingError: HookBlockingError
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookNonBlockingErrorAttachment
  | HookErrorDuringExecutionAttachment
  | {
      type: 'hook_stopped_continuation'
      message: string
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookSuccessAttachment
  | {
      type: 'hook_additional_context'
      content: string[]
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookSystemMessageAttachment
  | HookPermissionDecisionAttachment

// 钩子权限决策附件
export type HookPermissionDecisionAttachment = {
  type: 'hook_permission_decision'
  decision: 'allow' | 'deny'
  toolUseID: string
  hookEvent: HookEvent
}

// 钩子系统消息附件
export type HookSystemMessageAttachment = {
  type: 'hook_system_message'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
}

// 钩子取消附件
export type HookCancelledAttachment = {
  type: 'hook_cancelled'
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

// 钩子错误附件（执行期间）
export type HookErrorDuringExecutionAttachment = {
  type: 'hook_error_during_execution'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

// 钩子成功附件
export type HookSuccessAttachment = {
  type: 'hook_success'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  stdout?: string
  stderr?: string
  exitCode?: number
  command?: string
  durationMs?: number
}

// 钩子非阻塞错误附件
export type HookNonBlockingErrorAttachment = {
  type: 'hook_non_blocking_error'
  hookName: string
  stderr: string
  stdout: string
  exitCode: number
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

export type Attachment =
  /**
   * User at-mentioned the file
   */
  | FileAttachment
  | CompactFileReferenceAttachment
  | PDFReferenceAttachment
  | AlreadyReadFileAttachment
  /**
   * An at-mentioned file was edited
   */
  | {
      type: 'edited_text_file'
      filename: string
      snippet: string
    }
  | {
      type: 'edited_image_file'
      filename: string
      content: FileReadToolOutput
    }
  | {
      type: 'directory'
      path: string
      content: string
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'selected_lines_in_ide'
      ideName: string
      lineStart: number
      lineEnd: number
      filename: string
      content: string
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'opened_file_in_ide'
      filename: string
    }
  | {
      type: 'todo_reminder'
      content: TodoList
      itemCount: number
    }
  | {
      type: 'task_reminder'
      content: Task[]
      itemCount: number
    }
  | {
      type: 'nested_memory'
      path: string
      content: MemoryFileInfo
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'relevant_memories'
      memories: {
        path: string
        content: string
        mtimeMs: number
        /**
         * Pre-computed header string (age + path prefix).  Computed once
         * at attachment-creation time so the rendered bytes are stable
         * across turns — recomputing memoryAge(mtimeMs) at render time
         * calls Date.now(), so "saved 3 days ago" becomes "saved 4 days
         * ago" across turns → different bytes → prompt cache bust.
         * Optional for backward compat with resumed sessions; render
         * path falls back to recomputing if missing.
         */
        header?: string
        /**
         * lineCount when the file was truncated by readMemoriesForSurfacing,
         * else undefined. Threaded to the readFileState write so
         * getChangedFiles skips truncated memories (partial content would
         * yield a misleading diff).
         */
        limit?: number
      }[]
    }
  | {
      type: 'dynamic_skill'
      skillDir: string
      skillNames: string[]
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'skill_listing'
      content: string
      skillCount: number
      isInitial: boolean
    }
  | {
      type: 'skill_discovery'
      skills: { name: string; description: string; shortId?: string }[]
      signal: DiscoverySignal
      source: 'native' | 'aki' | 'both'
    }
  | {
      type: 'queued_command'
      prompt: string | Array<ContentBlockParam>
      source_uuid?: UUID
      imagePasteIds?: number[]
      /** 原始队列模式——'prompt' 表示用户消息，'task-notification' 表示系统事件 */
      commandMode?: string
      /** 从 QueuedCommand 携带的来源信息，确保轮中排空时保持一致 */
      origin?: MessageOrigin
      /** 从 QueuedCommand.isMeta 携带，区分人工输入与系统注入 */
      isMeta?: boolean
    }
  | {
      type: 'output_style'
      style: string
    }
  | {
      type: 'diagnostics'
      files: DiagnosticFile[]
      isNew: boolean
    }
  | {
      type: 'plan_mode'
      reminderType: 'full' | 'sparse'
      isSubAgent?: boolean
      planFilePath: string
      planExists: boolean
    }
  | {
      type: 'plan_mode_reentry'
      planFilePath: string
    }
  | {
      type: 'plan_mode_exit'
      planFilePath: string
      planExists: boolean
    }
  | {
      type: 'auto_mode'
      reminderType: 'full' | 'sparse'
    }
  | {
      type: 'auto_mode_exit'
    }
  | {
      type: 'critical_system_reminder'
      content: string
    }
  | {
      type: 'plan_file_reference'
      planFilePath: string
      planContent: string
    }
  | {
      type: 'mcp_resource'
      server: string
      uri: string
      name: string
      description?: string
      content: ReadResourceResult
    }
  | {
      type: 'command_permissions'
      allowedTools: string[]
      model?: string
    }
  | AgentMentionAttachment
  | {
      type: 'task_status'
      taskId: string
      taskType: TaskType
      status: TaskStatus
      description: string
      deltaSummary: string | null
      outputFilePath?: string
    }
  | AsyncHookResponseAttachment
  | {
      type: 'token_usage'
      used: number
      total: number
      remaining: number
    }
  | {
      type: 'budget_usd'
      used: number
      total: number
      remaining: number
    }
  | {
      type: 'output_token_usage'
      turn: number
      session: number
      budget: number | null
    }
  | {
      type: 'structured_output'
      data: unknown
    }
  | TeammateMailboxAttachment
  | TeamContextAttachment
  | HookAttachment
  | {
      type: 'invoked_skills'
      skills: Array<{
        name: string
        path: string
        content: string
      }>
    }
  | {
      type: 'verify_plan_reminder'
    }
  | {
      type: 'max_turns_reached'
      maxTurns: number
      turnCount: number
    }
  | {
      type: 'current_session_memory'
      content: string
      path: string
      tokenCount: number
    }
  | {
      type: 'teammate_shutdown_batch'
      count: number
    }
  | {
      type: 'compaction_reminder'
    }
  | {
      type: 'context_efficiency'
    }
  | {
      type: 'date_change'
      newDate: string
    }
  | {
      type: 'ultrathink_effort'
      level: 'high'
    }
  | {
      type: 'deferred_tools_delta'
      addedNames: string[]
      addedLines: string[]
      removedNames: string[]
    }
  | {
      type: 'agent_listing_delta'
      addedTypes: string[]
      addedLines: string[]
      removedTypes: string[]
      /** 如果这是对话中的首次公告，则为 true */
      isInitial: boolean
      /** 是否包含"并发启动多个智能体"的说明（非专业订阅） */
      showConcurrencyNote: boolean
    }
  | {
      type: 'mcp_instructions_delta'
      addedNames: string[]
      addedBlocks: string[]
      removedNames: string[]
    }
  | {
      type: 'companion_intro'
      name: string
      species: string
    }
  | {
      type: 'bagel_console'
      errorCount: number
      warningCount: number
      sample: string
    }

export type TeammateMailboxAttachment = {
  type: 'teammate_mailbox'
  messages: Array<{
    from: string
    text: string
    timestamp: string
    color?: string
    summary?: string
  }>
}

export type TeamContextAttachment = {
  type: 'team_context'
  agentId: string
  agentName: string
  teamName: string
  teamConfigPath: string
  taskListPath: string
}

/**
 * 这个函数比较杂乱
 * TODO: 在创建消息时生成附件，而不是在这里
 */
export async function getAttachments(
  input: string | null,
  toolUseContext: ToolUseContext,
  ideSelection: IDESelection | null,
  queuedCommands: QueuedCommand[],
  messages?: Message[],
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): Promise<Attachment[]> {
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS) ||
    isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
  ) {
    // query.ts:removeFromQueue 在 getAttachmentMessages 运行后会无条件地取消排队
    // 因此在这里返回 [] 会静默丢弃它们。
    // Coworker 使用 --bare 运行，依赖 task-notification 获取
    // 来自 Local*Task/Remote*Task 的中途工具调用通知。
    return getQueuedCommandAttachments(queuedCommands)
  }

  // 这会降低提交速度
  // TODO: 在用户输入时计算附件，而不是在这里（尽管我们也会对斜杠命令提示使用此函数）
  const abortController = createAbortController()
  // 增加超时时间到 5 秒（原 1 秒），避免大文件读取、PDF 处理、技能发现等操作超时
  const timeoutId = setTimeout(ac => ac.abort(), 5000, abortController)
  const context = { ...toolUseContext, abortController }

  const isMainThread = !toolUseContext.agentId

  // 响应用户输入的附件
  const userInputAttachments = input
    ? [
        maybe('at_mentioned_files', () =>
          processAtMentionedFiles(input, context),
        ),
        maybe('mcp_resources', () =>
          processMcpResourceAttachments(input, context),
        ),
        maybe('agent_mentions', () =>
          Promise.resolve(
            processAgentMentions(
              input,
              toolUseContext.options.agentDefinitions.activeAgents,
            ),
          ),
        ),
        // 技能发现在第 0 回合（用户输入作为信号）。回合间
        // discovery 通过 query.ts 中的 startSkillDiscoveryPrefetch 运行，
        // 受写时拐点检测控制 — 详见 skillSearch/prefetch.ts。
        // feature() 可以让 DCE 删除 "skill_discovery" 字符串（以及
        // 它调用的函数）从外部构建中删除。
        //
        // skipSkillDiscovery 控制 SKILL.md 展开路径
        // （getMessagesForPromptSlashCommand）。当技能被调用时，其
        // SKILL.md 内容会作为 `input` 传递到这里以提取 @提及 —
        // 但该内容不是用户意图，不应触发发现。
        // 如果没有此门控，一个 110KB 的 SKILL.md 会触发约 3.3 秒的分块 AKI
        // 查询在每次技能调用时（session 13a9afae）。
        ...(feature('EXPERIMENTAL_SKILL_SEARCH') &&
        skillSearchModules &&
        !options?.skipSkillDiscovery
          ? [
              maybe('skill_discovery', () =>
                skillSearchModules.prefetch.getTurnZeroSkillDiscovery(
                  input,
                  messages ?? [],
                  context,
                ),
              ),
            ]
          : []),
      ]
    : []

  // 首先处理用户输入附件（包括 @提及 的文件）
  // 这确保文件在 nested_memory 处理之前被添加到 nestedMemoryAttachmentTriggers
  const userAttachmentResults = await Promise.all(userInputAttachments)

  // 子代理可用的线程安全附件
  // 注意：这些必须在 userInputAttachments 完成后创建
  // 以确保 nestedMemoryAttachmentTriggers 在 getNestedMemoryAttachments 运行前已填充
  const allThreadAttachments = [
    // queuedCommands 已由 query.ts 中的排空门控按代理范围划分 —
    // 主线程获得 agentId===undefined，子代理获得各自的 agentId.
    // 必须对所有线程运行，否则子代理通知将丢失
    // (已由 removeFromQueue 从队列中移除但从未附加).
    maybe('queued_commands', () => getQueuedCommandAttachments(queuedCommands)),
    maybe('date_change', () =>
      Promise.resolve(getDateChangeAttachments(messages)),
    ),
    maybe('ultrathink_effort', () =>
      Promise.resolve(getUltrathinkEffortAttachment(input)),
    ),
    maybe('deferred_tools_delta', () =>
      Promise.resolve(
        getDeferredToolsDeltaAttachment(
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages,
          {
            callSite: isMainThread
              ? 'attachments_main'
              : 'attachments_subagent',
            querySource,
          },
        ),
      ),
    ),
    maybe('agent_listing_delta', () =>
      Promise.resolve(getAgentListingDeltaAttachment(toolUseContext, messages)),
    ),
    maybe('mcp_instructions_delta', () =>
      Promise.resolve(
        getMcpInstructionsDeltaAttachment(
          toolUseContext.options.mcpClients,
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages,
        ),
      ),
    ),
    ...(true
      ? [
          maybe('companion_intro', () =>
            Promise.resolve(getCompanionIntroAttachment(messages)),
          ),
        ]
      : []),
    maybe('changed_files', () => getChangedFiles(context)),
    maybe('nested_memory', () => getNestedMemoryAttachments(context)),
    // relevant_memories 已移至异步预取（startRelevantMemoryPrefetch）
    maybe('dynamic_skill', () => getDynamicSkillAttachments(context)),
    maybe('skill_listing', () => getSkillListingAttachments(context)),
    // 回合间 技能发现现在通过 startSkillDiscoveryPrefetch 运行
    // (query.ts, 与主回合并发)。原来在这里的阻塞调用是
    // assistant_turn 信号——97% 的 Haiku 调用在生产中找不到任何内容。
    // 预取 + 等待收集取代了它；详见 src/services/skillSearch/prefetch.ts
    maybe('plan_mode', () => getPlanModeAttachments(messages, toolUseContext)),
    maybe('plan_mode_exit', () => getPlanModeExitAttachment(toolUseContext)),
    ...(feature('TRANSCRIPT_CLASSIFIER')
      ? [
          maybe('auto_mode', () =>
            getAutoModeAttachments(messages, toolUseContext),
          ),
          maybe('auto_mode_exit', () =>
            getAutoModeExitAttachment(toolUseContext),
          ),
        ]
      : []),
    maybe('todo_reminders', () =>
      isTodoV2Enabled()
        ? getTaskReminderAttachments(messages, toolUseContext)
        : getTodoReminderAttachments(messages, toolUseContext),
    ),
    ...(isAgentSwarmsEnabled()
      ? [
          // 跳过 session_memory 派生代理的队友邮箱。
          // 它与领导者共享 AppState.teamContext，因此 isTeamLead 解析为
          // true，并将领导者的 DMs 读取+标记为已读，作为临时附件，
          // 静默窃取本应作为永久回合传递的消息。
          ...(querySource === 'session_memory'
            ? []
            : [
                maybe('teammate_mailbox', async () =>
                  getTeammateMailboxAttachments(toolUseContext),
                ),
              ]),
          maybe('team_context', async () =>
            getTeamContextAttachment(messages ?? []),
          ),
        ]
      : []),
    maybe('agent_pending_messages', async () =>
      getAgentPendingMessageAttachments(toolUseContext),
    ),
    maybe('critical_system_reminder', () =>
      Promise.resolve(getCriticalSystemReminderAttachment(toolUseContext)),
    ),
    ...(feature('COMPACTION_REMINDERS')
      ? [
          maybe('compaction_reminder', () =>
            Promise.resolve(
              getCompactionReminderAttachment(
                messages ?? [],
                toolUseContext.options.mainLoopModel,
              ),
            ),
          ),
        ]
      : []),
    ...(feature('HISTORY_SNIP')
      ? [
          maybe('context_efficiency', () =>
            Promise.resolve(getContextEfficiencyAttachment(messages ?? [])),
          ),
        ]
      : []),
  ]

  // 仅语义上适用于主要对话或不具有并发安全实现的附件
  const mainThreadAttachments = isMainThread
    ? [
        maybe('ide_selection', async () =>
          getSelectedLinesFromIDE(ideSelection, toolUseContext),
        ),
        maybe('ide_opened_file', async () =>
          getOpenedFileFromIDE(ideSelection, toolUseContext),
        ),
        maybe('output_style', async () =>
          Promise.resolve(getOutputStyleAttachment()),
        ),
        maybe('diagnostics', async () =>
          getDiagnosticAttachments(toolUseContext),
        ),
        maybe('lsp_diagnostics', async () =>
          getLSPDiagnosticAttachments(toolUseContext),
        ),
        maybe('unified_tasks', async () =>
          getUnifiedTaskAttachments(toolUseContext),
        ),
        maybe('async_hook_responses', async () =>
          getAsyncHookResponseAttachments(),
        ),
        maybe('token_usage', async () =>
          Promise.resolve(
            getTokenUsageAttachment(
              messages ?? [],
              toolUseContext.options.mainLoopModel,
            ),
          ),
        ),
        maybe('budget_usd', async () =>
          Promise.resolve(
            getMaxBudgetUsdAttachment(toolUseContext.options.maxBudgetUsd),
          ),
        ),
        maybe('output_token_usage', async () =>
          Promise.resolve(getOutputTokenUsageAttachment()),
        ),
        maybe('verify_plan_reminder', async () =>
          getVerifyPlanReminderAttachment(messages, toolUseContext),
        ),
      ]
    : []

  // 并行处理线程和主线程附件（它们之间没有依赖关系）
  const [threadAttachmentResults, mainThreadAttachmentResults] =
    await Promise.all([
      Promise.all(allThreadAttachments),
      Promise.all(mainThreadAttachments),
    ])

  clearTimeout(timeoutId)
  // 防御性措施：返回 [undefined] 的 getter 会导致下面的 .map(a => a.type) 崩溃。
  return [
    ...userAttachmentResults.flat(),
    ...threadAttachmentResults.flat(),
    ...mainThreadAttachmentResults.flat(),
  ].filter(a => a !== undefined && a !== null)
}

async function maybe<A>(label: string, f: () => Promise<A[]>): Promise<A[]> {
  const startTime = Date.now()
  try {
    const result = await f()
    const duration = Date.now() - startTime
    // 仅记录 5% 的事件以减少数据量
    if (Math.random() < 0.05) {
      // jsonStringify(undefined) 返回 undefined，因此 .length 会抛出异常
      const attachmentSizeBytes = result
        .filter(a => a !== undefined && a !== null)
        .reduce((total, attachment) => {
          return total + jsonStringify(attachment).length
        }, 0)
      logEvent('tengu_attachment_compute_duration', {
        label,
        duration_ms: duration,
        attachment_size_bytes: attachmentSizeBytes,
        attachment_count: result.length,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    }
    return result
  } catch (e) {
    const duration = Date.now() - startTime
    // 仅记录 5% 的事件以减少数据量
    if (Math.random() < 0.05) {
      logEvent('tengu_attachment_compute_duration', {
        label,
        duration_ms: duration,
        error: true,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    }
    logError(e)
    // 对于 Ant 用户，记录完整错误以帮助调试
    logAntError(`Attachment error in ${label}`, e)

    return []
  }
}

const INLINE_NOTIFICATION_MODES = new Set(['prompt', 'task-notification'])

export async function getQueuedCommandAttachments(
  queuedCommands: QueuedCommand[],
): Promise<Attachment[]> {
  if (!queuedCommands) {
    return []
  }
  // 将 prompt 和 task-notification 命令都作为附件包含。
  // 在主动 agentic 循环期间，task-notification 命令否则
  // 会永久留在队列中（useQueueProcessor 在查询运行时无法执行
  // 处于活动状态），导致 hasPendingNotifications() 返回 true，Sleep 将
  // 立即以 0ms 持续时间唤醒，进入无限循环。
  const filtered = queuedCommands.filter(_ =>
    INLINE_NOTIFICATION_MODES.has(_.mode),
  )
  return Promise.all(
    filtered.map(async _ => {
      const imageBlocks = await buildImageContentBlocks(_.pastedContents)
      let prompt: string | Array<ContentBlockParam> = _.value
      if (imageBlocks.length > 0) {
        // 构建包含文本+图像的内容块数组，以便模型看到它们
        const textValue =
          typeof _.value === 'string'
            ? _.value
            : extractTextContent(_.value, '\n')
        prompt = [{ type: 'text' as const, text: textValue }, ...imageBlocks]
      }
      return {
        type: 'queued_command' as const,
        prompt,
        source_uuid: _.uuid,
        imagePasteIds: getImagePasteIds(_.pastedContents),
        commandMode: _.mode,
        origin: _.origin,
        isMeta: _.isMeta,
      }
    }),
  )
}

export function getAgentPendingMessageAttachments(
  toolUseContext: ToolUseContext,
): Attachment[] {
  const agentId = toolUseContext.agentId
  if (!agentId) return []
  const drained = drainPendingMessages(
    agentId,
    toolUseContext.getAppState,
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState,
  )
  return drained.map(msg => ({
    type: 'queued_command' as const,
    prompt: msg,
    origin: { kind: 'coordinator' as const },
    isMeta: true,
  }))
}

async function buildImageContentBlocks(
  pastedContents: Record<number, PastedContent> | undefined,
): Promise<ImageBlockParam[]> {
  if (!pastedContents) {
    return []
  }
  const imageContents = Object.values(pastedContents).filter(isValidImagePaste)
  if (imageContents.length === 0) {
    return []
  }
  const results = await Promise.all(
    imageContents.map(async img => {
      const imageBlock: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mediaType ||
            'image/png') as Base64ImageSource['media_type'],
          data: img.content,
        },
      }
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock)
      return resized.block
    }),
  )
  return results
}

function getPlanModeAttachmentTurnCount(messages: Message[]): {
  turnCount: number
  foundPlanModeAttachment: boolean
} {
  let turnsSinceLastAttachment = 0
  let foundPlanModeAttachment = false

  // 向后迭代以查找最近的 plan_mode 附件。
  // 统计人类回合数（非元消息、非工具结果的用户消息），不统计助手
  // 消息 — query.ts 中的工具循环在每次工具调用时都会调用 getAttachmentMessages，
  // 工具回合，因此统计助手消息会导致提醒每
  // 5 次工具调用触发一次，而不是每 5 次人类回合触发一次。
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (
      message?.type === 'user' &&
      !message.isMeta &&
      !hasToolResultContent(message.message.content)
    ) {
      turnsSinceLastAttachment++
    } else if (
      message?.type === 'attachment' &&
      (message.attachment.type === 'plan_mode' ||
        message.attachment.type === 'plan_mode_reentry')
    ) {
      foundPlanModeAttachment = true
      break
    }
  }

  return { turnCount: turnsSinceLastAttachment, foundPlanModeAttachment }
}

/**
 * Count plan_mode attachments since the last plan_mode_exit (or from start if no exit).
 * This ensures the full/sparse cycle resets when re-entering plan mode.
 */
function countPlanModeAttachmentsSinceLastExit(messages: Message[]): number {
  let count = 0
  // 向后迭代 — 如果遇到 plan_mode_exit，停止计数
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type === 'attachment') {
      if (message.attachment.type === 'plan_mode_exit') {
        break // 在最后一次退出时停止计数
      }
      if (message.attachment.type === 'plan_mode') {
        count++
      }
    }
  }
  return count
}

async function getPlanModeAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const permissionContext = appState.toolPermissionContext
  if (permissionContext.mode !== 'plan') {
    return []
  }

  // 检查是否应根据回合数附加（除第一回合外）
  if (messages && messages.length > 0) {
    const { turnCount, foundPlanModeAttachment } =
      getPlanModeAttachmentTurnCount(messages)
    // 仅在之前已发送过 plan_mode 附件时进行节流
    // 在计划模式的第一回合，始终附加
    if (
      foundPlanModeAttachment &&
      turnCount < PLAN_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS
    ) {
      return []
    }
  }

  const planFilePath = getPlanFilePath(toolUseContext.agentId)
  const existingPlan = getPlan(toolUseContext.agentId)

  const attachments: Attachment[] = []

  // 检查是否重新进入：标志已设置且计划文件存在
  if (hasExitedPlanModeInSession() && existingPlan !== null) {
    attachments.push({ type: 'plan_mode_reentry', planFilePath })
    setHasExitedPlanMode(false) // 清除标志 — 一次性指导
  }

  // 确定应该是完整还是稀疏提醒
  // 完整提醒在第 1、6、11...次附件（每第 N 次附件）
  const attachmentCount =
    countPlanModeAttachmentsSinceLastExit(messages ?? []) + 1
  const reminderType: 'full' | 'sparse' =
    attachmentCount %
      PLAN_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS ===
    1
      ? 'full'
      : 'sparse'

  // 始终添加主 plan_mode 附件
  attachments.push({
    type: 'plan_mode',
    reminderType,
    isSubAgent: !!toolUseContext.agentId,
    planFilePath,
    planExists: existingPlan !== null,
  })

  return attachments
}

/**
 * Returns a plan_mode_exit attachment if we just exited plan mode.
 * This is a one-time notification to tell the model it's no longer in plan mode.
 */
async function getPlanModeExitAttachment(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 仅在标志已设置时触发（我们刚刚退出计划模式）
  if (!needsPlanModeExitAttachment()) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (appState.toolPermissionContext.mode === 'plan') {
    setNeedsPlanModeExitAttachment(false)
    return []
  }

  // 清除标志 — 这是一次性通知
  setNeedsPlanModeExitAttachment(false)

  const planFilePath = getPlanFilePath(toolUseContext.agentId)
  const planExists = getPlan(toolUseContext.agentId) !== null

  // 注意：技能发现在计划退出时不会触发。因为到计划写入时已经太晚了——
  // 模型在计划期间就应该有相关技能。user_message 信号已经在触发计划的请求时触发
  // （"plan how to deploy this"），这是正确的时机。
  return [{ type: 'plan_mode_exit', planFilePath, planExists }]
}

function getAutoModeAttachmentTurnCount(messages: Message[]): {
  turnCount: number
  foundAutoModeAttachment: boolean
} {
  let turnsSinceLastAttachment = 0
  let foundAutoModeAttachment = false

  // 向后迭代查找最近的 auto_mode 附件
  // 统计人类回合数（非元消息、非工具结果的用户消息），不统计助手消息
  // query.ts 中的工具循环在每次工具调用时都会调用 getAttachmentMessages，
  // 如果统计助手消息，单个人类回合的 100 次工具调用会触发约 20 次提醒。
  // 自动模式的目标场景是长时间的智能体会话，累积 60-105×/会话。
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (
      message?.type === 'user' &&
      !message.isMeta &&
      !hasToolResultContent(message.message.content)
    ) {
      turnsSinceLastAttachment++
    } else if (
      message?.type === 'attachment' &&
      message.attachment.type === 'auto_mode'
    ) {
      foundAutoModeAttachment = true
      break
    } else if (
      message?.type === 'attachment' &&
      message.attachment.type === 'auto_mode_exit'
    ) {
      // 退出重置节流 — 视为不存在之前的附件
      break
    }
  }

  return { turnCount: turnsSinceLastAttachment, foundAutoModeAttachment }
}

/**
 * 统计自上次 auto_mode_exit 以来的 auto_mode 附件数（没有退出则从头开始）。
 * 确保在重新进入自动模式时完整/稀疏周期重置。
 */
function countAutoModeAttachmentsSinceLastExit(messages: Message[]): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type === 'attachment') {
      if (message.attachment.type === 'auto_mode_exit') {
        break
      }
      if (message.attachment.type === 'auto_mode') {
        count++
      }
    }
  }
  return count
}

async function getAutoModeAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const permissionContext = appState.toolPermissionContext
  const inAuto = permissionContext.mode === 'auto'
  const inPlanWithAuto =
    permissionContext.mode === 'plan' &&
    (autoModeStateModule?.isAutoModeActive() ?? false)
  if (!inAuto && !inPlanWithAuto) {
    return []
  }

  // 检查是否应根据回合数附加（除第一回合外）
  if (messages && messages.length > 0) {
    const { turnCount, foundAutoModeAttachment } =
      getAutoModeAttachmentTurnCount(messages)
    // 仅在之前已发送过 auto_mode 附件时进行节流
    // 在自动模式的第一回合，始终附加
    if (
      foundAutoModeAttachment &&
      turnCount < AUTO_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS
    ) {
      return []
    }
  }

  // 确定应该是完整还是稀疏提醒
  const attachmentCount =
    countAutoModeAttachmentsSinceLastExit(messages ?? []) + 1
  const reminderType: 'full' | 'sparse' =
    attachmentCount %
      AUTO_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS ===
    1
      ? 'full'
      : 'sparse'

  return [{ type: 'auto_mode', reminderType }]
}

/**
 * 如果刚退出自动模式，返回 auto_mode_exit 附件。
 * 这是一次性通知，告知模型它不再处于自动模式。
 */
async function getAutoModeExitAttachment(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!needsAutoModeExitAttachment()) {
    return []
  }

  const appState = toolUseContext.getAppState()
  // 当自动模式仍然活跃时抑制 — 覆盖 mode==='auto' 和
  // plan-with-auto-active（mode==='plan' 但分类器运行）两种情况。
  if (
    appState.toolPermissionContext.mode === 'auto' ||
    (autoModeStateModule?.isAutoModeActive() ?? false)
  ) {
    setNeedsAutoModeExitAttachment(false)
    return []
  }

  setNeedsAutoModeExitAttachment(false)
  return [{ type: 'auto_mode_exit' }]
}

/**
 * 检测自上一轮以来本地日期是否已变更（用户编码跨过午夜），
 * 并发出附件以通知模型。
 *
 * date_change 附件附加在对话的尾部，
 * 因此模型能获知新日期，同时无需变更缓存的前缀。
 * messages[0]（来自 getUserContext → prependUserContext）有意
 * 保留旧日期——清除该缓存会重新生成前缀，
 * 并在下一轮将整个对话变为 cache_creation
 * （每次跨午夜每夜会话约 920K 有效 tokens）。
 *
 * 导出用于测试——防止清除缓存的回归问题。
 */
export function getDateChangeAttachments(
  messages: Message[] | undefined,
): Attachment[] {
  const currentDate = getLocalISODate()
  const lastDate = getLastEmittedDate()

  if (lastDate === null) {
    // 第一回合 — 仅记录，不需要附件
    setLastEmittedDate(currentDate)
    return []
  }

  if (currentDate === lastDate) {
    return []
  }

  setLastEmittedDate(currentDate)

  // 助手模式：将昨天的记录刷新到每日文件中，以便
  // /dream 技能（当地时间 1-5 点）即使没有压缩也能找到它
  // 今天。发送即忘；writeSessionTranscriptSegment 按
  // 消息时间戳分桶，这样多天的间隔也能正确刷新每一天。
  if (feature('KAIROS')) {
    if (getKairosActive() && messages !== undefined) {
      sessionTranscriptModule?.flushOnDateChange(messages, currentDate)
    }
  }

  return [{ type: 'date_change', newDate: currentDate }]
}

function getUltrathinkEffortAttachment(input: string | null): Attachment[] {
  if (!isUltrathinkEnabled() || !input || !hasUltrathinkKeyword(input)) {
    return []
  }
  logEvent('tengu_ultrathink', {})
  return [{ type: 'ultrathink_effort', level: 'high' }]
}

// 导出给 compact.ts — 两个调用点的门控必须一致。
export function getDeferredToolsDeltaAttachment(
  tools: Tools,
  model: string,
  messages: Message[] | undefined,
  scanContext?: DeferredToolsDeltaScanContext,
): Attachment[] {
  if (!isDeferredToolsDeltaEnabled()) return []
  // 这三个检查镜像了 isToolSearchEnabled 的同步部分 —
  // 附件文本写着“可通过 ToolSearch 获取”，因此 ToolSearch
  // 必须实际存在于请求中。异步自动阈值检查
  // 没有被复制（否则会重复触发 tengu_tool_search_mode_decision）；
  // 在 tst-auto 低于阈值时，即使 ToolSearch 被过滤，附件仍可能触发
  // 被过滤掉，但这是一个窄场景且已宣布的工具
  // 无论如何都是可直接调用的。
  if (!isToolSearchEnabledOptimistic()) return []
  if (!modelSupportsToolReference(model)) return []
  if (!isToolSearchToolAvailable(tools)) return []
  const delta = getDeferredToolsDelta(tools, messages ?? [], scanContext)
  if (!delta) return []
  return [{ type: 'deferred_tools_delta', ...delta }]
}

/**
 * 对比当前过滤后的代理池与对话中已公告过的内容
 * （从之前的 agent_listing_delta 附件重建得出）。
 * 如果无变化或门控关闭则返回 []。
 *
 * 代理列表曾嵌入在 AgentTool 的描述中，导致约 10.2% 的
 * fleet cache_creation：MCP 异步连接、/reload-plugins 或
 * 权限模式变更 → 描述变更 → 完整工具模式缓存失效。
 * 将列表移到这里可使工具描述保持静态。
 *
 * 为 compact.ts 导出——压缩消耗之前的增量后重新公告完整集合。
 */
export function getAgentListingDeltaAttachment(
  toolUseContext: ToolUseContext,
  messages: Message[] | undefined,
): Attachment[] {
  if (!shouldInjectAgentListInMessages()) return []

  // 如果 AgentTool 不在池中则跳过 — 列表将无法操作。
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, AGENT_TOOL_NAME))
  ) {
    return []
  }

  const { activeAgents, allowedAgentTypes } =
    toolUseContext.options.agentDefinitions

  // 镜像 AgentTool.prompt() 的过滤：MCP 需求 → 拒绝规则 →
  // allowedAgentTypes 限制。与 AgentTool.tsx 保持同步。
  const mcpServers = new Set<string>()
  for (const tool of toolUseContext.options.tools) {
    const info = mcpInfoFromString(tool.name)
    if (info) mcpServers.add(info.serverName)
  }
  const permissionContext = toolUseContext.getAppState().toolPermissionContext
  let filtered = filterDeniedAgents(
    filterAgentsByMcpRequirements(activeAgents, [...mcpServers]),
    permissionContext,
    AGENT_TOOL_NAME,
  )
  if (allowedAgentTypes) {
    filtered = filtered.filter(a => allowedAgentTypes.includes(a.agentType))
  }

  // 从记录中的先前增量重建已宣布的集合。
  const announced = new Set<string>()
  for (const msg of messages ?? []) {
    if (msg.type !== 'attachment') continue
    if (msg.attachment.type !== 'agent_listing_delta') continue
    for (const t of msg.attachment.addedTypes) announced.add(t)
    for (const t of msg.attachment.removedTypes) announced.delete(t)
  }

  const currentTypes = new Set(filtered.map(a => a.agentType))
  const added = filtered.filter(a => !announced.has(a.agentType))
  const removed: string[] = []
  for (const t of announced) {
    if (!currentTypes.has(t)) removed.push(t)
  }

  if (added.length === 0 && removed.length === 0) return []

  // 按确定性顺序排序 — 智能体加载顺序是不确定的
  // (plugin load races, MCP async connect).
  added.sort((a, b) => a.agentType.localeCompare(b.agentType))
  removed.sort()

  return [
    {
      type: 'agent_listing_delta',
      addedTypes: added.map(a => a.agentType),
      addedLines: added.map(formatAgentLine),
      removedTypes: removed,
      isInitial: announced.size === 0,
      showConcurrencyNote: getSubscriptionType() !== 'pro',
    },
  ]
}

// 导出给 compact.ts / reactiveCompact.ts — 门控的唯一真实来源。
export function getMcpInstructionsDeltaAttachment(
  mcpClients: MCPServerConnection[],
  tools: Tools,
  model: string,
  messages: Message[] | undefined,
): Attachment[] {
  if (!isMcpInstructionsDeltaEnabled()) return []

  // Chrome ToolSearch 提示是客户端编写的且有条件的；
  // 实际服务器的 `instructions` 是无条件的。在这里决定 Chrome 部分
  // 并将其作为合成条目传入纯 diff 中。
  const clientSide: ClientSideInstruction[] = []
  if (
    isToolSearchEnabledOptimistic() &&
    modelSupportsToolReference(model) &&
    isToolSearchToolAvailable(tools)
  ) {
    clientSide.push({
      serverName: CLAUDE_IN_CHROME_MCP_SERVER_NAME,
      block: CHROME_TOOL_SEARCH_INSTRUCTIONS,
    })
  }

  const delta = getMcpInstructionsDelta(mcpClients, messages ?? [], clientSide)
  if (!delta) return []
  return [{ type: 'mcp_instructions_delta', ...delta }]
}

function getCriticalSystemReminderAttachment(
  toolUseContext: ToolUseContext,
): Attachment[] {
  const reminder = toolUseContext.criticalSystemReminder_EXPERIMENTAL
  if (!reminder) {
    return []
  }
  return [{ type: 'critical_system_reminder', content: reminder }]
}

function getOutputStyleAttachment(): Attachment[] {
  const settings = getSettings_DEPRECATED()
  const outputStyle = settings?.outputStyle || 'default'

  // 仅对非默认样式显示
  if (outputStyle === 'default') {
    return []
  }

  return [
    {
      type: 'output_style',
      style: outputStyle,
    },
  ]
}

async function getSelectedLinesFromIDE(
  ideSelection: IDESelection | null,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const ideName = getConnectedIdeName(toolUseContext.options.mcpClients)
  if (
    !ideName ||
    ideSelection?.lineStart === undefined ||
    !ideSelection.text ||
    !ideSelection.filePath
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return []
  }

  return [
    {
      type: 'selected_lines_in_ide',
      ideName,
      lineStart: ideSelection.lineStart,
      lineEnd: ideSelection.lineStart + ideSelection.lineCount - 1,
      filename: ideSelection.filePath,
      content: ideSelection.text,
      displayPath: relative(getCwd(), ideSelection.filePath),
    },
  ]
}

/**
 * 计算嵌套记忆文件加载所需处理的目录。
 * 返回两个列表：
 * - nestedDirs：CWD 与 targetPath 之间的目录（处理 CLAUDE.md + 所有规则）
 * - cwdLevelDirs：根目录到 CWD 的目录（仅处理条件规则）
 *
 * @param targetPath 目标文件路径
 * @param originalCwd 原始当前工作目录
 * @returns 包含 nestedDirs 和 cwdLevelDirs 数组的对象，均按从父到子的顺序排列
 */
export function getDirectoriesToProcess(
  targetPath: string,
  originalCwd: string,
): { nestedDirs: string[]; cwdLevelDirs: string[] } {
  // 构建从原始 CWD 到 targetPath 目录的目录列表
  const targetDir = dirname(resolve(targetPath))
  const nestedDirs: string[] = []
  let currentDir = targetDir

  // 从目标目录向上走到原始 CWD
  while (currentDir !== originalCwd && currentDir !== parse(currentDir).root) {
    if (currentDir.startsWith(originalCwd)) {
      nestedDirs.push(currentDir)
    }
    currentDir = dirname(currentDir)
  }

  // 反转以获取从 CWD 到目标的顺序
  nestedDirs.reverse()

  // 构建从根目录到 CWD 的目录列表（仅条件规则）
  const cwdLevelDirs: string[] = []
  currentDir = originalCwd

  while (currentDir !== parse(currentDir).root) {
    cwdLevelDirs.push(currentDir)
    currentDir = dirname(currentDir)
  }

  // 反转以获取从根目录到 CWD 的顺序
  cwdLevelDirs.reverse()

  return { nestedDirs, cwdLevelDirs }
}

/**
 * 将记忆文件转换为附件，过滤掉已加载的文件。
 *
 * @param memoryFiles 要转换的记忆文件
 * @param toolUseContext 工具使用上下文（用于跟踪已加载的文件）
 * @returns 嵌套记忆附件数组
 */
function isInstructionsMemoryType(
  type: MemoryFileInfo['type'],
): type is InstructionsMemoryType {
  return (
    type === 'User' ||
    type === 'Project' ||
    type === 'Local' ||
    type === 'Managed'
  )
}

/** 导出用于测试——防止 LRU 淘汰后重新注入的回归保护。 */
export function memoryFilesToAttachments(
  memoryFiles: MemoryFileInfo[],
  toolUseContext: ToolUseContext,
  triggerFilePath?: string,
): Attachment[] {
  const attachments: Attachment[] = []
  const shouldFireHook = hasInstructionsLoadedHook()

  for (const memoryFile of memoryFiles) {
    // 去重：loadedNestedMemoryPaths 是非驱逐 Set；readFileState
    // 是一个 100 条目的 LRU，在繁忙会话中会丢弃条目，因此依赖
    // 仅靠它会在每次驱逐周期中重新注入相同的 CLAUDE.md。
    if (toolUseContext.loadedNestedMemoryPaths?.has(memoryFile.path)) {
      continue
    }
    if (!toolUseContext.readFileState.has(memoryFile.path)) {
      attachments.push({
        type: 'nested_memory',
        path: memoryFile.path,
        content: memoryFile,
        displayPath: relative(getCwd(), memoryFile.path),
      })
      toolUseContext.loadedNestedMemoryPaths?.add(memoryFile.path)

      // 在 readFileState 中标记为已加载 — 这提供了跨函数和
      // 通过上面的 .has() 检查进行跨回合去重。
      //
      // 当注入内容与磁盘不匹配时（剥离的 HTML 注释，
      // 剥离的 frontmatter，被截断的 MEMORY.md），缓存原始磁盘字节
      // 并设置 `isPartialView: true`。编辑/写入操作会检查该标志并要求执行真正的
      // Read 操作；getChangedFiles 会看到真实内容 + 未定义的偏移/限制
      // 因此会话中的更改检测仍然有效。
      toolUseContext.readFileState.set(memoryFile.path, {
        content: memoryFile.contentDiffersFromDisk
          ? (memoryFile.rawContent ?? memoryFile.content)
          : memoryFile.content,
        timestamp: Date.now(),
        offset: undefined,
        limit: undefined,
        isPartialView: memoryFile.contentDiffersFromDisk,
      })


      // 触发 InstructionsLoaded 钩子以进行审计/可观测性（发送即忘）
      if (shouldFireHook && isInstructionsMemoryType(memoryFile.type)) {
        const loadReason = memoryFile.globs
          ? 'path_glob_match'
          : memoryFile.parent
            ? 'include'
            : 'nested_traversal'
        void executeInstructionsLoadedHooks(
          memoryFile.path,
          memoryFile.type,
          loadReason,
          {
            globs: memoryFile.globs,
            triggerFilePath,
            parentFilePath: memoryFile.parent,
          },
        )
      }
    }
  }

  return attachments
}

/**
 * 加载指定文件路径的嵌套记忆文件，并以附件形式返回。
 * 此函数执行目录遍历，查找适用于目标文件路径的 CLAUDE.md 文件和条件规则。
 *
 * 处理顺序（必须保持）：
 * 1. 匹配 targetPath 的托管/用户条件规则
 * 2. 嵌套目录（CWD → 目标）：CLAUDE.md + 无条件规则 + 条件规则
 * 3. CWD 级目录（根 → CWD）：仅条件规则
 *
 * @param filePath 要获取嵌套记忆文件的文件路径
 * @param toolUseContext 工具使用上下文
 * @param appState 包含工具权限上下文的应用状态
 * @returns 嵌套记忆附件数组
 */
async function getNestedMemoryAttachmentsForFile(
  filePath: string,
  toolUseContext: ToolUseContext,
  appState: { toolPermissionContext: ToolPermissionContext },
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  try {
    // 如果路径不在允许的工作路径中，提前返回
    if (!pathInAllowedWorkingPath(filePath, appState.toolPermissionContext)) {
      return attachments
    }

    const processedPaths = new Set<string>()
    const originalCwd = getOriginalCwd()

    // 阶段 1：处理托管和用户条件规则
    const managedUserRules = await getManagedAndUserConditionalRules(
      filePath,
      processedPaths,
    )
    attachments.push(
      ...memoryFilesToAttachments(managedUserRules, toolUseContext, filePath),
    )

    // 阶段 2：获取要处理的目录
    const { nestedDirs, cwdLevelDirs } = getDirectoriesToProcess(
      filePath,
      originalCwd,
    )

    const skipProjectLevel = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_paper_halyard',
      false,
    )

    // 阶段 3：处理嵌套目录（CWD → 目标）
    // 每个目录获得：CLAUDE.md + 无条件规则 + 条件规则
    for (const dir of nestedDirs) {
      const memoryFiles = (
        await getMemoryFilesForNestedDirectory(dir, filePath, processedPaths)
      ).filter(
        f => !skipProjectLevel || (f.type !== 'Project' && f.type !== 'Local'),
      )
      attachments.push(
        ...memoryFilesToAttachments(memoryFiles, toolUseContext, filePath),
      )
    }

    // 阶段 4：处理 CWD 级目录（根目录 → CWD）
    // 仅条件规则（无条件规则已预先加载）
    for (const dir of cwdLevelDirs) {
      const conditionalRules = (
        await getConditionalRulesForCwdLevelDirectory(
          dir,
          filePath,
          processedPaths,
        )
      ).filter(
        f => !skipProjectLevel || (f.type !== 'Project' && f.type !== 'Local'),
      )
      attachments.push(
        ...memoryFilesToAttachments(conditionalRules, toolUseContext, filePath),
      )
    }
  } catch (error) {
    logError(error)
  }

  return attachments
}

async function getOpenedFileFromIDE(
  ideSelection: IDESelection | null,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!ideSelection?.filePath || ideSelection.text) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return []
  }

  // 获取嵌套记忆文件
  const nestedMemoryAttachments = await getNestedMemoryAttachmentsForFile(
    ideSelection.filePath,
    toolUseContext,
    appState,
  )

  // 返回嵌套记忆附件，后跟已打开的文件附件
  return [
    ...nestedMemoryAttachments,
    {
      type: 'opened_file_in_ide',
      filename: ideSelection.filePath,
    },
  ]
}

async function processAtMentionedFiles(
  input: string,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const files = extractAtMentionedFiles(input)
  if (files.length === 0) return []

  const appState = toolUseContext.getAppState()
  const results = await Promise.all(
    files.map(async file => {
      try {
        const { filename, lineStart, lineEnd } = parseAtMentionedFileLines(file)
        const absoluteFilename = expandPath(filename)

        if (
          isFileReadDenied(absoluteFilename, appState.toolPermissionContext)
        ) {
          return null
        }

        // 检查是否是目录
        try {
          const stats = await stat(absoluteFilename)
          if (stats.isDirectory()) {
            try {
              const entries = await readdir(absoluteFilename, {
                withFileTypes: true,
              })
              const MAX_DIR_ENTRIES = 1000
              const truncated = entries.length > MAX_DIR_ENTRIES
              const names = entries.slice(0, MAX_DIR_ENTRIES).map(e => e.name)
              if (truncated) {
                names.push(
                  `\u2026 and ${entries.length - MAX_DIR_ENTRIES} more entries`,
                )
              }
              const stdout = names.join('\n')
              logEvent('tengu_at_mention_extracting_directory_success', {})

              return {
                type: 'directory' as const,
                path: absoluteFilename,
                content: stdout,
                displayPath: relative(getCwd(), absoluteFilename),
              }
            } catch {
              return null
            }
          }
        } catch {
          // 如果 stat 失败，继续文件逻辑
        }

        return await generateFileAttachment(
          absoluteFilename,
          toolUseContext,
          'tengu_at_mention_extracting_filename_success',
          'tengu_at_mention_extracting_filename_error',
          'at-mention',
          {
            offset: lineStart,
            limit: lineEnd && lineStart ? lineEnd - lineStart + 1 : undefined,
          },
        )
      } catch {
        logEvent('tengu_at_mention_extracting_filename_error', {})
      }
    }),
  )
  return results.filter(Boolean) as Attachment[]
}

function processAgentMentions(
  input: string,
  agents: AgentDefinition[],
): Attachment[] {
  const agentMentions = extractAgentMentions(input)
  if (agentMentions.length === 0) return []

  const results = agentMentions.map(mention => {
    const agentType = mention.replace('agent-', '')
    const agentDef = agents.find(def => def.agentType === agentType)

    if (!agentDef) {
      logEvent('tengu_at_mention_agent_not_found', {})
      return null
    }

    logEvent('tengu_at_mention_agent_success', {})

    return {
      type: 'agent_mention' as const,
      agentType: agentDef.agentType,
    }
  })

  return results.filter(
    (result): result is NonNullable<typeof result> => result !== null,
  )
}

async function processMcpResourceAttachments(
  input: string,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const resourceMentions = extractMcpResourceMentions(input)
  if (resourceMentions.length === 0) return []

  const mcpClients = toolUseContext.options.mcpClients || []

  const results = await Promise.all(
    resourceMentions.map(async mention => {
      try {
        const [serverName, ...uriParts] = mention.split(':')
        const uri = uriParts.join(':') // 如果 URI 包含冒号，则重新连接

        if (!serverName || !uri) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        // 查找 MCP 客户端
        const client = mcpClients.find(c => c.name === serverName)
        if (!client || client.type !== 'connected') {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        // 在可用资源中查找资源以获取其元数据
        const serverResources =
          toolUseContext.options.mcpResources?.[serverName] || []
        const resourceInfo = serverResources.find(r => r.uri === uri)
        if (!resourceInfo) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        try {
          const result = await client.client.readResource({
            uri,
          })

          logEvent('tengu_at_mention_mcp_resource_success', {})

          return {
            type: 'mcp_resource' as const,
            server: serverName,
            uri,
            name: resourceInfo.name || uri,
            description: resourceInfo.description,
            content: result,
          }
        } catch (error) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          logError(error)
          return null
        }
      } catch {
        logEvent('tengu_at_mention_mcp_resource_error', {})
        return null
      }
    }),
  )

  return results.filter(
    (result): result is NonNullable<typeof result> => result !== null,
  ) as Attachment[]
}

export async function getChangedFiles(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const filePaths = cacheKeys(toolUseContext.readFileState)
  if (filePaths.length === 0) return []

  const appState = toolUseContext.getAppState()
  const results = await Promise.all(
    filePaths.map(async filePath => {
      const fileState = toolUseContext.readFileState.get(filePath)
      if (!fileState) return null

      // TODO：为已更改的文件实现偏移/限制支持
      if (fileState.offset !== undefined || fileState.limit !== undefined) {
        return null
      }

      const normalizedPath = expandPath(filePath)

      // 检查文件是否配置了拒绝规则
      if (isFileReadDenied(normalizedPath, appState.toolPermissionContext)) {
        return null
      }

      try {
        const mtime = await getFileModificationTimeAsync(normalizedPath)
        if (mtime <= fileState.timestamp) {
          return null
        }

        const fileInput = { file_path: normalizedPath }

        // 验证文件路径是否有效
        const isValid = await FileReadTool.validateInput(
          fileInput,
          toolUseContext,
        )
        if (!isValid.result) {
          return null
        }

        const result = await FileReadTool.call(fileInput, toolUseContext)
        // 仅提取更改的部分
        if (result.data.type === 'text') {
          const snippet = getSnippetForTwoFileDiff(
            fileState.content,
            result.data.file.content,
          )

          // 文件被触及但未修改
          if (snippet === '') {
            return null
          }

          return {
            type: 'edited_text_file' as const,
            filename: normalizedPath,
            snippet,
          }
        }

        // 对于非文本文件（图像），应用与 FileReadTool 相同的令牌限制逻辑
        if (result.data.type === 'image') {
          try {
            const data = await readImageWithTokenBudget(normalizedPath)
            return {
              type: 'edited_image_file' as const,
              filename: normalizedPath,
              content: data,
            }
          } catch (compressionError) {
            logError(compressionError)
            logEvent('tengu_watched_file_compression_failed', {
              file: normalizedPath,
            } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
            return null
          }
        }

        // notebook / pdf / parts — 没有 diff 表示形式；显式
        // 返回 null，使 map 回调没有隐式的 undefined 路径。
        return null
      } catch (err) {
        // 仅在 ENOENT 时驱逐（文件确实被删除）。瞬态 stat
        // 失败 — 原子保存竞争（编辑器写入 tmp→rename 并且
        // stat 命中间隙），EACCES 争用，网络文件系统故障 — 必须
        // 不驱逐，否则下一个 Edit 会失败 code-6 即使
        // 文件仍然存在且模型刚刚读取了它。VS Code
        // 自动保存/格式化保存经常命中此竞争。
        // 详见 PR #18525 的回归分析。
        if (isENOENT(err)) {
          toolUseContext.readFileState.delete(filePath)
        }
        return null
      }
    }),
  )
  return results.filter(result => result != null) as Attachment[]
}

/**
 * 处理需要嵌套内存附件的路径并检查嵌套的 CLAUDE.md 文件。
 * 使用 ToolUseContext 中的 nestedMemoryAttachmentTriggers 字段。
 */
async function getNestedMemoryAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 先检查触发器 — getAppState() 等待 React 渲染周期，
  // 而常见情况是空触发器集。
  if (
    !toolUseContext.nestedMemoryAttachmentTriggers ||
    toolUseContext.nestedMemoryAttachmentTriggers.size === 0
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  const attachments: Attachment[] = []

  for (const filePath of toolUseContext.nestedMemoryAttachmentTriggers) {
    const nestedAttachments = await getNestedMemoryAttachmentsForFile(
      filePath,
      toolUseContext,
      appState,
    )
    attachments.push(...nestedAttachments)
  }

  toolUseContext.nestedMemoryAttachmentTriggers.clear()

  return attachments
}

async function getRelevantMemoryAttachments(
  input: string,
  agents: AgentDefinition[],
  readFileState: FileStateCache,
  recentTools: readonly string[],
  signal: AbortSignal,
  alreadySurfaced: ReadonlySet<string>,
): Promise<Attachment[]> {
  // 如果 @-提到了某个智能体，仅搜索其内存目录（隔离）。
  // 否则搜索自动内存目录。
  const memoryDirs = extractAgentMentions(input).flatMap(mention => {
    const agentType = mention.replace('agent-', '')
    const agentDef = agents.find(def => def.agentType === agentType)
    return agentDef?.memory
      ? [getAgentMemoryDir(agentType, agentDef.memory)]
      : []
  })
  const dirs = memoryDirs.length > 0 ? memoryDirs : [getAutoMemPath()]

  const allResults = await Promise.all(
    dirs.map(dir =>
      findRelevantMemories(
        input,
        dir,
        signal,
        recentTools,
        alreadySurfaced,
      ).catch(() => []),
    ),
  )
  // alreadySurfaced 在选择器内部被过滤，因此 Sonnet 将其
  // 5-slot 预算用于新鲜候选项；readFileState 捕获模型通过 FileReadTool
  // 读取过的文件。这里多余的 alreadySurfaced 检查是双重保障
  //（多目录结果可能重新引入选择器在另一个目录中过滤掉的路径）。
  const selected = allResults
    .flat()
    .filter(m => !readFileState.has(m.path) && !alreadySurfaced.has(m.path))
    .slice(0, 5)

  const memories = await readMemoriesForSurfacing(selected, signal)

  if (memories.length === 0) {
    return []
  }
  return [{ type: 'relevant_memories' as const, memories }]
}

/**
 * 扫描消息中过去的 relevant_memories 附件。返回
 * 已浮现路径的集合（用于选择器去重）和累计字节数
 *（用于会话总限流）。通过扫描消息而非在 toolUseContext 中
 * 跟踪意味着 compact 会自然重置两者——旧附件从压缩后的
 * 转录中消失，因此重新浮出是有效的。
 */
export function collectSurfacedMemories(messages: ReadonlyArray<Message>): {
  paths: Set<string>
  totalBytes: number
} {
  const paths = new Set<string>()
  let totalBytes = 0
  for (const m of messages) {
    if (m.type === 'attachment' && m.attachment.type === 'relevant_memories') {
      for (const mem of m.attachment.memories) {
        paths.add(mem.path)
        totalBytes += mem.content.length
      }
    }
  }
  return { paths, totalBytes }
}

/**
 * 读取一组按相关性排序的记忆文件，以 <system-reminder> 附件形式注入。
 * 通过 readFileInRange 的 truncateOnByteLimit 选项同时强制执行
 * MAX_MEMORY_LINES 和 MAX_MEMORY_BYTES 限制。截断时会在附注中
 * 显示部分内容而非丢弃文件——findRelevantMemories 已将其选为最相关，
 * 因此即使后续行被截断，前文和开头上下文也值得浮出。
 *
 * 导出用于直接测试，无需模拟排序器和 GB 门控。
 */
export async function readMemoriesForSurfacing(
  selected: ReadonlyArray<{ path: string; mtimeMs: number }>,
  signal?: AbortSignal,
): Promise<
  Array<{
    path: string
    content: string
    mtimeMs: number
    header: string
    limit?: number
  }>
> {
  const results = await Promise.all(
    selected.map(async ({ path: filePath, mtimeMs }) => {
      try {
        const result = await readFileInRange(
          filePath,
          0,
          MAX_MEMORY_LINES,
          MAX_MEMORY_BYTES,
          signal,
          { truncateOnByteLimit: true },
        )
        const truncated =
          result.totalLines > MAX_MEMORY_LINES || result.truncatedByBytes
        const content = truncated
          ? result.content +
            `\n\n> This memory file was truncated (${result.truncatedByBytes ? `${MAX_MEMORY_BYTES} byte limit` : `first ${MAX_MEMORY_LINES} lines`}). Use the ${FILE_READ_TOOL_NAME} tool to view the complete file at: ${filePath}`
          : result.content
        return {
          path: filePath,
          content,
          mtimeMs,
          header: memoryHeader(filePath, mtimeMs),
          limit: truncated ? result.lineCount : undefined,
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter(r => r !== null)
}

/**
 * 相关记忆块的头部字符串。导出以便 messages.ts
 * 在恢复的会话中存储的头部丢失时可回退使用。
 */
export function memoryHeader(path: string, mtimeMs: number): string {
  const staleness = memoryFreshnessText(mtimeMs)
  return staleness
    ? `${staleness}\n\nMemory: ${path}:`
    : `Memory (saved ${memoryAge(mtimeMs)}): ${path}:`
}

/**
 * 记忆相关性选择器的预取句柄。promise 在每个用户轮次启动一次，
 * 在主模型流式输出和执行工具时异步运行。在收集点（工具执行后），
 * 调用者读取 settledAt 来判断是消费（如果已就绪）还是跳过并重试下一轮
 * ——预取从不阻塞轮次。
 *
 * 一次性（Disposable）：query.ts 使用 `using` 绑定，因此 [Symbol.dispose]
 * 会在所有生成器退出路径（return、throw、.return() 闭包）上触发——
 * 中止正在进行的请求并发出终结遥测，无需在 while 循环内
 * 约 13 个返回点分别进行检测。
 */
export type MemoryPrefetch = {
  promise: Promise<Attachment[]>
  /** Set by promise.finally(). null until the promise settles. */
  settledAt: number | null
  /** Set by the collect point in query.ts. -1 until consumed. */
  consumedOnIteration: number
  [Symbol.dispose](): void
}

/**
 * 启动相关记忆搜索作为异步预取。
 * 从消息中提取最后一个真实用户提示（跳过 isMeta 系统注入），
 * 并启动非阻塞搜索。返回带有完成跟踪的一次性句柄。
 * 在 query.ts 中使用 `using` 绑定。
 */
export function startRelevantMemoryPrefetch(
  messages: ReadonlyArray<Message>,
  toolUseContext: ToolUseContext,
): MemoryPrefetch | undefined {
  if (
    !isAutoMemoryEnabled() ||
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_moth_copse', false)
  ) {
    return undefined
  }

  const lastUserMessage = messages.findLast(m => m.type === 'user' && !m.isMeta)
  if (!lastUserMessage) {
    return undefined
  }

  const input = getUserMessageText(lastUserMessage)
  // 单个单词的提示缺乏足够的上下文进行有意义的术语提取
  if (!input || !/\s/.test(input.trim())) {
    return undefined
  }

  const surfaced = collectSurfacedMemories(messages)
  if (surfaced.totalBytes >= RELEVANT_MEMORIES_CONFIG.MAX_SESSION_BYTES) {
    return undefined
  }

  // 链接到轮次级中止，以便用户按 Escape 立即取消 sideQuery，
  // 而不仅仅是在 queryLoop 退出时通过 [Symbol.dispose] 取消。
  const controller = createChildAbortController(toolUseContext.abortController)
  const firedAt = Date.now()
  const promise = getRelevantMemoryAttachments(
    input,
    toolUseContext.options.agentDefinitions.activeAgents,
    toolUseContext.readFileState,
    collectRecentSuccessfulTools(messages, lastUserMessage),
    controller.signal,
    surfaced.paths,
  ).catch(e => {
    if (!isAbortError(e)) {
      logError(e)
    }
    return []
  })

  const handle: MemoryPrefetch = {
    promise,
    settledAt: null,
    consumedOnIteration: -1,
    [Symbol.dispose]() {
      controller.abort()
      logEvent('tengu_memdir_prefetch_collected', {
        hidden_by_first_iteration:
          handle.settledAt !== null && handle.consumedOnIteration === 0,
        consumed_on_iteration: handle.consumedOnIteration,
        latency_ms: (handle.settledAt ?? Date.now()) - firedAt,
      })
    },
  }
  void promise.finally(() => {
    handle.settledAt = Date.now()
  })
  return handle
}

type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  is_error?: boolean
}

function isToolResultBlock(b: unknown): b is ToolResultBlock {
  return (
    typeof b === 'object' &&
    b !== null &&
    (b as ToolResultBlock).type === 'tool_result' &&
    typeof (b as ToolResultBlock).tool_use_id === 'string'
  )
}

/**
 * 检查用户消息的内容是否包含 tool_result 块。
 * 这比检查 `toolUseResult === undefined` 更可靠，因为
 * 子代理工具结果消息在 `preserveToolUseResults` 为 false
 *（Explore 代理的默认值）时会显式将 `toolUseResult` 设置为 `undefined`。
 */
function hasToolResultContent(content: unknown): boolean {
  return Array.isArray(content) && content.some(isToolResultBlock)
}

/**
 * 自上一个真实轮次边界以来成功（且从未出错）的工具。
 * 记忆选择器使用此信息来抑制关于正在工作的工具的文档
 * ——为模型已成功调用的工具浮现参考资料是噪音。
 *
 * 任何错误 → 工具排除（模型遇到困难，文档保持可用）。
 * 尚无结果 → 也排除（结果未知）。
 *
 * tool_use 位于助手内容中；tool_result 位于用户内容中
 *（toolUseResult 已设置，isMeta 为 undefined）。两者都在扫描窗口内。
 * 向后扫描先看到结果后看到使用，因此我们按 ID 收集两者
 * 然后解析。
 */
export function collectRecentSuccessfulTools(
  messages: ReadonlyArray<Message>,
  lastUserMessage: Message,
): readonly string[] {
  const useIdToName = new Map<string, string>()
  const resultByUseId = new Map<string, boolean>()
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m) continue
    if (isHumanTurn(m) && m !== lastUserMessage) break
    if (m.type === 'assistant' && typeof m.message.content !== 'string') {
      for (const block of m.message.content) {
        if (block.type === 'tool_use') useIdToName.set(block.id, block.name)
      }
    } else if (
      m.type === 'user' &&
      'message' in m &&
      Array.isArray(m.message.content)
    ) {
      for (const block of m.message.content) {
        if (isToolResultBlock(block)) {
          resultByUseId.set(block.tool_use_id, block.is_error === true)
        }
      }
    }
  }
  const failed = new Set<string>()
  const succeeded = new Set<string>()
  for (const [id, name] of useIdToName) {
    const errored = resultByUseId.get(id)
    if (errored === undefined) continue
    if (errored) {
      failed.add(name)
    } else {
      succeeded.add(name)
    }
  }
  return [...succeeded].filter(t => !failed.has(t))
}


/**
 * 过滤预取的记忆附件，排除模型已通过 FileRead/Write/Edit 工具调用
 *（本轮任何迭代）或上一轮记忆浮出已在上下文中的记忆——
 * 两者都在累计的 readFileState 中跟踪。幸存者随后在 readFileState
 * 中标记，以便后续轮次不会重新浮出它们。
 *
 * 先过滤后标记的顺序至关重要：readMemoriesForSurfacing 曾经在预取期间
 * 写入 readFileState，这意味着过滤器将所有预选取路径视为已在上下文中
 * 并全部丢弃（自引用过滤器）。将写入推迟到此处的过滤之后，
 * 打破了该循环，同时仍能对任何迭代的工具调用进行去重。
 */
export function filterDuplicateMemoryAttachments(
  attachments: Attachment[],
  readFileState: FileStateCache,
): Attachment[] {
  return attachments
    .map(attachment => {
      if (attachment.type !== 'relevant_memories') return attachment
      const filtered = attachment.memories.filter(
        m => !readFileState.has(m.path),
      )
      for (const m of filtered) {
        readFileState.set(m.path, {
          content: m.content,
          timestamp: m.mtimeMs,
          offset: undefined,
          limit: m.limit,
        })
      }
      return filtered.length > 0 ? { ...attachment, memories: filtered } : null
    })
    .filter((a): a is Attachment => a !== null)
}

/**
 * 处理文件操作期间发现的技能目录。
 * 使用 ToolUseContext 中的 dynamicSkillDirTriggers 字段
 */
async function getDynamicSkillAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  if (
    toolUseContext.dynamicSkillDirTriggers &&
    toolUseContext.dynamicSkillDirTriggers.size > 0
  ) {
    // 并行处理：并发读取所有技能目录
    const perDirResults = await Promise.all(
      Array.from(toolUseContext.dynamicSkillDirTriggers).map(async skillDir => {
        try {
          const entries = await readdir(skillDir, { withFileTypes: true })
          const candidates = entries
            .filter(e => e.isDirectory() || e.isSymbolicLink())
            .map(e => e.name)
          // 并行处理：并发 stat 所有 SKILL.md 候选
          const checked = await Promise.all(
            candidates.map(async name => {
              try {
                await stat(resolve(skillDir, name, 'SKILL.md'))
                return name
              } catch {
                return null // SKILL.md 不存在，跳过此条目
              }
            }),
          )
          return {
            skillDir,
            skillNames: checked.filter((n): n is string => n !== null),
          }
        } catch {
          // 忽略读取技能目录时的错误（例如目录不存在）
          return { skillDir, skillNames: [] }
        }
      }),
    )

    for (const { skillDir, skillNames } of perDirResults) {
      if (skillNames.length > 0) {
        attachments.push({
          type: 'dynamic_skill',
          skillDir,
          skillNames,
          displayPath: relative(getCwd(), skillDir),
        })
      }
    }

    toolUseContext.dynamicSkillDirTriggers.clear()
  }

  return attachments
}

// 跟踪已发送的技能以避免重复发送。以 agentId 为键
//（空字符串 = 主线程），以便子代理获得自己的第 0 轮列表——
// 如果没有按代理作用域隔离，主线程填充此 Set 会导致
// 每个子代理的 filterToBundledAndMcp 结果去重后为空。
const sentSkillNames = new Map<string, Set<string>>()

// 当技能集真正发生变化时调用（插件重新加载、磁盘上技能文件
// 变更），以便新技能被宣布。不在 compact 时调用——
// compact 后重新注入每事件约花费 4K token，收益甚微。
export function resetSentSkillNames(): void {
  sentSkillNames.clear()
  suppressNext = false
}

/**
 * 抑制下一次技能列表注入。由 conversationRecovery 在 --resume 时调用，
 * 当转录中已存在 skill_listing 附件时使用。
 *
 * `sentSkillNames` 是模块作用域——进程本地。每个 `claude -p` 启动
 * 时 Map 为空，因此没有此机制时，每次 resume 都会重新注入
 * 完整的约 600 token 列表，即使它已经存在于之前进程的对话中。
 * 每次 --resume 都会出现；对于频繁重启的守护进程尤其明显。
 *
 * 权衡：会话之间新增的技能在下一次非 resume 会话之前不会
 * 被宣布。可以接受——skill_listing 本就不打算覆盖跨进程变更，
 * 而且代理仍然可以调用它们（无论如何它们都在 Skill 工具的运行时注册表中）。
 */
export function suppressNextSkillListing(): void {
  suppressNext = true
}
let suppressNext = false

// 当技能搜索启用且过滤后的（内置 + MCP）列表超过此数量时，
// 回退到仅内置技能。保护 MCP 重载用户（100+ 服务器）
// 免于截断，同时为典型配置保持第 0 轮保证。
const FILTERED_LISTING_MAX = 30

/**
 * 将技能过滤为仅内置（Anthropic 策划）+ MCP（用户连接）的。
 * 当技能搜索启用时用于解决子 agent 的 turn-0 缺口：
 * 这些来源很小、意图明确，不会触及截断预算。
 * 用户/项目/插件技能（长尾——200+）则通过发现机制处理。
 *
 * 如果内置+MCP 超过 FILTERED_LISTING_MAX，则回退到仅内置。
 */
export function filterToBundledAndMcp(commands: Command[]): Command[] {
  const filtered = commands.filter(
    cmd => cmd.loadedFrom === 'bundled' || cmd.loadedFrom === 'mcp',
  )
  if (filtered.length > FILTERED_LISTING_MAX) {
    return filtered.filter(cmd => cmd.loadedFrom === 'bundled')
  }
  return filtered
}

async function getSkillListingAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (process.env.NODE_ENV === 'test') {
    return []
  }

  // 跳过没有 Skill 工具的 agent 的技能列表——它们不能直接使用技能。
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, SKILL_TOOL_NAME))
  ) {
    return []
  }

  const cwd = getProjectRoot()
  const localCommands = await getSkillToolCommands(cwd)
  const mcpSkills = getMcpSkillCommands(
    toolUseContext.getAppState().mcp.commands,
  )
  let allCommands =
    mcpSkills.length > 0
      ? uniqBy([...localCommands, ...mcpSkills], 'name')
      : localCommands

  // 兼容非 Anthropic 模型（如 DeepSeek）：过滤掉元技能（superpowers 系列），
  // 这些技能描述中包含"1% 可能性也要检查技能"等指令，
  // 会导致兼容模型错误地反复触发 SkillTool 调用，形成死循环。
  const dangerousSkillPrefixes = ['superpowers:', 'superpowers-lab:']
  allCommands = allCommands.filter(cmd => {
    if (cmd.type !== 'prompt' || !cmd.name) return true
    return !dangerousSkillPrefixes.some(prefix => cmd.name.startsWith(prefix))
  })

  // 当技能搜索激活时，过滤为仅内置 + MCP，而不是完全抑制。
  // 解决了 turn-0 缺口：主线程通过 getTurnZeroSkillDiscovery（阻塞式）
  // 获得 turn-0 发现，但子 agent 使用异步 subagent_spawn 信号
  // （在工具之后收集，turn 1 可见）。内置 + MCP 很小且意图明确；
  // 用户/项目/插件技能通过发现机制处理。先调用 feature() 以支持
  // DCE——否则即使使用 ?. 在 null 上，属性访问字符串也会泄漏。
  if (
    feature('EXPERIMENTAL_SKILL_SEARCH') &&
    skillSearchModules?.featureCheck.isSkillSearchEnabled()
  ) {
    allCommands = filterToBundledAndMcp(allCommands)
  }

  const agentKey = toolUseContext.agentId ?? ''
  let sent = sentSkillNames.get(agentKey)
  if (!sent) {
    sent = new Set()
    sentSkillNames.set(agentKey, sent)
  }

  // 恢复路径：先前进程已注入了列表；它已在对话记录中。
  // 将所有当前标记为已发送，这样只有恢复后的增量
  // （稍后通过 /reload-plugins 等加载的技能）才会被宣布。
  if (suppressNext) {
    suppressNext = false
    for (const cmd of allCommands) {
      sent.add(cmd.name)
    }
    return []
  }

  // 查找尚未发送的技能
  const newSkills = allCommands.filter(cmd => !sent.has(cmd.name))

  if (newSkills.length === 0) {
    return []
  }

  // 如果还没有发送过任何技能，这是初始批次
  const isInitial = sent.size === 0

  // 标记为已发送
  for (const cmd of newSkills) {
    sent.add(cmd.name)
  }

  logForDebugging(
    `Sending ${newSkills.length} skills via attachment (${isInitial ? 'initial' : 'dynamic'}, ${sent.size} total sent)`,
  )

  // 使用现有逻辑在预算内格式化
  const contextWindowTokens = getContextWindowForModel(
    toolUseContext.options.mainLoopModel,
    getSdkBetas(),
  )
  const content = formatCommandsWithinBudget(newSkills, contextWindowTokens)

  return [
    {
      type: 'skill_listing',
      content,
      skillCount: newSkills.length,
      isInitial,
    },
  ]
}

// getSkillDiscoveryAttachment 已移至 skillSearch/prefetch.ts 作为
// getTurnZeroSkillDiscovery — 将 'skill_discovery' 字符串字面量保留在
// 功能门控模块内，避免泄漏到外部构建中。

export function extractAtMentionedFiles(content: string): string[] {
  // 提取使用 @ 符号提及的文件名，包括行范围语法：@file.txt#L10-20
  // 也支持含空格文件的引用路径：@"my/file with spaces.txt"
  // 示例："foo bar @baz moo" 会提取出 "baz"
  // 示例：'check @"my file.txt" please' 会提取出 "my file.txt"

  // 两种模式：引用路径和普通路径
  const quotedAtMentionRegex = /(^|\s)@"([^"]+)"/g
  const regularAtMentionRegex = /(^|\s)@([^\s]+)\b/g

  const quotedMatches: string[] = []
  const regularMatches: string[] = []

  // 先提取引用格式的提及（跳过 agent 提及，如 @"code-reviewer (agent)"）
  let match
  while ((match = quotedAtMentionRegex.exec(content)) !== null) {
    if (match[2] && !match[2].endsWith(' (agent)')) {
      quotedMatches.push(match[2]) // 引号内的内容
    }
  }

  // 提取普通格式的提及
  const regularMatchArray = content.match(regularAtMentionRegex) || []
  regularMatchArray.forEach(match => {
    const filename = match.slice(match.indexOf('@') + 1)
    // 如果以引号开头则不包含（已作为引用格式处理）
    if (!filename.startsWith('"')) {
      regularMatches.push(filename)
    }
  })

  // 合并并去重
  return uniq([...quotedMatches, ...regularMatches])
}

export function extractMcpResourceMentions(content: string): string[] {
  // 提取使用 @ 符号提及的 MCP 资源，格式为 @server:uri
  // 示例："@server1:resource/path" 会提取出 "server1:resource/path"
  const atMentionRegex = /(^|\s)@([^\s]+:[^\s]+)\b/g
  const matches = content.match(atMentionRegex) || []

  // 从每个匹配项中移除前缀（@ 之前的所有内容）
  return uniq(matches.map(match => match.slice(match.indexOf('@') + 1)))
}

export function extractAgentMentions(content: string): string[] {
  // 提取两种格式的 agent 提及：
  // 1. @agent-<agent-type>（传统/手动输入）
  //    示例："@agent-code-elegance-refiner" → "agent-code-elegance-refiner"
  // 2. @"<agent-type> (agent)"（来自自动补全选择）
  //    示例：'@"code-reviewer (agent)"' → "code-reviewer"
  // 支持插件作用域 agent 的冒号、点和 @ 符号，如 "@agent-asana:project-status-updater"
  const results: string[] = []

  // 匹配引用格式：@"<type> (agent)"
  const quotedAgentRegex = /(^|\s)@"([\w:.@-]+) \(agent\)"/g
  let match
  while ((match = quotedAgentRegex.exec(content)) !== null) {
    if (match[2]) {
      results.push(match[2])
    }
  }

  // 匹配无引号格式：@agent-<type>
  const unquotedAgentRegex = /(^|\s)@(agent-[\w:.@-]+)/g
  const unquotedMatches = content.match(unquotedAgentRegex) || []
  for (const m of unquotedMatches) {
    results.push(m.slice(m.indexOf('@') + 1))
  }

  return uniq(results)
}

interface AtMentionedFileLines {
  filename: string
  lineStart?: number
  lineEnd?: number
}

export function parseAtMentionedFileLines(
  mention: string,
): AtMentionedFileLines {
  // 解析如 "file.txt#L10-20"、"file.txt#heading" 或仅 "file.txt" 的提及
  // 支持行范围（#L10, #L10-20）并剥离非行范围的片段（#heading）
  const match = mention.match(/^([^#]+)(?:#L(\d+)(?:-(\d+))?)?(?:#[^#]*)?$/)

  if (!match) {
    return { filename: mention }
  }

  const [, filename, lineStartStr, lineEndStr] = match
  const lineStart = lineStartStr ? parseInt(lineStartStr, 10) : undefined
  const lineEnd = lineEndStr ? parseInt(lineEndStr, 10) : lineStart

  return { filename: filename ?? mention, lineStart, lineEnd }
}

async function getDiagnosticAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 诊断仅在 agent 拥有 Bash 工具来执行操作时才有用
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, BASH_TOOL_NAME))
  ) {
    return []
  }

  // 从跟踪器获取新的诊断（通过 MCP 获取 IDE 诊断）
  const newDiagnostics = await diagnosticTracker.getNewDiagnostics()
  if (newDiagnostics.length === 0) {
    return []
  }

  return [
    {
      type: 'diagnostics',
      files: newDiagnostics,
      isNew: true,
    },
  ]
}

/**
 * 从被动 LSP 服务器获取 LSP 诊断附件。
 * 遵循 AsyncHookRegistry 模式以实现一致的异步附件传递。
 */
async function getLSPDiagnosticAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // LSP 诊断仅在 agent 拥有 Bash 工具来执行操作时才有用
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, BASH_TOOL_NAME))
  ) {
    return []
  }

  logForDebugging('LSP Diagnostics: getLSPDiagnosticAttachments called')

  try {
    const diagnosticSets = checkForLSPDiagnostics()

    if (diagnosticSets.length === 0) {
      return []
    }

    logForDebugging(
      `LSP Diagnostics: Found ${diagnosticSets.length} pending diagnostic set(s)`,
    )

    // 将每组诊断转换为附件
    const attachments: Attachment[] = diagnosticSets.map(({ files }) => ({
      type: 'diagnostics' as const,
      files,
      isNew: true,
    }))

    // 从注册表中清除已传递的诊断以防止内存泄漏
    // 遵循与 removeDeliveredAsyncHooks 相同的模式
    if (diagnosticSets.length > 0) {
      clearAllLSPDiagnostics()
      logForDebugging(
        `LSP Diagnostics: Cleared ${diagnosticSets.length} delivered diagnostic(s) from registry`,
      )
    }

    logForDebugging(
      `LSP Diagnostics: Returning ${attachments.length} diagnostic attachment(s)`,
    )

    return attachments
  } catch (error) {
    const err = toError(error)
    logError(
      new Error(`Failed to get LSP diagnostic attachments: ${err.message}`),
    )
    // 返回空数组以允许其他附件继续处理
    return []
  }
}

export async function* getAttachmentMessages(
  input: string | null,
  toolUseContext: ToolUseContext,
  ideSelection: IDESelection | null,
  queuedCommands: QueuedCommand[],
  messages?: Message[],
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): AsyncGenerator<AttachmentMessage, void> {
  // TODO: 在上游计算此值
  const attachments = await getAttachments(
    input,
    toolUseContext,
    ideSelection,
    queuedCommands,
    messages,
    querySource,
    options,
  )

  if (attachments.length === 0) {
    return
  }

  logEvent('tengu_attachments', {
    attachment_types: attachments.map(
      _ => _.type,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  for (const attachment of attachments) {
    yield createAttachmentMessage(attachment)
  }
}

/**
 * 通过带有验证和截断的文件读取生成文件附件。
 * 这是 @-提及文件和后压缩恢复之间共享的核心文件读取逻辑。
 *
 * @param filename 要读取的文件的绝对路径
 * @param toolUseContext 用于调用 FileReadTool 的工具使用上下文
 * @param options 文件读取的可选配置
 * @returns 新文件附件，如果文件无法读取则返回 null
 */
/**
 * 检查 PDF 文件是否应表示为轻量级引用而非内联嵌入。
 * 对大 PDF（超过 PDF_AT_MENTION_INLINE_THRESHOLD 页）返回
 * PDFReferenceAttachment，否则返回 null。
 */
export async function tryGetPDFReference(
  filename: string,
): Promise<PDFReferenceAttachment | null> {
  const ext = parse(filename).ext.toLowerCase()
  if (!isPDFExtension(ext)) {
    return null
  }
  try {
    const [stats, pageCount] = await Promise.all([
      getFsImplementation().stat(filename),
      getPDFPageCount(filename),
    ])
    // 如果可用，使用页数，否则回退到大小启发式（每页约 100KB）
    const effectivePageCount = pageCount ?? Math.ceil(stats.size / (100 * 1024))
    if (effectivePageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      logEvent('tengu_pdf_reference_attachment', {
        pageCount: effectivePageCount,
        fileSize: stats.size,
        hadPdfinfo: pageCount !== null,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
      return {
        type: 'pdf_reference',
        filename,
        pageCount: effectivePageCount,
        fileSize: stats.size,
        displayPath: relative(getCwd(), filename),
      }
    }
  } catch {
    // 如果无法 stat 文件，返回 null 以继续正常读取
  }
  return null
}

export async function generateFileAttachment(
  filename: string,
  toolUseContext: ToolUseContext,
  successEventName: string,
  errorEventName: string,
  mode: 'compact' | 'at-mention',
  options?: {
    offset?: number
    limit?: number
  },
): Promise<
  | FileAttachment
  | CompactFileReferenceAttachment
  | PDFReferenceAttachment
  | AlreadyReadFileAttachment
  | null
> {
  const { offset, limit } = options ?? {}

  // 检查文件是否配置了拒绝规则
  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(filename, appState.toolPermissionContext)) {
    return null
  }

  // 尝试读取前检查文件大小（PDF 跳过——它们在下面有自己的大小/页面处理）
  if (
    mode === 'at-mention' &&
    !isFileWithinReadSizeLimit(
      filename,
      getDefaultFileReadingLimits().maxSizeBytes,
    )
  ) {
    const ext = parse(filename).ext.toLowerCase()
    if (!isPDFExtension(ext)) {
      try {
        const stats = await getFsImplementation().stat(filename)
        logEvent('tengu_attachment_file_too_large', {
          size_bytes: stats.size,
          mode,
        } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
        return null
      } catch {
        // 如果无法 stat 文件，继续正常读取（如果文件不存在，稍后会失败）
      }
    }
  }

  // 对于 @ 提及的大 PDF，返回轻量级引用而不是内联嵌入
  if (mode === 'at-mention') {
    const pdfRef = await tryGetPDFReference(filename)
    if (pdfRef) {
      return pdfRef
    }
  }

  // 检查文件是否已以最新版本存在于上下文中
  const existingFileState = toolUseContext.readFileState.get(filename)
  if (existingFileState && mode === 'at-mention') {
    try {
      // 检查文件自上次读取后是否已被修改
      const mtimeMs = await getFileModificationTimeAsync(filename)

      // 处理时间戳格式不一致：
      // - FileReadTool 存储 Date.now()（读取时的当前时间）
      // - FileEdit/WriteTools 存储 mtimeMs（文件修改时间）
      //
      // 如果 timestamp > mtimeMs，则是由 FileReadTool 使用 Date.now() 存储的
      // 在这种情况下，不应使用优化，因为无法可靠地比较修改时间。
      // 仅在 timestamp <= mtimeMs 时使用优化，表明是由
      // FileEdit/WriteTool 使用实际的 mtimeMs 存储的。

      if (
        existingFileState.timestamp <= mtimeMs &&
        mtimeMs === existingFileState.timestamp
      ) {
        // 文件未被修改，返回 already_read_file 附件
        // 这告诉系统文件已在上下文中，不需要发送到 API
        logEvent(successEventName, {})
        return {
          type: 'already_read_file',
          filename,
          displayPath: relative(getCwd(), filename),
          content: {
            type: 'text',
            file: {
              filePath: filename,
              content: existingFileState.content,
              numLines: countCharInString(existingFileState.content, '\n') + 1,
              startLine: offset ?? 1,
              totalLines:
                countCharInString(existingFileState.content, '\n') + 1,
            },
          },
        }
      }
    } catch {
      // 如果无法 stat 文件，继续正常读取
    }
  }

  try {
    const fileInput = {
      file_path: filename,
      offset,
      limit,
    }

    async function readTruncatedFile(): Promise<
      | FileAttachment
      | CompactFileReferenceAttachment
      | AlreadyReadFileAttachment
      | null
    > {
      if (mode === 'compact') {
        return {
          type: 'compact_file_reference',
          filename,
          displayPath: relative(getCwd(), filename),
        }
      }

      // 在读取截断文件前检查拒绝规则
      const appState = toolUseContext.getAppState()
      if (isFileReadDenied(filename, appState.toolPermissionContext)) {
        return null
      }

      try {
        // 对于过大的文件，仅读取前 MAX_LINES_TO_READ 行
        const truncatedInput = {
          file_path: filename,
          offset: offset ?? 1,
          limit: MAX_LINES_TO_READ,
        }
        const result = await FileReadTool.call(truncatedInput, toolUseContext)
        logEvent(successEventName, {})

        return {
          type: 'file' as const,
          filename,
          content: result.data,
          truncated: true,
          displayPath: relative(getCwd(), filename),
        }
      } catch {
        logEvent(errorEventName, {})
        return null
      }
    }

    // 验证文件路径是否有效
    const isValid = await FileReadTool.validateInput(fileInput, toolUseContext)
    if (!isValid.result) {
      return null
    }

    try {
      const result = await FileReadTool.call(fileInput, toolUseContext)
      logEvent(successEventName, {})
      return {
        type: 'file',
        filename,
        content: result.data,
        displayPath: relative(getCwd(), filename),
      }
    } catch (error) {
      if (
        error instanceof MaxFileReadTokenExceededError ||
        error instanceof FileTooLargeError
      ) {
        return await readTruncatedFile()
      }
      throw error
    }
  } catch {
    logEvent(errorEventName, {})
    return null
  }
}

export function createAttachmentMessage(
  attachment: Attachment,
): AttachmentMessage {
  return {
    attachment,
    type: 'attachment',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

function getTodoReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTodoWrite: number
  turnsSinceLastReminder: number
} {
  let lastTodoWriteIndex = -1
  let lastReminderIndex = -1
  let assistantTurnsSinceWrite = 0
  let assistantTurnsSinceReminder = 0

  // 向后迭代以查找最近的事件
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) {
        // 跳过思考消息
        continue
      }

      // 在递增计数器之前检查 TodoWrite 的使用
      // （我们不希望将 TodoWrite 消息本身计为"写后已过 1 轮"）
      if (
        lastTodoWriteIndex === -1 &&
        'message' in message &&
        Array.isArray(message.message?.content) &&
        message.message.content.some(
          block => block.type === 'tool_use' && block.name === 'TodoWrite',
        )
      ) {
        lastTodoWriteIndex = i
      }

      // 在找到事件之前计算 assistant 轮数
      if (lastTodoWriteIndex === -1) assistantTurnsSinceWrite++
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++
    } else if (
      lastReminderIndex === -1 &&
      message?.type === 'attachment' &&
      message.attachment.type === 'todo_reminder'
    ) {
      lastReminderIndex = i
    }

    if (lastTodoWriteIndex !== -1 && lastReminderIndex !== -1) {
      break
    }
  }

  return {
    turnsSinceLastTodoWrite: assistantTurnsSinceWrite,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  }
}

async function getTodoReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 如果 TodoWrite 工具不可用则跳过
  if (
    !toolUseContext.options.tools.some(t =>
      toolMatchesName(t, TODO_WRITE_TOOL_NAME),
    )
  ) {
    return []
  }

  // 当 SendUserMessage 在工具包中时，它是主要的通信通道，
  // 模型总是被告知使用它（#20467）。TodoWrite 变成了一个侧通道——
  // 提醒模型关于它的问题会与简洁工作流程冲突。
  // 工具本身仍然可用；这仅仅限制了"你有一段时间没用了"的提示。
  if (
    BRIEF_TOOL_NAME &&
    toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))
  ) {
    return []
  }

  // 如果没有提供消息则跳过
  if (!messages || messages.length === 0) {
    return []
  }

  const { turnsSinceLastTodoWrite, turnsSinceLastReminder } =
    getTodoReminderTurnCounts(messages)

  // 检查是否应显示提醒
  if (
    turnsSinceLastTodoWrite >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const todoKey = toolUseContext.agentId ?? getSessionId()
    const appState = toolUseContext.getAppState()
    const todos = appState.todos[todoKey] ?? []
    return [
      {
        type: 'todo_reminder',
        content: todos,
        itemCount: todos.length,
      },
    ]
  }

  return []
}

function getTaskReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTaskManagement: number
  turnsSinceLastReminder: number
} {
  let lastTaskManagementIndex = -1
  let lastReminderIndex = -1
  let assistantTurnsSinceTaskManagement = 0
  let assistantTurnsSinceReminder = 0

  // 向后迭代以查找最近的事件
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) {
        // 跳过思考消息
        continue
      }

      // 在递增计数器之前检查 TaskCreate 或 TaskUpdate 的使用
      if (
        lastTaskManagementIndex === -1 &&
        'message' in message &&
        Array.isArray(message.message?.content) &&
        message.message.content.some(
          block =>
            block.type === 'tool_use' &&
            (block.name === TASK_CREATE_TOOL_NAME ||
              block.name === TASK_UPDATE_TOOL_NAME),
        )
      ) {
        lastTaskManagementIndex = i
      }

      // 在找到事件之前计算 assistant 轮数
      if (lastTaskManagementIndex === -1) assistantTurnsSinceTaskManagement++
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++
    } else if (
      lastReminderIndex === -1 &&
      message?.type === 'attachment' &&
      message.attachment.type === 'task_reminder'
    ) {
      lastReminderIndex = i
    }

    if (lastTaskManagementIndex !== -1 && lastReminderIndex !== -1) {
      break
    }
  }

  return {
    turnsSinceLastTaskManagement: assistantTurnsSinceTaskManagement,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  }
}

async function getTaskReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isTodoV2Enabled()) {
    return []
  }

  // 跳过 ant 内部用户
  if (process.env.USER_TYPE === 'ant') {
    return []
  }

  // 当 SendUserMessage 在工具包中时，它是主要的通信通道，
  // 模型总是被告知使用它（#20467）。TaskUpdate 变成了一个侧通道——
  // 提醒模型关于它的问题会与简洁工作流程冲突。
  // 工具本身仍然可用；这仅仅限制了提示。
  if (
    BRIEF_TOOL_NAME &&
    toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))
  ) {
    return []
  }

  // 如果 TaskUpdate 工具不可用则跳过
  if (
    !toolUseContext.options.tools.some(t =>
      toolMatchesName(t, TASK_UPDATE_TOOL_NAME),
    )
  ) {
    return []
  }

  // 如果没有提供消息则跳过
  if (!messages || messages.length === 0) {
    return []
  }

  const { turnsSinceLastTaskManagement, turnsSinceLastReminder } =
    getTaskReminderTurnCounts(messages)

  // 检查是否应显示提醒
  if (
    turnsSinceLastTaskManagement >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const tasks = await listTasks(getTaskListId())
    return [
      {
        type: 'task_reminder',
        content: tasks,
        itemCount: tasks.length,
      },
    ]
  }

  return []
}

/**
 * Get attachments for all unified tasks using the Task framework.
 * Replaces the old getBackgroundShellAttachments, getBackgroundRemoteSessionAttachments,
 * and getAsyncAgentAttachments functions.
 */
async function getUnifiedTaskAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const { attachments, updatedTaskOffsets, evictedTaskIds } =
    await generateTaskAttachments(appState)

  applyTaskOffsetsAndEvictions(
    toolUseContext.setAppState,
    updatedTaskOffsets,
    evictedTaskIds,
  )

  // 将 TaskAttachment 转换为 Attachment 格式
  return attachments.map(taskAttachment => ({
    type: 'task_status' as const,
    taskId: taskAttachment.taskId,
    taskType: taskAttachment.taskType,
    status: taskAttachment.status,
    description: taskAttachment.description,
    deltaSummary: taskAttachment.deltaSummary,
    outputFilePath: getTaskOutputPath(taskAttachment.taskId),
  }))
}

async function getAsyncHookResponseAttachments(): Promise<Attachment[]> {
  const responses = await checkForAsyncHookResponses()

  if (responses.length === 0) {
    return []
  }

  logForDebugging(
    `Hooks: getAsyncHookResponseAttachments found ${responses.length} responses`,
  )

  const attachments = responses.map(
    ({
      processId,
      response,
      hookName,
      hookEvent,
      toolName,
      pluginId,
      stdout,
      stderr,
      exitCode,
    }) => {
      logForDebugging(
        `Hooks: Creating attachment for ${processId} (${hookName}): ${jsonStringify(response)}`,
      )
      return {
        type: 'async_hook_response' as const,
        processId,
        hookName,
        hookEvent,
        toolName,
        response,
        stdout,
        stderr,
        exitCode,
      }
    },
  )

  // 从注册表中移除已传递的钩子以防止重复处理
  if (responses.length > 0) {
    const processIds = responses.map(r => r.processId)
    removeDeliveredAsyncHooks(processIds)
    logForDebugging(
      `Hooks: Removed ${processIds.length} delivered hooks from registry`,
    )
  }

  logForDebugging(
    `Hooks: getAsyncHookResponseAttachments found ${attachments.length} attachments`,
  )

  return attachments
}

/**
 * 获取队友邮箱附件，用于 agent 群体通信。
 * 队友是并行运行的独立 Claude Code 会话（群体），
 * 而不是父子子 agent 关系。
 *
 * 此函数检查两个消息来源：
 * 1. 基于文件的邮箱（轮询间隔期间到达的消息）
 * 2. AppState.inbox（轮询中在回合中间排队的消息）
 *
 * 来自 AppState.inbox 的消息在回合中间作为附件传递，
 * 使队友无需等待回合结束即可接收消息。
 */
async function getTeammateMailboxAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isAgentSwarmsEnabled()) {
    return []
  }
  if (process.env.USER_TYPE !== 'ant') {
    return []
  }

  // 提前获取 AppState 以检查团队领导状态
  const appState = toolUseContext.getAppState()

  // 使用辅助函数获取 agent 名称（检查 AsyncLocalStorage，然后 dynamicTeamContext）
  const envAgentName = getAgentName()

  // 获取团队名称（检查 AsyncLocalStorage、dynamicTeamContext，然后 AppState）
  const teamName = getTeamName(appState.teamContext)

  // 检查我们是否是团队领导（使用 swarm 工具中的共享逻辑）
  const teamLeadStatus = isTeamLead(appState.teamContext)

  // 检查是否在查看队友的对话记录（适用于进程内队友）
  const viewedTeammate = getViewedTeammateTask(appState)

  // 根据正在查看的对象解析 agent 名称：
  // - 如果正在查看队友，使用他们的名称（以读取其邮箱）
  // - 否则使用环境变量（如果设置），或团队领导名称（如果我们是团队领导）
  let agentName = viewedTeammate?.identity.agentName ?? envAgentName
  if (!agentName && teamLeadStatus && appState.teamContext) {
    const leadAgentId = appState.teamContext.leadAgentId
    // 从 agent 映射中查找领导名称（非 UUID）
    agentName = appState.teamContext.teammates[leadAgentId]?.name || 'team-lead'
  }

  logForDebugging(
    `[SwarmMailbox] getTeammateMailboxAttachments called: envAgentName=${envAgentName}, isTeamLead=${teamLeadStatus}, resolved agentName=${agentName}, teamName=${teamName}`,
  )

  // 仅在作为群体中的 agent 或团队领导运行时检查收件箱
  if (!agentName) {
    logForDebugging(
      `[SwarmMailbox] Not checking inbox - not in a swarm or team lead`,
    )
    return []
  }

  logForDebugging(
    `[SwarmMailbox] Checking inbox for agent="${agentName}" team="${teamName || 'default'}"`,
  )

  // 检查邮箱中是否有未读消息（路由到进程内或基于文件的）
  // 过滤掉结构化协议消息（权限请求/响应、关闭
  // 消息等）——这些必须保持未读状态，供 useInboxPoller 路由到其
  // 适当的处理器（workerPermissions 队列、sandbox 队列等）。如果不进行过滤，
  // 附件生成会与 InboxPoller 竞争：谁先读取谁就将所有消息标记为
  // 已读，如果附件胜出，协议消息会被作为原始 LLM 上下文文本打包，
  // 而不是路由到它们的 UI 处理器。
  const allUnreadMessages = await readUnreadMessages(agentName, teamName)
  const unreadMessages = allUnreadMessages.filter(
    m => !isStructuredProtocolMessage(m.text),
  )
  logForDebugging(
    `[MailboxBridge] Found ${allUnreadMessages.length} unread message(s) for "${agentName}" (${allUnreadMessages.length - unreadMessages.length} structured protocol messages filtered out)`,
  )

  // 同时检查 AppState.inbox 中是否有待处理消息（由 useInboxPoller 在回合中排队）
  // 重要：appState.inbox 包含从队友发送给领导的消息。
  // 仅在查看领导对话记录时显示这些消息（而非队友的）。
  // 查看队友时，他们的消息来自上面基于文件的邮箱。
  // 进程内队友与领导共享 AppState — appState.inbox 包含
  // 领导的排队消息，而非队友的。跳过它以防止泄漏
  // （包括广播的自回显）。队友通过基于文件的邮箱 +
  // waitForNextPromptOrShutdown 专门接收消息。
  // 注意：viewedTeammate 已在上面为 agentName 解析计算过
  const pendingInboxMessages =
    viewedTeammate || isInProcessTeammate()
      ? [] // 查看同组成员或作为进程内同组成员运行——不显示负责人的收件箱
      : appState.inbox.messages.filter(m => m.status === 'pending')
  logForDebugging(
    `[SwarmMailbox] Found ${pendingInboxMessages.length} pending message(s) in AppState.inbox`,
  )

  // 合并两个消息来源并去重
  // 由于竞态条件，同一条消息可能同时存在于文件邮箱和 AppState.inbox 中：
  // 1. getTeammateMailboxAttachments 读取文件 -> 找到消息 M
  // 2. InboxPoller 读取同一文件 -> 将 M 排入 AppState.inbox
  // 3. getTeammateMailboxAttachments 读取 AppState -> 再次找到 M
  // 我们使用 from+timestamp+text 前缀作为键进行去重
  const seen = new Set<string>()
  let allMessages: Array<{
    from: string
    text: string
    timestamp: string
    color?: string
    summary?: string
  }> = []

  for (const m of [...unreadMessages, ...pendingInboxMessages]) {
    const key = `${m.from}|${m.timestamp}|${m.text.slice(0, 100)}`
    if (!seen.has(key)) {
      seen.add(key)
      allMessages.push({
        from: m.from,
        text: m.text,
        timestamp: m.timestamp,
        color: m.color,
        summary: m.summary,
      })
    }
  }

  // 折叠每个 agent 的多条空闲通知——只保留最新的。
  // 单次解析，然后过滤而不重新解析。
  const idleAgentByIndex = new Map<number, string>()
  const latestIdleByAgent = new Map<string, number>()
  for (let i = 0; i < allMessages.length; i++) {
    const idle = isIdleNotification(allMessages[i]!.text)
    if (idle) {
      idleAgentByIndex.set(i, idle.from)
      latestIdleByAgent.set(idle.from, i)
    }
  }
  if (idleAgentByIndex.size > latestIdleByAgent.size) {
    const beforeCount = allMessages.length
    allMessages = allMessages.filter((_m, i) => {
      const agent = idleAgentByIndex.get(i)
      if (agent === undefined) return true
      return latestIdleByAgent.get(agent) === i
    })
    logForDebugging(
      `[SwarmMailbox] Collapsed ${beforeCount - allMessages.length} duplicate idle notification(s)`,
    )
  }

  if (allMessages.length === 0) {
    logForDebugging(`[SwarmMailbox] No messages to deliver, returning empty`)
    return []
  }

  logForDebugging(
    `[SwarmMailbox] Returning ${allMessages.length} message(s) as attachment for "${agentName}" (${unreadMessages.length} from file, ${pendingInboxMessages.length} from AppState, after dedup)`,
  )

  // 在标记消息为已处理之前构建附件
  // 这可以防止以下任何操作失败时消息丢失
  const attachment: Attachment[] = [
    {
      type: 'teammate_mailbox',
      messages: allMessages,
    },
  ]

  // 构建附件后，仅将非结构化邮箱消息标记为已读。
  // 结构化协议消息保持未读状态，由 useInboxPoller 处理。
  if (unreadMessages.length > 0) {
    await markMessagesAsReadByPredicate(
      agentName,
      m => !isStructuredProtocolMessage(m.text),
      teamName,
    )
    logForDebugging(
      `[MailboxBridge] marked ${unreadMessages.length} non-structured message(s) as read for agent="${agentName}" team="${teamName || 'default'}"`,
    )
  }

  // 处理 shutdown_approved 消息 - 从团队文件中移除队友
  // 这镜像了 useInboxPoller 在交互模式中的处理（第 546-606 行）
  // 在 -p 模式下，useInboxPoller 不运行，因此我们必须在此处处理
  if (teamLeadStatus && teamName) {
    for (const m of allMessages) {
      const shutdownApproval = isShutdownApproved(m.text)
      if (shutdownApproval) {
        const teammateToRemove = shutdownApproval.from
        logForDebugging(
          `[SwarmMailbox] Processing shutdown_approved from ${teammateToRemove}`,
        )

        // 按名称查找队友 ID
        const teammateId = appState.teamContext?.teammates
          ? Object.entries(appState.teamContext.teammates).find(
              ([, t]) => t.name === teammateToRemove,
            )?.[0]
          : undefined

        if (teammateId) {
          // 从团队文件中移除
          removeTeammateFromTeamFile(teamName, {
            agentId: teammateId,
            name: teammateToRemove,
          })
          logForDebugging(
            `[SwarmMailbox] Removed ${teammateToRemove} from team file`,
          )

          // 取消分配该队友拥有的任务
          await unassignTeammateTasks(
            teamName,
            teammateId,
            teammateToRemove,
            'shutdown',
          )

          // 从 AppState 的 teamContext 中移除
          toolUseContext.setAppState(prev => {
            if (!prev.teamContext?.teammates) return prev
            if (!(teammateId in prev.teamContext.teammates)) return prev
            const { [teammateId]: _, ...remainingTeammates } =
              prev.teamContext.teammates
            return {
              ...prev,
              teamContext: {
                ...prev.teamContext,
                teammates: remainingTeammates,
              },
            }
          })
        }
      }
    }
  }

  // 在附件构建之后，最后将 AppState 收件箱消息标记为已处理
  // 这确保如果前面的操作失败，消息不会丢失
  if (pendingInboxMessages.length > 0) {
    const pendingIds = new Set(pendingInboxMessages.map(m => m.id))
    toolUseContext.setAppState(prev => ({
      ...prev,
      inbox: {
        messages: prev.inbox.messages.map(m =>
          pendingIds.has(m.id) ? { ...m, status: 'processed' as const } : m,
        ),
      },
    }))
  }

  return attachment
}

/**
 * 获取群体中队友的团队上下文附件。
 * 仅在首轮注入以提供团队协调指令。
 */
function getTeamContextAttachment(messages: Message[]): Attachment[] {
  const teamName = getTeamName()
  const agentId = getAgentId()
  const agentName = getAgentName()

  // 仅对队友注入（非团队领导或非团队会话）
  if (!teamName || !agentId) {
    return []
  }

  // 仅在首轮注入——检查是否还没有 assistant 消息
  const hasAssistantMessage = messages.some(m => m.type === 'assistant')
  if (hasAssistantMessage) {
    return []
  }

  const configDir = getClaudeConfigHomeDir()
  const teamConfigPath = `${configDir}/teams/${teamName}/config.json`
  const taskListPath = `${configDir}/tasks/${teamName}/`

  return [
    {
      type: 'team_context',
      agentId,
      agentName: agentName || agentId,
      teamName,
      teamConfigPath,
      taskListPath,
    },
  ]
}

function getTokenUsageAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT)) {
    return []
  }

  const contextWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountFromLastAPIResponse(messages)

  return [
    {
      type: 'token_usage',
      used: usedTokens,
      total: contextWindow,
      remaining: contextWindow - usedTokens,
    },
  ]
}

function getOutputTokenUsageAttachment(): Attachment[] {
  if (feature('TOKEN_BUDGET')) {
    const budget = getCurrentTurnTokenBudget()
    if (budget === null || budget <= 0) {
      return []
    }
    return [
      {
        type: 'output_token_usage',
        turn: getTurnOutputTokens(),
        session: getTotalOutputTokens(),
        budget,
      },
    ]
  }
  return []
}

function getMaxBudgetUsdAttachment(maxBudgetUsd?: number): Attachment[] {
  if (maxBudgetUsd === undefined) {
    return []
  }

  const usedCost = getTotalCostUSD()
  const remainingBudget = maxBudgetUsd - usedCost

  return [
    {
      type: 'budget_usd',
      used: usedCost,
      total: maxBudgetUsd,
      remaining: remainingBudget,
    },
  ]
}

/**
 * 统计自计划模式退出（plan_mode_exit 附件）以来的人工轮数。
 * 如果未找到 plan_mode_exit 附件，则返回 0。
 *
 * tool_result 消息的类型为 'user' 且没有 isMeta，因此通过 toolUseResult
 * 过滤以避免计数它们——否则 10 轮提醒间隔会在每约 10 次工具调用时
 * 触发，而不是每约 10 个人工轮数。
 */
export function getVerifyPlanReminderTurnCount(messages: Message[]): number {
  let turnCount = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && isHumanTurn(message)) {
      turnCount++
    }
    // 在 plan_mode_exit 附件处停止计数（标记实现开始的时间）
    if (
      message?.type === 'attachment' &&
      message.attachment.type === 'plan_mode_exit'
    ) {
      return turnCount
    }
  }
  // 未找到 plan_mode_exit
  return 0
}

/**
 * 如果模型尚未调用 VerifyPlanExecution，获取验证计划提醒附件。
 */
async function getVerifyPlanReminderAttachment(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (
    process.env.USER_TYPE !== 'ant' ||
    !isEnvTruthy(process.env.CLAUDE_CODE_VERIFY_PLAN)
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  const pending = appState.pendingPlanVerification

  // 仅在计划存在且验证未开始或未完成时提醒
  if (
    !pending ||
    pending.verificationStarted ||
    pending.verificationCompleted
  ) {
    return []
  }

  // 仅每 N 轮提醒一次
  if (messages && messages.length > 0) {
    const turnCount = getVerifyPlanReminderTurnCount(messages)
    if (
      turnCount === 0 ||
      turnCount % VERIFY_PLAN_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS !== 0
    ) {
      return []
    }
  }

  return [{ type: 'verify_plan_reminder' }]
}

export function getCompactionReminderAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_marble_fox', false)) {
    return []
  }

  if (!isAutoCompactEnabled()) {
    return []
  }

  const contextWindow = getContextWindowForModel(model, getSdkBetas())
  if (contextWindow < 1_000_000) {
    return []
  }

  const effectiveWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountWithEstimation(messages)
  if (usedTokens < effectiveWindow * 0.25) {
    return []
  }

  return [{ type: 'compaction_reminder' }]
}

/**
 * 上下文效率提示。在没有 snip 的情况下每增长 N 个 token 后注入。
 * 节奏完全由 shouldNudgeForSnips 控制——10k 间隔在之前的提示、
 * snip 标记、snip 边界和压缩边界处重置。
 */
export function getContextEfficiencyAttachment(
  messages: Message[],
): Attachment[] {
  if (!feature('HISTORY_SNIP')) {
    return []
  }
  // 门控必须与 SnipTool.isEnabled() 匹配——不要提示指向不在工具列表中的
  // 工具。懒加载的 require 使此文件保持无 snip 字符串。
  const { isSnipRuntimeEnabled, shouldNudgeForSnips } =
     
    require('../services/compact/snipCompact.js') as typeof import('../services/compact/snipCompact.js')
  if (!isSnipRuntimeEnabled()) {
    return []
  }

  if (!shouldNudgeForSnips(messages)) {
    return []
  }

  return [{ type: 'context_efficiency' }]
}


function isFileReadDenied(
  filePath: string,
  toolPermissionContext: ToolPermissionContext,
): boolean {
  const denyRule = matchingRuleForInput(
    filePath,
    toolPermissionContext,
    'read',
    'deny',
  )
  return denyRule !== null
}
