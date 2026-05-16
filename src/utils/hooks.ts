// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
/**
 * Hook 是用户定义的 shell 命令，可在 Claude Code 生命周期的各个阶段执行。
 *
 */
import { basename } from 'path'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { pathExists } from './file.js'
import { wrapSpawn } from './ShellCommand.js'
import { TaskOutput } from './task/TaskOutput.js'
import { getCwd } from './cwd.js'
import { randomUUID } from 'crypto'
import { formatShellPrefixCommand } from './bash/shellPrefix.js'
import {
  getHookEnvFilePath,
  invalidateSessionEnvCache,
} from './sessionEnvironment.js'
import { subprocessEnv } from './subprocessEnv.js'
import { getPlatform } from './platform.js'
import { findGitBashPath, windowsPathToPosixPath } from './windowsPaths.js'
import { getCachedPowerShellPath } from './shell/powershellDetection.js'
import { DEFAULT_HOOK_SHELL } from './shell/shellProvider.js'
import { buildPowerShellArgs } from './shell/powershellProvider.js'
import {
  loadPluginOptions,
  substituteUserConfigVariables,
} from './plugins/pluginOptionsStorage.js'
import { getPluginDataDir } from './plugins/pluginDirectories.js'
import {
  getSessionId,
  getProjectRoot,
  getIsNonInteractiveSession,
  getRegisteredHooks,
  getStatsStore,
  addToTurnHookDuration,
  getOriginalCwd,
  getMainThreadAgentType,
} from '../bootstrap/state.js'
import { checkHasTrustDialogAccepted } from './config.js'
import {
  getHooksConfigFromSnapshot,
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged,
} from './hooks/hooksConfigSnapshot.js'
import {
  getTranscriptPathForSession,
  getAgentTranscriptPath,
} from './sessionStorage.js'
import type { AgentId } from '../types/ids.js'
import {
  getSettings_DEPRECATED,
  getSettingsForSource,
} from './settings/settings.js'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from '../services/analytics/index.js'
import { logOTelEvent } from './telemetry/events.js'
import { ALLOWED_OFFICIAL_MARKETPLACE_NAMES } from './plugins/schemas.js'
import {
  startHookSpan,
  endHookSpan,
  isBetaTracingEnabled,
} from './telemetry/sessionTracing.js'
import {
  hookJSONOutputSchema,
  promptRequestSchema,
  type HookCallback,
  type HookCallbackMatcher,
  type PromptRequest,
  type PromptResponse,
  isAsyncHookJSONOutput,
  isSyncHookJSONOutput,
  type PermissionRequestResult,
} from '../types/hooks.js'
import type {
  HookEvent,
  HookInput,
  HookJSONOutput,
  NotificationHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  PermissionDeniedHookInput,
  PreCompactHookInput,
  PostCompactHookInput,
  PreToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  SetupHookInput,
  StopHookInput,
  StopFailureHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
  TeammateIdleHookInput,
  TaskCreatedHookInput,
  TaskCompletedHookInput,
  ConfigChangeHookInput,
  CwdChangedHookInput,
  FileChangedHookInput,
  InstructionsLoadedHookInput,
  UserPromptSubmitHookInput,
  PermissionRequestHookInput,
  ElicitationHookInput,
  ElicitationResultHookInput,
  PermissionUpdate,
  ExitReason,
  SyncHookJSONOutput,
  AsyncHookJSONOutput,
} from '../entrypoints/agentSdkTypes.js'
import type { StatusLineCommandInput } from '../types/statusLine.js'
import type { ElicitResult } from '@modelcontextprotocol/sdk/types.js'
import type { FileSuggestionCommandInput } from '../types/fileSuggestion.js'
import type { HookResultMessage } from '../types/message.js'
import chalk from 'chalk'
import type {
  HookMatcher,
  HookCommand,
  PluginHookMatcher,
  SkillHookMatcher,
} from './settings/types.js'
import { getHookDisplayText } from './hooks/hooksSettings.js'
import { logForDebugging } from './debug.js'
import { logForDiagnosticsNoPII } from './diagLogs.js'
import { firstLineOf } from './stringUtils.js'
import {
  normalizeLegacyToolName,
  getLegacyToolNames,
  permissionRuleValueFromString,
} from './permissions/permissionRuleParser.js'
import { logError } from './log.js'
import { createCombinedAbortSignal } from './combinedAbortSignal.js'
import type { PermissionResult } from './permissions/PermissionResult.js'
import { registerPendingAsyncHook } from './hooks/AsyncHookRegistry.js'
import { enqueuePendingNotification } from './messageQueueManager.js'
import {
  extractTextContent,
  getLastAssistantMessage,
  wrapInSystemReminder,
} from './messages.js'
import {
  emitHookStarted,
  emitHookResponse,
  startHookProgressInterval,
} from './hooks/hookEvents.js'
import { createAttachmentMessage } from './attachments.js'
import { all } from './generators.js'
import { findToolByName, type Tools, type ToolUseContext } from '../Tool.js'
import { execPromptHook } from './hooks/execPromptHook.js'
import type { Message, AssistantMessage } from '../types/message.js'
import { execAgentHook } from './hooks/execAgentHook.js'
import { execHttpHook } from './hooks/execHttpHook.js'
import type { ShellCommand } from './ShellCommand.js'
import {
  getSessionHooks,
  getSessionFunctionHooks,
  getSessionHookCallback,
  clearSessionHooks,
  type SessionDerivedHookMatcher,
  type FunctionHook,
} from './hooks/sessionHooks.js'
import type { AppState } from '../state/AppState.js'
import { jsonStringify, jsonParse } from './slowOperations.js'
import { isEnvTruthy } from './envUtils.js'
import { errorMessage, getErrnoCode } from './errors.js'

const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000

/**
 * SessionEnd 钩子在关闭/清除期间运行，需要比 TOOL_HOOK_EXECUTION_TIMEOUT_MS 更严格的限制。
 * 此值被调用者同时用作每个钩子的默认超时 AND 整体 AbortSignal 上限（钩子并行运行，
 * 一个值就足够了）。可通过环境变量覆盖，供需要更多时间的用户使用。
 *
 * teardown scripts need more time.
 */
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500
export function getSessionEndHookTimeoutMs(): number {
  const raw = process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : SESSION_END_HOOK_TIMEOUT_MS_DEFAULT
}

function executeInBackground({
  processId,
  hookId,
  shellCommand,
  asyncResponse,
  hookEvent,
  hookName,
  command,
  asyncRewake,
  pluginId,
}: {
  processId: string
  hookId: string
  shellCommand: ShellCommand
  asyncResponse: AsyncHookJSONOutput
  hookEvent: HookEvent | 'StatusLine' | 'FileSuggestion'
  hookName: string
  command: string
  asyncRewake?: boolean
  pluginId?: string
}): boolean {
  if (asyncRewake) {
    // asyncRewake 钩子完全绕过注册表。完成后，如果退出
    // 代码 2（阻塞错误），将其作为任务通知入队，以便通过 useQueueProcessor（空闲）唤醒
    // 模型，或在忙碌时通过 queued_command 附件注入查询中。
    // queued_command 附件（忙碌时）。
    //
    // 注意：我们故意不在此处调用 shellCommand.background()，因为
    // 它会调用 taskOutput.spillToDisk()，这会破坏内存中的 stdout/stderr
    // 捕获（getStderr() 在磁盘模式下返回 ''）。StreamWrapper 保持
    // 连接并将数据管道传输到内存中的 TaskOutput 缓冲区。abort
    // 处理程序已对 'interrupt' 原因执行空操作（用户提交了新消息），
    // 因此钩子能存活于新提示。硬取消（Escape）将
    // 通过 abort 处理程序杀死钩子，这是预期行为。
    void shellCommand.result.then(async result => {
      // result 在 'exit' 时解析，但 stdio 'data' 事件可能仍然
      // 待处理。让出 I/O 以便 StreamWrapper 数据处理程序在
      // 我们读取之前将数据排入 TaskOutput。
      await new Promise(resolve => setImmediate(resolve))
      const stdout = await shellCommand.taskOutput.getStdout()
      const stderr = shellCommand.taskOutput.getStderr()
      shellCommand.cleanup()
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: stdout + stderr,
        stdout,
        stderr,
        exitCode: result.code,
        outcome: result.code === 0 ? 'success' : 'error',
      })
      if (result.code === 2) {
        enqueuePendingNotification({
          value: wrapInSystemReminder(
            `Stop hook blocking error from command "${hookName}": ${stderr || stdout}`,
          ),
          mode: 'task-notification',
        })
      }
    })
    return true
  }

  // ShellCommand 上的 TaskOutput 累积数据——不需要流监听器
  if (!shellCommand.background(processId)) {
    return false
  }

  registerPendingAsyncHook({
    processId,
    hookId,
    asyncResponse,
    hookEvent,
    hookName,
    command,
    shellCommand,
    pluginId,
  })

  return true
}

/**
 * 检查是否因缺少工作区信任而应跳过钩子。
 *
 * ALL 钩子需要工作区信任，因为它们从 .claude/settings.json 执行任意命令。
 * 这是一项深度防御安全措施。
 *
 * 上下文：钩子在显示信任对话框之前通过 captureHooksConfigSnapshot() 捕获。
 * 虽然大多数钩子直到通过正常程序流程建立信任后才会执行，
 * 但对 ALL 钩子强制执行信任可以防止：
 * - 未来可能出现的钩子在信任前意外执行的错误
 * - 任何可能在信任对话框前触发钩子的代码路径
 * - 在不受信任的工作区中执行钩子的安全问题
 *
 * 促使此检查的历史漏洞：
 * - 用户拒绝信任对话框时 SessionEnd 钩子执行
 * - 子代理在信任前完成时 SubagentStop 钩子执行
 *
 * @returns 如果应跳过钩子则返回 true，如果应执行则返回 false
 */
export function shouldSkipHookDueToTrust(): boolean {
  // 在非交互模式（SDK）下，信任是隐式的——始终执行
  const isInteractive = !getIsNonInteractiveSession()
  if (!isInteractive) {
    return false
  }

  // 在交互模式下，ALL 钩子都需要信任
  const hasTrust = checkHasTrustDialogAccepted()
  return !hasTrust
}

/**
 * 创建所有钩子类型通用的基础钩子输入
 */
export function createBaseHookInput(
  permissionMode?: string,
  sessionId?: string,
  // 窄类型化（非 ToolUseContext），以便调用者可以通过结构类型直接传递 toolUseContext，
  // 无需此函数依赖 Tool.ts。
  agentInfo?: { agentId?: string; agentType?: string },
): {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode?: string
  agent_id?: string
  agent_type?: string
} {
  const resolvedSessionId = sessionId ?? getSessionId()
  // agent_type：子代理的类型（来自 toolUseContext）优先于
  // 会话的 --agent 标志。钩子使用 agent_id 存在性来区分
  // 子代理调用与 --agent 会话中的主线程调用。
  const resolvedAgentType = agentInfo?.agentType ?? getMainThreadAgentType()
  return {
    session_id: resolvedSessionId,
    transcript_path: getTranscriptPathForSession(resolvedSessionId),
    cwd: getCwd(),
    permission_mode: permissionMode,
    agent_id: agentInfo?.agentId,
    agent_type: resolvedAgentType,
  }
}

export interface HookBlockingError {
  blockingError: string
  command: string
}

/** 从 MCP SDK 重新导出 ElicitResult 作为 ElicitationResponse，以保持向后兼容。 */
export type ElicitationResponse = ElicitResult

export interface HookResult {
  message?: HookResultMessage
  systemMessage?: string
  blockingError?: HookBlockingError
  outcome: 'success' | 'blocking' | 'non_blocking_error' | 'cancelled'
  preventContinuation?: boolean
  stopReason?: string
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough'
  hookPermissionDecisionReason?: string
  additionalContext?: string
  initialUserMessage?: string
  updatedInput?: Record<string, unknown>
  updatedMCPToolOutput?: unknown
  permissionRequestResult?: PermissionRequestResult
  elicitationResponse?: ElicitationResponse
  watchPaths?: string[]
  elicitationResultResponse?: ElicitationResponse
  retry?: boolean
  hook: HookCommand | HookCallback | FunctionHook
}

export type AggregatedHookResult = {
  message?: HookResultMessage
  blockingError?: HookBlockingError
  preventContinuation?: boolean
  stopReason?: string
  hookPermissionDecisionReason?: string
  hookSource?: string
  permissionBehavior?: PermissionResult['behavior']
  additionalContexts?: string[]
  initialUserMessage?: string
  updatedInput?: Record<string, unknown>
  updatedMCPToolOutput?: unknown
  permissionRequestResult?: PermissionRequestResult
  watchPaths?: string[]
  elicitationResponse?: ElicitationResponse
  elicitationResultResponse?: ElicitationResponse
  retry?: boolean
}

/**
 * 解析并验证针对钩子输出 Zod 模式的 JSON 字符串。
 * 返回验证后的输出或格式化的验证错误。
 */
function validateHookJson(
  jsonString: string,
): { json: HookJSONOutput } | { validationError: string } {
  const parsed = jsonParse(jsonString)
  const validation = hookJSONOutputSchema().safeParse(parsed)
  if (validation.success) {
    logForDebugging('Successfully parsed and validated hook JSON output')
    return { json: validation.data }
  }
  const errors = validation.error.issues
    .map(err => `  - ${err.path.join('.')}: ${err.message}`)
    .join('\n')
  return {
    validationError: `Hook JSON output validation failed:\n${errors}\n\nThe hook's output was: ${jsonStringify(parsed, null, 2)}`,
  }
}

function parseHookOutput(stdout: string): {
  json?: HookJSONOutput
  plainText?: string
  validationError?: string
} {
  const trimmed = stdout.trim()
  if (!trimmed.startsWith('{')) {
    logForDebugging('Hook output does not start with {, treating as plain text')
    return { plainText: stdout }
  }

  try {
    const result = validateHookJson(trimmed)
    if ('json' in result) {
      return result
    }
    // 对于命令钩子，在错误消息中包含模式提示
    const errorMessage = `${result.validationError}\n\nExpected schema:\n${jsonStringify(
      {
        continue: 'boolean (optional)',
        suppressOutput: 'boolean (optional)',
        stopReason: '字符串（可选）',
        decision: '"approve" | "block"（可选）',
        reason: '字符串（可选）',
        systemMessage: '字符串（可选）',
        permissionDecision: '"allow" | "deny" | "ask"（可选）',
        hookSpecificOutput: {
          'for PreToolUse': {
            hookEventName: '"PreToolUse"',
            permissionDecision: '"allow" | "deny" | "ask"（可选）',
            permissionDecisionReason: '字符串（可选）',
            updatedInput: '对象（可选）- 要使用的修改后的工具输入',
          },
          'for UserPromptSubmit': {
            hookEventName: '"UserPromptSubmit"',
            additionalContext: '字符串（必填）',
          },
          'for PostToolUse': {
            hookEventName: '"PostToolUse"',
            additionalContext: '字符串（可选）',
          },
        },
      },
      null,
      2,
    )}`
    logForDebugging(errorMessage)
    return { plainText: stdout, validationError: errorMessage }
  } catch (e) {
    logForDebugging(`Failed to parse hook output as JSON: ${e}`)
    return { plainText: stdout }
  }
}

function parseHttpHookOutput(body: string): {
  json?: HookJSONOutput
  validationError?: string
} {
  const trimmed = body.trim()

  if (trimmed === '') {
    const validation = hookJSONOutputSchema().safeParse({})
    if (validation.success) {
      logForDebugging(
        'HTTP 钩子返回空响应体，按空 JSON 对象处理',
      )
      return { json: validation.data }
    }
  }

  if (!trimmed.startsWith('{')) {
    const validationError = `HTTP hook must return JSON, but got non-JSON response body: ${trimmed.length > 200 ? trimmed.slice(0, 200) + '\u2026' : trimmed}`
    logForDebugging(validationError)
    return { validationError }
  }

  try {
    const result = validateHookJson(trimmed)
    if ('json' in result) {
      return result
    }
    logForDebugging(result.validationError)
    return result
  } catch (e) {
    const validationError = `HTTP hook must return valid JSON, but parsing failed: ${e}`
    logForDebugging(validationError)
    return { validationError }
  }
}

