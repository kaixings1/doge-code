/**
 * 契约测试：useLogMessages 的 ignore 判据
 *
 * 原判据（REPL.tsx:3745）:
 *     messages.length === initialMessages?.length
 * 意图：--resume 后什么都不做就退出 → 不重复写盘（优化）。
 *
 * 【缺陷】用 length 比较是"恒真陷阱"：当数组被重建后长度恰好回到初始值
 * （如 /compact 把 N 条压成 M 条，而 M 恰好等于 resume 时的初始条数），
 * 判据翻转为 true → compact 后的全部内容不写盘 → 再 --resume 加载不到。
 *
 * 正确判据：数组引用身份（initialMessages 在整个组件生命周期内不变，
 * useState(initialMessages ?? []) 初始引用相同；任何 setMessages 都产生新数组）。
 *
 * 本文件同时断言"缺陷判据会误伤"与"修复判据不会误伤"，作为回归保护。
 */
import { describe, expect, test } from 'vitest'

type Msg = { uuid: string }

/** 缺陷判据（原实现） */
function isUnmodifiedByLength(
  messages: Msg[],
  initialMessages: Msg[] | undefined,
): boolean {
  return messages.length === initialMessages?.length
}

/** 修复判据（引用身份） */
function isUnmodifiedByIdentity(
  messages: Msg[],
  initialMessages: Msg[] | undefined,
): boolean {
  return messages === initialMessages
}

const initial: Msg[] = [
  { uuid: 'u1' },
  { uuid: 'u2' },
  { uuid: 'u3' },
]

describe('useLogMessages ignore 判据', () => {
  test('resume 后未操作：两种判据都判定"未修改"（均应跳过写盘）', () => {
    const messages = initial // useState 初始引用相同
    expect(isUnmodifiedByLength(messages, initial)).toBe(true)
    expect(isUnmodifiedByIdentity(messages, initial)).toBe(true)
  })

  test('缺陷：compact 重建数组且长度恰好相等 → 长度判据误判为"未修改"', () => {
    // /compact 后 setMessages 产生新数组，但条数可能恰好等于初始条数
    const afterCompact: Msg[] = [
      { uuid: 'boundary' },
      { uuid: 'summary' },
      { uuid: 'keep' },
    ]
    expect(afterCompact).not.toBe(initial)
    // 缺陷判据：误判为未修改 → 内容不写盘
    expect(isUnmodifiedByLength(afterCompact, initial)).toBe(true)
    // 修复判据：正确识别为已修改 → 正常写盘
    expect(isUnmodifiedByIdentity(afterCompact, initial)).toBe(false)
  })

  test('缺陷：同长度替换（rewind/重写）也被误判', () => {
    const replaced: Msg[] = [
      { uuid: 'x1' },
      { uuid: 'x2' },
      { uuid: 'x3' },
    ]
    expect(isUnmodifiedByLength(replaced, initial)).toBe(true) // 误判
    expect(isUnmodifiedByIdentity(replaced, initial)).toBe(false) // 正确
  })

  test('新增消息：两种判据都判定"已修改"', () => {
    const grown: Msg[] = [...initial, { uuid: 'u4' }]
    expect(isUnmodifiedByLength(grown, initial)).toBe(false)
    expect(isUnmodifiedByIdentity(grown, initial)).toBe(false)
  })

  test('全新会话（无 initialMessages）：不得判定为未修改', () => {
    const fresh: Msg[] = []
    // length 判据：0 === undefined → false，偶然正确
    expect(isUnmodifiedByLength(fresh, undefined)).toBe(false)
    // 身份判据：[] !== undefined → false，同样正确
    expect(isUnmodifiedByIdentity(fresh, undefined)).toBe(false)
  })

  test('边界：全新会话已有消息，长度恰好为 0 的情况不存在（数组非空）', () => {
    const fresh: Msg[] = [{ uuid: 'a' }]
    expect(isUnmodifiedByLength(fresh, undefined)).toBe(false)
    expect(isUnmodifiedByIdentity(fresh, undefined)).toBe(false)
  })
})
