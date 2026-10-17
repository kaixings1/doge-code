/**
 * StreamingToolExecutor.discard() 后 inProgressToolUseIDs 必须被清空的回归测试。
 *
 * 背景（2026-10）：模型回退 / tombstone 路径（query.ts:707/869）调用 discard() 后
 * 换新 executor。旧 executor 的 getCompletedResults / getRemainingResults 因
 * this.discarded 直接 return，工具 ID 永远不会被 markToolUseAsComplete 删除
 * → REPL 的 hasActiveTools 恒真 → 标题栏永远不显示 [空闲]、绿点永不出现。
 *
 * 本测试断言：discard() 后，已登记的 inProgressToolUseIDs 全部被删除。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreamingToolExecutor } from '../../src/services/tools/StreamingToolExecutor.js'

type TrackedTool = {
  id: string
  status: 'queued' | 'executing' | 'completed' | 'yielded'
  isConcurrencySafe: boolean
}

function makeToolUseContext(ids: Set<string>) {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test',
      tools: [],
      verbose: false,
      thinkingConfig: { budgetTokens: 0 },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { agentDefinitions: [], getAgentDefinition: () => undefined },
    },
    abortController: new AbortController(),
    readFileState: {
      states: new Map(),
      currentFile: undefined,
      updateFileState: () => {},
    },
    setInProgressToolUseIDs: (fn: (prev: Set<string>) => Set<string>) => {
      ids = fn(ids)
    },
    messages: [],
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    getAppState: () => ({}),
    setAppState: () => {},
  }
}

describe('StreamingToolExecutor.discard() 清理 inProgressToolUseIDs', () => {
  it('discard 后已登记的 ID 全部从 inProgressToolUseIDs 删除', () => {
    let ids = new Set<string>(['tool-1', 'tool-2'])
    const ctx = makeToolUseContext(ids)
    // 捕获 setter 后的最新集合
    const realCtx = {
      ...ctx,
      setInProgressToolUseIDs: (fn: (prev: Set<string>) => Set<string>) => {
        ids = fn(ids)
      },
    }

    const executor = new StreamingToolExecutor(
      [],
      async () => ({ ok: true, message: 'ok' }) as never,
      realCtx as never,
    )

    // 模拟已经登记了两个工具 ID
    ;(executor as unknown as { tools: TrackedTool[] }).tools = [
      { id: 'tool-1', status: 'executing', isConcurrencySafe: true },
      { id: 'tool-2', status: 'queued', isConcurrencySafe: true },
    ]

    executor.discard()

    expect(ids.size).toBe(0)
    expect(ids.has('tool-1')).toBe(false)
    expect(ids.has('tool-2')).toBe(false)
    // 消息提示：普通路径下 getCompletedResults 已删过（幂等），这里再删无副作用
  })

  it('discard 时未登记的 ID 不影响已有集合（删除幂等）', () => {
    let ids = new Set<string>(['unrelated-id'])
    const ctx = makeToolUseContext(ids)
    const realCtx = {
      ...ctx,
      setInProgressToolUseIDs: (fn: (prev: Set<string>) => Set<string>) => {
        ids = fn(ids)
      },
    }

    const executor = new StreamingToolExecutor(
      [],
      async () => ({ ok: true, message: 'ok' }) as never,
      realCtx as never,
    )
    ;(executor as unknown as { tools: TrackedTool[] }).tools = [
      { id: 'tool-1', status: 'executing', isConcurrencySafe: true },
    ]

    executor.discard()

    // 未被 executor 登记过的 ID 应保留（不影响其他并发 executor/远程会话）
    expect(ids.has('unrelated-id')).toBe(true)
  })
})