function processHookJSONOutput({
  json,
  command,
  hookName,
  toolUseID,
  hookEvent,
  expectedHookEvent,
  stdout,
  stderr,
  exitCode,
  durationMs,
}: {
  json: SyncHookJSONOutput
  command: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  expectedHookEvent?: HookEvent
  stdout?: string
  stderr?: string
  exitCode?: number
  durationMs?: number
}): Partial<HookResult> {
  const result: Partial<HookResult> = {}

  // 此时我们知道这是一个同步响应
  const syncJson = json

  // 处理公共元素
  if (syncJson.continue === false) {
    result.preventContinuation = true
    if (syncJson.stopReason) {
      result.stopReason = syncJson.stopReason
    }
  }

  if (json.decision) {
    switch (json.decision) {
      case 'approve':
        result.permissionBehavior = 'allow'
        break
      case 'block':
        result.permissionBehavior = 'deny'
        result.blockingError = {
          blockingError: json.reason || '被钩子阻止',
          command,
        }
        break
      default:
        // 将未知决策类型视为错误
        throw new Error(
          `Unknown hook decision type: ${json.decision}. Valid types are: approve, block`,
        )
    }
  }

  // 处理 systemMessage 字段
  if (json.systemMessage) {
    result.systemMessage = json.systemMessage
  }

  // 处理 PreToolUse 特定逻辑
  if (
    json.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
    json.hookSpecificOutput.permissionDecision
  ) {
    switch (json.hookSpecificOutput.permissionDecision) {
      case 'allow':
        result.permissionBehavior = 'allow'
        break
      case 'deny':
        result.permissionBehavior = 'deny'
        result.blockingError = {
          blockingError: json.reason || '被钩子阻止',
          command,
        }
        break
      case 'ask':
        result.permissionBehavior = 'ask'
        break
      default:
        // 将未知决策类型视为错误
        throw new Error(
          `Unknown hook permissionDecision type: ${json.hookSpecificOutput.permissionDecision}. Valid types are: allow, deny, ask`,
        )
    }
  }
  if (result.permissionBehavior !== undefined && json.reason !== undefined) {
    result.hookPermissionDecisionReason = json.reason
  }

  // 处理 hookSpecificOutput
  if (json.hookSpecificOutput) {
    // 验证钩子事件名称与期望值匹配（如果提供了）
    if (
      expectedHookEvent &&
      json.hookSpecificOutput.hookEventName !== expectedHookEvent
    ) {
      throw new Error(
        `Hook returned incorrect event name: expected '${expectedHookEvent}' but got '${json.hookSpecificOutput.hookEventName}'. Full stdout: ${jsonStringify(json, null, 2)}`,
      )
    }

    switch (json.hookSpecificOutput.hookEventName) {
      case 'PreToolUse':
        // 如果提供了更具体的权限决策，则覆盖
        if (json.hookSpecificOutput.permissionDecision) {
          switch (json.hookSpecificOutput.permissionDecision) {
            case 'allow':
              result.permissionBehavior = 'allow'
              break
            case 'deny':
              result.permissionBehavior = 'deny'
              result.blockingError = {
                blockingError:
                  json.hookSpecificOutput.permissionDecisionReason ||
                  json.reason ||
                  '被钩子阻止',
                command,
              }
              break
            case 'ask':
              result.permissionBehavior = 'ask'
              break
          }
        }
        result.hookPermissionDecisionReason =
          json.hookSpecificOutput.permissionDecisionReason
        // 如果提供了 updatedInput，则提取
        if (json.hookSpecificOutput.updatedInput) {
          result.updatedInput = json.hookSpecificOutput.updatedInput
        }
        // 如果提供了 additionalContext，则提取
        result.additionalContext = json.hookSpecificOutput.additionalContext
        break
      case 'UserPromptSubmit':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        break
      case 'SessionStart':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        result.initialUserMessage = json.hookSpecificOutput.initialUserMessage
        if (
          'watchPaths' in json.hookSpecificOutput &&
          json.hookSpecificOutput.watchPaths
        ) {
          result.watchPaths = json.hookSpecificOutput.watchPaths
        }
        break
      case 'Setup':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        break
      case 'SubagentStart':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        break
      case 'PostToolUse':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        // 如果提供了 updatedMCPToolOutput，则提取
        if (json.hookSpecificOutput.updatedMCPToolOutput) {
          result.updatedMCPToolOutput =
            json.hookSpecificOutput.updatedMCPToolOutput
        }
        break
      case 'PostToolUseFailure':
        result.additionalContext = json.hookSpecificOutput.additionalContext
        break
      case 'PermissionDenied':
        result.retry = json.hookSpecificOutput.retry
        break
      case 'PermissionRequest':
        // 提取权限请求决策
        if (json.hookSpecificOutput.decision) {
          result.permissionRequestResult = json.hookSpecificOutput.decision
          // 同时更新 permissionBehavior 以保持一致性
          result.permissionBehavior =
            json.hookSpecificOutput.decision.behavior === 'allow'
              ? 'allow'
              : 'deny'
          if (
            json.hookSpecificOutput.decision.behavior === 'allow' &&
            json.hookSpecificOutput.decision.updatedInput
          ) {
            result.updatedInput = json.hookSpecificOutput.decision.updatedInput
          }
        }
        break
      case 'Elicitation':
        if (json.hookSpecificOutput.action) {
          result.elicitationResponse = {
            action: json.hookSpecificOutput.action,
            content: json.hookSpecificOutput.content as
              | ElicitationResponse['content']
              | undefined,
          }
          if (json.hookSpecificOutput.action === 'decline') {
            result.blockingError = {
              blockingError: json.reason || 'Elicitation 被钩子拒绝',
              command,
            }
          }
        }
        break
      case 'ElicitationResult':
        if (json.hookSpecificOutput.action) {
          result.elicitationResultResponse = {
            action: json.hookSpecificOutput.action,
            content: json.hookSpecificOutput.content as
              | ElicitationResponse['content']
              | undefined,
          }
          if (json.hookSpecificOutput.action === 'decline') {
            result.blockingError = {
              blockingError:
                json.reason || 'Elicitation 结果被钩子阻止',
              command,
            }
          }
        }
        break
    }
  }

  return {
    ...result,
    message: result.blockingError
      ? createAttachmentMessage({
          type: 'hook_blocking_error',
          hookName,
          toolUseID,
          hookEvent,
          blockingError: result.blockingError,
        })
      : createAttachmentMessage({
          type: 'hook_success',
          hookName,
          toolUseID,
          hookEvent,
          // JSON 输出钩子通过 additionalContext 注入上下文——
          // hook_additional_context，而非此字段。空内容抑制了
          // 否则会污染每一轮的琐碎 "X hook success: Success" 系统提醒
          // （messages.ts:3577 在 '' 时跳过）。
          content: '',
          stdout,
          stderr,
          exitCode,
          command,
          durationMs,
        }),
  }
}

/**
 * 使用 bash 或 PowerShell 执行基于命令的钩子。
 *
 * Shell 解析顺序：hook.shell → 'bash'。PowerShell 钩子使用
 * -NoProfile -NonInteractive -Command 参数启动 pwsh，并跳过 bash 特定的预处理
 *（POSIX 路径转换、.sh 自动前置、CLAUDE_CODE_SHELL_PREFIX）。
 * 参见 docs/design/ps-shell-selection.md §5.1。
 */
