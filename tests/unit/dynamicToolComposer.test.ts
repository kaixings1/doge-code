import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 动态工具组合器位于 src/utils/dynamicToolComposer.ts，但测试通过 vitest 的
// ESM resolve hook（tests/setup.ts）解析 .ts 后缀。
import {
  composeToolsForTurn,
  isDynamicToolComposerEnabled,
  type DynamicToolComposerOptions,
} from '../../src/utils/dynamicToolComposer'

// ─── 模拟工具工厂 ──────────────────────────────────────

function makeTool(name: string, opts: { isMcp?: boolean } = {}): any {
  return {
    name,
    isMcp: opts.isMcp ?? false,
    description: () => `Tool ${name}`,
    inputSchema: {},
    call: async () => ({ type: 'text', value: '' }),
    isEnabled: () => true,
    checkPermissions: async () => ({ allowed: true }),
  }
}

const ALWAYS_ON_NAMES = [
  'AgentTool',
  'TodoWriteTool',
  'TaskCreateTool',
  'TaskGetTool',
  'TaskUpdateTool',
  'TaskListTool',
]

const allTools = [
  ...ALWAYS_ON_NAMES.map(n => makeTool(n)),
  makeTool('BashTool'),
  makeTool('FileReadTool'),
  makeTool('FileWriteTool'),
  makeTool('FileEditTool'),
  makeTool('GrepTool'),
  makeTool('WebSearchTool'),
  makeTool('WebFetchTool'),
  makeTool('AdvisorTool'),
  makeTool('MonitorTool'),
  makeTool('BackupTool'),
  makeTool('McpTool', { isMcp: true }),
]

function makeMessage(
  type: 'user' | 'assistant',
  content: unknown,
): { type: string; message?: { content?: unknown } } {
  return { type, message: { content } }
}

// ─── 测试 ──────────────────────────────────────────────

describe('DynamicToolComposer', () => {
  beforeEach(() => {
    delete process.env.ENABLE_DYNAMIC_TOOL_COMPOSER
  })

  afterEach(() => {
    delete process.env.ENABLE_DYNAMIC_TOOL_COMPOSER
  })

  describe('isDynamicToolComposerEnabled', () => {
    it('returns false when env var is not set', () => {
      expect(isDynamicToolComposerEnabled()).toBe(false)
    })

    it('returns true when ENABLE_DYNAMIC_TOOL_COMPOSER=true', () => {
      process.env.ENABLE_DYNAMIC_TOOL_COMPOSER = 'true'
      expect(isDynamicToolComposerEnabled()).toBe(true)
    })

    it('returns false for other values', () => {
      process.env.ENABLE_DYNAMIC_TOOL_COMPOSER = 'false'
      expect(isDynamicToolComposerEnabled()).toBe(false)
      process.env.ENABLE_DYNAMIC_TOOL_COMPOSER = 'auto'
      expect(isDynamicToolComposerEnabled()).toBe(false)
    })
  })

  describe('composeToolsForTurn (disabled by default)', () => {
    it('returns only always-on tools for simple greeting when disabled', () => {
      const messages = [makeMessage('user', 'hello')]
      const result = composeToolsForTurn(allTools, messages, { enabled: false })
      const names = result.map(t => t.name).sort()
      expect(names).toEqual(ALWAYS_ON_NAMES.sort())
    })

    it('includes keyword-matched tools for non-simple messages when disabled', () => {
      const messages = [makeMessage('user', 'read the file')]
      const result = composeToolsForTurn(allTools, messages, { enabled: false })
      const names = result.map(t => t.name)
      expect(names).toContain('FileReadTool')
    })

    it('does NOT preserve history tools when disabled (fallback behavior)', () => {
      // 关闭时 fallbackFilter 只看最后一条用户消息 + 已用工具名并集
      // "continue" 不匹配关键词，但 GrepTool 是已用工具，应保留
      const messages = [
        makeMessage('user', 'hello'),
        makeMessage('assistant', [
          { type: 'text', text: 'Let me search for that' },
          { type: 'tool_use', name: 'GrepTool', input: {} },
        ]),
        makeMessage('user', 'continue'),
      ]
      const result = composeToolsForTurn(allTools, messages, { enabled: false })
      const names = result.map(t => t.name)
      // fallbackFilter: simple last message → only always-on tools
      expect(names).not.toContain('GrepTool')
    })
  })

  describe('composeToolsForTurn (enabled)', () => {
    const options: DynamicToolComposerOptions = { enabled: true }

    it('returns always-on tools for simple greeting', () => {
      const messages = [makeMessage('user', 'hello')]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      for (const name of ALWAYS_ON_NAMES) {
        expect(names).toContain(name)
      }
    })

    it('includes MCP tools for non-simple messages', () => {
      const messages = [makeMessage('user', 'read the file')]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).toContain('McpTool')
    })

    it('dynamically appends tools based on assistant tool_use history', () => {
      const messages = [
        makeMessage('user', 'hello'),
        makeMessage('assistant', [
          { type: 'text', text: 'Let me search the web' },
          { type: 'tool_use', name: 'WebSearchTool', input: { query: 'test' } },
        ]),
        makeMessage('user', 'what did you find?'),
      ]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).toContain('WebSearchTool')
    })

    it('dynamically appends tools based on intent keywords in assistant text', () => {
      const messages = [
        makeMessage('user', 'hello'),
        makeMessage('assistant', [
          { type: 'text', text: 'Let me review the code for security issues' },
        ]),
        makeMessage('user', 'continue'),
      ]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).toContain('AdvisorTool')
    })

    it('dynamically appends tools based on intent keywords for monitoring', () => {
      const messages = [
        makeMessage('user', 'hello'),
        makeMessage('assistant', [
          { type: 'text', text: 'I will monitor the system health' },
        ]),
        makeMessage('user', 'ok'),
      ]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).toContain('MonitorTool')
    })

    it('combines user message keywords with history signals', () => {
      const messages = [
        makeMessage('user', 'search the web for info'),
        makeMessage('assistant', [
          { type: 'text', text: 'Let me check the system status' },
          { type: 'tool_use', name: 'MonitorTool', input: {} },
        ]),
      ]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).toContain('WebSearchTool')
      expect(names).toContain('MonitorTool')
    })

    it('respects historyWindow option', () => {
      const messages = [
        makeMessage('user', 'hello'),
        makeMessage('assistant', [
          { type: 'text', text: 'old' },
          { type: 'tool_use', name: 'WebSearchTool', input: {} },
        ]),
        makeMessage('user', 'middle'),
        makeMessage('assistant', [
          { type: 'text', text: 'middle' },
          { type: 'tool_use', name: 'MonitorTool', input: {} },
        ]),
        makeMessage('user', 'latest'),
      ]
      // windowSize=1 should only see the last round
      const result = composeToolsForTurn(allTools, messages, { enabled: true, historyWindow: 1 })
      const names = result.map(t => t.name)
      expect(names).toContain('MonitorTool')
      expect(names).not.toContain('WebSearchTool')
    })

    it('does not include irrelevant tools for simple greeting', () => {
      const messages = [makeMessage('user', 'hello')]
      const result = composeToolsForTurn(allTools, messages, options)
      const names = result.map(t => t.name)
      expect(names).not.toContain('WebSearchTool')
      expect(names).not.toContain('BashTool')
      expect(names).not.toContain('GrepTool')
    })
  })
})
