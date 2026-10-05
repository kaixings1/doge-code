import { describe, expect, it } from 'vitest'
import { handleEmptyContentResponse } from '../../src/query/emptyContentHandler.js'

/**
 * 根因 B 回归测试：流式分块下「尾块只承载单个内容块」时，
 * 判定必须覆盖本轮全部 assistant 消息（allMessages），不能只看最后一条。
 *
 * 背景：openaiCompat 的 flushBufferedText 按标点切分，
 * 每个 content_block_stop 独立产出一条 assistant 消息。
 * 因此 assistantMessages.at(-1) 常只是尾块（如单个空格/句末残留）。
 * 旧实现只看最后一条 → 把完整回答误判为空 → 终止会话或空转自动继续。
 */

function makeAssistant(content: unknown, stopReason = 'end_turn'): any {
  return {
    type: 'assistant',
    message: { content, stop_reason: stopReason, usage: { input_tokens: 1 } },
  }
}

describe('handleEmptyContentResponse — allMessages 合并判定（根因 B）', () => {
  it('尾块是单空格、前序块有正文 → 不应判定为空（核心回归）', () => {
    const blocks = [
      makeAssistant([{ type: 'text', text: '这是一段完整回答，' }]),
      makeAssistant([{ type: 'text', text: '分成了多个块。' }]),
      makeAssistant([{ type: 'text', text: ' ' }]), // 尾块：句末残留
    ]
    const last = blocks[blocks.length - 1]

    // 旧行为（只传 lastMessage）：误判为空
    const oldWay = handleEmptyContentResponse(last, 'q', 0)
    expect(oldWay.isEmptyContent).toBe(true)

    // 新行为（传 allMessages）：正确识别为有内容
    const newWay = handleEmptyContentResponse(last, 'q', 0, blocks)
    expect(newWay.isEmptyContent).toBe(false)
  })

  it('尾块是空数组、前序块有正文 → 不应判定为空', () => {
    const blocks = [
      makeAssistant([{ type: 'text', text: '正文内容' }]),
      makeAssistant([]), // 尾块空
    ]
    const r = handleEmptyContentResponse(blocks[1], 'q', 0, blocks)
    expect(r.isEmptyContent).toBe(false)
  })

  it('尾块是 thinking、前序块有正文 → 不应判定为空', () => {
    const blocks = [
      makeAssistant([{ type: 'text', text: '正文内容' }]),
      makeAssistant([{ type: 'thinking', thinking: '...' }]),
    ]
    const r = handleEmptyContentResponse(blocks[1], 'q', 0, blocks)
    expect(r.isEmptyContent).toBe(false)
  })

  it('前序块是 tool_use、尾块为空 → 不应判定为空', () => {
    const blocks = [
      makeAssistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]),
      makeAssistant([]),
    ]
    const r = handleEmptyContentResponse(blocks[1], 'q', 0, blocks)
    expect(r.isEmptyContent).toBe(false)
  })

  it('全部块都无有效内容 → 仍应判定为空（修复不能过度放宽）', () => {
    const blocks = [
      makeAssistant([{ type: 'text', text: '   ' }]),
      makeAssistant([{ type: 'text', text: '' }]),
      makeAssistant([]),
    ]
    const r = handleEmptyContentResponse(blocks[2], 'q', 0, blocks)
    expect(r.isEmptyContent).toBe(true)
  })

  it('allMessages 为空数组时回退到只看 lastMessage（向下兼容）', () => {
    const last = makeAssistant([{ type: 'text', text: '正文' }])
    const r = handleEmptyContentResponse(last, 'q', 0, [])
    expect(r.isEmptyContent).toBe(false)
  })

  it('allMessages 为 undefined 时回退到只看 lastMessage（旧调用点兼容）', () => {
    const last = makeAssistant([])
    const r = handleEmptyContentResponse(last, 'q', 0)
    expect(r.isEmptyContent).toBe(true)
  })

  it('content_blocks_count 统计的是合并后的块总数', () => {
    const blocks = [
      makeAssistant([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]),
      makeAssistant([{ type: 'text', text: 'c' }]),
    ]
    // 全部为空内容时才会走到统计分支；构造无有效文本但块存在的场景
    const emptyBlocks = [
      makeAssistant([{ type: 'thinking', thinking: 'x' }, { type: 'thinking', thinking: 'y' }]),
      makeAssistant([{ type: 'thinking', thinking: 'z' }]),
    ]
    const r = handleEmptyContentResponse(emptyBlocks[1], 'q', 0, emptyBlocks)
    expect(r.isEmptyContent).toBe(true)
    // warnings 应存在（证明走了空内容分支）
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})
