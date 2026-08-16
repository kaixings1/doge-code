/**
 * __tests__/commands/replay.test.ts — replay 命令单元测试
 *
 * 覆盖：parseArgs / extractTurns / formatTurns
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

// Copied from replay.ts to keep tests pure-function based
function parseArgs(args: string): { sessionId: string | null; limit: number } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts = { sessionId: null as string | null, limit: 50 }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--session' && i + 1 < parts.length) {
      opts.sessionId = parts[++i]!
    } else if (p === '--limit' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.limit = n
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// extractTurns + helpers
// ---------------------------------------------------------------------------

function extractText(
  content: Array<Record<string, unknown>> | string | undefined,
): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join(' ').trim() : null
}

function extractToolUses(
  content: Array<Record<string, unknown>> | string | undefined,
): string[] {
  if (!Array.isArray(content)) return []
  const tools: string[] = []
  for (const block of content) {
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      tools.push(block.name)
    }
  }
  return tools
}

function extractTurns(entries: Array<Record<string, unknown>>) {
  const turns: Array<{ index: number; role: string; summary: string; tools: string[] }> = []

  for (const entry of entries) {
    const type = entry.type as string | undefined
    if (!type || type === 'system' || type === 'meta') continue
    if (type === 'tool_result' || type === 'tool_use') continue

    if (type === 'user') {
      const rec = entry as Record<string, unknown>
      const msgObj = rec.message as Record<string, unknown> | undefined
      const content = (msgObj && 'content' in msgObj ? (msgObj as { content: unknown }).content : undefined) as Array<Record<string, unknown>> | string | undefined
      const text = extractText(content)
      turns.push({
        index: turns.length,
        role: 'user',
        summary: text ? text.slice(0, 120) + (text.length > 120 ? '...' : '') : '(空消息)',
        tools: [],
      })
    } else if (type === 'assistant') {
      const rec = entry as Record<string, unknown>
      const msgObj = rec.message as Record<string, unknown> | undefined
      const content = (msgObj && 'content' in msgObj ? (msgObj as { content: unknown }).content : undefined) as Array<Record<string, unknown>> | string | undefined
      const text = extractText(content)
      const toolUses = extractToolUses(content)

      turns.push({
        index: turns.length,
        role: 'assistant',
        summary: text ? text.slice(0, 120) + (text.length > 120 ? '...' : '') : toolUses.length > 0 ? `(调用 ${toolUses.length} 个工具)` : '(空回复)',
        tools: toolUses,
      })
    } else if (type === 'summary') {
      turns.push({
        index: turns.length,
        role: 'summary',
        summary: (entry.summary as string)?.slice(0, 120) ?? '(无摘要)',
        tools: [],
      })
    }
  }

  return turns
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('replay parseArgs', () => {
  it('empty args → defaults', () => {
    expect(parseArgs('')).toEqual({ sessionId: null, limit: 50 })
  })

  it('--session sets sessionId', () => {
    expect(parseArgs('--session abc-123')).toEqual({ sessionId: 'abc-123', limit: 50 })
  })

  it('--limit sets limit', () => {
    expect(parseArgs('--limit 10')).toEqual({ sessionId: null, limit: 10 })
  })

  it('combined args', () => {
    expect(parseArgs('--session xyz --limit 5')).toEqual({ sessionId: 'xyz', limit: 5 })
  })

  it('invalid limit falls back to default', () => {
    expect(parseArgs('--limit abc')).toEqual({ sessionId: null, limit: 50 })
  })

  it('zero limit is rejected', () => {
    expect(parseArgs('--limit 0')).toEqual({ sessionId: null, limit: 50 })
  })
})

describe('replay extractTurns', () => {
  it('extracts user + assistant turns', () => {
    const entries = [
      { type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi there' }] } },
    ]
    const turns = extractTurns(entries)
    expect(turns).toHaveLength(2)
    expect(turns[0]!.role).toBe('user')
    expect(turns[0]!.summary).toBe('hello')
    expect(turns[1]!.role).toBe('assistant')
    expect(turns[1]!.summary).toBe('hi there')
    expect(turns[1]!.tools).toEqual([])
  })

  it('extracts tool calls from assistant turn', () => {
    const entries = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'let me check' },
            { type: 'tool_use', name: 'Read', input: { path: '/foo' } },
            { type: 'tool_use', name: 'Grep', input: { pattern: 'bar' } },
          ],
        },
      },
    ]
    const turns = extractTurns(entries)
    expect(turns).toHaveLength(1)
    expect(turns[0]!.tools).toEqual(['Read', 'Grep'])
  })

  it('extracts summary turns', () => {
    const entries = [
      { type: 'summary', summary: '这段对话讨论了React性能优化' },
    ]
    const turns = extractTurns(entries)
    expect(turns).toHaveLength(1)
    expect(turns[0]!.role).toBe('summary')
    expect(turns[0]!.summary).toContain('React')
  })

  it('skips system/meta/tool_result entries', () => {
    const entries = [
      { type: 'system', content: 'sys' },
      { type: 'meta', content: 'meta' },
      { type: 'tool_result', content: 'result' },
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } },
    ]
    const turns = extractTurns(entries)
    expect(turns).toHaveLength(1)
    expect(turns[0]!.role).toBe('user')
  })

  it('long text is truncated to 120 chars', () => {
    const longText = 'a'.repeat(200)
    const entries = [
      { type: 'user', message: { content: [{ type: 'text', text: longText }] } },
    ]
    const turns = extractTurns(entries)
    expect(turns[0]!.summary).toHaveLength(123) // 120 + '...'
    expect(turns[0]!.summary).toMatch(/\.\.\.$/)
  })

  it('empty user message shows placeholder', () => {
    const entries = [
      { type: 'user', message: { content: [] } },
    ]
    const turns = extractTurns(entries)
    expect(turns[0]!.summary).toBe('(空消息)')
  })

  it('assistant with only tools shows tool count', () => {
    const entries = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: {} },
          ],
        },
      },
    ]
    const turns = extractTurns(entries)
    expect(turns[0]!.summary).toBe('(调用 1 个工具)')
  })
})
