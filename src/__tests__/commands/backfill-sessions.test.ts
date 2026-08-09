import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const TMP_DIR = 'C:\\Windows\\Temp\\doge-backfill-test'
const SESSION_DIR = join(TMP_DIR, '.doge', 'sessions')

const mockCache = new Map<string, string[]>()
vi.mock('../../utils/dirCache.js', () => ({
  getCachedDirEntries: (dir: string) => mockCache.get(dir),
  setCachedDirEntries: (dir: string, entries: string[]) => mockCache.set(dir, entries),
  clearDirCache: () => mockCache.clear(),
}))

let call: (args: string) => Promise<{ type: string; value: string }>

beforeEach(async () => {
  mockCache.clear()
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(SESSION_DIR, { recursive: true })
  process.env.HOME = TMP_DIR
  process.env.USERPROFILE = TMP_DIR
  const mod = await import('../../commands/backfill-sessions/index.js')
  call = async (args: string) => {
    const m = await mod.default.load()
    return m.call(args)
  }
})

afterEach(() => {
  delete process.env.HOME
  delete process.env.USERPROFILE
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
})

function setSessionCache() {
  if (existsSync(SESSION_DIR)) {
    const entries = require('fs').readdirSync(SESSION_DIR)
    mockCache.set(SESSION_DIR, entries)
  }
}

describe('backfill-sessions call', () => {
  it('help should show usage', async () => {
    const result = await call('help')
    expect(result.value).toContain('会话回填工具')
    expect(result.value).toContain('list')
  })

  it('empty command shows help', async () => {
    const result = await call('')
    expect(result.value).toContain('会话回填工具')
  })

  it('list with no sessions returns empty', async () => {
    const result = await call('list')
    expect(result.value).toContain('没有找到会话文件')
  })

  it('stats with no sessions shows stats', async () => {
    const result = await call('stats')
    expect(result.value).toContain('会话统计')
  })

  it('unknown command returns error', async () => {
    const result = await call('unknown')
    expect(result.value).toContain('未知命令')
  })
})

describe('backfill-sessions with data', () => {
  beforeEach(() => {
    writeFileSync(join(SESSION_DIR, 's1.json'), JSON.stringify({
      name: 'Test1', messages: [{ role: 'user', content: 'hello' }]
    }), 'utf-8')
    writeFileSync(join(SESSION_DIR, 's2.json'), JSON.stringify({
      name: 'Test2', messages: []
    }), 'utf-8')
    setSessionCache()
  })

  it('list shows sessions', async () => {
    const result = await call('list')
    expect(result.value).toContain('Test1')
    expect(result.value).toContain('Test2')
  })

  it('stats shows count 2', async () => {
    const result = await call('stats')
    expect(result.value).toContain('会话总数: 2')
  })

  it('find-empty lists empty sessions', async () => {
    const result = await call('find-empty')
    expect(result.value).toContain('s2')
  })

  it('search matches session name', async () => {
    const result = await call('search Test1')
    expect(result.value).toContain('s1')
  })
})