async function execCommandHook(
  hook: HookCommand & { type: 'command' },
  hookEvent: HookEvent | 'StatusLine' | 'FileSuggestion',
  hookName: string,
  jsonInput: string,
  signal: AbortSignal,
  hookId: string,
  hookIndex?: number,
  pluginRoot?: string,
  pluginId?: string,
  skillRoot?: string,
  forceSyncExecution?: boolean,
  requestPrompt?: (request: PromptRequest) => Promise<PromptResponse>,
): Promise<{
  stdout: string
  stderr: string
  output: string
  status: number
  aborted?: boolean
  backgrounded?: boolean
}> {
  // 限制为每会话一次的事件，以保持 diag_log 量在可控范围内。
  // started/completed 位于 try/finally 内部，因此 setup-path 抛出的异常不会孤立 started 标记——那将无法与挂起区分。
  // 不会孤立 started 标记——那将无法与挂起区分。
  const shouldEmitDiag =
    hookEvent === 'SessionStart' ||
    hookEvent === 'Setup' ||
    hookEvent === 'SessionEnd'
  const diagStartMs = Date.now()
  let diagExitCode: number | undefined
  let diagAborted = false

  const isWindows = getPlatform() === 'windows'

  // --
  // 每个钩子的 shell 选择（docs/design/ps-shell-selection.md 的阶段 1）。
  // 解析顺序：hook.shell → DEFAULT_HOOK_SHELL。defaultShell 回退（settings.defaultShell）是阶段 2——尚未接入。
  // 回退（settings.defaultShell）是阶段 2——尚未接入。
  //
  // bash 路径是历史默认值，保持不变。PowerShell 路径故意跳过 Windows 特定的 bash 适配（cygpath 转换、.sh 自动前置、POSIX 引用的 SHELL_PREFIX）。
  const shellType = hook.shell ?? DEFAULT_HOOK_SHELL

  const isPowerShell = shellType === 'powershell'

  // --
  // Windows bash 路径：钩子通过 Git Bash（Cygwin）运行，而非 cmd.exe。
  //
  // 这意味着我们放入环境变量或替换到命令字符串中的每个路径
  // 都必须是 POSIX 路径（/c/Users/foo），而不是 Windows 路径
  //（C:\Users\foo 或 C:/Users/foo）。Git Bash 无法解析 Windows 路径。
  //
  // windowsPathToPosixPath() 是纯 JS 正则表达式转换（无需 cygpath shell 外部调用）：
  // C:\Users\foo -> /c/Users/foo，保留 UNC，翻转斜杠。已记忆化
  //（LRU-500），因此重复调用成本低廉。
  //
  // PowerShell 路径：使用原生路径——完全跳过转换。
  // PowerShell 在 Windows 上期望 Windows 路径（在 Unix 上期望原生路径，
  // pwsh 也可用）。
  const toHookPath =
    isWindows && !isPowerShell
      ? (p: string) => windowsPathToPosixPath(p)
      : (p: string) => p

  // 将 CLAUDE_PROJECT_DIR 设置为稳定的项目根目录（而非工作树路径）。
  // getProjectRoot() 在进入工作树时从不更新，因此引用
  // $CLAUDE_PROJECT_DIR 的钩子始终相对于真实仓库根目录解析。
  const projectDir = getProjectRoot()

  // 在命令字符串中替换 ${CLAUDE_PLUGIN_ROOT} 和 ${user_config.X}。
  // 顺序与 MCP/LSP 匹配（插件变量优先，然后用户配置），因此用户
  // 输入的包含字面文本 ${CLAUDE_PLUGIN_ROOT} 的值被视为
  // 不透明——不会重新解释为模板。
  let command = hook.command
  let pluginOpts: ReturnType<typeof loadPluginOptions> | undefined
  if (pluginRoot) {
    // 插件目录已消失（孤儿 GC 竞争，并发会话删除了它）：
    // 抛出异常以便调用者产生非阻塞错误。运行将会失败——
    // 并且 python3 <missing>.py 退出码 2（钩子协议阻塞代码），这会
    // 阻塞 UserPromptSubmit/Stop 直到重启。预检查是必要的，
    // 因为缺失脚本的退出码 2 与生成后的
    // 有意阻塞无法区分。
    if (!(await pathExists(pluginRoot))) {
      throw new Error(
        `插件目录不存在：${pluginRoot}` +
          (pluginId ? `（${pluginId} — 运行 /plugin 重新安装）` : ''),
      )
    }
    // 内联 ROOT 和 DATA 替换，而不是调用
    // substitutePluginVariables()。该辅助函数无条件地将反斜杠规范化为 Windows 上的 /
    // — 对于 bash 是正确的（toHookPath 已生成 /c/...
    // 因此这是空操作）但对于 PS 是错误的，其中 toHookPath 是恒等函数，我们
    // 希望保留原生的 C:\... 反斜杠。内联还允许我们使用函数
    // 形式的 .replace()，以便包含 $ 的路径不会被 $-pattern 损坏
    const rootPath = toHookPath(pluginRoot)
    command = command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, () => rootPath)
    if (pluginId) {
      const dataPath = toHookPath(getPluginDataDir(pluginId))
      command = command.replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, () => dataPath)
    }
    if (pluginId) {
      pluginOpts = loadPluginOptions(pluginId)
      // 如果引用的键缺失则抛出异常——这意味着钩子使用了
      // 未在 manifest.userConfig 中声明或尚未配置的键。
      // 像任何其他钩子执行失败一样在上游捕获。
      command = substituteUserConfigVariables(command, pluginOpts)
    }
  }

  // 在 Windows 上（仅 bash），自动为 .sh 脚本添加 bash 前缀，以便它们
  // 执行而不是在默认文件处理程序中打开。PowerShell
  // 原生运行 .ps1 文件——无需添加前缀。
  if (isWindows && !isPowerShell && command.trim().match(/\.sh(\s|$|")/)) {
    if (!command.trim().startsWith('bash ')) {
      command = `bash ${command}`
    }
  }

  // CLAUDE_CODE_SHELL_PREFIX 通过 POSIX 引用来包装命令
  //（formatShellPrefixCommand 使用 shell-quote）。这对 PowerShell 没有
  // 意义——请参阅设计。目前 PS 钩子忽略此前缀；
  // CLAUDE_CODE_PS_SHELL_PREFIX（或 shell 感知前缀）是后续工作。
  const finalCommand =
    !isPowerShell && process.env.CLAUDE_CODE_SHELL_PREFIX
      ? formatShellPrefixCommand(process.env.CLAUDE_CODE_SHELL_PREFIX, command)
      : command

  const hookTimeoutMs = hook.timeout
    ? hook.timeout * 1000
    : TOOL_HOOK_EXECUTION_TIMEOUT_MS

  // 构建环境变量——所有路径都经过 toHookPath 进行 Windows POSIX 转换
  const envVars: NodeJS.ProcessEnv = {
    ...subprocessEnv(),
    CLAUDE_PROJECT_DIR: toHookPath(projectDir),
  }

  // 插件和技能钩子都设置 CLAUDE_PLUGIN_ROOT（技能使用相同的
  // 名称以保持一致性——技能可以迁移到插件而无需更改代码）
  if (pluginRoot) {
    envVars.CLAUDE_PLUGIN_ROOT = toHookPath(pluginRoot)
    if (pluginId) {
      envVars.CLAUDE_PLUGIN_DATA = toHookPath(getPluginDataDir(pluginId))
    }
  }
  // 也将插件选项作为环境变量暴露，以便钩子无需在命令字符串中使用
  // ${user_config.X} 即可读取它们。包含敏感值——钩子
  // 运行用户自己的代码，与直接读取密钥链具有相同的信任边界。
  if (pluginOpts) {
    for (const [key, value] of Object.entries(pluginOpts)) {
      // 清理非标识符字符（bash 无法引用 $FOO-BAR）。schemas.ts:611 的 schema
      // 现在将键限制为 /^[A-Za-z_]\w*$/，因此这是
      // 双重保险，但如果有人绕过 schema，则是廉价的保险。
      const envKey = key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
      envVars[`CLAUDE_PLUGIN_OPTION_${envKey}`] = String(value)
    }
  }
  if (skillRoot) {
    envVars.CLAUDE_PLUGIN_ROOT = toHookPath(skillRoot)
  }

  // CLAUDE_ENV_FILE 指向一个 .sh 文件，钩子将环境变量定义写入其中；
  // getSessionEnvironmentScript() 将它们连接起来，
  // bashProvider 将内容注入到 bash 命令中。PS 钩子自然会
  // 写入 PS 语法（$env:FOO = 'bar'），bash 无法解析。
  // 为 PS 跳过——与上面已仅限 bash 的 .sh 前置和 SHELL_PREFIX 一致。
  if (
    !isPowerShell &&
    (hookEvent === 'SessionStart' ||
      hookEvent === 'Setup' ||
      hookEvent === 'CwdChanged' ||
      hookEvent === 'FileChanged') &&
    hookIndex !== undefined
  ) {
    envVars.CLAUDE_ENV_FILE = await getHookEnvFilePath(hookEvent, hookIndex)
  }

  // 当 agent worktree 被移除时，getCwd() 可能通过 AsyncLocalStorage 返回已删除路径
  // 在 spawn 前验证，因为 spawn() 对缺失的 cwd 发出异步错误事件而非同步抛出
  // 
  const hookCwd = getCwd()
  const safeCwd = (await pathExists(hookCwd)) ? hookCwd : getOriginalCwd()
  if (safeCwd !== hookCwd) {
    logForDebugging(
      `Hooks: cwd ${hookCwd} not found, falling back to original cwd`,
      { level: 'warn' },
    )
  }

  // --
  // Spawn。两条完全独立的路径：
  //
  //   Bash: spawn(cmd, [], { shell: <gitBashPath | true> })——shell 选项让 Node 将整个字符串传给 shell 解析。
  // 
  //
  //   PowerShell: spawn(pwshPath, ['-NoProfile', '-NonInteractive',
  //   '-Command', cmd])——显式 argv，无 shell 选项。-NoProfile 跳过用户配置文件脚本（更快、更确定）。
  // 
  //   -NonInteractive 快速失败而非弹窗提示。
  //
  // findGitBashPath() 中的 Git Bash 硬退出检查对 bash 钩子仍然生效。
  // PowerShell 钩子不会调用它，因此一个只有 pwsh 且将所有钩子设为 shell:'powershell' 的 Windows 用户
  // 理论上可以完全不依赖 Git Bash 运行——但 init.ts 在启动时仍会调用 setShellIfWindows()，
  // 它会在找到 Git Bash 前直接退出。放宽这一点是此设计实现顺序的第 1 阶段（独立 PR）。
  // 
  // 
  let child: ChildProcessWithoutNullStreams
  if (shellType === 'powershell') {
    const pwshPath = await getCachedPowerShellPath()
    if (!pwshPath) {
      throw new Error(
        `Hook "${hook.command}" has shell: 'powershell' but no PowerShell ` +
          `executable (pwsh or powershell) was found on PATH. Install ` +
          `PowerShell, or remove "shell": "powershell" to use bash.`,
      )
    }
    child = spawn(pwshPath, buildPowerShellArgs(finalCommand), {
      env: envVars,
      cwd: safeCwd,
      // 在 Windows 上阻止显示控制台窗口（其他平台无操作）
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams
  } else {
    // 在 Windows 上，显式使用 Git Bash（cmd.exe 无法运行 bash 语法）。
    // 在其他平台上，shell: true 使用 /bin/sh。
    const shell = isWindows ? findGitBashPath() : true
    child = spawn(finalCommand, [], {
      env: envVars,
      cwd: safeCwd,
      shell,
      // 在 Windows 上阻止显示控制台窗口（其他平台无操作）
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams
  }

  // 钩子使用管道模式——stdout 必须流式传输到 JS 中，以便我们解析
  // 第一行响应来检测异步钩子（{"async": true}）。
  const hookTaskOutput = new TaskOutput(`hook_${child.pid}`, null)
  const shellCommand = wrapSpawn(child, signal, hookTimeoutMs, hookTaskOutput)
  // 跟踪 shellCommand 所有权是否已转移（例如，转移到异步钩子注册表）
  let shellCommandTransferred = false
  // 跟踪 stdin 是否已写入（以避免 "write after end" 错误）
  let stdinWritten = false

  if ((hook.async || hook.asyncRewake) && !forceSyncExecution) {
    const processId = `async_hook_${child.pid}`
    logForDebugging(
      `Hooks: Config-based async hook, backgrounding process ${processId}`,
    )

    // 在后台化之前写入 stdin，以便钩子接收其输入。
    // 尾随换行符与同步路径（L1000）保持一致。缺少它时，
    // bash `read -r line` 返回退出码 1（EOF 在分隔符之前）——
    // 但 `if read -r line; then ...` 会跳过该分支。见 gh-30509 / CC-161。
    // 
    child.stdin.write(jsonInput + '\n', 'utf8')
    child.stdin.end()
    stdinWritten = true

    const backgrounded = executeInBackground({
      processId,
      hookId,
      shellCommand,
      asyncResponse: { async: true, asyncTimeout: hookTimeoutMs },
      hookEvent,
      hookName,
      command: hook.command,
      asyncRewake: hook.asyncRewake,
      pluginId,
    })
    if (backgrounded) {
      return {
        stdout: '',
        stderr: '',
        output: '',
        status: 0,
        backgrounded: true,
      }
    }
  }

  let stdout = ''
  let stderr = ''
  let output = ''

  // 设置输出数据收集，使用显式 UTF-8 编码
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let initialResponseChecked = false

  let asyncResolve:
    | ((result: {
        stdout: string
        stderr: string
        output: string
        status: number
      }) => void)
    | null = null
  const childIsAsyncPromise = new Promise<{
    stdout: string
    stderr: string
    output: string
    status: number
    aborted?: boolean
  }>(resolve => {
    asyncResolve = resolve
  })

  // 跟踪已处理的修剪后的 prompt-request 行，以便通过内容匹配将其从最终 stdout 中去除
  // （无索引跟踪 → 无索引漂移）
  const processedPromptLines = new Set<string>()
  // 串行化异步 prompt 处理，确保响应按顺序发送
  let promptChain = Promise.resolve()
  // 行缓冲区，用于在流式输出中检测 prompt 请求
  let lineBuffer = ''

  child.stdout.on('data', data => {
    stdout += data
    output += data

    // 当提供了 requestPrompt 时，逐行解析 stdout 以发现 prompt 请求
    if (requestPrompt) {
      lineBuffer += data
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? '' // 最后一个元素是不完整的行

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const parsed = jsonParse(trimmed)
          const validation = promptRequestSchema().safeParse(parsed)
          if (validation.success) {
            processedPromptLines.add(trimmed)
            logForDebugging(
              `Hooks: Detected prompt request from hook: ${trimmed}`,
            )
            // 链式异步处理以串行化 prompt 响应
            const promptReq = validation.data
            const reqPrompt = requestPrompt
            promptChain = promptChain.then(async () => {
              try {
                const response = await reqPrompt(promptReq)
                child.stdin.write(jsonStringify(response) + '\n', 'utf8')
              } catch (err) {
                logForDebugging(`钩子: Prompt 请求处理失败: ${err}`)
                // 用户取消或提示失败——关闭 stdin 以便钩子
                // 
                child.stdin.destroy()
              }
            })
            continue
          }
        } catch {
          // 不是 JSON，只是普通行
        }
      }
    }

    // 检查输出第一行是否为异步响应。异步协议是：
    // 钩子在第一行发出 {"async":true,...}，然后是正常输出。
    // 我们必须仅解析第一行——如果进程很快并写入更多内容
    // 解析全部累积的 stdout 会失败，异步钩子将在其完整持续时间内阻塞而非后台化。
    // 
    if (!initialResponseChecked) {
      const firstLine = firstLineOf(stdout).trim()
      if (!firstLine.includes('}')) return
      initialResponseChecked = true
      logForDebugging(`钩子: 检查第一行是否为异步: ${firstLine}`)
      try {
        const parsed = jsonParse(firstLine)
        logForDebugging(
          `Hooks: Parsed initial response: ${jsonStringify(parsed)}`,
        )
        if (isAsyncHookJSONOutput(parsed) && !forceSyncExecution) {
          const processId = `async_hook_${child.pid}`
          logForDebugging(
            `钩子: 检测到异步钩子，后台化进程 ${processId}`,
          )

          const backgrounded = executeInBackground({
            processId,
            hookId,
            shellCommand,
            asyncResponse: parsed,
            hookEvent,
            hookName,
            command: hook.command,
            pluginId,
          })
          if (backgrounded) {
            shellCommandTransferred = true
            asyncResolve?.({
              stdout,
              stderr,
              output,
              status: 0,
            })
          }
        } else if (isAsyncHookJSONOutput(parsed) && forceSyncExecution) {
          logForDebugging(
            `Hooks: Detected async hook but forceSyncExecution is true, waiting for completion`,
          )
        } else {
          logForDebugging(
            `Hooks: Initial response is not async, continuing normal processing`,
          )
        }
      } catch (e) {
        logForDebugging(`钩子: 解析初始响应为 JSON 失败: ${e}`)
      }
    }
  })

  child.stderr.on('data', data => {
    stderr += data
    output += data
  })

  const stopProgressInterval = startHookProgressInterval({
    hookId,
    hookName,
    hookEvent,
    getOutput: async () => ({ stdout, stderr, output }),
  })

  // 等待 stdout 和 stderr 流结束，然后再认为输出完成
  // 这防止了竞争条件——'close' 在所有 'data' 事件处理完毕前触发
  const stdoutEndPromise = new Promise<void>(resolve => {
    child.stdout.on('end', () => resolve())
  })

  const stderrEndPromise = new Promise<void>(resolve => {
    child.stderr.on('end', () => resolve())
  })

  // 写入 stdin，确保处理 EPIPE 错误，这可能在钩子命令在读取完所有输入前退出时发生。
  // 
  // 注意: EPIPE 处理在测试中很难设置，因为 Bun 和 Node 的行为不同。
  // 
  // TODO: 为 EPIPE 处理添加测试。
  // 如果 stdin 已写入则跳过（例如，由基于配置的异步钩子路径写入）
  const stdinWritePromise = stdinWritten
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        child.stdin.on('error', err => {
          // 当提供了 requestPrompt 时，stdin 保持打开以接收提示响应。
          // 来自后续写入（进程退出后）的 EPIPE 错误是预期的——抑制它们。
          if (!requestPrompt) {
            reject(err)
          } else {
            logForDebugging(
              `Hooks: stdin error during prompt flow (likely process exited): ${err}`,
            )
          }
        })
        // 显式指定 UTF-8 编码以确保正确处理 Unicode 字符
        child.stdin.write(jsonInput + '\n', 'utf8')
        // 当提供了 requestPrompt 时，保持 stdin 打开以接收 prompt 响应
        if (!requestPrompt) {
          child.stdin.end()
        }
        resolve()
      })

  // 为子进程错误创建 promise
  const childErrorPromise = new Promise<never>((_, reject) => {
    child.on('error', reject)
  })

  // 为子进程关闭创建 promise——但仅在流结束后才 resolve
  // 以确保已收集所有输出
  const childClosePromise = new Promise<{
    stdout: string
    stderr: string
    output: string
    status: number
    aborted?: boolean
  }>(resolve => {
    let exitCode: number | null = null

    child.on('close', code => {
      exitCode = code ?? 1

      // 等待两个流都结束，然后用最终输出来 resolve
      void Promise.all([stdoutEndPromise, stderrEndPromise]).then(() => {
        // 去除已作为 prompt 请求处理的行，以使 parseHookOutput 仅看到最终的钩子结果。
        // 通过对实际处理过的行进行内容匹配（content-matching），prompt JSON 永远不会泄漏出去
        // （fail-closed），无论行位置如何。
        // 
        const finalStdout =
          processedPromptLines.size === 0
            ? stdout
            : stdout
                .split('\n')
                .filter(line => !processedPromptLines.has(line.trim()))
                .join('\n')

        resolve({
          stdout: finalStdout,
          stderr,
          output,
          status: exitCode!,
          aborted: signal.aborted,
        })
      })
    })
  })

  // stdin 写入、异步检测和进程完成之间的竞态
  try {
    if (shouldEmitDiag) {
      logForDiagnosticsNoPII('info', 'hook_spawn_started', {
        hook_event_name: hookEvent,
        index: hookIndex,
      })
    }
    await Promise.race([stdinWritePromise, childErrorPromise])

    // 等待所有待处理的 prompt 响应再 resolve
    const result = await Promise.race([
      childIsAsyncPromise,
      childClosePromise,
      childErrorPromise,
    ])
    // 确保所有排队的 prompt 响应已发送
    await promptChain
    diagExitCode = result.status
    diagAborted = result.aborted ?? false
    return result
  } catch (error) {
    // 处理来自 stdin 写入或子进程的错误
    const code = getErrnoCode(error)
    diagExitCode = 1

    if (code === 'EPIPE') {
      logForDebugging(
        '向钩子 stdin 写入时发生 EPIPE 错误（钩子命令可能提前关闭）',
      )
      const errMsg =
        '钩子命令在钩子输入完全写入前关闭了 stdin (EPIPE)'
      return {
        stdout: '',
        stderr: errMsg,
        output: errMsg,
        status: 1,
      }
    } else if (code === 'ABORT_ERR') {
      diagAborted = true
      return {
        stdout: '',
        stderr: '钩子已取消',
        output: '钩子已取消',
        status: 1,
        aborted: true,
      }
    } else {
      const errorMsg = errorMessage(error)
      const errOutput = `Error occurred while executing hook command: ${errorMsg}`
      return {
        stdout: '',
        stderr: errOutput,
        output: errOutput,
        status: 1,
      }
    }
  } finally {
    if (shouldEmitDiag) {
      logForDiagnosticsNoPII('info', 'hook_spawn_completed', {
        hook_event_name: hookEvent,
        index: hookIndex,
        duration_ms: Date.now() - diagStartMs,
        exit_code: diagExitCode,
        aborted: diagAborted,
      })
    }
    stopProgressInterval()
    // 清理流资源，除非所有权已转移（例如，转给异步钩子注册表）
    if (!shellCommandTransferred) {
      shellCommand.cleanup()
    }
  }
}

/**
 * 检查匹配查询是否匹配钩子匹配器模式
 * @param matchQuery 要匹配的查询（例如 'Write', 'Edit', 'Bash'）
 * @param matcher 匹配器模式——可以是:
 *   - 简单字符串进行精确匹配（例如 'Write'）
 *   - 管道分隔列表用于多个精确匹配（例如 'Write|Edit'）
 *   - 正则表达式模式（例如 '^Write.*', '.*', '^(Write|Edit)$'）
 * @returns 如果查询匹配模式则返回 true
 */
function matchesPattern(matchQuery: string, matcher: string): boolean {
  if (!matcher || matcher === '*') {
    return true
  }
  // 检查是否为简单字符串或管道分隔列表（除 | 外无正则特殊字符）
  if (/^[a-zA-Z0-9_|]+$/.test(matcher)) {
    // 处理管道分隔的精确匹配
    if (matcher.includes('|')) {
      const patterns = matcher
        .split('|')
        .map(p => normalizeLegacyToolName(p.trim()))
      return patterns.includes(matchQuery)
    }
    // 简单精确匹配
    return matchQuery === normalizeLegacyToolName(matcher)
  }

  // 否则视为正则表达式
  try {
    const regex = new RegExp(matcher)
    if (regex.test(matchQuery)) {
      return true
    }
    // 也测试旧版名称，以便像 "^Task$" 这样的模式仍然匹配
    for (const legacyName of getLegacyToolNames(matchQuery)) {
      if (regex.test(legacyName)) {
        return true
      }
    }
    return false
  } catch {
    // 如果正则表达式无效，记录错误并返回 false
    logForDebugging(`Invalid regex pattern in hook matcher: ${matcher}`)
    return false
  }
}

type IfConditionMatcher = (ifCondition: string) => boolean

/**
 * 为钩子的 `if` 条件准备匹配器。繁重工作（工具查找、Zod 验证、Bash 的 tree-sitter 解析）
 * 在此处只执行一次；返回的闭包为每个钩子调用。非工具事件返回 undefined。
 * 
 */
async function prepareIfConditionMatcher(
  hookInput: HookInput,
  tools: Tools | undefined,
): Promise<IfConditionMatcher | undefined> {
  if (
    hookInput.hook_event_name !== 'PreToolUse' &&
    hookInput.hook_event_name !== 'PostToolUse' &&
    hookInput.hook_event_name !== 'PostToolUseFailure' &&
    hookInput.hook_event_name !== 'PermissionRequest'
  ) {
    return undefined
  }

  const toolName = normalizeLegacyToolName(hookInput.tool_name)
  const tool = tools && findToolByName(tools, hookInput.tool_name)
  const input = tool?.inputSchema.safeParse(hookInput.tool_input)
  const patternMatcher =
    input?.success && tool?.preparePermissionMatcher
      ? await tool.preparePermissionMatcher(input.data)
      : undefined

  return ifCondition => {
    const parsed = permissionRuleValueFromString(ifCondition)
    if (normalizeLegacyToolName(parsed.toolName) !== toolName) {
      return false
    }
    if (!parsed.ruleContent) {
      return true
    }
    return patternMatcher ? patternMatcher(parsed.ruleContent) : false
  }
}

type FunctionHookMatcher = {
  matcher: string
  hooks: FunctionHook[]
}

/**
 * A hook paired with optional plugin context.
 * Used when returning matched hooks so we can apply plugin env vars at execution time.
 */
type MatchedHook = {
  hook: HookCommand | HookCallback | FunctionHook
  pluginRoot?: string
  pluginId?: string
  skillRoot?: string
  hookSource?: string
}

function isInternalHook(matched: MatchedHook): boolean {
  return matched.hook.type === 'callback' && matched.hook.internal === true
}

/**
 * 为匹配的钩子构建去重键，按源上下文命名空间。
 *
 * 设置文件钩子（无 pluginRoot/skillRoot）共享 '' 前缀，使得在 user/project/local 中定义的相同命令
 * 仍然折叠为一个——这是去重的原始意图。插件/技能钩子以它们的根作为前缀，
 * 因此共享未展开的模板（如 `${CLAUDE_PLUGIN_ROOT}/hook.sh`）的两个插件不会折叠：
 * 展开后它们指向不同的文件。
 * 
 */
function hookDedupKey(m: MatchedHook, payload: string): string {
  return `${m.pluginRoot ?? m.skillRoot ?? ''}\0${payload}`
}

/**
 * 从匹配的钩子构建 {sanitizedPluginName: hookCount} 映射。
 * 仅为官方市场插件记录实际名称；其他插件显示为 'third-party'。
 */
function getPluginHookCounts(
  hooks: MatchedHook[],
): Record<string, number> | undefined {
  const pluginHooks = hooks.filter(h => h.pluginId)
  if (pluginHooks.length === 0) {
    return undefined
  }
  const counts: Record<string, number> = {}
  for (const h of pluginHooks) {
    const atIndex = h.pluginId!.lastIndexOf('@')
    const isOfficial =
      atIndex > 0 &&
      ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(h.pluginId!.slice(atIndex + 1))
    const key = isOfficial ? h.pluginId! : 'third-party'
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}


/**
 * 从匹配的钩子构建 {hookType: count} 映射。
 */
function getHookTypeCounts(hooks: MatchedHook[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const h of hooks) {
    counts[h.hook.type] = (counts[h.hook.type] || 0) + 1
  }
  return counts
}

function getHooksConfig(
  appState: AppState | undefined,
  sessionId: string,
  hookEvent: HookEvent,
): Array<
  | HookMatcher
  | HookCallbackMatcher
  | FunctionHookMatcher
  | PluginHookMatcher
  | SkillHookMatcher
  | SessionDerivedHookMatcher
> {
  // HookMatcher 是 zod 剥离后的 {matcher, hooks}，因此快照匹配器可以直接推送而无需重新包装。
  // 
  const hooks: Array<
    | HookMatcher
    | HookCallbackMatcher
    | FunctionHookMatcher
    | PluginHookMatcher
    | SkillHookMatcher
    | SessionDerivedHookMatcher
  > = [...(getHooksConfigFromSnapshot()?.[hookEvent] ?? [])]

  // 检查是否仅应运行 managed 钩子（用于已注册钩子和会话钩子）
  const managedOnly = shouldAllowManagedHooksOnly()

  // 处理已注册钩子（SDK 回调和插件原生钩子）
  const registeredHooks = getRegisteredHooks()?.[hookEvent]
  if (registeredHooks) {
    for (const matcher of registeredHooks) {
      // 当限制为仅 managed 钩子时跳过插件钩子
      // 插件钩子设置了 pluginRoot，SDK 回调没有
      if (managedOnly && 'pluginRoot' in matcher) {
        continue
      }
      hooks.push(matcher)
    }
  }

  // 仅合并当前会话的会话钩子
  // 函数钩子（如结构化输出强制）必须限定在其会话范围内
  // 以防止来自一个 agent 的钩子泄漏到另一个 agent（例如，验证 agent 泄漏到主 agent）
  // 当设置了 allowManagedHooksOnly 时完全跳过会话钩子——
  // 这防止来自 agents/skills 的 frontmatter 钩子绕过策略。
  // strictPluginOnlyCustomization 此处不阻塞——它在以下位置进行门控
  // （runAgent.ts:526 用于 agent frontmatter 钩子）进行门控，
  // 那里可以知道 agentDefinition.source。在此处进行全局阻塞也会杀死
  // 插件提供的 agent 的 frontmatter 钩子，范围太广了。
  // 如果未提供 appState 也跳过（为了向后兼容）
  if (!managedOnly && appState !== undefined) {
    const sessionHooks = getSessionHooks(appState, sessionId, hookEvent).get(
      hookEvent,
    )
    if (sessionHooks) {
      // SessionDerivedHookMatcher 已包含可选的 skillRoot
      for (const matcher of sessionHooks) {
        hooks.push(matcher)
      }
    }

    // 单独合并会话函数钩子（无法持久化为 HookMatcher 格式）
    const sessionFunctionHooks = getSessionFunctionHooks(
      appState,
      sessionId,
      hookEvent,
    ).get(hookEvent)
    if (sessionFunctionHooks) {
      for (const matcher of sessionFunctionHooks) {
        hooks.push(matcher)
      }
    }
  }

  return hooks
}

/**
 * 对给定事件的钩子进行轻量级存在性检查。镜像 getHooksConfig() 装配的源，
 * 但在第一次命中时停止，无需构建完整的合并配置。
 * 
 *
 * 故意过度近似：如果事件存在任何匹配器则返回 true，
 * 即使 managed-only 过滤或模式匹配后续会丢弃它。
 * 误报只是意味着我们进入完整匹配路径；漏报会跳过钩子，因此我们倾向于返回 true。
 * 
 *
 * 用于在钩子通常未配置的热路径上跳过 createBaseHookInput（getTranscriptPathForSession 路径拼接）
 * 和 getMatchingHooks。参见 hasInstructionsLoadedHook / hasWorktreeCreateHook 的相同模式。
 * 
 */
function hasHookForEvent(
  hookEvent: HookEvent,
  appState: AppState | undefined,
  sessionId: string,
): boolean {
  const snap = getHooksConfigFromSnapshot()?.[hookEvent]
  if (snap && snap.length > 0) return true
  const reg = getRegisteredHooks()?.[hookEvent]
  if (reg && reg.length > 0) return true
  if (appState?.sessionHooks.get(sessionId)?.hooks[hookEvent]) return true
  return false
}

/**
 * 获取与给定查询匹配的钩子命令
 * @param appState 当前应用状态（为向后兼容而可选）
 * @param sessionId 当前会话 ID（主会话或 agent ID）
 * @param hookEvent 钩子事件
 * @param hookInput 用于匹配的钩子输入
 * @returns 匹配的钩子数组，包含可选的插件上下文
 */
export async function getMatchingHooks(
  appState: AppState | undefined,
  sessionId: string,
  hookEvent: HookEvent,
  hookInput: HookInput,
  tools?: Tools,
): Promise<MatchedHook[]> {
  try {
    const hookMatchers = getHooksConfig(appState, sessionId, hookEvent)

    // 如果你更改以下条件，则必须同时更改
    // src/utils/hooks/hooksConfigManager.ts。
    let matchQuery: string | undefined = undefined
    switch (hookInput.hook_event_name) {
      case 'PreToolUse':
      case 'PostToolUse':
      case 'PostToolUseFailure':
      case 'PermissionRequest':
      case 'PermissionDenied':
        matchQuery = hookInput.tool_name
        break
      case 'SessionStart':
        matchQuery = hookInput.source
        break
      case 'Setup':
        matchQuery = hookInput.trigger
        break
      case 'PreCompact':
      case 'PostCompact':
        matchQuery = hookInput.trigger
        break
      case 'Notification':
        matchQuery = hookInput.notification_type
        break
      case 'SessionEnd':
        matchQuery = hookInput.reason
        break
      case 'StopFailure':
        matchQuery = hookInput.error
        break
      case 'SubagentStart':
        matchQuery = hookInput.agent_type
        break
      case 'SubagentStop':
        matchQuery = hookInput.agent_type
        break
      case 'TeammateIdle':
      case 'TaskCreated':
      case 'TaskCompleted':
        break
      case 'Elicitation':
        matchQuery = hookInput.mcp_server_name
        break
      case 'ElicitationResult':
        matchQuery = hookInput.mcp_server_name
        break
      case 'ConfigChange':
        matchQuery = hookInput.source
        break
      case 'InstructionsLoaded':
        matchQuery = hookInput.load_reason
        break
      case 'FileChanged':
        matchQuery = basename(hookInput.file_path)
        break
      default:
        break
    }

    logForDebugging(
      `Getting matching hook commands for ${hookEvent} with query: ${matchQuery}`,
      { level: 'verbose' },
    )
    logForDebugging(`Found ${hookMatchers.length} hook matchers in settings`, {
      level: 'verbose',
    })

    // 提取钩子及其插件上下文（如有）
    const filteredMatchers = matchQuery
      ? hookMatchers.filter(
          matcher =>
            !matcher.matcher || matchesPattern(matchQuery, matcher.matcher),
        )
      : hookMatchers

    const matchedHooks: MatchedHook[] = filteredMatchers.flatMap(matcher => {
      // 检查这是 PluginHookMatcher（有 pluginRoot）还是 SkillHookMatcher（有 skillRoot）
      const pluginRoot =
        'pluginRoot' in matcher ? matcher.pluginRoot : undefined
      const pluginId = 'pluginId' in matcher ? matcher.pluginId : undefined
      const skillRoot = 'skillRoot' in matcher ? matcher.skillRoot : undefined
      const hookSource = pluginRoot
        ? 'pluginName' in matcher
          ? `plugin:${matcher.pluginName}`
          : 'plugin'
        : skillRoot
          ? 'skillName' in matcher
            ? `skill:${matcher.skillName}`
            : 'skill'
          : 'settings'
      return matcher.hooks.map(hook => ({
        hook,
        pluginRoot,
        pluginId,
        skillRoot,
        hookSource,
      }))
    })

    // 在同一源上下文中按 command/prompt/url 对钩子去重。
    // 键按 pluginRoot/skillRoot 命名空间（见上文的 hookDedupKey），因此跨插件模板冲突不会丢弃钩子（gh-29724）。
    // 
    //
    // 注意: new Map(entries) 在键冲突时保留最后一个条目，而非第一个。
    // 对于设置钩子，这意味着最后合并的作用域获胜；对于同插件重复项，pluginRoot 是相同的所以无关紧要。
    // 
    // 快速路径: callback/function 钩子无需去重（每个都是唯一的）。
    // 当所有钩子都是时跳过下面的 6 遍过滤器 + 4×Map + 4×Array.from
    // callback/function——内部钩子的常见情况，如
    // （微基准测试中快 44 倍）。
    if (
      matchedHooks.every(
        m => m.hook.type === 'callback' || m.hook.type === 'function',
      )
    ) {
      return matchedHooks
    }

    // 辅助函数：从钩子中提取 `if` 条件用于去重键。
    // 具有不同 `if` 条件的钩子即使其他部分相同也是不同的。
    const getIfCondition = (hook: { if?: string }): string => hook.if ?? ''

    const uniqueCommandHooks = Array.from(
      new Map(
        matchedHooks
          .filter(
            (
              m,
            ): m is MatchedHook & { hook: HookCommand & { type: 'command' } } =>
              m.hook.type === 'command',
          )
          // shell 是标识的一部分：{command:'echo x', shell:'bash'} 和 {command:'echo x', shell:'powershell'}
          // 是不同的钩子，不是重复项。默认为 'bash'，这样旧配置（无 shell 字段）仍能与显式 shell:'bash' 去重。
          // 
          // 
          .map(m => [
            hookDedupKey(
              m,
              `${m.hook.shell ?? DEFAULT_HOOK_SHELL}\0${m.hook.command}\0${getIfCondition(m.hook)}`,
            ),
            m,
          ]),
      ).values(),
    )
    const uniquePromptHooks = Array.from(
      new Map(
        matchedHooks
          .filter(m => m.hook.type === 'prompt')
          .map(m => [
            hookDedupKey(
              m,
              `${(m.hook as { prompt: string }).prompt}\0${getIfCondition(m.hook as { if?: string })}`,
            ),
            m,
          ]),
      ).values(),
    )
    const uniqueAgentHooks = Array.from(
      new Map(
        matchedHooks
          .filter(m => m.hook.type === 'agent')
          .map(m => [
            hookDedupKey(
              m,
              `${(m.hook as { prompt: string }).prompt}\0${getIfCondition(m.hook as { if?: string })}`,
            ),
            m,
          ]),
      ).values(),
    )
    const uniqueHttpHooks = Array.from(
      new Map(
        matchedHooks
          .filter(m => m.hook.type === 'http')
          .map(m => [
            hookDedupKey(
              m,
              `${(m.hook as { url: string }).url}\0${getIfCondition(m.hook as { if?: string })}`,
            ),
            m,
          ]),
      ).values(),
    )
    const callbackHooks = matchedHooks.filter(m => m.hook.type === 'callback')
    // 函数钩子无需去重——每个回调都是唯一的
    const functionHooks = matchedHooks.filter(m => m.hook.type === 'function')
    const uniqueHooks = [
      ...uniqueCommandHooks,
      ...uniquePromptHooks,
      ...uniqueAgentHooks,
      ...uniqueHttpHooks,
      ...callbackHooks,
      ...functionHooks,
    ]

    // 基于 `if` 条件过滤钩子。这允许钩子指定条件
    // 如 "Bash(git *)"，以便仅为 git 命令运行，避免为非匹配命令产生进程启动开销。
    // 
    const hasIfCondition = uniqueHooks.some(
      h =>
        (h.hook.type === 'command' ||
          h.hook.type === 'prompt' ||
          h.hook.type === 'agent' ||
          h.hook.type === 'http') &&
        (h.hook as { if?: string }).if,
    )
    const ifMatcher = hasIfCondition
      ? await prepareIfConditionMatcher(hookInput, tools)
      : undefined
    const ifFilteredHooks = uniqueHooks.filter(h => {
      if (
        h.hook.type !== 'command' &&
        h.hook.type !== 'prompt' &&
        h.hook.type !== 'agent' &&
        h.hook.type !== 'http'
      ) {
        return true
      }
      const ifCondition = (h.hook as { if?: string }).if
      if (!ifCondition) {
        return true
      }
      if (!ifMatcher) {
        logForDebugging(
          `Hook if condition "${ifCondition}" cannot be evaluated for non-tool event ${hookInput.hook_event_name}`,
        )
        return false
      }
      if (ifMatcher(ifCondition)) {
        return true
      }
      logForDebugging(
        `Skipping hook due to if condition "${ifCondition}" not matching`,
      )
      return false
    })

    // SessionStart/Setup 事件不支持 HTTP 钩子。在 headless 模式下，沙箱 ask 回调会死锁，
    // 因为当这些钩子触发时 structuredInput 消费者尚未启动。
    // 
    const filteredHooks =
      hookEvent === 'SessionStart' || hookEvent === 'Setup'
        ? ifFilteredHooks.filter(h => {
            if (h.hook.type === 'http') {
              logForDebugging(
                `Skipping HTTP hook ${(h.hook as { url: string }).url} — HTTP hooks are not supported for ${hookEvent}`,
              )
              return false
            }
            return true
          })
        : ifFilteredHooks

    logForDebugging(
      `已匹配 ${filteredHooks.length} 个唯一钩子，查询 "${matchQuery || '无匹配查询'}"（去重前 ${matchedHooks.length} 个）`,
      { level: 'verbose' },
    )
    return filteredHooks
  } catch {
    return []
  }
}

/**
 * 格式化来自 PreTool 钩子配置命令的阻塞错误列表。
 * @param hookName 钩子名称（例如 'PreToolUse:Write', 'PreToolUse:Edit', 'PreToolUse:Bash'）
 * @param blockingErrors 来自钩子的阻塞错误数组
 * @returns 格式化后的阻塞消息
 */
export function getPreToolHookBlockingMessage(
  hookName: string,
  blockingError: HookBlockingError,
): string {
  return `${hookName} hook error: ${blockingError.blockingError}`
}

/**
 * 格式化来自 Stop 钩子配置命令的阻塞错误列表。
 * @param blockingErrors 来自钩子的阻塞错误数组
 * @returns 格式化后的消息，用于给模型提供反馈
 */
export function getStopHookMessage(blockingError: HookBlockingError): string {
  return `Stop hook feedback:\n${blockingError.blockingError}`
}

/**
 * 格式化来自 TeammateIdle 钩子的阻塞错误。
 * @param blockingError 来自钩子的阻塞错误
 * @returns 格式化后的消息，用于给模型提供反馈
 */
export function getTeammateIdleHookMessage(
  blockingError: HookBlockingError,
): string {
  return `TeammateIdle hook feedback:\n${blockingError.blockingError}`
}

/**
 * 格式化来自 TaskCreated 钩子的阻塞错误。
 * @param blockingError 来自钩子的阻塞错误
 * @returns 格式化后的消息，用于给模型提供反馈
 */
export function getTaskCreatedHookMessage(
  blockingError: HookBlockingError,
): string {
  return `TaskCreated hook feedback:\n${blockingError.blockingError}`
}

/**
 * 格式化来自 TaskCompleted 钩子的阻塞错误。
 * @param blockingError 来自钩子的阻塞错误
 * @returns 格式化后的消息，用于给模型提供反馈
 */
export function getTaskCompletedHookMessage(
  blockingError: HookBlockingError,
): string {
  return `TaskCompleted hook feedback:\n${blockingError.blockingError}`
}

/**
 * 格式化来自 UserPromptSubmit 钩子配置命令的阻塞错误列表。
 * @param blockingErrors 来自钩子的阻塞错误数组
 * @returns 格式化后的阻塞消息
 */
export function getUserPromptSubmitHookBlockingMessage(
  blockingError: HookBlockingError,
): string {
  return `UserPromptSubmit operation blocked by hook:\n${blockingError.blockingError}`
}
/**
 * 执行钩子的通用逻辑
 * @param hookInput 将被验证并转换为 JSON 的结构化钩子输入
 * @param toolUseID 用于跟踪此钩子执行的 ID
 * @param matchQuery 与钩子匹配器进行匹配的查询
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @param toolUseContext 可选的 ToolUseContext，用于基于 prompt 的钩子（如果使用 prompt 钩子则需要）
 * @param messages 可选的对话历史记录，用于 prompt/function 钩子
 * @returns 异步生成器，产出进度消息和钩子结果
 */
async function* executeHooks({
  hookInput,
  toolUseID,
  matchQuery,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  toolUseContext,
  messages,
  forceSyncExecution,
  requestPrompt,
  toolInputSummary,
}: {
  hookInput: HookInput
  toolUseID: string
  matchQuery?: string
  signal?: AbortSignal
  timeoutMs?: number
  toolUseContext?: ToolUseContext
  messages?: Message[]
  forceSyncExecution?: boolean
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>
  toolInputSummary?: string | null
}): AsyncGenerator<AggregatedHookResult> {
  if (shouldDisableAllHooksIncludingManaged()) {
    return
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return
  }

  const hookEvent = hookInput.hook_event_name
  const hookName = matchQuery ? `${hookEvent}:${matchQuery}` : hookEvent

  // 绑定 prompt 回调到当前钩子名称和工具输入摘要，以便 UI 可以显示上下文
  const boundRequestPrompt = requestPrompt?.(hookName, toolInputSummary)

  // 安全：在交互模式下所有钩子都需要工作区信任
  // 此集中检查可防止所有当前和未来钩子的 RCE 漏洞
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `跳过 ${hookName} 钩子执行——工作区信任未接受`,
    )
    return
  }

  const appState = toolUseContext ? toolUseContext.getAppState() : undefined
  // 如果可用则使用 agent 的会话 ID，否则回退到主会话
  const sessionId = toolUseContext?.agentId ?? getSessionId()
  const matchingHooks = await getMatchingHooks(
    appState,
    sessionId,
    hookEvent,
    hookInput,
    toolUseContext?.options?.tools,
  )
  if (matchingHooks.length === 0) {
    return
  }

  if (signal?.aborted) {
    return
  }

  const userHooks = matchingHooks.filter(h => !isInternalHook(h))
  if (userHooks.length > 0) {
    const pluginHookCounts = getPluginHookCounts(userHooks)
    const hookTypeCounts = getHookTypeCounts(userHooks)
    logEvent(`tengu_run_hook`, {
      hookName:
        hookName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      numCommands: userHooks.length,
      hookTypeCounts: jsonStringify(
        hookTypeCounts,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(pluginHookCounts && {
        pluginHookCounts: jsonStringify(
          pluginHookCounts,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
    })
  } else {
    // 快速路径：所有钩子都是内部回调（sessionFileAccessHooks、attributionHooks）。
    // 它们返回 {} 并且不使用中止信号，因此我们可以跳过 span/progress/abortSignal/processHookJSONOutput/resultLoop。
    // 
    // Measured: 6.01µs → ~1.8µs per PostToolUse hit (-70%).
    const batchStartTime = Date.now()
    const context = toolUseContext
      ? {
          getAppState: toolUseContext.getAppState,
          updateAttributionState: toolUseContext.updateAttributionState,
        }
      : undefined
    for (const [i, { hook }] of matchingHooks.entries()) {
      if (hook.type === 'callback') {
        await hook.callback(hookInput, toolUseID, signal, i, context)
      }
    }
    const totalDurationMs = Date.now() - batchStartTime
    getStatsStore()?.observe('hook_duration_ms', totalDurationMs)
    addToTurnHookDuration(totalDurationMs)
    logEvent(`tengu_repl_hook_finished`, {
      hookName:
        hookName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      numCommands: matchingHooks.length,
      numSuccess: matchingHooks.length,
      numBlocking: 0,
      numNonBlockingError: 0,
      numCancelled: 0,
      totalDurationMs,
    })
    return
  }

  // 收集钩子定义用于 beta 追踪遥测
  const hookDefinitionsJson = isBetaTracingEnabled()
    ? jsonStringify(getHookDefinitionsForTelemetry(matchingHooks))
    : '[]'

  // 将钩子执行开始记录到 OTEL（仅限 beta 追踪）
  if (isBetaTracingEnabled()) {
    void logOTelEvent('hook_execution_start', {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: hookDefinitionsJson,
      hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    })
  }

  // 为 beta 追踪启动钩子 span
  const hookSpan = startHookSpan(
    hookEvent,
    hookName,
    matchingHooks.length,
    hookDefinitionsJson,
  )

  // 在执行前为每个钩子产出进度消息
  for (const { hook } of matchingHooks) {
    yield {
      message: {
        type: 'progress',
        data: {
          type: 'hook_progress',
          hookEvent,
          hookName,
          command: getHookDisplayText(hook),
          ...(hook.type === 'prompt' && { promptText: hook.prompt }),
          ...('statusMessage' in hook &&
            hook.statusMessage != null && {
              statusMessage: hook.statusMessage,
            }),
        },
        parentToolUseID: toolUseID,
        toolUseID,
        timestamp: new Date().toISOString(),
        uuid: randomUUID(),
      },
    }
  }

  // 跟踪整个钩子批次的挂钟时间
  const batchStartTime = Date.now()

  // hookInput 的惰性一次性字符串化。在所有 command/prompt/agent/http 钩子间共享
  // （hookInput 从不被修改）。Callback/function 钩子在此前已返回，因此仅包含这些钩子的批次无需支付字符串化成本。
  // 
  let jsonInputResult:
    | { ok: true; value: string }
    | { ok: false; error: unknown }
    | undefined
  function getJsonInput() {
    if (jsonInputResult !== undefined) {
      return jsonInputResult
    }
    try {
      return (jsonInputResult = { ok: true, value: jsonStringify(hookInput) })
    } catch (error) {
      logError(
        Error(`Failed to stringify hook ${hookName} input`, { cause: error }),
      )
      return (jsonInputResult = { ok: false, error })
    }
  }

  // 并行运行所有钩子，各自带有独立的超时
  const hookPromises = matchingHooks.map(async function* (
    { hook, pluginRoot, pluginId, skillRoot },
    hookIndex,
  ): AsyncGenerator<HookResult> {
    if (hook.type === 'callback') {
      const callbackTimeoutMs = hook.timeout ? hook.timeout * 1000 : timeoutMs
      const { signal: abortSignal, cleanup } = createCombinedAbortSignal(
        signal,
        { timeoutMs: callbackTimeoutMs },
      )
      yield executeHookCallback({
        toolUseID,
        hook,
        hookEvent,
        hookInput,
        signal: abortSignal,
        hookIndex,
        toolUseContext,
      }).finally(cleanup)
      return
    }

    if (hook.type === 'function') {
      if (!messages) {
        yield {
          message: createAttachmentMessage({
            type: 'hook_error_during_execution',
            hookName,
            toolUseID,
            hookEvent,
            content: '函数钩子未提供消息',
          }),
          outcome: 'non_blocking_error',
          hook,
        }
        return
      }

      // 函数钩子仅来自嵌入了回调的会话存储
      yield executeFunctionHook({
        hook,
        messages,
        hookName,
        toolUseID,
        hookEvent,
        timeoutMs,
        signal,
      })
      return
    }

    // Command 和 prompt 钩子需要 jsonInput
    const commandTimeoutMs = hook.timeout ? hook.timeout * 1000 : timeoutMs
    const { signal: abortSignal, cleanup } = createCombinedAbortSignal(signal, {
      timeoutMs: commandTimeoutMs,
    })
    const hookId = randomUUID()
    const hookStartMs = Date.now()
    const hookCommand = getHookDisplayText(hook)

    try {
      const jsonInputRes = getJsonInput()
      if (!jsonInputRes.ok) {
        yield {
          message: createAttachmentMessage({
            type: 'hook_error_during_execution',
            hookName,
            toolUseID,
            hookEvent,
            content: `Failed to prepare hook input: ${errorMessage(jsonInputRes.error)}`,
            command: hookCommand,
            durationMs: Date.now() - hookStartMs,
          }),
          outcome: 'non_blocking_error',
          hook,
        }
        cleanup()
        return
      }
      const jsonInput = jsonInputRes.value

      if (hook.type === 'prompt') {
        if (!toolUseContext) {
          throw new Error(
            'ToolUseContext 是 prompt 钩子的必需项。这是一个 bug。',
          )
        }
        const promptResult = await execPromptHook(
          hook,
          hookName,
          hookEvent,
          jsonInput,
          abortSignal,
          toolUseContext,
          messages,
          toolUseID,
        )
        // 注入时间字段以便钩子可见性
        if (promptResult.message?.type === 'attachment') {
          const att = promptResult.message.attachment
          if (
            att.type === 'hook_success' ||
            att.type === 'hook_non_blocking_error'
          ) {
            att.command = hookCommand
            att.durationMs = Date.now() - hookStartMs
          }
        }
        yield promptResult
        cleanup?.()
        return
      }

      if (hook.type === 'agent') {
        if (!toolUseContext) {
          throw new Error(
            'ToolUseContext 是 agent 钩子的必需项。这是一个 bug。',
          )
        }
        if (!messages) {
          throw new Error(
            '消息是 agent 钩子的必需项。这是一个 bug。',
          )
        }
        const agentResult = await execAgentHook(
          hook,
          hookName,
          hookEvent,
          jsonInput,
          abortSignal,
          toolUseContext,
          toolUseID,
          messages,
          'agent_type' in hookInput
            ? (hookInput.agent_type as string)
            : undefined,
        )
        // 注入时间字段以便钩子可见性
        if (agentResult.message?.type === 'attachment') {
          const att = agentResult.message.attachment
          if (
            att.type === 'hook_success' ||
            att.type === 'hook_non_blocking_error'
          ) {
            att.command = hookCommand
            att.durationMs = Date.now() - hookStartMs
          }
        }
        yield agentResult
        cleanup?.()
        return
      }

      if (hook.type === 'http') {
        emitHookStarted(hookId, hookName, hookEvent)

        // execHttpHook 通过 hook.timeout 或 DEFAULT_HTTP_HOOK_TIMEOUT_MS 在内部管理其自己的超时，
        // 因此直接传递父信号以避免与 abortSignal 双重堆叠超时。
        // 
        const httpResult = await execHttpHook(
          hook,
          hookEvent,
          jsonInput,
          signal,
        )
        cleanup?.()

        if (httpResult.aborted) {
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: '钩子已取消',
            stdout: '',
            stderr: '',
            exitCode: undefined,
            outcome: 'cancelled',
          })
          yield {
            message: createAttachmentMessage({
              type: 'hook_cancelled',
              hookName,
              toolUseID,
              hookEvent,
            }),
            outcome: 'cancelled' as const,
            hook,
          }
          return
        }

        if (httpResult.error || !httpResult.ok) {
          const stderr =
            httpResult.error || `HTTP ${httpResult.statusCode} from ${hook.url}`
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: stderr,
            stdout: '',
            stderr,
            exitCode: httpResult.statusCode,
            outcome: 'error',
          })
          yield {
            message: createAttachmentMessage({
              type: 'hook_non_blocking_error',
              hookName,
              toolUseID,
              hookEvent,
              stderr,
              stdout: '',
              exitCode: httpResult.statusCode ?? 0,
            }),
            outcome: 'non_blocking_error' as const,
            hook,
          }
          return
        }

        // HTTP hooks must return JSON — parse and validate through Zod
        const { json: httpJson, validationError: httpValidationError } =
          parseHttpHookOutput(httpResult.body)

        if (httpValidationError) {
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: `JSON validation failed: ${httpValidationError}`,
            exitCode: httpResult.statusCode,
            outcome: 'error',
          })
          yield {
            message: createAttachmentMessage({
              type: 'hook_non_blocking_error',
              hookName,
              toolUseID,
              hookEvent,
              stderr: `JSON validation failed: ${httpValidationError}`,
              stdout: httpResult.body,
              exitCode: httpResult.statusCode ?? 0,
            }),
            outcome: 'non_blocking_error' as const,
            hook,
          }
          return
        }

        if (httpJson && isAsyncHookJSONOutput(httpJson)) {
          // 异步响应：视为成功（无需进一步处理）
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: '',
            exitCode: httpResult.statusCode,
            outcome: 'success',
          })
          yield {
            outcome: 'success' as const,
            hook,
          }
          return
        }

        if (httpJson) {
          const processed = processHookJSONOutput({
            json: httpJson,
            command: hook.url,
            hookName,
            toolUseID,
            hookEvent,
            expectedHookEvent: hookEvent,
            stdout: httpResult.body,
            stderr: '',
            exitCode: httpResult.statusCode,
          })
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: httpResult.body,
            stdout: httpResult.body,
            stderr: '',
            exitCode: httpResult.statusCode,
            outcome: 'success',
          })
          yield {
            ...processed,
            outcome: 'success' as const,
            hook,
          }
          return
        }

        return
      }

      emitHookStarted(hookId, hookName, hookEvent)

      const result = await execCommandHook(
        hook,
        hookEvent,
        hookName,
        jsonInput,
        abortSignal,
        hookId,
        hookIndex,
        pluginRoot,
        pluginId,
        skillRoot,
        forceSyncExecution,
        boundRequestPrompt,
      )
      cleanup?.()
      const durationMs = Date.now() - hookStartMs

      if (result.backgrounded) {
        yield {
          outcome: 'success' as const,
          hook,
        }
        return
      }

      if (result.aborted) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: 'cancelled',
        })
        yield {
          message: createAttachmentMessage({
            type: 'hook_cancelled',
            hookName,
            toolUseID,
            hookEvent,
            command: hookCommand,
            durationMs,
          }),
          outcome: 'cancelled' as const,
          hook,
        }
        return
      }

      // 首先尝试 JSON 解析
      const { json, plainText, validationError } = parseHookOutput(
        result.stdout,
      )

      if (validationError) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: `JSON validation failed: ${validationError}`,
          exitCode: 1,
          outcome: 'error',
        })
        yield {
          message: createAttachmentMessage({
            type: 'hook_non_blocking_error',
            hookName,
            toolUseID,
            hookEvent,
            stderr: `JSON validation failed: ${validationError}`,
            stdout: result.stdout,
            exitCode: 1,
            command: hookCommand,
            durationMs,
          }),
          outcome: 'non_blocking_error' as const,
          hook,
        }
        return
      }

      if (json) {
        // 异步响应已在执行期间被后台化
        if (isAsyncHookJSONOutput(json)) {
          yield {
            outcome: 'success' as const,
            hook,
          }
          return
        }

        // 处理 JSON 输出
        const processed = processHookJSONOutput({
          json,
          command: hookCommand,
          hookName,
          toolUseID,
          hookEvent,
          expectedHookEvent: hookEvent,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          durationMs,
        })

        // 处理 suppressOutput（跳过异步响应）
        if (
          isSyncHookJSONOutput(json) &&
          !json.suppressOutput &&
          plainText &&
          result.status === 0
        ) {
          // 如果未抑制，仍显示非 JSON 输出
          const content = `${chalk.bold(hookName)} completed`
          emitHookResponse({
            hookId,
            hookName,
            hookEvent,
            output: result.output,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status,
            outcome: 'success',
          })
          yield {
            ...processed,
            message:
              processed.message ||
              createAttachmentMessage({
                type: 'hook_success',
                hookName,
                toolUseID,
                hookEvent,
                content,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.status,
                command: hookCommand,
                durationMs,
              }),
            outcome: 'success' as const,
            hook,
          }
          return
        }

        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: result.status === 0 ? 'success' : 'error',
        })
        yield {
          ...processed,
          outcome: 'success' as const,
          hook,
        }
        return
      }

      // 回退到非 JSON 输出的现有逻辑
      if (result.status === 0) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: 'success',
        })
        yield {
          message: createAttachmentMessage({
            type: 'hook_success',
            hookName,
            toolUseID,
            hookEvent,
            content: result.stdout.trim(),
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status,
            command: hookCommand,
            durationMs,
          }),
          outcome: 'success' as const,
          hook,
        }
        return
      }

      // 退出码为 2 的钩子提供阻塞反馈
      if (result.status === 2) {
        emitHookResponse({
          hookId,
          hookName,
          hookEvent,
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.status,
          outcome: 'error',
        })
        yield {
          blockingError: {
            blockingError: `[${hook.command}]: ${result.stderr || 'No stderr output'}`,
            command: hook.command,
          },
          outcome: 'blocking' as const,
          hook,
        }
        return
      }

      // 任何其他非零退出码是非关键错误，应仅向用户显示。
      // 
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: result.output,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        outcome: 'error',
      })
      yield {
        message: createAttachmentMessage({
          type: 'hook_non_blocking_error',
          hookName,
          toolUseID,
          hookEvent,
          stderr: `Failed with non-blocking status code: ${result.stderr.trim() || 'No stderr output'}`,
          stdout: result.stdout,
          exitCode: result.status,
          command: hookCommand,
          durationMs,
        }),
        outcome: 'non_blocking_error' as const,
        hook,
      }
      return
    } catch (error) {
      // 出错时清理
      cleanup?.()

      const errorMessage =
        error instanceof Error ? error.message : String(error)
      emitHookResponse({
        hookId,
        hookName,
        hookEvent,
        output: `Failed to run: ${errorMessage}`,
        stdout: '',
        stderr: `Failed to run: ${errorMessage}`,
        exitCode: 1,
        outcome: 'error',
      })
      yield {
        message: createAttachmentMessage({
          type: 'hook_non_blocking_error',
          hookName,
          toolUseID,
          hookEvent,
          stderr: `Failed to run: ${errorMessage}`,
          stdout: '',
          exitCode: 1,
          command: hookCommand,
          durationMs: Date.now() - hookStartMs,
        }),
        outcome: 'non_blocking_error' as const,
        hook,
      }
      return
    }
  })

  // 跟踪结果用于日志记录
  const outcomes = {
    success: 0,
    blocking: 0,
    non_blocking_error: 0,
    cancelled: 0,
  }

  let permissionBehavior: PermissionResult['behavior'] | undefined

  // 并行运行所有钩子并等待所有完成
  for await (const result of all(hookPromises)) {
    outcomes[result.outcome]++

    // 提前检查 preventContinuation
    if (result.preventContinuation) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) requested preventContinuation`,
      )
      yield {
        preventContinuation: true,
        stopReason: result.stopReason,
      }
    }

    // 处理不同的结果类型
    if (result.blockingError) {
      yield {
        blockingError: result.blockingError,
      }
    }

    if (result.message) {
      yield { message: result.message }
    }

    // 如果存在，单独 yield systemMessage
    if (result.systemMessage) {
      yield {
        message: createAttachmentMessage({
          type: 'hook_system_message',
          content: result.systemMessage,
          hookName,
          toolUseID,
          hookEvent,
        }),
      }
    }

    // 从钩子收集额外上下文
    if (result.additionalContext) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided additionalContext (${result.additionalContext.length} chars)`,
      )
      yield {
        additionalContexts: [result.additionalContext],
      }
    }

    if (result.initialUserMessage) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided initialUserMessage (${result.initialUserMessage.length} chars)`,
      )
      yield {
        initialUserMessage: result.initialUserMessage,
      }
    }

    if (result.watchPaths && result.watchPaths.length > 0) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) provided ${result.watchPaths.length} watchPaths`,
      )
      yield {
        watchPaths: result.watchPaths,
      }
    }

    // 如果提供了 updatedMCPToolOutput 则 yield（来自 PostToolUse 钩子）
    if (result.updatedMCPToolOutput) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) replaced MCP tool output`,
      )
      yield {
        updatedMCPToolOutput: result.updatedMCPToolOutput,
      }
    }

    // 检查权限行为，优先级：deny > ask > allow
    if (result.permissionBehavior) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) returned permissionDecision: ${result.permissionBehavior}${result.hookPermissionDecisionReason ? ` (reason: ${result.hookPermissionDecisionReason})` : ''}`,
      )
      // Apply precedence rules
      switch (result.permissionBehavior) {
        case 'deny':
          // deny 始终优先
          permissionBehavior = 'deny'
          break
        case 'ask':
          // ask 优先于 allow 但不优先于 deny
          if (permissionBehavior !== 'deny') {
            permissionBehavior = 'ask'
          }
          break
        case 'allow':
          // 仅当未设置其他行为时才 allow
          if (!permissionBehavior) {
            permissionBehavior = 'allow'
          }
          break
        case 'passthrough':
          // passthrough 不设置权限行为
          break
      }
    }

    // 如果提供了，yield permissionBehavior 和 updatedInput（来自 allow 或 ask 行为）
    if (permissionBehavior !== undefined) {
      const updatedInput =
        result.updatedInput &&
        (result.permissionBehavior === 'allow' ||
          result.permissionBehavior === 'ask')
          ? result.updatedInput
          : undefined
      if (updatedInput) {
        logForDebugging(
          `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) modified tool input keys: [${Object.keys(updatedInput).join(', ')}]`,
        )
      }
      yield {
        permissionBehavior,
        hookPermissionDecisionReason: result.hookPermissionDecisionReason,
        hookSource: matchingHooks.find(m => m.hook === result.hook)?.hookSource,
        updatedInput,
      }
    }

    // 为 passthrough 情况单独 yield updatedInput（无权限决策）
    // 这允许钩子在不做权限决策的情况下修改输入
    // 注意：检查 result.permissionBehavior（当前钩子的行为），而非聚合后的 permissionBehavior
    if (result.updatedInput && result.permissionBehavior === undefined) {
      logForDebugging(
        `Hook ${hookEvent} (${getHookDisplayText(result.hook)}) modified tool input keys: [${Object.keys(result.updatedInput).join(', ')}]`,
      )
      yield {
        updatedInput: result.updatedInput,
      }
    }
    // 如果提供了，yield permissionRequestResult（来自 PermissionRequest 钩子）
    if (result.permissionRequestResult) {
      yield {
        permissionRequestResult: result.permissionRequestResult,
      }
    }
    // 如果提供了，yield retry 标志（来自 PermissionDenied 钩子）
    if (result.retry) {
      yield {
        retry: result.retry,
      }
    }
    // 如果提供了，yield elicitationResponse（来自 Elicitation 钩子）
    if (result.elicitationResponse) {
      yield {
        elicitationResponse: result.elicitationResponse,
      }
    }
    // 如果提供了，yield elicitationResultResponse（来自 ElicitationResult 钩子）
    if (result.elicitationResultResponse) {
      yield {
        elicitationResultResponse: result.elicitationResultResponse,
      }
    }

    // 如果这是 command/prompt/function 钩子（不是 callback 钩子），调用会话钩子回调
    if (appState && result.hook.type !== 'callback') {
      const sessionId = getSessionId()
      // 当 matchQuery 为 undefined 时使用空字符串作为匹配器（例如，对于 Stop 钩子）
      const matcher = matchQuery ?? ''
      const hookEntry = getSessionHookCallback(
        appState,
        sessionId,
        hookEvent,
        matcher,
        result.hook,
      )
      // 仅在成功结果时调用 onHookSuccess
      if (hookEntry?.onHookSuccess && result.outcome === 'success') {
        try {
          hookEntry.onHookSuccess(result.hook, result as AggregatedHookResult)
        } catch (error) {
          logError(
            Error('会话钩子成功回调失败', { cause: error }),
          )
        }
      }
    }
  }

  const totalDurationMs = Date.now() - batchStartTime
  getStatsStore()?.observe('hook_duration_ms', totalDurationMs)
  addToTurnHookDuration(totalDurationMs)

  logEvent(`tengu_repl_hook_finished`, {
    hookName:
      hookName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    numCommands: matchingHooks.length,
    numSuccess: outcomes.success,
    numBlocking: outcomes.blocking,
    numNonBlockingError: outcomes.non_blocking_error,
    numCancelled: outcomes.cancelled,
    totalDurationMs,
  })

  // 将钩子执行完成记录到 OTEL（仅限 beta 追踪）
  if (isBetaTracingEnabled()) {
    const hookDefinitionsComplete =
      getHookDefinitionsForTelemetry(matchingHooks)

    void logOTelEvent('hook_execution_complete', {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      num_success: String(outcomes.success),
      num_blocking: String(outcomes.blocking),
      num_non_blocking_error: String(outcomes.non_blocking_error),
      num_cancelled: String(outcomes.cancelled),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: jsonStringify(hookDefinitionsComplete),
      hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    })
  }

  // 结束 beta 追踪的钩子 span
  endHookSpan(hookSpan, {
    numSuccess: outcomes.success,
    numBlocking: outcomes.blocking,
    numNonBlockingError: outcomes.non_blocking_error,
    numCancelled: outcomes.cancelled,
  })
}

