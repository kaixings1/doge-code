import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { UUID } from 'crypto'
import type React from 'react'
import type { PermissionResult } from '../entrypoints/agentSdkTypes.js'
import type { Key } from '../ink.js'
import type { PastedContent } from '../utils/config.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import type { TextHighlight } from '../utils/textHighlighting.js'
import type { AgentId } from './ids.js'
import type { AssistantMessage, MessageOrigin } from './message.js'

/**
 * 输入过程中用于命令自动补全的幽灵文字
 */
export type InlineGhostText = {
  /** 要显示的幽灵文字（例如 /commit 对应 "mit"） */
  readonly text: string
  /** 完整命令名称（例如 "commit"） */
  readonly fullCommand: string
  /** 幽灵文字在输入框中应出现的位置 */
  readonly insertPosition: number
}

/**
 * 文本输入组件的基础属性
 */
export type BaseTextInputProps = {
  /**
   * 可选回调：在输入框开头按下上箭头键时处理历史导航
   */
  readonly onHistoryUp?: () => void

  /**
   * 可选回调：在输入框末尾按下下箭头键时处理历史导航
   */
  readonly onHistoryDown?: () => void

  /**
   * 当 value 为空时显示的文本。
   */
  readonly placeholder?: string

  /**
   * 允许多行输入，通过反斜杠结尾换行（默认：`true`）
   */
  readonly multiline?: boolean

  /**
   * 监听用户的输入。当有多个输入组件同时存在且输入需要路由到特定组件时很有用。
   */
  readonly focus?: boolean

  /**
   * 替换所有字符并遮盖值。适用于密码输入。
   */
  readonly mask?: string

  /**
   * 是否显示光标并允许使用箭头键在文本输入框内导航。
   */
  readonly showCursor?: boolean

  /**
   * 高亮粘贴的文字
   */
  readonly highlightPastedText?: boolean

  /**
   * 要在文本输入框中显示的值。
   */
  readonly value: string

  /**
   * 值更新时要调用的函数。
   */
  readonly onChange: (value: string) => void

  /**
   * 按下 `Enter` 键时要调用的函数，第一个参数为输入的值。
   */
  readonly onSubmit?: (value: string) => void

  /**
   * 按下 Ctrl+C 退出时要调用的函数。
   */
  readonly onExit?: () => void

  /**
   * 可选回调：显示退出消息
   */
  readonly onExitMessage?: (show: boolean, key?: string) => void

  /**
   * 可选回调：显示自定义消息
   */
  // readonly onMessage?: (show: boolean, message?: string) => void

  /**
   * 可选回调：重置历史位置
   */
  readonly onHistoryReset?: () => void

  /**
   * 可选回调：输入被清除时（例如双击 Esc）
   */
  readonly onClearInput?: () => void

  /**
   * 文本换行的列数
   */
  readonly columns: number

  /**
   * 输入视口的最大可见行数。当换行输入超过此行数时，仅渲染光标附近的行。
   */
  readonly maxVisibleLines?: number

  /**
   * 可选回调：粘贴图片时
   */
  readonly onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void

  /**
   * 可选回调：粘贴大段文本（超过 800 个字符）时
   */
  readonly onPaste?: (text: string) => void

  /**
   * 粘贴状态改变时的回调
   */
  readonly onIsPastingChange?: (isPasting: boolean) => void

  /**
   * 是否禁用上/下箭头键的光标移动
   */
  readonly disableCursorMovementForUpDownKeys?: boolean

  /**
   * 跳过文本级别的双击 Esc 处理程序。当快捷键上下文（例如自动补全）拥有 Esc 时设置此选项——
   * 快捷键的 stopImmediatePropagation 无法保护文本输入框，因为子效果的 useInput
   * 监听器在父效果之前注册。
   */
  readonly disableEscapeDoublePress?: boolean

  /**
   * 光标在文本中的偏移量
   */
  readonly cursorOffset: number

  /**
   * 用于设置光标偏移量的回调
   */
  onChangeCursorOffset: (offset: number) => void

  /**
   * 可选：命令输入后要显示的提示文本
   * 用于展示命令的可用参数
   */
  readonly argumentHint?: string

  /**
   * 可选回调：撤销功能
   */
  readonly onUndo?: () => void

  /**
   * 是否以暗淡颜色渲染文本
   */
  readonly dimColor?: boolean

  /**
   * 可选文本高亮：用于搜索结果或其他高亮场景
   */
  readonly highlights?: TextHighlight[]

  /**
   * 可选的自定义 React 元素，用于渲染占位符。
   * 如果提供，将覆盖标准的 `placeholder` 字符串渲染。
   */
  readonly placeholderElement?: React.ReactNode

  /**
   * 可选的内联幽灵文本，用于输入过程中的命令自动补全
   */
  readonly inlineGhostText?: InlineGhostText

  /**
   * 可选的过滤器，在按键路由之前应用于原始输入。返回（可能被转换的）输入字符串；
   * 对于非空输入返回 '' 会丢弃该事件。
   */
  readonly inputFilter?: (input: string, key: Key) => string
}

