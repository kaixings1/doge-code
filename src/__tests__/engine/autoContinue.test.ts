import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageLoop, type MessageLoopDeps, type QueryResult, type AutoContinueConfig } from '../../engine/messageLoop.js'
import { QueryStateMachine } from '../../engine/stateMachine.js'
import { TokenBudgetManager } from '../../engine/tokenBudgetManager.js'
import { RequestBuilder } from '../../engine/requestBuilder.js'
import { ResponseHandler } from '../../engine/responseHandler.js'
import { ToolScheduler } from '../../engine/toolScheduler.js'
import { RetryHandler } from '../../engine/errors/retryHandler.js'

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
    return (this as unknown as { _recordAssistantResponse(processed: unknown): Promise<boolean> })._recordAssistantResponse({
      content: processed.content,
      toolCalls: processed.toolCalls,
      stopReason: processed.stopReason,
      needsUserInput: processed.needsUserInput ?? false,
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'test',
    } as any)
  }
}

function createDeps(overrides: Partial<MessageLoopDeps> = {}, autoContinue?: AutoContinueConfig): MessageLoopDeps {
  return {
    stateMachine: new QueryStateMachine(),
    tokenBudget: new TokenBudgetManager(),
    requestBuilder: new RequestBuilder(),
    responseHandler: new ResponseHandler(),
    retryHandler: new RetryHandler(),
    toolScheduler: new ToolScheduler(new Map(), { check: async () => true, requestAuthorization: async () => true, requestPermission: async () => true } as any, { execute: async () => ({ content: '', toolUseId: '', success: true }) } as any),
    apiClient: { sendMessage: async () => [] } as any,
    conversation: { messages: [], addToolResults: () => {} },
    systemPrompt: 'test',
    model: 'test',
    maxOutputTokens: 4000,
    toolDefinitions: [],
    provider: 'openai' as any,
    autoContinue,
    ...overrides,
  }
}

describe('MessageLoop 自动继续', () => {
  let loop: TestableMessageLoop
  let onEvent: ReturnType<typeof vi.fn>

  // 带配置创建 loop，验证「由配置决定是否自动继续」
  function makeLoop(autoContinue?: AutoContinueConfig) {
    onEvent = vi.fn()
    loop = new TestableMessageLoop(createDeps({ onEvent }, autoContinue))
    ;(loop as any).lastToolCalls = []
    return loop
  }

  beforeEach(() => {
    onEvent = vi.fn()
    loop = new TestableMessageLoop(createDeps({ onEvent }))
    ;(loop as any).lastToolCalls = []
  })

  // ── 默认开启：未配置时自动继续 ��─

  it('未配置 autoContinue 时，AI 回复含"是否继续"应自动继续', async () => {
    const result = await loop.recordAssistant({
      content: '是否继续处理剩余文件？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('未配置 autoContinue 时，read 后 AI 返回纯文本应自动继续', async () => {
    ;(loop as any).lastToolCalls = [{ name: 'read' }]
    const result = await loop.recordAssistant({
      content: '这是文件内容分析',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  // ── 关键词触发（需配置 continueKeyword: true） ──

  it('AI 回复含"是否继续处理"且配置 keyword 时应自动继续', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '是否继续处理？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('AI 回复含"继续吗"且配置 keyword 时应自动继续', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '你现在要继续吗？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('显式设置 enabled: false 时应阻止自动继续（即使含关键词）', async () => {
    const l = makeLoop({ enabled: false, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '是否继续？',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  // ── read/search 后提前终止（需配置 enabled: true） ──

  it('上一步执行了 read，AI 返回纯文本且配置 enabled 时应自动继续', async () => {
    const l = makeLoop({ enabled: true })
    ;(l as any).lastToolCalls = [{ name: 'read' }]
    const result = await l.recordAssistant({
      content: '这是文件内容分析',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('上一步执行了 grep，AI 返回纯文本且配置 enabled 时应自动继续', async () => {
    const l = makeLoop({ enabled: true })
    ;(l as any).lastToolCalls = [{ name: 'grep' }]
    const result = await l.recordAssistant({
      content: '匹配到 3 处',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  // ── 新正则边界：不应触发自动继续的模糊表达 ──

  it('AI 单独说"是否"不应自动继续（新正则要求完整句式）', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '这是否正确',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('AI 单独说"继续"不应自动继续（新正则要求完整问句）', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '让我继续处理',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('AI 说"没问题"不应自动继续（新正则已移除）', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '没问题',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('AI 说"确认一下"不应自动继续（新正则已移除）', async () => {
    const l = makeLoop({ enabled: true, continueKeyword: true })
    const result = await l.recordAssistant({
      content: '确认一下信息',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  // ── 不触发自动继续的情况 ──

  it('无关键词且无 read/search 时应停止（即使 enabled）', async () => {
    const l = makeLoop({ enabled: true })
    const result = await l.recordAssistant({
      content: '任务已完成',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('上一步是 write 工具，AI 返回纯文本不应自动继续（即使 enabled）', async () => {
    const l = makeLoop({ enabled: true })
    ;(l as any).lastToolCalls = [{ name: 'write' }]
    const result = await l.recordAssistant({
      content: '文件已写入',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  it('空内容不应触发自动继续（即使 enabled）', async () => {
    const l = makeLoop({ enabled: true })
    const result = await l.recordAssistant({
      content: '',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  // ── end_turn 自动继续（需配置 endTurn: true） ──

  it('end_turn 有内容且配置 endTurn 时应自动继续', async () => {
    const l = makeLoop({ enabled: true, endTurn: true })
    const result = await l.recordAssistant({
      content: '这是最终回复',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(true)
  })

  it('end_turn 有内容但未配置 endTurn 时不应自动继续', async () => {
    const l = makeLoop({ enabled: true })
    const result = await l.recordAssistant({
      content: '这是最终回复',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(result).toBe(false)
  })

  // ── maxCount 上限 ──

  it('超过 maxCount 后不应再自动继续（防无限循环）', async () => {
    const l = makeLoop({ enabled: true, readSearch: true, maxCount: 1 })
    ;(l as any).lastToolCalls = [{ name: 'read' }]
    const r1 = await l.recordAssistant({
      content: '第一次分析',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(r1).toBe(true)
    ;(l as any).lastToolCalls = [{ name: 'read' }]
    const r2 = await l.recordAssistant({
      content: '第二次分析',
      toolCalls: [],
      stopReason: 'end_turn',
    })
    expect(r2).toBe(false)
  })
})