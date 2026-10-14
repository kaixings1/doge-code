/**
 * 会话空闲驱逐测试。
 *
 * 通过 DOGE_BRIDGE_SESSIONS_DIR 指向临时目录，隔离真实用户数据。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let mgr: typeof import('../sessionManager.js')

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sess-'))
  process.env.DOGE_BRIDGE_SESSIONS_DIR = dir
  // 重新导入以获得指向新目录的模块实例
  const mod = await import('../sessionManager.js?' + Date.now())
  mgr = mod as typeof import('../sessionManager.js')
})

afterEach(async () => {
  // 让 createSession 内部 fire-and-forget 的 saveSession 落盘完成，
  // 再删目录，避免 ENOENT unhandled rejection。
  await new Promise(r => setTimeout(r, 20))
  delete process.env.DOGE_BRIDGE_SESSIONS_DIR
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('evictIdleSessions', () => {
  it('驱逐超过 TTL 的会话，保留活跃会话', async () => {
    const stale = mgr.createSession(process.cwd(), '旧会话')
    // 手动把 lastActive 拨回很久以前
    stale.lastActive = Date.now() - 60 * 60 * 1000 // 1 小时前

    const fresh = mgr.createSession(process.cwd(), '新会话')
    fresh.lastActive = Date.now()

    // 明确指定 keep，避免依赖 activeSessionId 的副作用
    const evicted = await mgr.evictIdleSessions({
      ttlMs: 30 * 60 * 1000,
      keepSessionId: fresh.id,
    })

    expect(evicted).toContain(stale.id)
    expect(evicted).not.toContain(fresh.id)
    expect(mgr.getSession(stale.id)).toBeUndefined()
    expect(mgr.getSession(fresh.id)).toBeDefined()
  })

  it('活跃会话即使超时也不被驱逐', async () => {
    const s = mgr.createSession(process.cwd(), '活跃')
    s.lastActive = Date.now() - 10 * 60 * 60 * 1000 // 10 小时前
    // keepSessionId 显式指定为该会话
    const evicted = await mgr.evictIdleSessions({
      ttlMs: 60 * 1000,
      keepSessionId: s.id,
    })
    expect(evicted).not.toContain(s.id)
    expect(mgr.getSession(s.id)).toBeDefined()
  })

  it('未超时的会话不被驱逐', async () => {
    const s = mgr.createSession(process.cwd(), '刚刚')
    s.lastActive = Date.now()
    const evicted = await mgr.evictIdleSessions({ ttlMs: 30 * 60 * 1000 })
    expect(evicted).toHaveLength(0)
    expect(mgr.getSession(s.id)).toBeDefined()
  })
})
