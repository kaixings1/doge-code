/** 消息来源类型标识 */
export type MessageOrigin = {
  kind?: string  // 消息来源类型标识
  [key: string]: unknown
}

/** 消息基类 */
export type MessageBase = {
  /** 消息唯一标识 */
  uuid?: string
  /** 父消息标识 */
  parentUuid?: string
  /** 消息时间戳 */
  timestamp?: string
  /** 消息创建时间 */
  createdAt?: string
  /** 是否为元信息消息 */
  isMeta?: boolean
  /** 是否为虚拟消息（不显示给用户） */
  isVirtual?: boolean
  /** 是否为压缩摘要消息 */
  isCompactSummary?: boolean
  /** 工具调用结果 */
  toolUseResult?: unknown
  /** 消息来源信息 */
  origin?: MessageOrigin
  [key: string]: unknown
}

/** 附件消息 */
export type AttachmentMessage = MessageBase & {
  type: 'attachment'
  /** 附件路径 */
  path?: string
}

/** 用户消息 */
export type UserMessage = MessageBase & {
  type: 'user'
  /** 消息内容 */
  message: {
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>
    [key: string]: unknown
  }
}

/** 助手消息 */
export type AssistantMessage = MessageBase & {
  type: 'assistant'
  /** 消息内容 */
  message?: {
    content?: unknown
    [key: string]: unknown
  }
}

/** 进度消息 */
export type ProgressMessage = MessageBase & {
  type: 'progress'
  /** 进度数据 */
  progress?: unknown
}

/** 系统消息级别 */
export type SystemMessageLevel = 'info' | 'warning' | 'error' | string

/** 系统消息 */
export type SystemMessage = MessageBase & {
  type: 'system'
  /** 子类型 */
  subtype?: string
  /** 消息级别 */
  level?: SystemMessageLevel
  /** 消息内容 */
  message?: string
}

/** 系统本地命令消息 */
export type SystemLocalCommandMessage = SystemMessage & {
  subtype: 'local_command'
}

/** 系统桥接状态消息 */
export type SystemBridgeStatusMessage = SystemMessage
/** 系统回合时长消息 */
export type SystemTurnDurationMessage = SystemMessage
/** 系统思维消息 */
export type SystemThinkingMessage = SystemMessage
/** 系统记忆保存消息 */
export type SystemMemorySavedMessage = SystemMessage
/** 系统停止钩子摘要消息 */
export type SystemStopHookSummaryMessage = SystemMessage
/** 系统信息消息 */
export type SystemInformationalMessage = SystemMessage
/** 系统压缩边界消息 */
export type SystemCompactBoundaryMessage = SystemMessage
/** 系统微压缩边界消息 */
export type SystemMicrocompactBoundaryMessage = SystemMessage
/** 系统权限重试消息 */
export type SystemPermissionRetryMessage = SystemMessage
/** 系统计划任务触发消息 */
export type SystemScheduledTaskFireMessage = SystemMessage
/** 系统离开摘要消息 */
export type SystemAwaySummaryMessage = SystemMessage
/** 系统代理终止消息 */
export type SystemAgentsKilledMessage = SystemMessage
/** 系统 API 指标消息 */
export type SystemApiMetricsMessage = SystemMessage
/** 系统 API 错误消息 */
export type SystemAPIErrorMessage = SystemMessage & { error?: string }
/** 系统文件快照消息 */
export type SystemFileSnapshotMessage = SystemMessage

/** 钩子结果消息 */
export type HookResultMessage = MessageBase & {
  type: 'hook_result'
}

/** 工具调用摘要消息 */
export type ToolUseSummaryMessage = MessageBase & {
  type: 'tool_use_summary'
}

/** 墓碑消息（标记删除） */
export type TombstoneMessage = MessageBase & {
  type: 'tombstone'
}

/** 流事件 */
export type StreamEvent = {
  type?: string
  [key: string]: unknown
}

/** 请求开始事件 */
export type RequestStartEvent = StreamEvent

/** 停止钩子信息 */
export type StopHookInfo = {
  [key: string]: unknown
}

/** 压缩元数据 */
export type CompactMetadata = {
  [key: string]: unknown
}

/** 部分压缩方向 */
export type PartialCompactDirection = 'older' | 'newer' | 'both' | string

/** 折叠读取搜索组 */
export type CollapsedReadSearchGroup = {
  [key: string]: unknown
}

/** 分组工具调用消息 */
export type GroupedToolUseMessage = MessageBase & {
  type: 'grouped_tool_use'
}

/** 可折叠消息 */
export type CollapsibleMessage = MessageBase

/** 规范化助手消息 */
export type NormalizedAssistantMessage = AssistantMessage
/** 规范化用户消息 */
export type NormalizedUserMessage = UserMessage
/** 规范化消息 */
export type NormalizedMessage =
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | ProgressMessage
  | SystemMessage
  | AttachmentMessage

/** 可渲染消息 */
export type RenderableMessage = Message

export type Message =
  | UserMessage
  | AssistantMessage
  | ProgressMessage
  | SystemMessage
  | AttachmentMessage
  | HookResultMessage
  | ToolUseSummaryMessage
  | TombstoneMessage
  | GroupedToolUseMessage

