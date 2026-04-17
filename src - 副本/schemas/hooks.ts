/**
 * Hook Zod schemas extracted to break import cycles.
 *
 * This file contains hook-related schema definitions that were originally
 * in src/utils/settings/types.ts. By extracting them here, we break the
 * circular dependency between settings/types.ts and plugins/schemas.ts.
 *
 * Both files now import from this shared location instead of each other.
 */

import { HOOK_EVENTS, type HookEvent } from '../entrypoints/agentSdkTypes.js'
import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'
import { SHELL_TYPES } from '../utils/shell/shellProvider.js'

// Shared schema for the `if` condition field.
// Uses permission rule syntax (e.g., "Bash(git *)", "Read(*.ts)") to filter hooks
// before spawning. Evaluated against the hook input's tool_name and tool_input.
const IfConditionSchema = lazySchema(() =>
  z
    .string()
    .optional()
    .describe(
      '权限规则语法，用于过滤钩子运行时机（例如："Bash(git *)"）。' +
        '仅当工具调用匹配模式时才执行。避免为非匹配命令启动钩子。',
    ),
)

// Internal factory for individual hook schemas (shared between exported
// discriminated union members and the HookCommandSchema factory)
function buildHookSchemas() {
  const BashCommandHookSchema = z.object({
    type: z.literal('command').describe('Shell 命令钩子类型'),
    command: z.string().describe('要执行的 Shell 命令'),
    if: IfConditionSchema(),
    shell: z
      .enum(SHELL_TYPES)
      .optional()
      .describe(
        "Shell 解释器。'bash'使用你的 $SHELL (bash/zsh/sh); 'powershell'使用 pwsh。默认为 bash。",
      ),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('此命令的超时时间（秒）'),
    statusMessage: z
      .string()
      .optional()
      .describe('钩子运行时的自定义状态消息'),
    once: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子运行一次后在执行后移除'),
    async: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子在后台运行而不阻塞'),
    asyncRewake: z
      .boolean()
      .optional()
      .describe(
        '如果为 true，钩子在后台运行并在退出码 2（阻塞错误）时唤醒模型。隐含异步执行。',
      ),
  })

  const PromptHookSchema = z.object({
    type: z.literal('prompt').describe('LLM 提示词钩子类型'),
    prompt: z
      .string()
      .describe(
        '使用 LLM 评估的提示词。在钩子输入 JSON 中使用 $ARGUMENTS 占位符。',
      ),
    if: IfConditionSchema(),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('此特定提示词评估的超时时间（秒）'),
    // @[MODEL LAUNCH]: Update the example model ID in the .describe() strings below (prompt + agent hooks).
    model: z
      .string()
      .optional()
      .describe(
        '此提示词钩子使用的模型（如 "claude-sonnet-4-6"）。如果不指定，使用默认的小型快速模型。',
      ),
    statusMessage: z
      .string()
      .optional()
      .describe('钩子运行时在旋转加载器中显示的自定义状态消息'),
    once: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子运行一次后在执行后移除'),
  })

  const HttpHookSchema = z.object({
    type: z.literal('http').describe('HTTP 钩子类型'),
    url: z.string().url().describe('要 POST 钩子输入 JSON 的 URL'),
    if: IfConditionSchema(),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('Timeout in seconds for this specific request'),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Additional headers to include in the request. Values may reference environment variables using $VAR_NAME or ${VAR_NAME} syntax (e.g., "Authorization": "Bearer $MY_TOKEN"). Only variables listed in allowedEnvVars will be interpolated.',
      ),
    allowedEnvVars: z
      .array(z.string())
      .optional()
      .describe(
        '可在头部值中插值的明文环境变量名称列表。只有列在此处的变量才会被解析；其他所有 $VAR 引用都将保留为空字符串。这是环境变量插值工作所必需的。',
      ),
    statusMessage: z
      .string()
      .optional()
      .describe('钩子运行时在旋转加载器中显示的自定义状态消息'),
    once: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子运行一次后在执行后移除'),
  })

  const AgentHookSchema = z.object({
    type: z.literal('agent').describe('智能体验证钩子类型'),
    // DO NOT add .transform() here. This schema is used by parseSettingsFile,
    // and updateSettingsForSource round-trips the parsed result through
    // JSON.stringify — a transformed function value is silently dropped,
    // deleting the user's prompt from settings.json (gh-24920, CC-79). The
    // transform (from #10594) wrapped the string in `(_msgs) => prompt`
    // for a programmatic-construction use case in ExitPlanModeV2Tool that
    // has since been refactored into VerifyPlanExecutionTool, which no
    // longer constructs AgentHook objects at all.
    prompt: z
      .string()
      .describe(
        'Prompt describing what to verify (e.g. "Verify that unit tests ran and passed."). Use $ARGUMENTS placeholder for hook input JSON.',
      ),
    if: IfConditionSchema(),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('Timeout in seconds for agent execution (default 60)'),
    model: z
      .string()
      .optional()
      .describe(
        'Model to use for this agent hook (e.g., "claude-sonnet-4-6"). If not specified, uses Haiku.',
      ),
    statusMessage: z
      .string()
      .optional()
      .describe('Custom status message to display in spinner while hook runs'),
    once: z
      .boolean()
      .optional()
      .describe('If true, hook runs once and is removed after execution'),
  })

  return {
    BashCommandHookSchema,
    PromptHookSchema,
    HttpHookSchema,
    AgentHookSchema,
  }
}

/**
 * Schema for hook command (excludes function hooks - they can't be persisted)
 */
export const HookCommandSchema = lazySchema(() => {
  const {
    BashCommandHookSchema,
    PromptHookSchema,
    AgentHookSchema,
    HttpHookSchema,
  } = buildHookSchemas()
  return z.discriminatedUnion('type', [
    BashCommandHookSchema,
    PromptHookSchema,
    AgentHookSchema,
    HttpHookSchema,
  ])
})

/**
 * Schema for matcher configuration with multiple hooks
 */
export const HookMatcherSchema = lazySchema(() =>
  z.object({
    matcher: z
      .string()
      .optional()
      .describe('要匹配的字符串模式（例如工具名 "Write"）'), // String (e.g. Write) to match values related to the hook event, e.g. tool names
    hooks: z
      .array(HookCommandSchema())
      .describe('匹配器匹配时要执行的钩子列表'),
  }),
)

/**
 * Schema for hooks configuration
 * The key is the hook event. The value is an array of matcher configurations.
 * Uses partialRecord since not all hook events need to be defined.
 */
export const HooksSchema = lazySchema(() =>
  z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema())),
)

// Inferred types from schemas
export type HookCommand = z.infer<ReturnType<typeof HookCommandSchema>>
export type BashCommandHook = Extract<HookCommand, { type: 'command' }>
export type PromptHook = Extract<HookCommand, { type: 'prompt' }>
export type AgentHook = Extract<HookCommand, { type: 'agent' }>
export type HttpHook = Extract<HookCommand, { type: 'http' }>
export type HookMatcher = z.infer<ReturnType<typeof HookMatcherSchema>>
export type HooksSettings = Partial<Record<HookEvent, HookMatcher[]>>
