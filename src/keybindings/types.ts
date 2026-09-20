export type KeybindingContextName = string
export type KeybindingAction = string
export type ParsedKeystroke = {
  key?: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  /** Super/Cmd（部分平台） */
  super?: boolean
}
/** 组合键序列（多个按键的序列，如 "Ctrl+k Ctrl+s"） */
export type Chord = ParsedKeystroke[]
export type ParsedBinding = {
  /** 按键序列 */
  chord: Chord
  action: string
  /** 所属上下文 */
  context?: KeybindingContextName
}
/**
 * 配置层的绑定表：按键描述 -> 动作名。
 * 例：{ 'Ctrl+c': 'app:interrupt' }。
 * 注意与 ParsedBinding（解析后的 { action, keys } 结构）区分。
 */
export type KeybindingBindings = Record<string, KeybindingAction>
export type KeybindingBlock = {
  context?: KeybindingContextName
  bindings?: KeybindingBindings
}
