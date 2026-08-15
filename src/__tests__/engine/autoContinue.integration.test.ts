import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageLoop, type MessageLoopDeps, type QueryResult } from '../../engine/messageLoop.js'
import { QueryStateMachine } from '../../engine/stateMachine.js'
import { TokenBudgetManager } from '../../engine/tokenBudgetManager.js'
import { RequestBuilder } from '../../engine/requestBuilder.js'
import { ResponseHandler, type APIEvent } from '../../engine/responseHandler.js'
import { ToolScheduler } from '../../engine/toolScheduler.js'
import { type InternalMessage } from '../../engine/messageNormalizer.js'

/**
 * 端到端集成测试：验证 _recordAssistantResponse → runIteration → run() 的自动继续调用链
 *
 * 核心场景：AI 第一次返回 end_turn + 关键词 → _recordAssistantResponse 返回 true
 * → runIteration 继续循环 → 第二次 API 调用 → 最终结束
 */
describe('MessageLoop 自动继续集成测试', () => {
  let onEvent: ReturnType<typeof vi.fn>

  function createMockApiClient(responses: Array<{ content: string; stopReason: string; toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }> }>) {
    let callIndex = 0
    const client = {
      sendMessage: async (_req: unknown): Promise<AsyncIterable<APIEvent>> => {
        const idx = callIndex
        callIndex++
        const response = responses[idx]
        // 生成符合 Anthropic 格式的流式事件序列，支持 text + tool_use blocks
        async function* generator() {
          await new Promise(resolve => setTimeout(resolve, 10))
          yield {
            type: 'message_start',
            message: {
              id: `msg_${idx + 1}`,
              type: 'message',
              role: 'assistant',
              content: [],
              model: 'test-model',
              stop_reason: response.stopReason,
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          } as APIEvent

          let blockIndex = 0
          // text block（如果有内容）
          if (response.content) {
            yield {
              type: 'content_block_start',
              content_block: { type: 'text', text: '' },
              index: blockIndex,
            } as APIEvent
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: response.content },
              index: blockIndex,
            } as APIEvent
            yield { type: 'content_block_stop', index: blockIndex } as APIEvent
            blockIndex++
          }
          // tool_use blocks（如果有工具调用）
          for (const tc of (response.toolCalls ?? [])) {
            yield {
              type: 'content_block_start',
              content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: tc.input },
              index: blockIndex,
            } as APIEvent
            yield { type: 'content_block_stop', index: blockIndex } as APIEvent
            blockIndex++
          }
          yield { type: 'message_delta', delta: { stop_reason: response.stopReason }, usage: { input_tokens: 100, output_tokens: 50 } } as APIEvent
          yield { type: 'message_stop' } as APIEvent
        }
        return generator()
      },
      get callCount() {
        return callIndex
      },
    }
    return client
  }

  function createDeps(
    apiResponses: Array<{ content: string; stopReason: string; toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }> }>,
    overrides: Partial<MessageLoopDeps> = {}
  ): MessageLoopDeps {
    const mockApiClient = createMockApiClient(apiResponses)
    onEvent = vi.fn()

    // 注册常用 mock 工具（含 validate/execute），避免被过滤为 invalid
    const toolRegistry = new Map<string, import('../../engine/toolScheduler.ts').Tool>([
      ['read', { name: 'read', description: '读取文件', parameters: { type: 'object', properties: { file_path: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
      ['write', { name: 'write', description: '写入文件', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
      ['search', { name: 'search', description: '搜索文件', parameters: { type: 'object', properties: { query: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
      ['glob', { name: 'glob', description: '匹配文件', parameters: { type: 'object', properties: { pattern: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
      ['grep', { name: 'grep', description: '搜索内容', parameters: { type: 'object', properties: { pattern: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
      ['edit', { name: 'edit', description: '编辑文件', parameters: { type: 'object', properties: { file_path: { type: 'string' } } }, validate: () => ({ valid: true }), execute: async () => ({ content: '' }) }],
    ])
    const toolDefinitions = Array.from(toolRegistry.values())

    return {
      stateMachine: new QueryStateMachine(),
      tokenBudget: new TokenBudgetManager(),
      requestBuilder: new RequestBuilder(),
      responseHandler: new ResponseHandler(),
      toolScheduler: new ToolScheduler(
        toolRegistry,
        { check: async () => true, requestAuthorization: async () => true, requestPermission: async () => true } as any,
        { execute: async () => ({ content: '', toolUseId: '', success: true }) } as any
      ),
      apiClient: mockApiClient,
      conversation: {
        messages: [],
        addToolResults: (_results: unknown[]) => {},
      },
      systemPrompt: 'You are a helpful assistant.',
      model: 'test-model',
      maxOutputTokens: 4000,
      toolDefinitions,
      provider: 'openai' as any,
      onEvent,
      ...overrides,
    }
  }

  // ── 场景 1：AI 回复含"是否继续"关键词，应自动继续并发送第二次请求 ──

  it('AI 回复含"是否继续"应自动继续并执行第二次 API 调用', async () => {
    const deps = createDeps([
      { content: '是否继续处理剩余文件？', stopReason: 'end_turn' },
      { content: '已处理完毕，任务完成。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('请帮我分析项目')

    // 验证：sendMessage 被调用了 2 次（第一次 + 自动继续的第二次）
    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(2)

    // 验证：conversation 中有两轮 assistant 回复
    const assistantMessages = result.messages.filter(m => m.role === 'assistant')
    expect(assistantMessages.length).toBe(2)

    // 验证：最终状态为 done（不是 crashed 或 should_continue）
    expect(result.state).toBe('done')

    // 验证：迭代次数为 2
    expect(result.iterations).toBe(2)
  })

  it('AI 回复含"需要我继续吗"应自动继续', async () => {
    const deps = createDeps([
      { content: '需要我继续吗？', stopReason: 'end_turn' },
      { content: '后续操作已执行完毕。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('执行任务')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(2)
    expect(result.iterations).toBe(2)
    expect(result.state).toBe('done')
  })

  // ── 场景 2：上一步执行了 read，AI 返回纯文本应自动继续 ──

  it('上一步执行了 read，AI 返回纯文本应自动继续', async () => {
    const deps = createDeps([
      // 第一轮：AI 调用 read 工具
      {
        content: '先读取文件',
        stopReason: 'end_turn',
        toolCalls: [{ id: 'tc_1', name: 'read', input: { file_path: '/test.ts' } }],
      },
      // 第二轮：AI 分析文件内容，但只返回文本（这是 bug 场景：提前终止）
      { content: '文件内容分析完毕，未发现异常。', stopReason: 'end_turn' },
      // 第三轮：自动继续后 AI 完成分析
      { content: '分析完成，发现 3 个潜在问题。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('请分析这个文件')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    // 应调用 3 次：初始 + read工具执行后 + 自动继续
    expect(apiClient.callCount).toBe(3)
    expect(result.iterations).toBe(3)
    expect(result.state).toBe('done')
  })

  it('上一步执行了 search，AI 返回纯文本应自动继续', async () => {
    const deps = createDeps([
      {
        content: '开始搜索',
        stopReason: 'end_turn',
        toolCalls: [{ id: 'tc_1', name: 'search', input: { query: 'test' } }],
      },
      { content: '搜索完成，共 3 条匹配。', stopReason: 'end_turn' },
      { content: '根据搜索结果，共 3 条匹配，已整理完毕。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('搜索相关代码')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(3)
    expect(result.iterations).toBe(3)
    expect(result.state).toBe('done')
  })

  // ── 场景 3：不应自动继续的情况 ──

  it('无关键词且无 read/search 时应停止，只调用一次 API', async () => {
    const deps = createDeps([
      { content: '任务已完成，无其他待办事项。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('完成任务')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(1)
    expect(result.iterations).toBe(1)
    expect(result.state).toBe('done')
  })

  it('上一步是 write 工具，AI 返回纯文本不应自动继续', async () => {
    const deps = createDeps([
      {
        content: '开始写入文件',
        stopReason: 'end_turn',
        toolCalls: [{ id: 'tc_1', name: 'write', input: { file_path: '/test.ts', content: '...' } }],
      },
      { content: '文件已成功写入。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('写入文件')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(2) // write工具调用1次 + 文本回复1次
    expect(result.iterations).toBe(2)
    expect(result.state).toBe('done')
  })

  // ── 场景 4：关键词触发后自动继续，但第二次回复正常结束 ──

  it('关键词触发自动继续后，第二次回复正常结束', async () => {
    const deps = createDeps([
      { content: '确认一下后续操作', stopReason: 'end_turn' },
      { content: '好的，操作已执行完毕。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('执行操作')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(2)
    expect(result.iterations).toBe(2)
    expect(result.state).toBe('done')
  })

  // ── 场景 5：max_tokens 也应继续（不依赖自动继续逻辑） ──

  it('stopReason 为 max_tokens 应自动继续', async () => {
    const deps = createDeps([
      { content: '输出被截断...', stopReason: 'max_tokens' },
      { content: '续上之前的内容，全部输出完毕。', stopReason: 'end_turn' },
    ])

    const loop = new MessageLoop(deps)
    const result = await loop.run('生成长文本')

    const apiClient = deps.apiClient as ReturnType<typeof createMockApiClient>
    expect(apiClient.callCount).toBe(2)
    expect(result.iterations).toBe(2)
    expect(result.state).toBe('done')
  })
})