export type HookOutsideReplResult = {
  command: string
  succeeded: boolean
  output: string
  blocked: boolean
  watchPaths?: string[]
  systemMessage?: string
}

export function hasBlockingResult(results: HookOutsideReplResult[]): boolean {
  return results.some(r => r.blocked)
}

/**
 * 在 REPL 外部执行钩子（例如通知、会话结束）
 *
 * 与 executeHooks() 不同——后者会生成暴露给模型的消息作为
 * 系统消息。此函数仅通过 logForDebugging 记录错误（使用
 * --debug 可见）。需要向用户呈现错误的调用方应适当处理
 * 返回的结果（例如 executeSessionEndHooks 在关闭期间写入
 * stderr）。
 *
 * @param getAppState 获取当前应用状态的可选函数（用于会话钩子）
 * @param hookInput 将被验证并转换为 JSON 的结构化钩子输入
 * @param matchQuery 用于匹配钩子匹配器的查询
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 包含 command、succeeded 和 output 的 HookOutsideReplResult 对象数组
 */
async function executeHooksOutsideREPL({
  getAppState,
  hookInput,
  matchQuery,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
}: {
  getAppState?: () => AppState
  hookInput: HookInput
  matchQuery?: string
  signal?: AbortSignal
  timeoutMs: number
}): Promise<HookOutsideReplResult[]> {
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return []
  }

  const hookEvent = hookInput.hook_event_name
  const hookName = matchQuery ? `${hookEvent}:${matchQuery}` : hookEvent
  if (shouldDisableAllHooksIncludingManaged()) {
    logForDebugging(
      `由于 managed 设置 'disableAllHooks'，跳过 ${hookName} 的钩子`,
    )
    return []
  }

  // 安全：所有钩子在交互模式下都需要工作区信任
  // 此集中式检查防止所有当前和未来钩子的 RCE 漏洞
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `跳过 ${hookName} 钩子执行——工作区信任未接受`,
    )
    return []
  }

  const appState = getAppState ? getAppState() : undefined
  // 对 REPL 外部钩子使用主会话 ID
  const sessionId = getSessionId()
  const matchingHooks = await getMatchingHooks(
    appState,
    sessionId,
    hookEvent,
    hookInput,
  )
  if (matchingHooks.length === 0) {
    return []
  }

  if (signal?.aborted) {
    return []
  }

  const userHooks = matchingHooks.filter(h => !isInternalHook(h))
  if (userHooks.length > 0) {
    const pluginHookCounts = getPluginHookCounts(userHooks)
    const hookTypeCounts = getHookTypeCounts(userHooks)
    logEvent(`tengu_run_hook`, {
      hookName:
        hookName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      numCommands: userHooks.length,
      hookTypeCounts: jsonStringify(
        hookTypeCounts,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(pluginHookCounts && {
        pluginHookCounts: jsonStringify(
          pluginHookCounts,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
    })
  }

  // 验证并序列化钩子输入
  let jsonInput: string
  try {
    jsonInput = jsonStringify(hookInput)
  } catch (error) {
    logError(error)
    return []
  }

  // 使用各自的超时时间并行运行所有钩子
  const hookPromises = matchingHooks.map(
    async ({ hook, pluginRoot, pluginId }, hookIndex) => {
      // 处理回调钩子
      if (hook.type === 'callback') {
        const callbackTimeoutMs = hook.timeout ? hook.timeout * 1000 : timeoutMs
        const { signal: abortSignal, cleanup } = createCombinedAbortSignal(
          signal,
          { timeoutMs: callbackTimeoutMs },
        )

        try {
          const toolUseID = randomUUID()
          const json = await hook.callback(
            hookInput,
            toolUseID,
            abortSignal,
            hookIndex,
          )

          cleanup?.()

          if (isAsyncHookJSONOutput(json)) {
            logForDebugging(
              `${hookName} [callback] 返回异步响应，返回空输出`,
            )
            return {
              command: 'callback',
              succeeded: true,
              output: '',
              blocked: false,
            }
          }

          const output =
            hookEvent === 'WorktreeCreate' &&
            isSyncHookJSONOutput(json) &&
            json.hookSpecificOutput?.hookEventName === 'WorktreeCreate'
              ? json.hookSpecificOutput.worktreePath
              : json.systemMessage || ''
          const blocked =
            isSyncHookJSONOutput(json) && json.decision === 'block'

          logForDebugging(`${hookName} [callback] 完成`)

          return {
            command: 'callback',
            succeeded: true,
            output,
            blocked,
          }
        } catch (error) {
          cleanup?.()

          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logForDebugging(
            `${hookName} [callback] 执行失败: ${errorMessage}`,
            { level: 'error' },
          )
          return {
            command: 'callback',
            succeeded: false,
            output: errorMessage,
            blocked: false,
          }
        }
      }

      // TODO: 在 REPL 外部实现 prompt stop 钩子
      if (hook.type === 'prompt') {
        return {
          command: hook.prompt,
          succeeded: false,
          output: 'Prompt 停止钩子在 REPL 之外暂不支持',
          blocked: false,
        }
      }

      // TODO: 在 REPL 外部实现 agent stop 钩子
      if (hook.type === 'agent') {
        return {
          command: hook.prompt,
          succeeded: false,
          output: 'Agent 停止钩子在 REPL 之外暂不支持',
          blocked: false,
        }
      }

      // Function 钩子需要 messages 数组（仅在 REPL 上下文中可用）
      // 对于 -p 模式的 Stop 钩子，请使用支持 function 钩子的 executeStopHooks
      if (hook.type === 'function') {
        logError(
          new Error(
            `Function hook reached executeHooksOutsideREPL for ${hookEvent}. Function hooks should only be used in REPL context (Stop hooks).`,
          ),
        )
        return {
          command: 'function',
          succeeded: false,
          output: '内部错误：函数钩子在 REPL 上下文之外执行',
          blocked: false,
        }
      }

      // 处理 HTTP 钩子（不需要 toolUseContext——仅 HTTP POST）
      // execHttpHook 通过 hook.timeout 或
      // DEFAULT_HTTP_HOOK_TIMEOUT_MS 内部处理超时，因此直接传递 signal
      if (hook.type === 'http') {
        try {
          const httpResult = await execHttpHook(
            hook,
            hookEvent,
            jsonInput,
            signal,
          )

          if (httpResult.aborted) {
            logForDebugging(`${hookName} [${hook.url}] 已取消`)
            return {
              command: hook.url,
              succeeded: false,
              output: '钩子已取消',
              blocked: false,
            }
          }

          if (httpResult.error || !httpResult.ok) {
            const errMsg =
              httpResult.error ||
              `HTTP ${httpResult.statusCode} from ${hook.url}`
            logForDebugging(`${hookName} [${hook.url}] 失败: ${errMsg}`, {
              level: 'error',
            })
            return {
              command: hook.url,
              succeeded: false,
              output: errMsg,
              blocked: false,
            }
          }

          // HTTP 钩子必须返回 JSON——通过 Zod 解析和验证
          const { json: httpJson, validationError: httpValidationError } =
            parseHttpHookOutput(httpResult.body)
          if (httpValidationError) {
            throw new Error(httpValidationError)
          }
          if (httpJson && !isAsyncHookJSONOutput(httpJson)) {
            logForDebugging(
              `从 HTTP 钩子解析的 JSON 输出: ${jsonStringify(httpJson)}`,
              { level: 'verbose' },
            )
          }
          const jsonBlocked =
            httpJson &&
            !isAsyncHookJSONOutput(httpJson) &&
            isSyncHookJSONOutput(httpJson) &&
            httpJson.decision === 'block'

          // WorktreeCreate 的消费者将 `output` 读取为裸文件系统路径
          // 命令钩子通过 stdout 提供；http 钩子通过
          // hookSpecificOutput.worktreePath 提供。没有 worktreePath 时发出 ''
          // 以便消费者的长度过滤器跳过它，而不是将原始的
          // '{}' body 视为路径。
          const output =
            hookEvent === 'WorktreeCreate'
              ? httpJson &&
                isSyncHookJSONOutput(httpJson) &&
                httpJson.hookSpecificOutput?.hookEventName === 'WorktreeCreate'
                ? httpJson.hookSpecificOutput.worktreePath
                : ''
              : httpResult.body

          return {
            command: hook.url,
            succeeded: true,
            output,
            blocked: !!jsonBlocked,
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logForDebugging(
            `${hookName} [${hook.url}] 执行失败: ${errorMessage}`,
            { level: 'error' },
          )
          return {
            command: hook.url,
            succeeded: false,
            output: errorMessage,
            blocked: false,
          }
        }
      }

      // 处理命令钩子
      const commandTimeoutMs = hook.timeout ? hook.timeout * 1000 : timeoutMs
      const { signal: abortSignal, cleanup } = createCombinedAbortSignal(
        signal,
        { timeoutMs: commandTimeoutMs },
      )
      try {
        const result = await execCommandHook(
          hook,
          hookEvent,
          hookName,
          jsonInput,
          abortSignal,
          randomUUID(),
          hookIndex,
          pluginRoot,
          pluginId,
        )

        // 钩子完成时清除超时
        cleanup?.()

        if (result.aborted) {
          logForDebugging(`${hookName} [${hook.command}] 已取消`)
          return {
            command: hook.command,
            succeeded: false,
            output: '钩子已取消',
            blocked: false,
          }
        }

        logForDebugging(
          `${hookName} [${hook.command}] 完成，状态码 ${result.status}`,
        )

        // 解析 JSON 以获取要打印的消息
        const { json, validationError } = parseHookOutput(result.stdout)
        if (validationError) {
          // 验证错误通过 logForDebugging 记录并在输出中返回
          throw new Error(validationError)
        }
        if (json && !isAsyncHookJSONOutput(json)) {
          logForDebugging(
            `从钩子解析的 JSON 输出: ${jsonStringify(json)}`,
            { level: 'verbose' },
          )
        }

        // 若退出码为 2 或 JSON decision 为 'block' 则阻塞
        const jsonBlocked =
          json &&
          !isAsyncHookJSONOutput(json) &&
          isSyncHookJSONOutput(json) &&
          json.decision === 'block'
        const blocked = result.status === 2 || !!jsonBlocked

        // 成功钩子（退出码 0）使用 stdout，失败钩子使用 stderr
        const output =
          result.status === 0 ? result.stdout || '' : result.stderr || ''

        const watchPaths =
          json &&
          isSyncHookJSONOutput(json) &&
          json.hookSpecificOutput &&
          'watchPaths' in json.hookSpecificOutput
            ? json.hookSpecificOutput.watchPaths
            : undefined

        const systemMessage =
          json && isSyncHookJSONOutput(json) ? json.systemMessage : undefined

        return {
          command: hook.command,
          succeeded: result.status === 0,
          output,
          blocked,
          watchPaths,
          systemMessage,
        }
      } catch (error) {
        // 出错时清理
        cleanup?.()

        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logForDebugging(
          `${hookName} [${hook.command}] 执行失败: ${errorMessage}`,
          { level: 'error' },
        )
        return {
          command: hook.command,
          succeeded: false,
          output: errorMessage,
          blocked: false,
        }
      }
    },
  )

  // 等待所有钩子完成并收集结果
  return await Promise.all(hookPromises)
}

/**
 * 如果已配置则执行工具前钩子
 * @param toolName 工具名称（例如 'Write'、'Edit'、'Bash'）
 * @param toolUseID 工具使用的 ID
 * @param toolInput 将传递给工具的输入
 * @param permissionMode 来自 toolPermissionContext 的可选权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @param toolUseContext 可选的 ToolUseContext，用于基于 prompt 的钩子
 * @returns 生成进度消息并返回阻塞错误的异步生成器
 */
export async function* executePreToolHooks<ToolInput>(
  toolName: string,
  toolUseID: string,
  toolInput: ToolInput,
  toolUseContext: ToolUseContext,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>,
  toolInputSummary?: string | null,
): AsyncGenerator<AggregatedHookResult> {
  const appState = toolUseContext.getAppState()
  const sessionId = toolUseContext.agentId ?? getSessionId()
  if (!hasHookForEvent('PreToolUse', appState, sessionId)) {
    return
  }

  logForDebugging(`executePreToolHooks called for tool: ${toolName}`, {
    level: 'verbose',
  })

  const hookInput: PreToolUseHookInput = {
    ...createBaseHookInput(permissionMode, undefined, toolUseContext),
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
  }

  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
    requestPrompt,
    toolInputSummary,
  })
}

/**
 * 如果已配置则执行工具后钩子
 * @param toolName 工具名称（例如 'Write'、'Edit'、'Bash'）
 * @param toolUseID 工具使用的 ID
 * @param toolInput 传递给工具的输入
 * @param toolResponse 工具的响应
 * @param toolUseContext 用于基于 prompt 的钩子的 ToolUseContext
 * @param permissionMode 来自 toolPermissionContext 的可选权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息和阻塞错误以进行自动反馈的异步生成器
 */
export async function* executePostToolHooks<ToolInput, ToolResponse>(
  toolName: string,
  toolUseID: string,
  toolInput: ToolInput,
  toolResponse: ToolResponse,
  toolUseContext: ToolUseContext,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: PostToolUseHookInput = {
    ...createBaseHookInput(permissionMode, undefined, toolUseContext),
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
    tool_use_id: toolUseID,
  }

  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
  })
}

