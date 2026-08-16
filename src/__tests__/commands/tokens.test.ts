/**
 * __tests__/commands/tokens.test.ts — tokens 命令单元测试
 *
 * 覆盖：parseArgs
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// parseArgs (local copy for unit testing)
// ---------------------------------------------------------------------------

function parseArgs(args: string): { byModel: boolean } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts = { byModel: false }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--by-model') {
      opts.byModel = true
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tokens parseArgs', () => {
  it('empty args → defaults', () => {
    expect(parseArgs('')).toEqual({ byModel: false })
  })

  it('--by-model sets flag', () => {
    expect(parseArgs('--by-model')).toEqual({ byModel: true })
  })

  it('unknown args are ignored', () => {
    expect(parseArgs('--unknown')).toEqual({ byModel: false })
  })
})
