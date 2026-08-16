/**
 * __tests__/commands/prune-sessions.test.ts — prune-sessions 命令单元测试
 *
 * 覆盖：parseArgs
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// parseArgs (local copy for unit testing)
// ---------------------------------------------------------------------------

function parseArgs(args: string): { olderThanDays: number; dryRun: boolean; force: boolean } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts = { olderThanDays: 30, dryRun: false, force: false }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--older-than' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.olderThanDays = n
    } else if (p === '--dry-run') {
      opts.dryRun = true
    } else if (p === '--force') {
      opts.force = true
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prune-sessions parseArgs', () => {
  it('empty args → defaults', () => {
    expect(parseArgs('')).toEqual({ olderThanDays: 30, dryRun: false, force: false })
  })

  it('--older-than N sets days', () => {
    expect(parseArgs('--older-than 7')).toEqual({ olderThanDays: 7, dryRun: false, force: false })
  })

  it('--dry-run sets flag', () => {
    expect(parseArgs('--dry-run')).toEqual({ olderThanDays: 30, dryRun: true, force: false })
  })

  it('--force sets flag', () => {
    expect(parseArgs('--force')).toEqual({ olderThanDays: 30, dryRun: false, force: true })
  })

  it('combined args', () => {
    expect(parseArgs('--older-than 60 --force')).toEqual({ olderThanDays: 60, dryRun: false, force: true })
  })

  it('invalid --older-than falls back to default', () => {
    expect(parseArgs('--older-than abc')).toEqual({ olderThanDays: 30, dryRun: false, force: false })
  })

  it('zero --older-than is rejected', () => {
    expect(parseArgs('--older-than 0')).toEqual({ olderThanDays: 30, dryRun: false, force: false })
  })
})