/**
 * 如果已配置则执行工具使用失败后钩子
 * @param toolName 工具名称（例如 'Write'、'Edit'、'Bash'）
 * @param toolUseID 工具使用的 ID
 * @param toolInput 传递给工具的输入
 * @param error 失败工具调用的错误消息
 * @param toolUseContext 用于基于 prompt 的钩子的 ToolUseContext
 * @param isInterrupt 工具是否被用户中断
 * @param permissionMode 来自 toolPermissionContext 的可选权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息和阻塞错误的异步生成器
 */
export async function* executePostToolUseFailureHooks<ToolInput>(
  toolName: string,
  toolUseID: string,
  toolInput: ToolInput,
  error: string,
  toolUseContext: ToolUseContext,
  isInterrupt?: boolean,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): AsyncGenerator<AggregatedHookResult> {
  const appState = toolUseContext.getAppState()
  const sessionId = toolUseContext.agentId ?? getSessionId()
  if (!hasHookForEvent('PostToolUseFailure', appState, sessionId)) {
    return
  }

  const hookInput: PostToolUseFailureHookInput = {
    ...createBaseHookInput(permissionMode, undefined, toolUseContext),
    hook_event_name: 'PostToolUseFailure',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
    error,
    is_interrupt: isInterrupt,
  }

  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
  })
}

