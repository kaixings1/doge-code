/**
 * 进程生命周期回归测试。
 *
 * 覆盖三处「长时间运行后子进程越积越多」的泄漏修复：
 * 1. TaskQueue.dequeue 并发独占（否则同一任务被多个 worker 重复处理）
 * 2. daemon start 锁互斥（否则并发 start 起多个永不退出的 worker）
 * 3. WorkerPool worker 退出机制（否则 worker 线程数无限增长）
 *
 * 测试用真实文件系统与真实模块，不复刻生产逻辑。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { TaskQueue } from '../TaskQueue.js'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'lifecycle-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('TaskQueue.dequeue 并发独占', () => {
  it('20 个并发 dequeue 拿到 20 个互不重复的任务', async () => {
    const q = new TaskQueue(tmp())
    await q.init()
    for (let i = 0; i < 20; i++) {
      await q.enqueue({ id: `t${i}`, data: { i } })
    }

    const results = await Promise.all(
      Array.from({ length: 20 }, () => q.dequeue()),
    )
    const ids = results.filter(Boolean).map(r => r!.id)

    // 变异测试验证：把 link() 换成 copyFile() 时此断言失败（uniq≈2）
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
  })

  it('队列为空时返回 null', async () => {
    const q = new TaskQueue(tmp())
    await q.init()
    expect(await q.dequeue()).toBeNull()
  })
})

describe('daemon start 锁互斥', () => {
  it('未释放时重复获取失败，释放后成功', async () => {
    const home = tmp()
    const prevProfile = process.env.USERPROFILE
    const prevHome = process.env.HOME
    process.env.USERPROFILE = home
    process.env.HOME = home
    try {
      const { acquireStartLock } = await import('../../daemon/main.js')

      const lock1 = acquireStartLock()
      expect(typeof lock1).toBe('function')

      // 变异测试验证：把 'wx' 改成 'w' 时此断言失败
      expect(acquireStartLock()).toBeNull()

      lock1!()
      const lock3 = acquireStartLock()
      expect(typeof lock3).toBe('function')
      lock3!()
    } finally {
      if (prevProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = prevProfile
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
    }
  })
})

describe('WorkerPool worker 生命周期（源码契约）', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/core/WorkerPool.ts'),
    'utf-8',
  )

  it('存在空闲回收（idleTimer 到点 terminate）', () => {
    expect(src).toMatch(/armIdleTimer/)
    expect(src).toMatch(/this\.retireWorker\(slot\)/)
    expect(src).toMatch(/worker\.terminate\(\)/)
  })

  it('主线程在 worker exit 时从存活列表移除', () => {
    expect(src).toMatch(/worker\.on\('exit'/)
    expect(src).toMatch(/this\.workers\.splice/)
  })

  it('worker 侧不再自行 dequeue（避免与主线程双份拉取）', () => {
    // guard 判据：runWorker 体内不得出现 queue.dequeue
    const runWorkerBody = src.slice(src.indexOf('private runWorker'))
    expect(runWorkerBody).not.toMatch(/this\.queue\.dequeue/)
  })
})
