// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'
import {
  type HookEvent,
  HOOK_EVENTS,
  type HookInput,
  type PermissionUpdate,
} from '../entrypoints/agentSdkTypes.js'
import type {
  HookJSONOutput,
  AsyncHookJSONOutput,
  SyncHookJSONOutput,
} from '../entrypoints/agentSdkTypes.js'
import type { Message } from './types/message.js'
import type { PermissionResult } from '../utils/permissions/PermissionResult.js'
import { permissionBehaviorSchema } from '../utils/permissions/PermissionRule.js'
import { permissionUpdateSchema } from '../utils/permissions/PermissionUpdateSchema.js'
import type { AppState } from '../state/AppState.js'
import type { AttributionState } from '../utils/commitAttribution.js'

export function isHookEvent(value: string): value is HookEvent {
  return HOOK_EVENTS.includes(value as HookEvent)
}

// 提示提取协议类型。`prompt` 键作为鉴别器
// （镜像 {async:true} 模式），其值为 id。
export const promptRequestSchema = lazySchema(() =>
  z.object({
    prompt: z.string(), // request id
    message: z.string(),
    options: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().optional(),
      }),
    ),
  }),
)

export type PromptRequest = z.infer<ReturnType<typeof promptRequestSchema>>

/** 提示响应 */
export type PromptResponse = {
  prompt_response: string // 请求 ID
  selected: string
}

// 同步钩子响应架构
/** 同步钩子响应架构 */
export const syncHookResponseSchema = lazySchema(() =>
  z.object({
    continue: z
      .boolean()
      .describe('钩子执行后 Claude 是否继续（默认：true）')
      .optional(),
    suppressOutput: z
      .boolean()
      .describe('隐藏记录中的 stdout（默认：false）')
      .optional(),
    stopReason: z
      .string()
      .describe('continue 为 false 时显示的消息')
      .optional(),
    decision: z.enum(['approve', 'block']).optional(),
    reason: z.string().describe('决策的解释').optional(),
    systemMessage: z
      .string()
      .describe('显示给用户的警告消息')
      .optional(),
    hookSpecificOutput: z
      .union([
        z.object({
          hookEventName: z.literal('PreToolUse'),
          permissionDecision: permissionBehaviorSchema().optional(), // 权限决策结果
          permissionDecisionReason: z.string().optional(), // 权限决策原因
          updatedInput: z.record(z.string(), z.unknown()).optional(), // 更新后的输入
          additionalContext: z.string().optional(), // 额外上下文信息
        }),
        z.object({
          hookEventName: z.literal('UserPromptSubmit'),
          additionalContext: z.string().optional(), // 额外上下文信息
        }),
        z.object({
          hookEventName: z.literal('SessionStart'),
          additionalContext: z.string().optional(), // 会话开始时的额外上下文
          initialUserMessage: z.string().optional(),
          watchPaths: z
            .array(z.string())
            .describe('需要监控文件变更的绝对路径数组')
            .optional(),
        }),
        z.object({
          hookEventName: z.literal('Setup'),
          additionalContext: z.string().optional(), // 设置阶段的额外上下文信息
        }),
        z.object({
          hookEventName: z.literal('SubagentStart'),
          additionalContext: z.string().optional(), // 子代理启动时的额外上下文信息
        }),
        z.object({
          hookEventName: z.literal('PostToolUse'),
          additionalContext: z.string().optional(), // 工具使用后的额外上下文信息
          updatedMCPToolOutput: z
            .unknown()
            .describe('更新 MCP 工具的输出')
            .optional(),
        }),
        z.object({
          hookEventName: z.literal('PostToolUseFailure'),
          additionalContext: z.string().optional(), // 工具使用失败时的额外上下文信息
        }),
        z.object({
          hookEventName: z.literal('PermissionDenied'),
          retry: z.boolean().optional(), // 是否重试
        }),
        z.object({
          hookEventName: z.literal('Notification'),
          additionalContext: z.string().optional(),
        }),
        z.object({
          hookEventName: z.literal('PermissionRequest'),
          decision: z.union([ // 权限请求决策
            z.object({
              behavior: z.literal('allow'),
              updatedInput: z.record(z.string(), z.unknown()).optional(),
              updatedPermissions: z.array(permissionUpdateSchema()).optional(),
            }),
            z.object({
              behavior: z.literal('deny'),
              message: z.string().optional(),
              interrupt: z.boolean().optional(),
            }),
          ]),
        }),
        z.object({
          hookEventName: z.literal('Elicitation'),
          action: z.enum(['accept', 'decline', 'cancel']).optional(), // 用户操作结果
          content: z.record(z.string(), z.unknown()).optional()
        }),
        z.object({
          hookEventName: z.literal('ElicitationResult'),
          action: z.enum(['accept', 'decline', 'cancel']).optional(), // 用户最终操作结果
          content: z.record(z.string(), z.unknown()).optional()
        }),
        z.object({
          hookEventName: z.literal('CwdChanged'),
          watchPaths: z
            .array(z.string())
            .describe('需要监控工作目录变更的绝对路径数组')
            .optional(),
        }),
        z.object({
          hookEventName: z.literal('FileChanged'),
          watchPaths: z
            .array(z.string())
            .describe('需要监控文件变更的绝对路径数组')
            .optional(),
        }),
        z.object({
          hookEventName: z.literal('WorktreeCreate'),
          worktreePath: z.string() // 工作树创建路径
        }),
      ])
      .optional(),
  }),
)