export async function* executePermissionDeniedHooks<ToolInput>(
  toolName: string,
  toolUseID: string,
  toolInput: ToolInput,
  reason: string,
  toolUseContext: ToolUseContext,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): AsyncGenerator<AggregatedHookResult> {
  const appState = toolUseContext.getAppState()
  const sessionId = toolUseContext.agentId ?? getSessionId()
  if (!hasHookForEvent('PermissionDenied', appState, sessionId)) {
    return
  }

  const hookInput: PermissionDeniedHookInput = {
    ...createBaseHookInput(permissionMode, undefined, toolUseContext),
    hook_event_name: 'PermissionDenied',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
    reason,
  }

  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
  })
}

/**
 * 如果已配置则执行通知钩子
 * @param notificationData 传递给钩子的通知数据
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 所有钩子完成时解析的 Promise
 */
export async function executeNotificationHooks(
  notificationData: {
    message: string
    title?: string
    notificationType: string
  },
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<void> {
  const { message, title, notificationType } = notificationData
  const hookInput: NotificationHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'Notification',
    message,
    title,
    notification_type: notificationType,
  }

  await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: notificationType,
  })
}

export async function executeStopFailureHooks(
  lastMessage: AssistantMessage,
  toolUseContext?: ToolUseContext,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<void> {
  const appState = toolUseContext?.getAppState()
  // executeHooksOutsideREPL 硬编码主会话 ID（:2738）。Agent frontmatter
  // 钩子（registerFrontmatterHooks）使用 agentId 作为键；在此处使用 agentId 进行门控
  // 会通过门控但执行失败。使门控与执行对齐。
  const sessionId = getSessionId()
  if (!hasHookForEvent('StopFailure', appState, sessionId)) return

  const lastAssistantText =
    extractTextContent(lastMessage.message.content, '\n').trim() || undefined

  // 某些 createAssistantAPIErrorMessage 调用站点省略了 `error`（例如
  // errors.ts:431 中的 image-size）。默认为 'unknown'，
  // 以便 getMatchingHooks:1525 的匹配器过滤始终适用。
  const error = lastMessage.error ?? 'unknown'
  const hookInput: StopFailureHookInput = {
    ...createBaseHookInput(undefined, undefined, toolUseContext),
    hook_event_name: 'StopFailure',
    error,
    error_details: lastMessage.errorDetails,
    last_assistant_message: lastAssistantText,
  }

  await executeHooksOutsideREPL({
    getAppState: toolUseContext?.getAppState,
    hookInput,
    timeoutMs,
    matchQuery: error,
  })
}

/**
 * 如果已配置则执行 stop 钩子
 * @param toolUseContext 用于基于 prompt 的钩子的 ToolUseContext
 * @param permissionMode 来自 toolPermissionContext 的权限模式
 * @param signal 用于取消钩子执行的 AbortSignal
 * @param stopHookActive 此调用是否发生在另一个 stop 钩子内部
 * @param isSubagent 当前执行上下文是否是子代理
 * @param messages 可选的对话历史，用于 prompt/function 钩子
 * @returns 生成进度消息和阻塞错误的异步生成器
 */
export async function* executeStopHooks(
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  stopHookActive: boolean = false,
  subagentId?: AgentId,
  toolUseContext?: ToolUseContext,
  messages?: Message[],
  agentType?: string,
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>,
): AsyncGenerator<AggregatedHookResult> {
  const hookEvent = subagentId ? 'SubagentStop' : 'Stop'
  const appState = toolUseContext?.getAppState()
  const sessionId = toolUseContext?.agentId ?? getSessionId()
  if (!hasHookForEvent(hookEvent, appState, sessionId)) {
    return
  }

  // 从最后一条助手消息中提取文本内容，以便钩子无需读取记录文件即可检查最终响应。
  const lastAssistantMessage = messages
    ? getLastAssistantMessage(messages)
    : undefined
  const lastAssistantText = lastAssistantMessage
    ? extractTextContent(lastAssistantMessage.message.content, '\n').trim() ||
      undefined
    : undefined

  const hookInput: StopHookInput | SubagentStopHookInput = subagentId
    ? {
        ...createBaseHookInput(permissionMode),
        hook_event_name: 'SubagentStop',
        stop_hook_active: stopHookActive,
        agent_id: subagentId,
        agent_transcript_path: getAgentTranscriptPath(subagentId),
        agent_type: agentType ?? '',
        last_assistant_message: lastAssistantText,
      }
    : {
        ...createBaseHookInput(permissionMode),
        hook_event_name: 'Stop',
        stop_hook_active: stopHookActive,
        last_assistant_message: lastAssistantText,
      }

  // 信任检查现已集中在 executeHooks() 中
  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext,
    messages,
    requestPrompt,
  })
}

