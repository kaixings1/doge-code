/**
 * 为打破导入循环而提取的纯权限类型定义。
 *
 * 该文件仅包含类型定义和常量，没有运行时依赖项。
 * 实现文件仍位于 src/utils/permissions/，但现在可以从此处导入
 * 以避免循环依赖。
 */

import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

// ============================================================================
// 权限模式
// ============================================================================

export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

export type ExternalPermissionMode = (typeof EXTERNAL_PERMISSION_MODES)[number]

// 用于类型检查的穷举模式联合体。用户可寻址的运行时集合
// 是下面的 INTERNAL_PERMISSION_MODES。
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'
export type PermissionMode = InternalPermissionMode

// 运行时验证集：用户可设置的模式（settings.json 的 defaultMode、
// --permission-mode CLI 标志、对话恢复）。
export const INTERNAL_PERMISSION_MODES = [
  ...EXTERNAL_PERMISSION_MODES,
  ...(feature('TRANSCRIPT_CLASSIFIER') ? (['auto'] as const) : ([] as const)),
] as const satisfies readonly PermissionMode[]

export const PERMISSION_MODES = INTERNAL_PERMISSION_MODES

// ============================================================================
// Permission Behaviors
// ============================================================================

/**
 * 权限行为类型，表示允许、拒绝或询问用户。
 */
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

// ============================================================================
// 权限规则
// ============================================================================

/**
 * 权限规则的来源。
 * 包含所有 SettingSource 值以及额外的规则特定来源。
 */
export type PermissionRuleSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'
  | 'command'
  | 'session'

/**
 * 权限规则的值 — 指定哪个工具以及可选的内容
 */
export type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}

/**
 * 权限规则及其来源和行为
 */
export type PermissionRule = {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
}

// ============================================================================
// 权限更新
// ============================================================================

/**
 * 权限更新的持久化目标
 */
export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'

/**
 * 权限配置的更新操作
 */
export type PermissionUpdate =
  | {
      type: 'addRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'replaceRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'removeRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'setMode'
      destination: PermissionUpdateDestination
      mode: ExternalPermissionMode
    }
  | {
      type: 'addDirectories'
      destination: PermissionUpdateDestination
      directories: string[]
    }
  | {
      type: 'removeDirectories'
      destination: PermissionUpdateDestination
      directories: string[]
    }

/**
 * 额外工作目录权限的来源。
 * 注意：当前与 PermissionRuleSource 相同，但出于语义清晰和未来可能的分歧而单独保留。
 */
export type WorkingDirectorySource = PermissionRuleSource

/** 权限范围内包含的额外目录 */
export type AdditionalWorkingDirectory = {
  path: string
  source: WorkingDirectorySource
}

// ============================================================================
// 权限决策与结果
// ============================================================================

/**
 * 用于权限元数据的最小命令结构。
 * 故意使用完整 Command 类型的子集以避免循环导入。
 * 仅包含权限相关组件所需的属性。
 */
export type PermissionCommandMetadata = {
  name: string
  description?: string
  // 允许额外的属性以保持向前兼容
  [key: string]: unknown
}

/** 附加到权限决策的元数据 */
export type PermissionMetadata =
  | { command: PermissionCommandMetadata }
  | undefined

/** 权限被授予时的结果 */
export type PermissionAllowDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: 'allow'
  updatedInput?: Input
  userModified?: boolean
  decisionReason?: PermissionDecisionReason
  toolUseID?: string
  acceptFeedback?: string
  contentBlocks?: ContentBlockParam[]
}

/**
 * 待处理的分类器检查元数据，将异步运行。
 * 用于启用非阻塞的允许分类器评估。
 */
export type PendingClassifierCheck = {
  command: string
  cwd: string
  descriptions: string[]
}

/** 需要提示用户时的结果 */
export type PermissionAskDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: 'ask'
  message: string
  updatedInput?: Input
  decisionReason?: PermissionDecisionReason
  suggestions?: PermissionUpdate[]
  blockedPath?: string
  metadata?: PermissionMetadata
  /**
   * 如果为 true，此询问决策是由 bashCommandIsSafe_DEPRECATED 安全检查触发的，
   * 用于 splitCommand_DEPRECATED 可能误解析的模式（例如行续接、shell 引号转换）。
   * 由 bashToolHasPermission 在 splitCommand_DEPRECATED 转换命令之前提前阻止。
   * 对于简单的换行符复合命令，不会设置此字段。
   */
  isBashSecurityCheckForMisparsing?: boolean
  /**
   * 如果设置，将异步运行允许分类器检查。
   * 分类器可能会在用户响应之前自动批准权限。
   */
  pendingClassifierCheck?: PendingClassifierCheck
  /**
   * 可选的内容块（例如图片），包含在工具结果的拒绝消息中，
   * 当用户粘贴图片作为反馈时使用。
   */
  contentBlocks?: ContentBlockParam[]
}

/** 权限被拒绝时的结果 */
export type PermissionDenyDecision = {
  behavior: 'deny'
  message: string
  decisionReason: PermissionDecisionReason
  toolUseID?: string
}

/** 权限决策 — 允许、询问或拒绝 */
export type PermissionDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionAllowDecision<Input>
  | PermissionAskDecision<Input>
  | PermissionDenyDecision

