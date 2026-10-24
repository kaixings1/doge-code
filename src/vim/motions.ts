/**
 * Vim 移动函数
 *
 * 用于解析 vim 移动命令到光标位置的纯函数。
 */

import { Cursor } from '../utils/Cursor.js'

/**
 * 解析移动命令到目标光标位置。
 * 不修改任何内容 —— 纯计算。
 */
export function resolveMotion(
  key: string,
  cursor: Cursor,
  count: number,
): Cursor {
  let result = cursor
  for (let i = 0; i < count; i++) {
    const next = applySingleMotion(key, result)
    if (next.equals(result)) break
    result = next
  }
  return result
}

/**
 * 应用单个移动步骤。
 */
function applySingleMotion(key: string, cursor: Cursor): Cursor {
  switch (key) {
    case 'h':
      return cursor.left()
    case 'l':
      return cursor.right()
    case 'j':
      return cursor.downLogicalLine()
    case 'k':
      return cursor.upLogicalLine()
    case 'gj':
      return cursor.down()
    case 'gk':
      return cursor.up()
    case 'w':
      return cursor.nextVimWord()
    case 'b':
      return cursor.prevVimWord()
    case 'e':
      return cursor.endOfVimWord()
    case 'W':
      return cursor.nextWORD()
    case 'B':
      return cursor.prevWORD()
    case 'E':
      return cursor.endOfWORD()
    case '0':
      return cursor.startOfLogicalLine()
    case '^':
      return cursor.firstNonBlankInLogicalLine()
    case '$':
      return cursor.endOfLogicalLine()
    case 'G':
      return cursor.startOfLastLine()
    case '%':
      return matchBracket(cursor) ?? cursor
    default:
      return cursor
  }
}

const OPEN_BRACKETS = '([{<'
const BRACKET_PAIRS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
}

/**
 * Vim 的 `%` 动作：跳到匹配的括号（对齐官方 v2.1.301）。
 *
 * - 光标在开括号上 → 跳到对应的闭括号
 * - 光标在闭括号上 → 跳到对应的开括号
 * - 光标不在括号上 → 在本行内向后找第一个括号；本行没有则不动
 *
 * 纯函数：只读 cursor.text。找不到匹配时返回 null，调用方保持原位
 * （与 vim 行为一致：不匹配的括号不移动）。
 */
function matchBracket(cursor: Cursor): Cursor | null {
  const text = cursor.text
  const start = cursor.offset
  if (start >= text.length) return null

  // 先看光标处是不是括号；不是则在本行内向后找第一个。
  const lineEnd = findLogicalLineEnd(text, start)
  let pos = -1
  for (let i = start; i < lineEnd; i++) {
    if (text[i] in BRACKET_PAIRS) {
      pos = i
      break
    }
  }
  if (pos === -1) return null

  const ch = text[pos]
  const target = BRACKET_PAIRS[ch]
  const step = OPEN_BRACKETS.includes(ch) ? 1 : -1
  let depth = 0

  for (let i = pos; i >= 0 && i < text.length; i += step) {
    if (text[i] === ch) depth += 1
    else if (text[i] === target) {
      depth -= 1
      if (depth === 0) return new Cursor(cursor.measuredText, i)
    }
  }
  return null
}

/** 找到 offset 所在逻辑行的末尾（不含换行符）。 */
function findLogicalLineEnd(text: string, offset: number): number {
  const nl = text.indexOf('\n', offset)
  return nl === -1 ? text.length : nl
}

/**
 * 检查移动命令是否是包含式的（包含目标位置的字符）。
 */
export function isInclusiveMotion(key: string): boolean {
  // `%` 是包含式：d% 应删掉匹配的括号本身（vim: :help o_v），
  // 否则会留下一个孤立的闭括号。
  return 'eE$'.includes(key) || key === '%'
}

/**
 * 检查移动命令是否是行式的（与操作符连用时操作整行）。
 * 注意：gj/gk 是字符式的（不包括行式），参见 `:help gj`。
 */
export function isLinewiseMotion(key: string): boolean {
  return 'jkG'.includes(key) || key === 'gg'
}
