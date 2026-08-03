/**
 * 为打破导入循环而提取的 Hook Zod 模式定义。
 *
 * 该文件包含原本位于 src/utils/settings/types.ts 中的钩子相关模式定义。
 * 提取到此处以打破 settings/types.ts 和 plugins/schemas.ts 之间的循环依赖。
 *
 * 两个文件现在都从此共享位置导入，而不是相互导入。
 */

import { HOOK_EVENTS, type HookEvent } from '../entrypoints/agentSdkTypes.js'
import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'
import { SHELL_TYPES } from '../utils/shell/shellProvider.js'

// `if` 条件字段的共享模式。
// 使用权限规则语法（例如 "Bash(git *)"、"Read(*.ts)"）在生成前过滤钩子。
// 根据钩子输入的 tool_name 和 tool_input 进行评估。
const IfConditionSchema = lazySchema(() =>
  z
    .string()
    .optional()
    .describe(
      '权限规则语法，用于过滤钩子运行时（例如 "Bash(git *)"）。' +
        '仅当工具调用匹配模式时才执行。避免为非匹配命令启动钩子。',
    ),
)

// 单个钩子模式的内部工厂（供导出的区分联合成员和 HookCommandSchema 工厂共享）
function buildHookSchemas() {
  const BashCommandHookSchema = z.object({
    type: z.literal('command').describe('Shell 命令钩子类型'),
    command: z.string().describe('要执行的 Shell 命令'),
    if: IfConditionSchema(),
    shell: z
      .enum(SHELL_TYPES)
      .optional()
      .describe(
        "Shell 解释器。'bash' 使用你的 $SHELL (bash/zsh/sh)；'powershell' 使用 pwsh。默认为 bash。",
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
      .describe('如果为 true，钩子运行一次后执行后移除'),
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
    // @[MODEL LAUNCH]：更新下方 .describe() 字符串中的示例模型 ID（提示词 + 代理钩子）。
    model: z
      .string()
      .optional()
      .describe(
        '此提示词钩子使用的模型（如 "claude-sonnet-4-6"）。如果不指定，则使用默认的轻量快速模型。',
      ),
    statusMessage: z
      .string()
      .optional()
      .describe('钩子运行时在旋转加载器中显示的自定义状态消息'),
    once: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子运行一次后执行后移除'),
  })

  const HttpHookSchema = z.object({
    type: z.literal('http').describe('HTTP 钩子类型'),
    url: z.string().url().describe('要 POST 钩子输入 JSON 的 URL'),
    if: IfConditionSchema(),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('此特定请求的超时时间（秒）'),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        '请求中包含的额外头部。值可以使用 $VAR_NAME 或 ${VAR_NAME} 语法引用环境变量（例如 "Authorization": "Bearer $MY_TOKEN"）。只有 allowedEnvVars 中列出的变量才会被插值。',
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
      .describe('如果为 true，钩子运行一次后执行后移除'),
  })

  const AgentHookSchema = z.object({
    type: z.literal('agent').describe('智能体验证钩子类型'),
    // 不要在此处添加 .transform()。该模式由 parseSettingsFile 使用，
    // 并且 updateSettingsForSource 会通过 JSON.stringify 往返处理解析结果——
    // 转换后的函数值会被静默丢弃，从而从 settings.json 中删除用户的提示词
    // （gh-24920, CC-79）。Transform（来自 #10594）将字符串包装为
    // `(_msgs) => prompt`，用于 ExitPlanModeV2Tool 中的编程构造场景，
    // 该场景此后已重构到 VerifyPlanExecutionTool 中，不再构造 AgentHook 对象。
    prompt: z
      .string()
      .describe(
        '描述待验证内容的提示词（例如 "验证单元测试是否已运行并通过"）。使用 $ARGUMENTS 占位符表示钩子输入 JSON。',
      ),
    if: IfConditionSchema(),
    timeout: z
      .number()
      .positive()
      .optional()
      .describe('代理执行的超时时间（秒，默认 60）'),
    model: z
      .string()
      .optional()
      .describe(
        '此代理钩子使用的模型（例如 "claude-sonnet-4-6"）。如果不指定，则使用 Haiku。',
      ),
    statusMessage: z
      .string()
      .optional()
      .describe('钩子运行时在旋转加载器中显示的自定义状态消息'),
    once: z
      .boolean()
      .optional()
      .describe('如果为 true，钩子运行一次后即移除'),
  })

  return {
    BashCommandHookSchema,
    PromptHookSchema,
    HttpHookSchema,
    AgentHookSchema,
  }
}

/** 钩子命令的模式（不包括函数钩子——它们无法被持久化） */
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

/** 多钩子匹配器配置的模式 */
export const HookMatcherSchema = lazySchema(() =>
  z.object({
    matcher: z
      .string()
      .optional()
      .describe('要匹配的字符串模式（例如工具名 "Write"）'),
    hooks: z
      .array(HookCommandSchema())
      .describe('匹配器匹配时要执行的钩子列表'),
  }),
)

/**
 * 钩子配置的模式
 * 键是钩子事件，值是匹配器配置数组。
 * 使用 partialRecord 是因为并非所有钩子事件都需要定义。
 */
export const HooksSchema = lazySchema(() =>
  z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema())),
)

// 从模式推断的类型
export type HookCommand = z.infer<ReturnType<typeof HookCommandSchema>>
export type BashCommandHook = Extract<HookCommand, { type: 'command' }>
export type PromptHook = Extract<HookCommand, { type: 'prompt' }>
export type AgentHook = Extract<HookCommand, { type: 'agent' }>
export type HttpHook = Extract<HookCommand, { type: 'http' }>
export type HookMatcher = z.infer<ReturnType<typeof HookMatcherSchema>>
export type HooksSettings = Partial<Record<HookEvent, HookMatcher[]>>