/**
 * 当队友即将进入空闲状态时执行 TeammateIdle 钩子。
 * 如果钩子阻塞（退出码 2），队友应继续工作而不是进入空闲状态。
 * @param teammateName 进入空闲状态的队友姓名
 * @param teamName 此队友所属的团队
 * @param permissionMode 可选的权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息和阻塞错误的异步生成器
 */
export async function* executeTeammateIdleHooks(
  teammateName: string,
  teamName: string,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: TeammateIdleHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'TeammateIdle',
    teammate_name: teammateName,
    team_name: teamName,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
  })
}

/**
 * 当任务正在创建时执行 TaskCreated 钩子。
 * 如果钩子阻塞（退出码 2），应阻止任务创建并返回反馈。
 * @param taskId 正在创建的任务 ID
 * @param taskSubject 任务的主题/标题
 * @param taskDescription 可选的任务描述
 * @param teammateName 可选的任务创建者队友姓名
 * @param teamName 可选的团队名称
 * @param permissionMode 可选的权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @param toolUseContext 可选的 ToolUseContext，用于解析 appState 和 sessionId
 * @returns 生成进度消息和阻塞错误的异步生成器
 */
export async function* executeTaskCreatedHooks(
  taskId: string,
  taskSubject: string,
  taskDescription?: string,
  teammateName?: string,
  teamName?: string,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  toolUseContext?: ToolUseContext,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: TaskCreatedHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'TaskCreated',
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext,
  })
}

/**
 * 当任务被标记为完成时执行 TaskCompleted 钩子。
 * 如果钩子阻塞（退出码 2），应阻止任务完成并返回反馈。
 * @param taskId 正在完成的任务 ID
 * @param taskSubject 任务的主题/标题
 * @param taskDescription 可选的任务描述
 * @param teammateName 可选的完成任务者队友姓名
 * @param teamName 可选的团队名称
 * @param permissionMode 可选的权限模式
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @param toolUseContext 可选的 ToolUseContext，用于解析 appState 和 sessionId
 * @returns 生成进度消息和阻塞错误的异步生成器
 */
export async function* executeTaskCompletedHooks(
  taskId: string,
  taskSubject: string,
  taskDescription?: string,
  teammateName?: string,
  teamName?: string,
  permissionMode?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  toolUseContext?: ToolUseContext,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: TaskCompletedHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'TaskCompleted',
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal,
    timeoutMs,
    toolUseContext,
  })
}

/**
 * 如果已配置则执行开始钩子
 * @param prompt 将传递给工具的用户提示
 * @param permissionMode 来自 toolPermissionContext 的权限模式
 * @param toolUseContext 用于基于 prompt 的钩子的 ToolUseContext
 * @returns 生成进度消息和钩子结果的异步生成器
 */
export async function* executeUserPromptSubmitHooks(
  prompt: string,
  permissionMode: string,
  toolUseContext: ToolUseContext,
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>,
): AsyncGenerator<AggregatedHookResult> {
  const appState = toolUseContext.getAppState()
  const sessionId = toolUseContext.agentId ?? getSessionId()
  if (!hasHookForEvent('UserPromptSubmit', appState, sessionId)) {
    return
  }

  const hookInput: UserPromptSubmitHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'UserPromptSubmit',
    prompt,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    signal: toolUseContext.abortController.signal,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS,
    toolUseContext,
    requestPrompt,
  })
}

/**
 * 如果已配置则执行会话开始钩子
 * @param source 会话开始的来源（startup、resume、clear）
 * @param sessionId 可选的会话 ID，用作钩子输入
 * @param agentType 可选的运行此会话的代理类型（来自 --agent 标志）
 * @param model 可选的本会话所使用的模型
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息和钩子结果的异步生成器
 */
export async function* executeSessionStartHooks(
  source: 'startup' | 'resume' | 'clear' | 'compact',
  sessionId?: string,
  agentType?: string,
  model?: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  forceSyncExecution?: boolean,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: SessionStartHookInput = {
    ...createBaseHookInput(undefined, sessionId),
    hook_event_name: 'SessionStart',
    source,
    agent_type: agentType,
    model,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: source,
    signal,
    timeoutMs,
    forceSyncExecution,
  })
}

/**
 * 如果已配置则执行 setup 钩子
 * @param trigger 触发类型（'init' 或 'maintenance'）
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @param forceSyncExecution 如果为 true，异步钩子将不会后台运行
 * @returns 生成进度消息和钩子结果的异步生成器
 */
export async function* executeSetupHooks(
  trigger: 'init' | 'maintenance',
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  forceSyncExecution?: boolean,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: SetupHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'Setup',
    trigger,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: trigger,
    signal,
    timeoutMs,
    forceSyncExecution,
  })
}

/**
 * 如果已配置则执行子代理启动钩子
 * @param agentId 子代理的唯一标识符
 * @param agentType 正在启动的子代理的类型/名称
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息和钩子结果的异步生成器
 */
export async function* executeSubagentStartHooks(
  agentId: string,
  agentType: string,
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): AsyncGenerator<AggregatedHookResult> {
  const hookInput: SubagentStartHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'SubagentStart',
    agent_id: agentId,
    agent_type: agentType,
  }

  yield* executeHooks({
    hookInput,
    toolUseID: randomUUID(),
    matchQuery: agentType,
    signal,
    timeoutMs,
  })
}

/**
 * 如果已配置则执行压缩前钩子
 * @param compactData 传递给钩子的压缩数据
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 包含可选 newCustomInstructions 和 userDisplayMessage 的对象
 */
export async function executePreCompactHooks(
  compactData: {
    trigger: 'manual' | 'auto'
    customInstructions: string | null
  },
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<{
  newCustomInstructions?: string
  userDisplayMessage?: string
}> {
  const hookInput: PreCompactHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'PreCompact',
    trigger: compactData.trigger,
    custom_instructions: compactData.customInstructions,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: compactData.trigger,
    signal,
    timeoutMs,
  })

  if (results.length === 0) {
    return {}
  }

  // 从具有非空输出的成功钩子中提取自定义指令
  const successfulOutputs = results
    .filter(result => result.succeeded && result.output.trim().length > 0)
    .map(result => result.output.trim())

  // 使用命令信息构建用户显示消息
  const displayMessages: string[] = []
  for (const result of results) {
    if (result.succeeded) {
      if (result.output.trim()) {
        displayMessages.push(
          `PreCompact [${result.command}] 完成: ${result.output.trim()}`,
        )
      } else {
        displayMessages.push(
          `PreCompact [${result.command}] 完成`,
        )
      }
    } else {
      if (result.output.trim()) {
        displayMessages.push(
          `PreCompact [${result.command}] 失败: ${result.output.trim()}`,
        )
      } else {
        displayMessages.push(`PreCompact [${result.command}] 失败`)
      }
    }
  }

  return {
    newCustomInstructions:
      successfulOutputs.length > 0 ? successfulOutputs.join('\n\n') : undefined,
    userDisplayMessage:
      displayMessages.length > 0 ? displayMessages.join('\n') : undefined,
  }
}

/**
 * 执行压缩后钩子（如果已配置）
 * @param compactData 传递给钩子的压缩数据，包括摘要
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 包含可选的 userDisplayMessage 的对象
 */
export async function executePostCompactHooks(
  compactData: {
    trigger: 'manual' | 'auto'
    compactSummary: string
  },
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<{
  userDisplayMessage?: string
}> {
  const hookInput: PostCompactHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'PostCompact',
    trigger: compactData.trigger,
    compact_summary: compactData.compactSummary,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: compactData.trigger,
    signal,
    timeoutMs,
  })

  if (results.length === 0) {
    return {}
  }

  const displayMessages: string[] = []
  for (const result of results) {
    if (result.succeeded) {
      if (result.output.trim()) {
        displayMessages.push(
          `PostCompact [${result.command}] 完成: ${result.output.trim()}`,
        )
      } else {
        displayMessages.push(
          `PostCompact [${result.command}] 完成`,
        )
      }
    } else {
      if (result.output.trim()) {
        displayMessages.push(
          `PostCompact [${result.command}] 失败: ${result.output.trim()}`,
        )
      } else {
        displayMessages.push(`PostCompact [${result.command}] 失败`)
      }
    }
  }

  return {
    userDisplayMessage:
      displayMessages.length > 0 ? displayMessages.join('\n') : undefined,
  }
}

/**
 * 执行会话结束钩子（如果已配置）
 * @param reason 结束会话的原因
 * @param options 可选参数，包括应用状态函数和 signal
 * @returns 当所有钩子完成时解析的 Promise
 */
export async function executeSessionEndHooks(
  reason: ExitReason,
  options?: {
    getAppState?: () => AppState
    setAppState?: (updater: (prev: AppState) => AppState) => void
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<void> {
  const {
    getAppState,
    setAppState,
    signal,
    timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  } = options || {}

  const hookInput: SessionEndHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'SessionEnd',
    reason,
  }

  const results = await executeHooksOutsideREPL({
    getAppState,
    hookInput,
    matchQuery: reason,
    signal,
    timeoutMs,
  })

  // 关闭期间，Ink 已卸载，因此我们可以直接写入 stderr
  for (const result of results) {
    if (!result.succeeded && result.output) {
      process.stderr.write(
        `SessionEnd hook [${result.command}] failed: ${result.output}\n`,
      )
    }
  }

  // 执行后清除会话钩子
  if (setAppState) {
    const sessionId = getSessionId()
    clearSessionHooks(setAppState, sessionId)
  }
}

/**
 * 执行权限请求钩子（如果已配置）
 * 当权限对话框将要显示给用户时调用这些钩子。
 * 钩子可以编程方式批准或拒绝权限请求。
 * @param toolName 请求权限的工具名称
 * @param toolUseID 工具使用的 ID
 * @param toolInput 将传递给工具的输入
 * @param toolUseContext 请求的 ToolUseContext
 * @param permissionMode 可选的权限模式，来自 toolPermissionContext
 * @param permissionSuggestions 可选的权限建议（"始终允许"选项）
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 生成进度消息并返回聚合结果的异步生成器
 */
export async function* executePermissionRequestHooks<ToolInput>(
  toolName: string,
  toolUseID: string,
  toolInput: ToolInput,
  toolUseContext: ToolUseContext,
  permissionMode?: string,
  permissionSuggestions?: PermissionUpdate[],
  signal?: AbortSignal,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>,
  toolInputSummary?: string | null,
): AsyncGenerator<AggregatedHookResult> {
  logForDebugging(`executePermissionRequestHooks 为工具调用: ${toolName}`)

  const hookInput: PermissionRequestHookInput = {
    ...createBaseHookInput(permissionMode, undefined, toolUseContext),
    hook_event_name: 'PermissionRequest',
    tool_name: toolName,
    tool_input: toolInput,
    permission_suggestions: permissionSuggestions,
  }

  yield* executeHooks({
    hookInput,
    toolUseID,
    matchQuery: toolName,
    signal,
    timeoutMs,
    toolUseContext,
    requestPrompt,
    toolInputSummary,
  })
}

/** 配置变更的来源类型 */
export type ConfigChangeSource =
  | 'user_settings'
  | 'project_settings'
  | 'local_settings'
  | 'policy_settings'
  | 'skills'

/**
 * 当配置在会话期间发生更改时执行配置更改钩子。
 * 由文件监视器在设置、技能或命令在磁盘上发生更改时触发。
 * 使企业管理员能够审计/记录配置更改以确保安全。
 *
 * 策略设置由企业管理，绝不能可被钩子阻塞。
 * 钩子仍然触发（用于审计日志记录），但阻塞结果会被忽略——调用者
 * 将始终看到策略来源的空结果。
 *
 * @param source 发生更改的配置类型
 * @param filePath 可选的更改文件的路径
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 */
export async function executeConfigChangeHooks(
  source: ConfigChangeSource,
  filePath?: string,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<HookOutsideReplResult[]> {
  const hookInput: ConfigChangeHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'ConfigChange',
    source,
    file_path: filePath,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: source,
  })

  // 策略设置由企业管理——钩子触发用于审计日志记录
  // 但绝不能阻止策略变更的生效
  if (source === 'policy_settings') {
    return results.map(r => ({ ...r, blocked: false }))
  }

  return results
}

async function executeEnvHooks(
  hookInput: HookInput,
  timeoutMs: number,
): Promise<{
  results: HookOutsideReplResult[]
  watchPaths: string[]
  systemMessages: string[]
}> {
  const results = await executeHooksOutsideREPL({ hookInput, timeoutMs })
  if (results.length > 0) {
    invalidateSessionEnvCache()
  }
  const watchPaths = results.flatMap(r => r.watchPaths ?? [])
  const systemMessages = results
    .map(r => r.systemMessage)
    .filter((m): m is string => !!m)
  return { results, watchPaths, systemMessages }
}

export function executeCwdChangedHooks(
  oldCwd: string,
  newCwd: string,
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<{
  results: HookOutsideReplResult[]
  watchPaths: string[]
  systemMessages: string[]
}> {
  const hookInput: CwdChangedHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'CwdChanged',
    old_cwd: oldCwd,
    new_cwd: newCwd,
  }
  return executeEnvHooks(hookInput, timeoutMs)
}

export function executeFileChangedHooks(
  filePath: string,
  event: 'change' | 'add' | 'unlink',
  timeoutMs: number = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
): Promise<{
  results: HookOutsideReplResult[]
  watchPaths: string[]
  systemMessages: string[]
}> {
  const hookInput: FileChangedHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'FileChanged',
    file_path: filePath,
    event,
  }
  return executeEnvHooks(hookInput, timeoutMs)
}

/** 指令加载原因类型 */
export type InstructionsLoadReason =
  | 'session_start'
  | 'nested_traversal'
  | 'path_glob_match'
  | 'include'
  | 'compact'

/** 指令记忆类型 */
export type InstructionsMemoryType = 'User' | 'Project' | 'Local' | 'Managed'

/**
 * 检查是否配置了 InstructionsLoaded 钩子（但不执行它们）。
 * 调用者应在调用 executeInstructionsLoadedHooks 之前检查此项，以避免
 * 在没有配置钩子时为每个指令文件构建钩子输入。
 *
 * 检查设置文件钩子（getHooksConfigFromSnapshot）和注册的
 * 钩子（插件钩子 + 通过 registerHookCallbacks 的 SDK 回调钩子）。会话派生的
 * 钩子（结构化输出强制等）是内部的，不进行检查。
 */
export function hasInstructionsLoadedHook(): boolean {
  const snapshotHooks = getHooksConfigFromSnapshot()?.['InstructionsLoaded']
  if (snapshotHooks && snapshotHooks.length > 0) return true
  const registeredHooks = getRegisteredHooks()?.['InstructionsLoaded']
  if (registeredHooks && registeredHooks.length > 0) return true
  return false
}

/**
 * 当指令文件（CLAUDE.md 或 .claude/rules/*.md）被加载到上下文时执行
 * InstructionsLoaded 钩子。即发即弃——此钩子仅用于可观测性/审计，不支持阻塞。
 *
 * 调度点：
 * - 会话开始时急切加载（claudemd.ts 中的 getMemoryFiles）
 * - 压缩后急切重新加载（getMemoryFiles 缓存由 runPostCompactCleanup 清除；
 *   下次调用报告 load_reason: 'compact'）
 * - 当 Claude 触及触发嵌套 CLAUDE.md 或带路径的条件规则的文件时延迟加载：
 *   frontmatter（attachments.ts 中的 memoryFilesToAttachments）
 */