/** VimTextInput 的扩展属性 */
export type VimTextInputProps = BaseTextInputProps & {
  /**
   * 要使用的初始 Vim 模式
   */
  readonly initialMode?: VimMode

  /**
   * 可选回调：模式变更时触发
   */
  readonly onModeChange?: (mode: VimMode) => void
}

/**
 * Vim 编辑器模式
 */
export type VimMode = 'INSERT' | 'NORMAL'

/** 输入状态的通用属性 */
export type BaseInputState = {
  onInput: (input: string, key: Key) => void
  renderedValue: string
  offset: number
  setOffset: (offset: number) => void
  /** 在渲染文本中的光标行号（0 起始），考虑自动换行 */
  cursorLine: number
  /** 在当前行中的光标列位置（显示宽度） */
  cursorColumn: number
  /** 视口起始位置在完整文本中的字符偏移量（无窗口化时为 0） */
  viewportCharOffset: number
  /** 视口结束位置在完整文本中的字符偏移量（无窗口化时为 text.length） */
  viewportCharEnd: number

  // For paste handling
  isPasting?: boolean
  pasteState?: {
    chunks: string[]
    timeoutId: ReturnType<typeof setTimeout> | null
  }
}

/**
 * 文本输入状态
 */
export type TextInputState = BaseInputState

/**
 * 带有模式的 Vim 输入状态
 */
export type VimInputState = BaseInputState & {
  mode: VimMode
  setMode: (mode: VimMode) => void
}

/**
 * 提示符的输入模式
 */
export type PromptInputMode =
  | 'bash'
  | 'prompt'
  | 'orphaned-permission'
  | 'task-notification'

export type EditablePromptInputMode = Exclude<
  PromptInputMode,
  `${string}-notification`
>

/**
 * 队列优先级级别。普通模式和主动模式下语义相同。
 *
 *  - `now`   — 立即中断并发送。中止任何正在进行的工具
 *              调用（相当于 Esc + 发送）。消费者（print.ts、
 *              REPL.tsx）订阅队列变化并在看到
 *              'now' 命令时中止。
 *  - `next`  — 回合中段排空。让当前工具调用完成后，
 *              在工具结果和下一个 API 往返之间发送此消息。
 *              唤醒正在进行的 SleepTool 调用。
 *  - `later` — 回合结束排空。等待当前回合结束后，
 *              再作为新查询处理。唤醒正在进行的 SleepTool
 *              调用（query.ts 在睡眠后提升排空阈值，以便
 *              消息附加到同一回合）。
 *
 * SleepTool 仅在主动模式下可用，因此"唤醒 SleepTool"
 * 在普通模式下是空操作。
 */
