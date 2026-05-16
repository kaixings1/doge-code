import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { CompactionResult } from '../services/compact/compact.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import type { ToolUseContext } from '../Tool.js'
import type { EffortValue } from '../utils/effort.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import type { SettingSource } from '../utils/settings/constants.js'
import type { HooksSettings } from '../utils/settings/types.js'
import type { ThemeName } from '../utils/theme.js'
import type { LogOption } from './logs.js'
import type { Message } from './message.js'
import type { PluginManifest } from './plugin.js'

export type LocalCommandResult =
  | { type: 'text'; value: string }       // 文本结果类型
  | {
      type: 'compact'                  // 压缩结果类型
      compactionResult: CompactionResult
      displayText?: string              // 显示文本
    }
  | { type: 'skip' } // 跳过消息

/**
 * 提示命令类型 — 通过向模型发送提示来执行。
 */
export type PromptCommand = {
  type: 'prompt'
  /** 进度提示消息 */
  progressMessage: string
  /** 命令内容长度（字符数，用于 token 估算） */
  contentLength: number
  /** 参数名称列表 */
  argNames?: string[]
  /** 允许使用的工具名称列表 */
  allowedTools?: string[]
  /** 模型名称 */
  model?: string
  /** 命令来源 */
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  /** 插件信息（仅插件命令） */
  pluginInfo?: {
    pluginManifest: PluginManifest
    repository: string
  }
  /** 是否禁用非交互模式 */
  disableNonInteractive?: boolean
  /** 在调用此技能时注册的钩子 */
  hooks?: HooksSettings
  /** 技能资源的基础目录（用于设置 CLAUDE_PLUGIN_ROOT 环境变量） */
  skillRoot?: string
  /**
   * 执行上下文：'inline'（默认）或 'fork'（作为子代理运行）
   * 'inline' = 技能内容展开到当前对话中
   * 'fork' = 技能在子代理中运行，拥有独立的上下文和 token 预算
   */
  context?: 'inline' | 'fork'
  /** 分叉时使用的代理类型（例如 'Bash'、'general-purpose'） */
  agent?: string
  /** 预估所需 effort 值 */
  effort?: EffortValue
  /** 此技能适用的文件路径 Glob 模式 */
  paths?: string[]
  /**
   * 为命令生成提示内容。
   * @param args - 命令参数字符串
   * @param context - 工具调用上下文
   * @returns 提示内容块数组
   */
  getPromptForCommand(
    args: string,
    context: ToolUseContext,
  ): Promise<ContentBlockParam[]>
}

/**
 * 本地命令实现的调用签名。
 * @param args - 命令参数字符串
 * @param context - 本地 JSX 命令上下文
 * @returns 本地命令结果
 */
export type LocalCommandCall = (
  args: string,
  context: LocalJSXCommandContext,
) => Promise<LocalCommandResult>

/**
 * load() 为懒加载本地命令返回的模块结构。
 * 包含一个 call 函数用于执行命令。
 */
export type LocalCommandModule = {
  call: LocalCommandCall
}

/**
 * 本地命令类型定义（非 JSX）。
 */
type LocalCommand = {
  type: 'local'
  /** 是否支持非交互模式 */
  supportsNonInteractive: boolean
  /** 懒加载函数，返回命令模块 */
  load: () => Promise<LocalCommandModule>
}

/**
 * 本地 JSX 命令的执行上下文，扩展自 ToolUseContext。
 */
export type LocalJSXCommandContext = ToolUseContext & {
  canUseTool?: CanUseToolFn
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  options: {
    dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
    ideInstallationStatus: IDEExtensionInstallationStatus | null
    theme: ThemeName
  }
  onChangeAPIKey: () => void
  onChangeDynamicMcpConfig?: (
    config: Record<string, ScopedMcpServerConfig>,
  ) => void
  onInstallIDEExtension?: (ide: IdeType) => void
  resume?: (
    sessionId: UUID,
    log: LogOption,
    entrypoint: ResumeEntrypoint,
  ) => Promise<void>
}

/**
 * 会话恢复入口点类型
 */
export type ResumeEntrypoint =
  | 'cli_flag'
  | 'slash_command_picker'
  | 'slash_command_session_id'
  | 'slash_command_title'
  | 'fork'

/**
 * 命令结果的展示方式
 */
export type CommandResultDisplay = 'skip' | 'system' | 'user'

