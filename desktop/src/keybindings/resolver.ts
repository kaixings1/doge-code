import type { Key } from '../ink.js'
import { getKeyName, matchesBinding } from './match.js'
import { chordToString } from './parser.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types.js'

export type ResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' }

export type ChordResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' }
  | { type: 'chord_started'; pending: ParsedKeystroke[] }
  | { type: 'chord_cancelled' }

/**
 * 将按键输入解析为操作。
 * 纯函数 - 无状态、无副作用、仅匹配逻辑。
 *
 * @param input - 来自 Ink 的字符输入
 * @param key - 来自 Ink 的 Key 对象，含修饰符标志
 * @param activeContexts - 当前活跃的上下文数组（例如 ['Chat', 'Global']）
 * @param bindings - 要搜索的所有已解析绑定
 * @returns 解析结果
 */
export function resolveKey(
  input: string,
  key: Key,
  activeContexts: KeybindingContextName[],
  bindings: ParsedBinding[],
): ResolveResult {
  // 查找匹配的绑定（最后一个生效，用于用户覆盖）
  let match: ParsedBinding | undefined
  const ctxSet = new Set(activeContexts)

  for (const binding of bindings) {
    // 阶段 1：仅单次按键绑定
    if (binding.chord.length !== 1) continue
    if (!ctxSet.has(binding.context)) continue

    if (matchesBinding(input, key, binding)) {
      match = binding
    }
  }

  if (!match) {
    return { type: 'none' }
  }

  if (match.action === null) {
    return { type: 'unbound' }
  }

  return { type: 'match', action: match.action }
}

/**
 * 从绑定中获取操作的显示文本（例如 "ctrl+t" 对应 "app:toggleTodos"）。
 * 按反向顺序搜索，以便用户覆盖优先。
 */
export function getBindingDisplayText(
  action: string,
  context: KeybindingContextName,
  bindings: ParsedBinding[],
): string | undefined {
  // 在此上下文中查找此操作的最后一个绑定
  const binding = bindings.findLast(
    b => b.action === action && b.context === context,
  )
  return binding ? chordToString(binding.chord) : undefined
}

/**
 * Build a ParsedKeystroke from Ink's input/key.
 */
function buildKeystroke(input: string, key: Key): ParsedKeystroke | null {
  const keyName = getKeyName(input, key)
  if (!keyName) return null

  // 怪癖：Ink 在按下 escape 时设置 key.meta=true（参见 input-event.ts）。
  // 这是传统终端行为——我们不应将其记录为 escape 键本身的修饰符，
  // 否则和弦匹配将失败。
  const effectiveMeta = key.escape ? false : key.meta

  return {
    key: keyName,
    ctrl: key.ctrl,
    alt: effectiveMeta,
    shift: key.shift,
    meta: effectiveMeta,
    super: key.super,
  }
}

/**
 * 比较两个 ParsedKeystroke 是否相等。将 alt/meta 合并为
 * 一个逻辑修饰符——传统终端无法区分它们（参见
 * match.ts modifiersMatch），因此 "alt+k" 和 "meta+k" 是同一个键。
 * Super（cmd/win）是不同的——仅通过 kitty 键盘协议到达。
 */
export function keystrokesEqual(
  a: ParsedKeystroke,
  b: ParsedKeystroke,
): boolean {
  return (
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    (a.alt || a.meta) === (b.alt || b.meta) &&
    a.super === b.super
  )
}

/**
 * 检查和弦前缀是否匹配绑定和弦的开头。
 */
function chordPrefixMatches(
  prefix: ParsedKeystroke[],
  binding: ParsedBinding,
): boolean {
  if (prefix.length >= binding.chord.length) return false
  for (let i = 0; i < prefix.length; i++) {
    const prefixKey = prefix[i]
    const bindingKey = binding.chord[i]
    if (!prefixKey || !bindingKey) return false
    if (!keystrokesEqual(prefixKey, bindingKey)) return false
  }
  return true
}

/**
 * 检查完整和弦是否匹配绑定的和弦。
 */
function chordExactlyMatches(
  chord: ParsedKeystroke[],
  binding: ParsedBinding,
): boolean {
  if (chord.length !== binding.chord.length) return false
  for (let i = 0; i < chord.length; i++) {
    const chordKey = chord[i]
    const bindingKey = binding.chord[i]
    if (!chordKey || !bindingKey) return false
    if (!keystrokesEqual(chordKey, bindingKey)) return false
  }
  return true
}

/**
 * 使用和弦状态支持解析按键。
 *
 * 此函数处理多按键和弦绑定，如 "ctrl+k ctrl+s"。
 *
 * @param input - 来自 Ink 的字符输入
 * @param key - 来自 Ink 的 Key 对象，含修饰符标志
 * @param activeContexts - 当前活跃的上下文数组
 * @param bindings - 所有已解析的绑定
 * @param pending - 当前和弦状态（不在和弦中时为 null）
 * @returns 带和弦状态的解析结果
 */
export function resolveKeyWithChordState(
  input: string,
  key: Key,
  activeContexts: KeybindingContextName[],
  bindings: ParsedBinding[],
  pending: ParsedKeystroke[] | null,
): ChordResolveResult {
  // 按下 escape 时取消和弦
  if (key.escape && pending !== null) {
    return { type: 'chord_cancelled' }
  }

  // 构建当前按键
  const currentKeystroke = buildKeystroke(input, key)
  if (!currentKeystroke) {
    if (pending !== null) {
      return { type: 'chord_cancelled' }
    }
    return { type: 'none' }
  }

  // 构建要测试的完整和弦序列
  const testChord = pending
    ? [...pending, currentKeystroke]
    : [currentKeystroke]

  // 按活跃上下文过滤绑定（Set 查找：O(n) 而非 O(n·m)）
  const ctxSet = new Set(activeContexts)
  const contextBindings = bindings.filter(b => ctxSet.has(b.context))

  // 检查这是否可能成为更长和弦的前缀。按和弦字符串分组，
  // 以便后面的空覆盖遮蔽它所解绑的默认值——
  // 否则空解绑 `ctrl+x ctrl+k` 仍会使 `ctrl+x` 进入和弦等待，
  // 且前缀上的单键绑定永远不会触发。
  const chordWinners = new Map<string, string | null>()
  for (const binding of contextBindings) {
    if (
      binding.chord.length > testChord.length &&
      chordPrefixMatches(testChord, binding)
    ) {
      chordWinners.set(chordToString(binding.chord), binding.action)
    }
  }
  let hasLongerChords = false
  for (const action of chordWinners.values()) {
    if (action !== null) {
      hasLongerChords = true
      break
    }
  }

  // 如果此按键可以开始一个更长的和弦，优先选择
  //（即使存在精确的单键匹配）
  if (hasLongerChords) {
    return { type: 'chord_started', pending: testChord }
  }

  // 检查精确匹配（最后一个生效）
  let exactMatch: ParsedBinding | undefined
  for (const binding of contextBindings) {
    if (chordExactlyMatches(testChord, binding)) {
      exactMatch = binding
    }
  }

  if (exactMatch) {
    if (exactMatch.action === null) {
      return { type: 'unbound' }
    }
    return { type: 'match', action: exactMatch.action }
  }

  // 无匹配且无潜在更长和弦
  if (pending !== null) {
    return { type: 'chord_cancelled' }
  }

  return { type: 'none' }
}