export type QueuePriority = 'now' | 'next' | 'later'

/**
 * 已排队命令类型
 */
export type QueuedCommand = {
  value: string | Array<ContentBlockParam>
  mode: PromptInputMode
  /** 默认为入队时 `mode` 所隐含的优先级 */
  priority?: QueuePriority
  uuid?: UUID
  orphanedPermission?: OrphanedPermission
  /** 原始粘贴内容（包括图片），图片在执行时进行缩放 */
  pastedContents?: Record<number, PastedContent>
  /**
   * [粘贴文本 #N] 占位符展开前的原始输入字符串。
   * 用于 ultraplan 关键词检测，防止粘贴内容中包含关键词时触发 CCR 会话。
   * 未设置时回退到 `value`（bridge/UDS/MCP 源没有粘贴展开）。
   */
  preExpansionValue?: string
  /**
   * 为 true 时，即使输入以 `/` 开头，也将其视为纯文本。
   * 用于远程接收的消息（如 bridge/CCR），避免触发本地 slash 命令或技能。
   */
  skipSlashCommands?: boolean
  /**
   * 为 true 时，slash 命令会被分发但经过 isBridgeSafeCommand() 过滤——
   * 'local-jsx' 和仅限终端的命令会返回有用错误而不执行。由远程控制桥接器的
   * 入站路径设置，以便移动/网页客户端可以运行技能和安全命令，
   * 而不会重新暴露 PR #19134 的错误（/model 弹出本地选择器）。
   */
  bridgeOrigin?: boolean
  /**
   * 为 true 时，生成的 UserMessage 会设置 `isMeta: true` — 在记录 UI 中
   * 隐藏但对模型可见。由系统生成的提示（主动心跳、队友消息、资源更新）
   * 通过队列路由而不是直接调用 `onQuery` 时使用。
   */
  isMeta?: boolean
  /**
   * 命令来源。标记到生成的 UserMessage 上，以便
   * 会话记录从结构上记录来源（不仅仅是通过 XML 标签在内容中）。
   * 值为 undefined 时代表人工（键盘输入）。
   */
  origin?: MessageOrigin
  /**
   * 工作负载标签，贯穿到计费头的 cc_workload= 归属块中。
   * 队列是 cron 调度器触发与实际执行之间的异步边界——用户提示可能在此之间
   * 插入，因此标签挂载在 QueuedCommand 本身上，只在此命令出队时才
   * 提升到 bootstrap 状态。
   */
  workload?: string
  /**
   * 应当接收此通知的代理。undefined = 主线程。
   * 子代理在进程中运行并共享模块级命令队列；
   * query.ts 中的排空门控按此字段过滤，以免子代理的后台
   * 任务通知泄漏到协调器的上下文中（PR #18453
   * 统一了队列，但失去了双队列意外提供的隔离性）。
   */
  agentId?: AgentId
}

/** 类型守卫：检查图片 PastedContent 是否非空。来自零字节文件拖拽的空内容
 * 会产生空 base64 字符串，API 会因 "image cannot be empty" 而拒绝。
 * 在所有将 PastedContent 转换为 ImageBlockParam 的位置使用此守卫，
 * 以确保过滤器和 ID 列表保持同步。 */
export function isValidImagePaste(c: PastedContent): boolean {
  return c.type === 'image' && c.content.length > 0
}

/** 从 QueuedCommand 的 pastedContents 中提取图片粘贴 ID。 */
export function getImagePasteIds(
  pastedContents: Record<number, PastedContent> | undefined,
): number[] | undefined {
  if (!pastedContents) {
    return undefined
  }
  const ids = Object.values(pastedContents)
    .filter(isValidImagePaste)
    .map(c => c.id)
  return ids.length > 0 ? ids : undefined
}

export type OrphanedPermission = {
  permissionResult: PermissionResult
  assistantMessage: AssistantMessage
}