/**
 * 命令完成时的回调函数。
 * @param result - 可选的用户可见消息
 * @param options - 可选的命令完成配置
 * @param options.display - 结果展示方式：'skip' | 'system' | 'user'（默认）
 * @param options.shouldQuery - 若为 true，命令完成后向模型发送消息
 * @param options.metaMessages - 额外插入的 isMeta 消息（对用户隐藏但对模型可见）
 */
export type LocalJSXCommandOnDone = (
  result?: string,
  options?: {
    display?: CommandResultDisplay
    shouldQuery?: boolean
    metaMessages?: string[]
    nextInput?: string
    submitNextInput?: boolean
  },
) => void

/**
 * 本地 JSX 命令实现的调用签名。
 */
export type LocalJSXCommandCall = (
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
) => Promise<React.ReactNode>

/**
 * load() 为懒加载命令返回的模块结构。
 */
export type LocalJSXCommandModule = {
  call: LocalJSXCommandCall
}

/**
 * 本地 JSX 命令类型定义。
 */
type LocalJSXCommand = {
  type: 'local-jsx'
  /**
   * 懒加载命令实现。
   * 返回带 call() 函数的模块。
   * 推迟加载重型依赖，直到命令被调用时才加载。
   */
  load: () => Promise<LocalJSXCommandModule>
}

/**
 * 声明命令在哪些认证/提供者环境中可用。
 *
 * 这与 `isEnabled()` 不同：
 *   - `availability` = 谁可以使用（认证/提供者要求，静态的）
 *   - `isEnabled()` = 当前是否启用（GrowthBook、平台、环境变量）
 *
 * 没有 `availability` 的命令在所有地方都可用。
 * 仅当用户至少匹配下列一种认证类型时，才会显示设置了 `availability` 的命令：
 * 列表中的认证类型。参见 commands.ts 中的 meetsAvailabilityRequirement()。
 *
 * 示例：`availability: ['claude-ai', 'console']` 将命令显示给
 * claude.ai 订阅者和直接使用 Console API 密钥的用户 (api.anthropic.com)，
 * 但对 Bedrock/Vertex/Foundry 用户和自定义基础 URL 用户隐藏。
 */
export type CommandAvailability =
  // claude.ai OAuth 订阅者 (Pro/Max/Team/Enterprise via claude.ai)
  | 'claude-ai'
  // Console API 密钥用户 (direct api.anthropic.com, not via claude.ai OAuth)
  | 'console'

export type CommandBase = {
  availability?: CommandAvailability[]
  description: string
  hasUserSpecifiedDescription?: boolean
  /** 默认为 true。仅在命令有条件启用（功能标志、环境变量检查等）时设置 */
  isEnabled?: () => boolean
  /** 默认为 false。仅当命令应隐藏在自动补全/帮助中时设置 */
  isHidden?: boolean
  name: string
  aliases?: string[]
  isMcp?: boolean
  argumentHint?: string // Hint text for command arguments (displayed in gray after command)
  whenToUse?: string // 来自 "Skill" 规范。描述何时使用此命令的详细使用场景
  version?: string // Version of the command/skill
  disableModelInvocation?: boolean // 是否禁止模型调用此命令
  userInvocable?: boolean // 用户是否可以通过输入 /skill-name 来调用此技能
  loadedFrom?: // 命令加载来源
    | 'commands_DEPRECATED'
    | 'skills'
    | 'plugin'
    | 'managed'
    | 'bundled'
    | 'mcp' // Where the command was loaded from
  kind?: 'workflow' // Distinguishes workflow-backed commands (badged in autocomplete)
  immediate?: boolean // 若为 true，命令立即执行，无需等待停止点（跳过队列）
  isSensitive?: boolean // 若为 true，参数将在会话记录中被脱敏
  /** 默认值为 `name`。仅在显示名称不同时覆盖（如插件前缀剥离） */
  userFacingName?: () => string // 获取面向用户的显示名称
}

export type Command = CommandBase &
  (PromptCommand | LocalCommand | LocalJSXCommand)

/**
 * 解析面向用户的名称，若未覆盖则回退到 `cmd.name`。
 */
export function getCommandName(cmd: CommandBase): string {
  return cmd.userFacingName?.() ?? cmd.name
}

/**
 * 解析命令是否启用，默认为 true。
 */
export function isCommandEnabled(cmd: CommandBase): boolean {
  return cmd.isEnabled?.() ?? true
}
