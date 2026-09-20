export type KeybindingContextName = string
export type KeybindingAction = string
export type ParsedKeystroke = {
  key?: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}
export type ParsedBinding = {
  action: string
  keys: ParsedKeystroke[]
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