/** 带直通选项的权限结果 */
export type PermissionResult<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionDecision<Input>
  | {
      behavior: 'passthrough'
      message: string
      decisionReason?: PermissionDecision<Input>['decisionReason']
      suggestions?: PermissionUpdate[]
      blockedPath?: string
      /**
       * 如果设置，将异步运行允许分类器检查。
       * 分类器可能会在用户响应之前自动批准权限。
       */
      pendingClassifierCheck?: PendingClassifierCheck
    }

/** 权限决策原因的解释 */
export type PermissionDecisionReason =
  | {
      type: 'rule'
      rule: PermissionRule
    }
  | {
      type: 'mode'
      mode: PermissionMode
    }
  | {
      type: 'subcommandResults'
      reasons: Map<string, PermissionResult>
    }
  | {
      type: 'permissionPromptTool'
      permissionPromptToolName: string
      toolResult: unknown
    }
  | {
      type: 'hook'
      hookName: string
      hookSource?: string
      reason?: string
    }
  | {
      type: 'asyncAgent'
      reason: string
    }
  | {
      type: 'sandboxOverride'
      reason: 'excludedCommand' | 'dangerouslyDisableSandbox'
    }
  | {
      type: 'classifier'
      classifier: string
      reason: string
    }
  | {
      type: 'workingDir'
      reason: string
    }
  | {
      type: 'safetyCheck'
      reason: string
      // 若为 true，自动模式让分类器评估此项而非强制弹出提示。
      // 对敏感文件路径（.claude/、.git/、shell 配置文件）为 true——
      // 分类器可查看上下文并自行决定。对 Windows 路径绕过尝试和
      // 跨机器桥接消息为 false。
      classifierApprovable: boolean
    }
  | {
      type: 'other'
      reason: string
    }

// ============================================================================
// Bash 分类器类型
// ============================================================================

/** 分类器结果 */
export type ClassifierResult = {
  matches: boolean
  matchedDescription?: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/** 分类器行为 */
export type ClassifierBehavior = 'deny' | 'ask' | 'allow'

/** 分类器使用情况 */
export type ClassifierUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

/** YOLO 分类器结果 */
export type YoloClassifierResult = {
  thinking?: string
  shouldBlock: boolean
  reason: string
  unavailable?: boolean
  /**
   * API 返回 "prompt is too long" — 分类器上下文窗口超出限制。
   * 确定性结果（相同输入 → 相同错误），调用方应回退到普通提示
   * 而非重试或失败关闭。
   */
  transcriptTooLong?: boolean
  /** 本次分类器调用使用的模型 */
  model: string
  /** 分类器 API 调用的 Token 使用情况（用于开销遥测） */
  usage?: ClassifierUsage
  /** 分类器 API 调用持续时间（毫秒） */
  durationMs?: number
  /** 发送到分类器的提示各部分字符长度 */
  promptLengths?: {
    systemPrompt: number
    toolCalls: number
    userPrompts: number
  }
  /** 错误提示转储路径（仅 API 错误不可用时设置） */
  errorDumpPath?: string
  /** 哪个分类器阶段产生了最终决策（仅两阶段 XML 模式） */
  stage?: 'fast' | 'thinking'
  /** 阶段 2 也运行时，阶段 1（快速）的 Token 使用情况 */
  stage1Usage?: ClassifierUsage
  /** 阶段 2 也运行时，阶段 1 的持续时间（毫秒） */
  stage1DurationMs?: number
  /**
   * 阶段 1 的 API request_id (req_xxx)。用于关联到服务端的
   * api_usage 日志以进行缓存未命中/路由归因。同时用于
   * 遗留的单阶段（tool_use）分类器——单个请求放在这里。
   */
  stage1RequestId?: string
  /**
   * 阶段 1 的 API message_id (msg_xxx)。用于将 tengu_auto_mode_decision
   * 分析事件关联到分类器的实际提示/补全内容以进行后分析。
   */
  stage1MsgId?: string
  /** 阶段 2（思考）运行时的 Token 使用情况 */
  stage2Usage?: ClassifierUsage
  /** 阶段 2 运行时的持续时间（毫秒） */
  stage2DurationMs?: number
  /** 阶段 2 的 API request_id（阶段 2 运行时设置） */
  stage2RequestId?: string
  /** 阶段 2 的 API message_id（阶段 2 运行时设置） */
  stage2MsgId?: string
}

// ============================================================================
// 权限解释器类型
// ============================================================================

/** 风险等级 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

/** 权限解释 */
export type PermissionExplanation = {
  riskLevel: RiskLevel
  explanation: string
  reasoning: string
  risk: string
}

// ============================================================================
// 工具权限上下文
// ============================================================================

/** 按来源映射的权限规则 */
export type ToolPermissionRulesBySource = {
  [T in PermissionRuleSource]?: string[]
}

/**
 * 工具中权限检查所需的上下文
 * 注意：使用简化版的 DeepImmutable 近似类型
 */
export type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<
    string,
    AdditionalWorkingDirectory
  >
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly alwaysAskRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
  readonly strippedDangerousRules?: ToolPermissionRulesBySource
  readonly shouldAvoidPermissionPrompts?: boolean
  readonly awaitAutomatedChecksBeforeDialog?: boolean
  readonly prePlanMode?: PermissionMode
}
