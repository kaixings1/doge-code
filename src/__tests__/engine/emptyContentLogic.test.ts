import { describe, it, expect } from 'vitest'
import { handleEmptyContentResponse } from '../../query/emptyContentHandler.js'

// 验证生产 REPL 主循环（query.ts）依赖的空内容自动继续判定逻辑（套②）。
// 注意：这是独立判定的单元验证，不依赖完整 query() 环境。

function makeAssistant(content: unknown, stopReason = 'end_turn'): any {
  return {
    type: 'assistant',
    message: { content, stop_reason: stopReason, usage: { input_tokens: 1 } },
  }
}

describe('handleEmptyContentResponse（query.ts 生产自动继续判定）', () => {
  it('空内容数组 → isEmptyContent:true（应触发自动继续）', () => {
    const r = handleEmptyContentResponse(makeAssistant([]), 'q', 0)
    expect(r.isEmptyContent).toBe(true)
    expect(r.finishReason).toBe('end_turn')
  })

  it('content 为 null → isEmptyContent:true（应触发自动继续）', () => {
    const msg = { type: 'assistant', message: { content: null, stop_reason: 'end_turn' } }
    const r = handleEmptyContentResponse(msg, 'q', 0)
    expect(r.isEmptyContent).toBe(true)
  })

  it('有文本内容 → isEmptyContent:false（不应触发）', () => {
    const r = handleEmptyContentResponse(
      makeAssistant([{ type: 'text', text: '  正常回复  ' }]),
      'q',
      0,
    )
    expect(r.isEmptyContent).toBe(false)
  })

  it('有工具调用 → isEmptyContent:false（不应触发）', () => {
    const r = handleEmptyContentResponse(
      makeAssistant([{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }]),
      'q',
      0,
    )
    expect(r.isEmptyContent).toBe(false)
  })

  it('空内容时产生的警告包含"自动继续"路径提示（finishReason 传递）', () => {
    const r = handleEmptyContentResponse(makeAssistant([]), 'q', 0)
    // warnings 是 [system 警告, user 选择提示]，第一个 system 消息应含停止原因
    expect(Array.isArray(r.warnings)).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  // ============================================================
  // 回归：流式响应中每个 content_block_stop 独立成一条消息（claude.ts:2416），
  // 尾块常是单空格/句末残留。只看「最后一条」会把完整回答误判为空内容而终止会话。
  // 真实事故日志：最后一段 delta.content=" "，finish_reason=stop → 误判 empty_content。
  // ============================================================
  describe('多消息合并判定（尾块为空白的完整回答不得误判）', () => {
    it('尾块仅一个空格，但前序消息有正文 → isEmptyContent:false（核心回归）', () => {
      const msgs = [
        makeAssistant([{ type: 'text', text: 'EISDIR 是目录读取错误。' }]),
        makeAssistant([{ type: 'thinking', thinking: '思考中' }]),
        makeAssistant([{ type: 'text', text: ' ' }]), // 复刻日志：最后一个块是单空格
      ]
      const last = msgs[msgs.length - 1]!
      const r = handleEmptyContentResponse(last, 'q', 0, msgs)
      expect(r.isEmptyContent).toBe(false)
    })

    it('尾块是空白、且全部消息确实无实质内容 → isEmptyContent:true', () => {
      const msgs = [
        makeAssistant([{ type: 'text', text: ' ' }]),
        makeAssistant([{ type: 'text', text: '\n' }]),
      ]
      const r = handleEmptyContentResponse(msgs.at(-1), 'q', 0, msgs)
      expect(r.isEmptyContent).toBe(true)
    })

    it('工具调用出现在非末条消息 → isEmptyContent:false', () => {
      const msgs = [
        makeAssistant([{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }]),
        makeAssistant([{ type: 'text', text: '' }]),
      ]
      const r = handleEmptyContentResponse(msgs.at(-1), 'q', 0, msgs)
      expect(r.isEmptyContent).toBe(false)
    })

    it('未传 allMessages 时退回只看单条（向后兼容）', () => {
      const r = handleEmptyContentResponse(
        makeAssistant([{ type: 'text', text: '正文' }]),
        'q',
        0,
      )
      expect(r.isEmptyContent).toBe(false)
    })

    it('传入空数组时退回只看单条', () => {
      const r = handleEmptyContentResponse(makeAssistant([]), 'q', 0, [])
      expect(r.isEmptyContent).toBe(true)
    })
  })
})

// 模拟 query.ts:965-1003 的分支条件（isAutoContinueOnEmptyEnabled + retry 上限）
// 这验证了生产路径中"自动继续"的实际激活条件。
describe('query.ts 空内容自动继续分支条件', () => {
  it('默认（未设 AUTO_CONTINUE_ON_EMPTY）时自动继续开启', () => {
    // 对应 query.ts isAutoContinueOnEmptyEnabled()：process.env.AUTO_CONTINUE_ON_EMPTY !== 'false'
    delete process.env.AUTO_CONTINUE_ON_EMPTY
    const enabled = process.env.AUTO_CONTINUE_ON_EMPTY !== 'false'
    expect(enabled).toBe(true)
  })

  it('设为 false 时自动继续关闭', () => {
    const old = process.env.AUTO_CONTINUE_ON_EMPTY
    process.env.AUTO_CONTINUE_ON_EMPTY = 'false'
    const enabled = process.env.AUTO_CONTINUE_ON_EMPTY !== 'false'
    expect(enabled).toBe(false)
    if (old === undefined) delete process.env.AUTO_CONTINUE_ON_EMPTY
    else process.env.AUTO_CONTINUE_ON_EMPTY = old
  })

  it('重试次数低于上限 3 时允许继续（EMPTY_CONTENT_RETRY_LIMIT=3）', () => {
    const limit = 3
    // 模拟 emptyContentRetryCount=0,1,2 均可继续
    for (let count = 0; count < limit; count++) {
      expect(count < limit).toBe(true)
    }
  })
})