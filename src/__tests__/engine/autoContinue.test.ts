import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageLoop, type MessageLoopDeps, type QueryResult } from '../../engine/messageLoop.js'
import { QueryStateMachine } from '../../engine/stateMachine.js'
import { TokenBudgetManager } from '../../engine/tokenBudgetManager.js'
import { RequestBuilder } from '../../engine/requestBuilder.js'
import { ResponseHandler } from '../../engine/responseHandler.js'
import { ToolScheduler } from '../../engine/toolScheduler.js'

/**
 * 暴露 _recordAssistantResponse 以便测试
 */
class TestableMessageLoop extends MessageLoop {
  async recordAssistant(processed: {
    content: string
    toolCalls: Array<{ name: string }>
    stopReason: string
    needsUserInput?: boolean
  }): Promise<boolean> {
    return this._recordAssistantResponse({
      content: processed.content,
      toolCalls: processed.toolCalls,
      stopReason: processed.stopReason,
      needsUserInput: processed.needsUserInput ?? false,
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'test',
    } as any)
  }
}

function createDeps(overrides: Partial<MessageLoopDeps> = {}): MessageLoopDeps {
  return {
    stateMachine: new QueryStateMachine(),
    tokenBudget: new TokenBudgetManager(),
    requestBuilder: new RequestBuilder(),
    responseHandler: new ResponseHandler(),
    toolScheduler: new ToolScheduler(new Map(), { check: async () => true, requestAuthorization: async () => true, requestPermission: async () => true } as any, { execute: async () => ({ content: '', toolUseId: '', success: true }) } as any),
    apiClient: { sendMessage: async () => [] } as any,
    conversation: { messages: [], addToolResults: () => {} },
    systemPrompt: 'test',
    model: 'test',
    maxOutputTokens: 4000,
    toolDefinitions: [],
    provider: 'openai' as any,
    ...overrides,
  }
}

describe('MessageLoop 自动继续', () => {
  let loop: TestableMessageLoop
  let onEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onEvent = vi.fn()
    loop = new TestableMessageLoop(createDeps({ onEvent }))
    ;(loop as any).lastToolCalls = []
  })

  // ── 关键词触发 ──

  it('AI 回复含"是否继续"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '是否继续处理剩余文件？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"继续吗"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '你现在要继续吗？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"如果要继续，请确认"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '如果要继续，请确认...',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"需要我继续吗"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '需要我继续吗？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"确认一下后续操作"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '确认一下后续操作',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"没问题的话我就继续了"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '没问题的话我就继续了',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  // ── read/search 后提前终止 ──

  it('上一步执行了 read，AI 返回纯文本应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'read' }]
    const result = await loop.recordAssistant({
      content: '这是文件内容分析',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('上一步执行了 search，AI 返回纯文本应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'search' }]
    const result = await loop.recordAssistant({
      content: '搜索完成',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('上一步执行了 glob，AI 返回纯文本应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'glob' }]
    const result = await loop.recordAssistant({
      content: '找到 5 个文件',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('上一步执行了 grep，AI 返回纯文本应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'grep' }]
    const result = await loop.recordAssistant({
      content: '匹配到 3 处',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  // ── 不触发自动继续的情况 ──

  it('无关键词且无 read/search 时应停止', async () => {
    const result = await loop.recordAssistant({
      content: '任务已完成',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('上一步是 write 工具，AI 返回纯文本不应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'write' }]
    const result = await loop.recordAssistant({
      content: '文件已写入',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('read 后 AI 继续调用工具应继续循环（非自动继续，但必须执行工具）', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'read' }]
    const result = await loop.recordAssistant({
      content: '文件内容已分析完毕，开始编辑',
      toolCalls: [{ name: 'edit' }],
      stopReason: 'end_turn',
    })
    // 有工具调用 → 必须继续执行工具（不是自动继续，是正常工具流程）
    expect(result).toBe(true)
  })

  it('空内容不应触发自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })
})
