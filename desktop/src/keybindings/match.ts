import type { Key } from '../ink.js'
import type { ParsedBinding, ParsedKeystroke } from './types.js'

/**
 * 来自 Ink Key 类型中我们关心的修饰键。
 * 注意：有意排除了 `fn`，因为它很少使用且
 * 在终端应用中通常不可配置。
 */
type InkModifiers = Pick<Key, 'ctrl' | 'shift' | 'meta' | 'super'>

/**
 * 从 Ink Key 对象中提取修饰键。
 * 此函数确保我们显式提取关心的修饰键。
 */
function getInkModifiers(key: Key): InkModifiers {
  return {
    ctrl: key.ctrl,
    shift: key.shift,
    meta: key.meta,
    super: key.super,
  }
}

/**
 * 从 Ink 的 Key + input 中提取标准化的按键名称。
 * 将 Ink 的布尔标志（key.escape、key.return 等）映射为匹配
 * ParsedKeystroke.key 格式的字符串名称。
 */
export function getKeyName(input: string, key: Key): string | null {
  if (key.escape) return 'escape'
  if (key.return) return 'enter'
  if (key.tab) return 'tab'
  if (key.backspace) return 'backspace'
  if (key.delete) return 'delete'
  if (key.upArrow) return 'up'
  if (key.downArrow) return 'down'
  if (key.leftArrow) return 'left'
  if (key.rightArrow) return 'right'
  if (key.pageUp) return 'pageup'
  if (key.pageDown) return 'pagedown'
  if (key.wheelUp) return 'wheelup'
  if (key.wheelDown) return 'wheeldown'
  if (key.home) return 'home'
  if (key.end) return 'end'
  if (input.length === 1) return input.toLowerCase()
  return null
}

/**
 * 检查 Ink Key 和 ParsedKeystroke 之间的所有修饰键是否匹配。
 *
 * Alt 和 Meta：Ink 历史上为 Alt/Option 设置 `key.meta`。配置中的 `meta`
 * 修饰键被视为 `alt` 的别名——当 `key.meta` 为 true 时两者都匹配。
 *
 * Super（Cmd/Win）：与 alt/meta 不同。仅在支持的终端上通过 kitty
 * 键盘协议到达。`cmd`/`super` 绑定在未发送该协议的终端上
 * 永远不会触发。
 */
function modifiersMatch(
  inkMods: InkModifiers,
  target: ParsedKeystroke,
): boolean {
  // 检查 ctrl 修饰键
  if (inkMods.ctrl !== target.ctrl) return false

  // 检查 shift 修饰键
  if (inkMods.shift !== target.shift) return false

  // Alt 和 meta 都映射到 Ink 的 key.meta（终端限制）
  // 因此我们检查目标中是否需要 alt 或 meta 中的任意一个
  const targetNeedsMeta = target.alt || target.meta
  if (inkMods.meta !== targetNeedsMeta) return false

  // Super（cmd/win）是与 alt/meta 不同的修饰键
  if (inkMods.super !== target.super) return false

  return true
}

/**
 * 检查 ParsedKeystroke 是否匹配给定的 Ink input + Key。
 *
 * 显示文本将显示适合平台的名称（macOS 上显示 opt，其他平台显示 alt）。
 */
export function matchesKeystroke(
  input: string,
  key: Key,
  target: ParsedKeystroke,
): boolean {
  const keyName = getKeyName(input, key)
  if (keyName !== target.key) return false

  const inkMods = getInkModifiers(key)

  // 怪癖：按下 escape 时 Ink 设置 key.meta=true（参见 input-event.ts）。
  // 这是终端中转义序列工作方式的遗留行为。
  // 在匹配 escape 键本身时需要忽略 meta 修饰键，
  // 否则像 "escape"（无修饰键）这样的绑定永远不会匹配。
  if (key.escape) {
    return modifiersMatch({ ...inkMods, meta: false }, target)
  }

  return modifiersMatch(inkMods, target)
}

/**
 * 检查 Ink 的 Key + input 是否匹配已解析绑定的第一个按键。
 * 仅用于单次按键绑定（阶段 1）。
 */
export function matchesBinding(
  input: string,
  key: Key,
  binding: ParsedBinding,
): boolean {
  if (binding.chord.length !== 1) return false
  const keystroke = binding.chord[0]
  if (!keystroke) return false
  return matchesKeystroke(input, key, keystroke)
}