// Zod schema for hook JSON output validation
export const hookJSONOutputSchema = lazySchema(() => {
  // Async hook response schema
  const asyncHookResponseSchema = z.object({
    async: z.literal(true),
    asyncTimeout: z.number().optional(),
  })
  return z.union([asyncHookResponseSchema, syncHookResponseSchema()])
})

// Infer the TypeScript type from the schema
type SchemaHookJSONOutput = z.infer<ReturnType<typeof hookJSONOutputSchema>>

// Type guard function to check if response is sync
export function isSyncHookJSONOutput(
  json: HookJSONOutput,
): json is SyncHookJSONOutput {
  return !('async' in json && json.async === true)
}

// Type guard function to check if response is async
export function isAsyncHookJSONOutput(
  json: HookJSONOutput,
): json is AsyncHookJSONOutput {
  return 'async' in json && json.async === true
}

// Compile-time assertion that SDK and Zod types match
import type { IsEqual } from 'type-fest'
type Assert<T extends true> = T
type _assertSDKTypesMatch = Assert<
  IsEqual<SchemaHookJSONOutput, HookJSONOutput>
>

/** 传递给回调钩子的状态访问上下文 */
export type HookCallbackContext = {
  getAppState: () => AppState
  updateAttributionState: (
    updater: (prev: AttributionState) => AttributionState,
  ) => void
}

/** 回调类型的钩子 */
export type HookCallback = {
  type: 'callback'
  callback: (
    input: HookInput,
    toolUseID: string | null,
    abort: AbortSignal | undefined,
    /** SessionStart 钩子的索引，用于计算 CLAUDE_ENV_FILE 路径 */
    hookIndex?: number,
    /** 可选的应用状态访问上下文 */
    context?: HookCallbackContext,
  ) => Promise<HookJSONOutput>
  /** 钩子超时时间（秒） */
  timeout?: number
  /** 内部钩子（如会话文件访问分析）不计入 tengu_run_hook 指标 */
  internal?: boolean
}

/** 钩子回调匹配器 */
export type HookCallbackMatcher = {
  matcher?: string
  hooks: HookCallback[]
  pluginName?: string
}

/** 钩子进度信息 */
export type HookProgress = {
  type: 'hook_progress'
  hookEvent: HookEvent
  hookName: string
  command: string
  promptText?: string
  statusMessage?: string
}

/** 钩子阻塞错误 */
export type HookBlockingError = {
  blockingError: string
  command: string
}

/** 权限请求结果 */
export type PermissionRequestResult =
  | {
      behavior: 'allow'
      updatedInput?: Record<string, unknown>
      updatedPermissions?: PermissionUpdate[]
    }
  | {
      behavior: 'deny'
      message?: string
      interrupt?: boolean
    }

/** 钩子结果类型 */
export type HookResult = {
  message?: Message
  systemMessage?: Message
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
  retry?: boolean
}

/** 聚合的钩子结果 */
export type AggregatedHookResult = {
  message?: Message
  blockingErrors?: HookBlockingError[]
  preventContinuation?: boolean
  stopReason?: string
  hookPermissionDecisionReason?: string
  permissionBehavior?: PermissionResult['behavior']
  additionalContexts?: string[]
  initialUserMessage?: string
  updatedInput?: Record<string, unknown>
  updatedMCPToolOutput?: unknown
  permissionRequestResult?: PermissionRequestResult
  retry?: boolean
}
