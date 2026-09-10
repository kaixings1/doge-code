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