export async function executeInstructionsLoadedHooks(
  filePath: string,
  memoryType: InstructionsMemoryType,
  loadReason: InstructionsLoadReason,
  options?: {
    globs?: string[]
    triggerFilePath?: string
    parentFilePath?: string
    timeoutMs?: number
  },
): Promise<void> {
  const {
    globs,
    triggerFilePath,
    parentFilePath,
    timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  } = options ?? {}

  const hookInput: InstructionsLoadedHookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'InstructionsLoaded',
    file_path: filePath,
    memory_type: memoryType,
    load_reason: loadReason,
    globs,
    trigger_file_path: triggerFilePath,
    parent_file_path: parentFilePath,
  }

  await executeHooksOutsideREPL({
    hookInput,
    timeoutMs,
    matchQuery: loadReason,
  })
}

/** 启发式钩子执行的结果（非 REPL 路径）。 */
export type ElicitationHookResult = {
  elicitationResponse?: ElicitationResponse
  blockingError?: HookBlockingError
}

/** 启发式结果钩子执行的结果（非 REPL 路径）。 */
export type ElicitationResultHookResult = {
  elicitationResultResponse?: ElicitationResponse
  blockingError?: HookBlockingError
}

/**
 * 从 HookOutsideReplResult 解析启发式钩子特有的字段。
 * 镜像 processHookJSONOutput 中与 Elicitation
 * 和 ElicitationResult 钩子事件相关的分支。
 */
function parseElicitationHookOutput(
  result: HookOutsideReplResult,
  expectedEventName: 'Elicitation' | 'ElicitationResult',
): {
  response?: ElicitationResponse
  blockingError?: HookBlockingError
} {
  // 退出码 2 = 阻塞（与 executeHooks 路径相同）
  if (result.blocked && !result.succeeded) {
    return {
      blockingError: {
        blockingError: result.output || `Elicitation blocked by hook`,
        command: result.command,
      },
    }
  }

  if (!result.output.trim()) {
    return {}
  }

  // 尝试解析 JSON 输出以获取结构化的启发式响应
  const trimmed = result.output.trim()
  if (!trimmed.startsWith('{')) {
    return {}
  }

  try {
    const parsed = hookJSONOutputSchema().parse(JSON.parse(trimmed))
    if (isAsyncHookJSONOutput(parsed)) {
      return {}
    }
    if (!isSyncHookJSONOutput(parsed)) {
      return {}
    }

    // 检查顶层决策：'block'（退出码 0 + JSON block）
    if (parsed.decision === 'block' || result.blocked) {
      return {
        blockingError: {
          blockingError: parsed.reason || 'Elicitation blocked by hook',
          command: result.command,
        },
      }
    }

    const specific = parsed.hookSpecificOutput
    if (!specific || specific.hookEventName !== expectedEventName) {
      return {}
    }

    if (!specific.action) {
      return {}
    }

    const response: ElicitationResponse = {
      action: specific.action,
      content: specific.content as ElicitationResponse['content'] | undefined,
    }

    const out: {
      response?: ElicitationResponse
      blockingError?: HookBlockingError
    } = { response }

    // 'decline' 操作表示钩子拒绝了启发式请求
    if (specific.action === 'decline') {
      out.blockingError = {
        blockingError:
          parsed.reason ||
          (expectedEventName === 'Elicitation'
            ? '启发式被钩子拒绝'
            : '启发式结果被钩子阻塞'),
        command: result.command,
      }
    }

    return out
  } catch {
    return {}
  }
}

export async function executeElicitationHooks({
  serverName,
  message,
  requestedSchema,
  permissionMode,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  mode,
  url,
  elicitationId,
}: {
  serverName: string
  message: string
  requestedSchema?: Record<string, unknown>
  permissionMode?: string
  signal?: AbortSignal
  timeoutMs?: number
  mode?: 'form' | 'url'
  url?: string
  elicitationId?: string
}): Promise<ElicitationHookResult> {
  const hookInput: ElicitationHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'Elicitation',
    mcp_server_name: serverName,
    message,
    mode,
    url,
    elicitation_id: elicitationId,
    requested_schema: requestedSchema,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: serverName,
    signal,
    timeoutMs,
  })

  let elicitationResponse: ElicitationResponse | undefined
  let blockingError: HookBlockingError | undefined

  for (const result of results) {
    const parsed = parseElicitationHookOutput(result, 'Elicitation')
    if (parsed.blockingError) {
      blockingError = parsed.blockingError
    }
    if (parsed.response) {
      elicitationResponse = parsed.response
    }
  }

  return { elicitationResponse, blockingError }
}

export async function executeElicitationResultHooks({
  serverName,
  action,
  content,
  permissionMode,
  signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  mode,
  elicitationId,
}: {
  serverName: string
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
  permissionMode?: string
  signal?: AbortSignal
  timeoutMs?: number
  mode?: 'form' | 'url'
  elicitationId?: string
}): Promise<ElicitationResultHookResult> {
  const hookInput: ElicitationResultHookInput = {
    ...createBaseHookInput(permissionMode),
    hook_event_name: 'ElicitationResult',
    mcp_server_name: serverName,
    elicitation_id: elicitationId,
    mode,
    action,
    content,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    matchQuery: serverName,
    signal,
    timeoutMs,
  })

  let elicitationResultResponse: ElicitationResponse | undefined
  let blockingError: HookBlockingError | undefined

  for (const result of results) {
    const parsed = parseElicitationHookOutput(result, 'ElicitationResult')
    if (parsed.blockingError) {
      blockingError = parsed.blockingError
    }
    if (parsed.response) {
      elicitationResultResponse = parsed.response
    }
  }

  return { elicitationResultResponse, blockingError }
}

/**
 * 执行状态栏命令（如果已配置）
 * @param statusLineInput 将转换为 JSON 的结构化状态输入
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 要显示的状态栏文本，未配置命令时返回空
 */
export async function executeStatusLineCommand(
  statusLineInput: StatusLineCommandInput,
  signal?: AbortSignal,
  timeoutMs: number = 5000, // 状态栏的短超时
  logResult: boolean = false,
): Promise<string | undefined> {
  // 检查所有钩子（包括 statusLine）是否被托管设置禁用
  if (shouldDisableAllHooksIncludingManaged()) {
    return undefined
  }

  // 安全：所有钩子在交互模式下都需要工作区信任
  // 此集中式检查防止所有当前和未来钩子的 RCE 漏洞
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `跳过 StatusLine 命令执行 - 工作区信任未接受`,
    )
    return undefined
  }

  // 当在非托管设置中设置 disableAllHooks 时，仅托管 statusLine 运行
  //（非托管设置无法禁用托管命令，但非托管命令会被禁用）
  let statusLine = null
  if (shouldAllowManagedHooksOnly()) {
    statusLine = getSettingsForSource('policySettings')?.statusLine
  } else {
    statusLine = getSettings_DEPRECATED()?.statusLine
  }

  // DOGE: 默认使用内置 status-line.js（无需用户配置 ~/.claude/settings.json）
  if (!statusLine || statusLine.type !== 'command') {
    // 使用 import.meta.url 定位 status-line.js 的绝对路径（与 hooks.ts 同目录）
    const statusLinePath = new URL('status-line.js', import.meta.url).pathname
    statusLine = { type: 'command' as const, command: `node "${statusLinePath}"` as const }
  }

  // 使用提供的 signal 或创建默认的 signal
  const abortSignal = signal || AbortSignal.timeout(timeoutMs)

  try {
    // 将状态输入转换为 JSON
    const jsonInput = jsonStringify(statusLineInput)

    const result = await execCommandHook(
      statusLine,
      'StatusLine',
      'statusLine',
      jsonInput,
      abortSignal,
      randomUUID(),
    )

    if (result.aborted) {
      return undefined
    }

    // 对于成功的钩子（退出码 0），使用 stdout
    if (result.status === 0) {
      // 修剪输出并按行分割，然后用换行符连接
      const output = result.stdout
        .trim()
        .split('\n')
        .flatMap(line => line.trim() || [])
        .join('\n')

      if (output) {
        if (logResult) {
          logForDebugging(
            `StatusLine [${statusLine.command}] 完成，状态 ${result.status}`,
          )
        }
        return output
      }
    } else if (logResult) {
      logForDebugging(
        `StatusLine [${statusLine.command}] 完成，状态 ${result.status}`,
        { level: 'warn' },
      )
    }

    return undefined
  } catch (error) {
    logForDebugging(`Status 钩子失败: ${error}`, { level: 'error' })
    return undefined
  }
}

/**
 * 执行文件建议命令（如果已配置）
 * @param fileSuggestionInput 将转换为 JSON 的结构化输入
 * @param signal 可选的 AbortSignal，用于取消钩子执行
 * @param timeoutMs 可选的钩子执行超时时间（毫秒）
 * @returns 文件路径数组，如果未配置命令则返回空数组
 */
export async function executeFileSuggestionCommand(
  fileSuggestionInput: FileSuggestionCommandInput,
  signal?: AbortSignal,
  timeoutMs: number = 5000, // 输入提示建议的短超时
): Promise<string[]> {
  // 检查所有钩子是否被托管设置禁用
  if (shouldDisableAllHooksIncludingManaged()) {
    return []
  }

  // 安全：所有钩子在交互模式下都需要工作区信任
  // 此集中式检查防止所有当前和未来钩子的 RCE 漏洞
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `跳过 FileSuggestion 命令执行 - 工作区信任未接受`,
    )
    return []
  }

  // 当在非托管设置中设置 disableAllHooks 时，仅托管 fileSuggestion 运行
  //（非托管设置无法禁用托管命令，但非托管命令会被禁用）
  let fileSuggestion
  if (shouldAllowManagedHooksOnly()) {
    fileSuggestion = getSettingsForSource('policySettings')?.fileSuggestion
  } else {
    fileSuggestion = getSettings_DEPRECATED()?.fileSuggestion
  }

  if (!fileSuggestion || fileSuggestion.type !== 'command') {
    return []
  }

  // 使用提供的 signal 或创建默认的 signal
  const abortSignal = signal || AbortSignal.timeout(timeoutMs)

  try {
    const jsonInput = jsonStringify(fileSuggestionInput)

    const hook = { type: 'command' as const, command: fileSuggestion.command }

    const result = await execCommandHook(
      hook,
      'FileSuggestion',
      'FileSuggestion',
      jsonInput,
      abortSignal,
      randomUUID(),
    )

    if (result.aborted || result.status !== 0) {
      return []
    }

    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  } catch (error) {
    logForDebugging(`文件建议辅助函数失败: ${error}`, {
      level: 'error',
    })
    return []
  }
}

async function executeFunctionHook({
  hook,
  messages,
  hookName,
  toolUseID,
  hookEvent,
  timeoutMs,
  signal,
}: {
  hook: FunctionHook
  messages: Message[]
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  timeoutMs: number
  signal?: AbortSignal
}): Promise<HookResult> {
  const callbackTimeoutMs = hook.timeout ?? timeoutMs
  const { signal: abortSignal, cleanup } = createCombinedAbortSignal(signal, {
    timeoutMs: callbackTimeoutMs,
  })

  try {
    // 检查是否已中止
    if (abortSignal.aborted) {
      cleanup()
      return {
        outcome: 'cancelled',
        hook,
      }
    }

    // 使用中止信号执行回调
    const passed = await new Promise<boolean>((resolve, reject) => {
      // 处理中止信号
      const onAbort = () => reject(new Error('函数钩子已取消'))
      abortSignal.addEventListener('abort', onAbort)

      // 执行回调
      Promise.resolve(hook.callback(messages, abortSignal))
        .then(result => {
          abortSignal.removeEventListener('abort', onAbort)
          resolve(result)
        })
        .catch(error => {
          abortSignal.removeEventListener('abort', onAbort)
          reject(error)
        })
    })

    cleanup()

    if (passed) {
      return {
        outcome: 'success',
        hook,
      }
    }
    return {
      blockingError: {
        blockingError: hook.errorMessage,
        command: 'function',
      },
      outcome: 'blocking',
      hook,
    }
  } catch (error) {
    cleanup()

    // 处理取消
    if (
      error instanceof Error &&
      (error.message === '函数钩子已取消' ||
        error.name === 'AbortError')
    ) {
      return {
        outcome: 'cancelled',
        hook,
      }
    }

    // 记录日志以便监控
    logError(error)
    return {
      message: createAttachmentMessage({
        type: 'hook_error_during_execution',
        hookName,
        toolUseID,
        hookEvent,
        content:
          error instanceof Error
            ? error.message
            : '函数钩子执行错误',
      }),
      outcome: 'non_blocking_error',
      hook,
    }
  }
}

async function executeHookCallback({
  toolUseID,
  hook,
  hookEvent,
  hookInput,
  signal,
  hookIndex,
  toolUseContext,
}: {
  toolUseID: string
  hook: HookCallback
  hookEvent: HookEvent
  hookInput: HookInput
  signal: AbortSignal
  hookIndex?: number
  toolUseContext?: ToolUseContext
}): Promise<HookResult> {
  // 为需要状态访问的回调创建上下文
  const context = toolUseContext
    ? {
        getAppState: toolUseContext.getAppState,
        updateAttributionState: toolUseContext.updateAttributionState,
      }
    : undefined
  const json = await hook.callback(
    hookInput,
    toolUseID,
    signal,
    hookIndex,
    context,
  )
  if (isAsyncHookJSONOutput(json)) {
    return {
      outcome: 'success',
      hook,
    }
  }

  const processed = processHookJSONOutput({
    json,
    command: 'callback',
    // TODO: 如果钩子来自插件，使用插件的完整路径以便于调试
    hookName: `${hookEvent}:Callback`,
    toolUseID,
    hookEvent,
    expectedHookEvent: hookEvent,
    // 回调没有 stdout/stderr/exitCode
    stdout: undefined,
    stderr: undefined,
    exitCode: undefined,
  })
  return {
    ...processed,
    outcome: 'success',
    hook,
  }
}

/**
 * 检查是否配置了 WorktreeCreate 钩子（但不执行它们）。
 *
 * 检查设置文件钩子（getHooksConfigFromSnapshot）和注册的
 * 钩子（插件钩子 + 通过 registerHookCallbacks 的 SDK 回调钩子）。
 *
 * 必须镜像 getHooksConfig() 中的 managedOnly 过滤——当
 * shouldAllowManagedHooksOnly() 为 true 时，插件钩子（设置了 pluginRoot）
 * 在执行时被跳过，因此我们在这里也必须跳过它们。否则此函数返回
 * true 但 executeWorktreeCreateHook() 找不到匹配的钩子并抛出异常，
 * 阻塞 git-worktree 回退。
 */
export function hasWorktreeCreateHook(): boolean {
  const snapshotHooks = getHooksConfigFromSnapshot()?.['WorktreeCreate']
  if (snapshotHooks && snapshotHooks.length > 0) return true
  const registeredHooks = getRegisteredHooks()?.['WorktreeCreate']
  if (!registeredHooks || registeredHooks.length === 0) return false
  // 镜像 getHooksConfig()：在仅托管模式下跳过插件钩子
  const managedOnly = shouldAllowManagedHooksOnly()
  return registeredHooks.some(
    matcher => !(managedOnly && 'pluginRoot' in matcher),
  )
}

/**
 * 执行 WorktreeCreate 钩子。
 * 从钩子 stdout 返回工作树路径。
 * 如果钩子失败或没有输出则抛出异常。
 * 调用者应在调用此函数之前检查 hasWorktreeCreateHook()。
 */
export async function executeWorktreeCreateHook(
  name: string,
): Promise<{ worktreePath: string }> {
  const hookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'WorktreeCreate' as const,
    name,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  })

  // 查找第一个具有非空输出的成功结果
  const successfulResult = results.find(
    r => r.succeeded && r.output.trim().length > 0,
  )

  if (!successfulResult) {
    const failedOutputs = results
      .filter(r => !r.succeeded)
      .map(r => `${r.command}: ${r.output.trim() || '无输出'}`)
    throw new Error(
      `WorktreeCreate 钩子失败：${failedOutputs.join('; ') || '无成功输出'}`,
    )
  }

  const worktreePath = successfulResult.output.trim()
  return { worktreePath }
}

/**
 * 执行 WorktreeRemove 钩子（如果已配置）。
 * 如果钩子已配置并运行则返回 true，如果未配置钩子则返回 false。
 *
 * 检查设置文件钩子（getHooksConfigFromSnapshot）和注册的
 * 钩子（插件钩子 + 通过 registerHookCallbacks 的 SDK 回调钩子）。
 */
export async function executeWorktreeRemoveHook(
  worktreePath: string,
): Promise<boolean> {
  const snapshotHooks = getHooksConfigFromSnapshot()?.['WorktreeRemove']
  const registeredHooks = getRegisteredHooks()?.['WorktreeRemove']
  const hasSnapshotHooks = snapshotHooks && snapshotHooks.length > 0
  const hasRegisteredHooks = registeredHooks && registeredHooks.length > 0
  if (!hasSnapshotHooks && !hasRegisteredHooks) {
    return false
  }

  const hookInput = {
    ...createBaseHookInput(undefined),
    hook_event_name: 'WorktreeRemove' as const,
    worktree_path: worktreePath,
  }

  const results = await executeHooksOutsideREPL({
    hookInput,
    timeoutMs: TOOL_HOOK_EXECUTION_TIMEOUT_MS,
  })

  if (results.length === 0) {
    return false
  }

  for (const result of results) {
    if (!result.succeeded) {
      logForDebugging(
        `WorktreeRemove 钩子失败 [${result.command}]: ${result.output.trim()}`,
        { level: 'error' },
      )
    }
  }

  return true
}

function getHookDefinitionsForTelemetry(
  matchedHooks: MatchedHook[],
): Array<{ type: string; command?: string; prompt?: string; name?: string }> {
  return matchedHooks.map(({ hook }) => {
    if (hook.type === 'command') {
      return { type: 'command', command: hook.command }
    } else if (hook.type === 'prompt') {
      return { type: 'prompt', prompt: hook.prompt }
    } else if (hook.type === 'http') {
      return { type: 'http', command: hook.url }
    } else if (hook.type === 'function') {
      return { type: 'function', name: 'function' }
    } else if (hook.type === 'callback') {
      return { type: 'callback', name: 'callback' }
    }
    return { type: 'unknown' }
  })
}
