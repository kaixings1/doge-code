/**
 * __tests__/commands/recall.test.ts — recall 命令单元测试
 *
 * 覆盖：parseArgs
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// parseArgs (local copy)
// ---------------------------------------------------------------------------

function parseArgs(args: string): { query: string; sessionId: string | null; limit: number } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts = { query: '', sessionId: null as string | null, limit: 10 }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--session' && i + 1 < parts.length) {
      opts.sessionId = parts[++i]!
    } else if (p === '--limit' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.limit = n
    } else if (!p.startsWith('--')) {
      opts.query = opts.query ? opts.query + ' ' + p : p
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recall parseArgs', () => {
  it('empty args → empty query', () => {
    expect(parseArgs('')).toEqual({ query: '', sessionId: null, limit: 10 })
  })

  it('keyword as query', () => {
    expect(parseArgs('react')).toEqual({ query: 'react', sessionId: null, limit: 10 })
  })

  it('--session sets sessionId', () => {
    expect(parseArgs('api --session abc-123')).toEqual({ query: 'api', sessionId: 'abc-123', limit: 10 })
  })

  it('--limit sets limit', () => {
    expect(parseArgs('bug --limit 5')).toEqual({ query: 'bug', sessionId: null, limit: 5 })
  })

  it('multi-word query', () => {
    expect(parseArgs('react hooks')).toEqual({ query: 'react hooks', sessionId: null, limit: 10 })
  })

  it('invalid limit falls back to default', () => {
    expect(parseArgs('test --limit abc')).toEqual({ query: 'test', sessionId: null, limit: 10 })
  })
})
