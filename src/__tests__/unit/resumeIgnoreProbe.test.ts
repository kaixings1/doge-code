/**
 * 探针测试：验证 REPL.tsx:3745 的 useLogMessages ignore 判据
 *     useLogMessages(messages, messages.length === initialMessages?.length)
 * 在三种真实数据流下的实际取值：
 *   A. --resume 后用户什么都没做         → 期望 ignore=true（优化，不写盘）
 *   B. --resume 后 /compact（非 fullscreen）→ 期望 ignore=false（必须写盘）
 *   C. --resume 后中断产生 partial-assistant → 期望 ignore=false（必须写盘）
 *
 * 目的：确认判据能否区分"A 不该写"与"B/C 该写"。
 * 若 B/C 也得到 ignore=true，则判据误伤 —— 中断后内容丢失，--resume 加载不到。
 */
import { describe, expect, test } from 'vitest'

/** 复刻 REPL.tsx:3745 的判据（最小表达） */
function shouldIgnoreWrite(
  messagesLength: number,
  initialMessagesLength: number | undefined,
): boolean {
  return messagesLength === initialMessagesLength
}

describe('REPL:3745 ignore 判据探针', () => {
  test('A. resume 后未操作 → ignore=true（不写盘，符合优化意图）', () => {
    const initial = 42
    expect(shouldIgnoreWrite(42, initial)).toBe(true)
  })

  test('B. /compact 后消息数恰好回到初始值 → 判据为 true（误伤！）', () => {
    // 非 fullscreen：setMessages(() => [newMessage]) 长度为 1，不会撞上。
    expect(shouldIgnoreWrite(1, 42)).toBe(false)

    // 但若 compact 结果的行数恰好等于初始长度（真实可能：再次 resume 一个
    // 已压缩过的会话，其 initialMessages 本身就是压缩后的短数组），
    // 判据翻转为 true —— 此时 compact 后的内容全部不写盘。
    const initialFromPreviousResume = 3 // [boundary, summary, keep...]
    const afterSecondCompact = 3 // 结构相同的压缩结果
    expect(shouldIgnoreWrite(afterSecondCompact, initialFromPreviousResume)).toBe(
      true,
    )
  })

  test('C. 中断产生 partial-assistant（长度 +1）→ ignore=false（正常）', () => {
    const initial = 42
    expect(shouldIgnoreWrite(43, initial)).toBe(false)
  })

  test('判据的边界：initialMessages 为 undefined（全新会话）', () => {
    // undefined → messages.length === undefined 恒 false → 总是写盘
    expect(shouldIgnoreWrite(0, undefined)).toBe(false)
    expect(shouldIgnoreWrite(5, undefined)).toBe(false)
  })
})
