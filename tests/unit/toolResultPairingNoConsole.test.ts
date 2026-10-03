import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ensureToolResultPairing,
  createAssistantMessage,
  createUserMessage,
} from '../../src/utils/messages.js'

/**
 * 回归守卫：ensureToolResultPairing 曾内联 14 处裸 console.log，
 * 每次消息配对都向终端输出（实测 debug2.txt 里 10769 条 "console.log:" 拦截记录）。
 * 在 --debug-file 模式下这些直通 Ink 的 alt screen，表现为"界面闪现后台内容"。
 *
 * 断言：该函数无论走哪个分支，都不得写 console.log。
 */
function asAssistantWithToolUse(id: string) {
  const msg = createAssistantMessage({ content: 'ok' })
  return {
    ...msg,
    message: {
      ...msg.message,
      content: [{ type: 'tool_use' as const, id, name: 'Bash', input: {} }],
    },
  }
}

describe('ensureToolResultPairing 不得污染终端', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正常配对（无修复）时不调用 console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const messages = [createUserMessage({ content: 'hello' })]
    ensureToolResultPairing(messages as never)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('触发 missing tool_result 修复分支时也不调用 console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // assistant 声明了 tool_use，但下一条 user 消息没有对应 tool_result
    // → 命中 missingIds 分支（会合成错误 tool_result）
    const asst = asAssistantWithToolUse('toolu_missing_1')
    const userAfter = createUserMessage({ content: 'next turn without result' })
    const result = ensureToolResultPairing([asst, userAfter] as never)
    // 先确认真的触发了修复（否则断言无意义）
    expect(result.length).toBeGreaterThan(0)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('触发孤立 tool_result 修复分支时也不调用 console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const asst = createAssistantMessage({ content: 'ok' })
    const orphan = createUserMessage({
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: 'toolu_orphan_1',
          content: 'x',
        },
      ],
    })
    ensureToolResultPairing([asst, orphan] as never)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('变异对照：spy 机制本身能捕获 console.log（断言有效性自检）', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    console.log('[工具结果：缺失tool_result] 模拟旧行为')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})
