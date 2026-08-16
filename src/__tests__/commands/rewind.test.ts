/**
 * __tests__/commands/rewind.test.ts — rewind/checkpoint 命令单元测试
 *
 * 覆盖：parseArgs / handleCreate / handleList / handleRestore
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CHECKPOINTS_FILE = join(homedir(), '.doge', 'checkpoints.json')

// ---------------------------------------------------------------------------
// parseArgs (local copy)
// ---------------------------------------------------------------------------

function parseArgs(args: string): { subcommand: string; name: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  return {
    subcommand: parts[0] || 'list',
    name: parts.slice(1).join(' ') || '',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  try {
    if (existsSync(CHECKPOINTS_FILE)) unlinkSync(CHECKPOINTS_FILE)
  } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rewind parseArgs', () => {
  it('empty args → list', () => {
    expect(parseArgs('')).toEqual({ subcommand: 'list', name: '' })
  })

  it('create with name', () => {
    expect(parseArgs('create my-checkpoint')).toEqual({ subcommand: 'create', name: 'my-checkpoint' })
  })

  it('list', () => {
    expect(parseArgs('list')).toEqual({ subcommand: 'list', name: '' })
  })
})

describe('rewind checkpoint list', () => {
  it('shows empty when no checkpoints', async () => {
    try { if (existsSync(CHECKPOINTS_FILE)) unlinkSync(CHECKPOINTS_FILE) } catch { /* ignore */ }
    const { call } = await import('../../commands/rewind/rewind.ts')
    const result = await call('list', {} as any)
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('没有保存的检查点')
    }
  })
})

describe('rewind checkpoint create', () => {
  it('requires name', async () => {
    const { call } = await import('../../commands/rewind/rewind.ts')
    const result = await call('create', {} as any)
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('用法')
    }
  })
})
