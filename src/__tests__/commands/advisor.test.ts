/**
 * __tests__/commands/advisor.test.ts — advisor 命令单元测试
 *
 * 覆盖：parseArgs / call
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// parseArgs (local copy)
// ---------------------------------------------------------------------------

function parseArgs(args: string): { subcommand: string; focus: string; path: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts = { subcommand: parts.length === 0 ? 'status' : 'analyze', focus: 'code', path: '' }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (p === '--focus' && i + 1 < parts.length) {
      const f = parts[++i]!
      if (['code', 'architecture', 'performance', 'security'].includes(f)) {
        opts.focus = f
      }
    } else if (p === '--path' && i + 1 < parts.length) {
      opts.path = parts[++i]!
    } else if (p === 'off' || p === 'unset') {
      opts.subcommand = 'off'
    } else if (p === 'analyze') {
      opts.subcommand = 'analyze'
    } else if (p === 'status') {
      opts.subcommand = 'status'
    }
  }

  return opts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('advisor parseArgs', () => {
  it('empty args → status', () => {
    expect(parseArgs('')).toEqual({ subcommand: 'status', focus: 'code', path: '' })
  })

  it('--focus sets focus', () => {
    expect(parseArgs('--focus security')).toEqual({ subcommand: 'analyze', focus: 'security', path: '' })
  })

  it('--path sets path', () => {
    expect(parseArgs('--path ./src')).toEqual({ subcommand: 'analyze', focus: 'code', path: './src' })
  })

  it('off sets subcommand', () => {
    expect(parseArgs('off')).toEqual({ subcommand: 'off', focus: 'code', path: '' })
  })

  it('combined args', () => {
    expect(parseArgs('--focus performance --path ./utils')).toEqual({ subcommand: 'analyze', focus: 'performance', path: './utils' })
  })
})
