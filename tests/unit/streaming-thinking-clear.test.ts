import { describe, expect, it, vi } from 'vitest'
import { handleMessageFromStream } from '../../src/utils/messages.js'

/**
 * 回归测试：界面只显示思考、看不到回复正文。
 *
 * Bug 现象：输入 "hi" 后界面只有 "∴ Thinking…" + 完整思考内容，中文回复
 * 「你好！有什么我可以帮你的？」不显示。
 *
 * 根因：服务端把一条回复拆成两条 assistant 消息返回——先 thinking 后 text。
 * handleMessageFromStream 收到含 thinking 的 assistant 消息时，设置
 * streamingThinking 副本（30 秒可见，硬编码 isTranscriptMode 形态），
 * 但收到最终含 text 的 assistant 消息时**不清除**它，导致副本长期遮挡
 * 正式正文消息。
 *
 * 修复：assistant 分支新增 else-if——消息不含 thinking 但含 text 时，
 * 清空 streamingThinking（onStreamingThinking(() => null)）。
 *
 * 本测试直接调用真实源码的 handleMessageFromStream，不复刻逻辑。
 */

/** 构造 assistant 消息，模拟服务端返回形态 */
function assistantMsg(blocks: Array<Record<string, unknown>>) {
  return {
    type: 'assistant',
    message: {
      id: 'msg-1',
      role: 'assistant',
      model: 'step-3.7-flash',
      content: blocks,
    },
    uuid: 'uuid-1',
  } as never
}

/** 收集 onStreamingThinking 的更新，归纳出最终状态 */
function makeSink() {
  let current: unknown = { thinking: 'stale', isStreaming: false, streamingEndedAt: 0 }
  return {
    apply: (f: (c: unknown) => unknown) => {
      current = f(current)
      return current
    },
    get: () => current,
  }
}

const noop = () => {}

describe('handleMessageFromStream — 最终正文消息清除实时思考副本', () => {
  it('收到含 text 的 assistant 消息时清空 streamingThinking', () => {
    const sink = makeSink()
    // 前置：模拟先收到 thinking，副本已被设置
    handleMessageFromStream(
      assistantMsg([{ type: 'thinking', thinking: '我在思考' }]),
      noop, noop, noop, noop, undefined, sink.apply,
    )
    expect(sink.get()).toMatchObject({ thinking: '我在思考' })

    // 关键：收到最终含 text 的消息
    handleMessageFromStream(
      assistantMsg([{ type: 'text', text: '你好！有什么我可以帮你的？' }]),
      noop, noop, noop, noop, undefined, sink.apply,
    )
    expect(sink.get()).toBeNull()
  })

  it('含 thinking 的消息仍会设置副本（不被新分支误伤）', () => {
    const sink = makeSink()
    handleMessageFromStream(
      assistantMsg([{ type: 'thinking', thinking: '分析中' }]),
      noop, noop, noop, noop, undefined, sink.apply,
    )
    expect(sink.get()).toMatchObject({ thinking: '分析中', isStreaming: false })
  })

  it('同时含 thinking 与 text 时，优先保留 thinking 副本（不误清）', () => {
    const sink = makeSink()
    handleMessageFromStream(
      assistantMsg([
        { type: 'thinking', thinking: '先思考' },
        { type: 'text', text: '再回答' },
      ]),
      noop, noop, noop, noop, undefined, sink.apply,
    )
    // 有 thinking 走 if 分支 → 设置为思考副本，而非清空
    expect(sink.get()).toMatchObject({ thinking: '先思考' })
  })

  it('变异对照：若无 else-if 分支，含 text 的消息不会清空副本', () => {
    // 该用例锁定「修复确实改变了行为」——移除 else-if 后此断言会失败。
    const sink = makeSink()
    handleMessageFromStream(
      assistantMsg([{ type: 'text', text: '仅正文' }]),
      noop, noop, noop, noop, undefined, sink.apply,
    )
    // 修复后：仅 text → 清空（预期 null）
    expect(sink.get()).toBeNull()
  })
})
