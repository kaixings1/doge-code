/**
 * WorkerPool 端到端测试：真实起 worker 线程，验证任务被处理、结果写回、
 * worker 空闲回收。用临时目录做任务源，不污染真实数据。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'wp-'))
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

// 测试用 worker 入口：与生产 worker.ts 同协议（被动接收 run 消息）
const TEST_WORKER = `
const { parentPort } = require('worker_threads')
parentPort.on('message', async (req) => {
  if (!req || req.type !== 'run') return
  const task = req.task
  try {
    const data = await (async (t) => ({ doubled: (t.data.n ?? 0) * 2, id: t.id }))(task)
    parentPort.postMessage({ type: 'complete', taskId: task.id, data })
  } catch (e) {
    parentPort.postMessage({ type: 'error', taskId: task.id, error: String(e) })
  }
})
`

describe('WorkerPool 端到端', () => {
  it('处理全部任务并把结果写入 completed', async () => {
    const dir = tmp()
    const workerFile = join(dir, 'test-worker.cjs')
    writeFileSync(workerFile, TEST_WORKER)

    const { WorkerPool } = await import('../WorkerPool.js')
    const { TaskQueue } = await import('../TaskQueue.js')

    const taskDir = join(dir, 'tasks')
    const q = new TaskQueue(taskDir)
    await q.init()
    for (let i = 1; i <= 5; i++) {
      await q.enqueue({ id: `t${i}`, data: { n: i } })
    }

    const pool = new WorkerPool({
      concurrency: 2,
      taskDir,
      workerFile,
      idleTimeoutMs: 500,
      pollIntervalMs: 20,
    })
    await pool.init()
    await pool.run(async () => ({}) as never) // 主线程不执行 processor

    const completedDir = join(taskDir, 'completed')
    const done = existsSync(completedDir) ? readdirSync(completedDir) : []
    expect(done.length).toBe(5)

    // 校验结果内容正确（doubled = n*2）
    const results = done.map(f =>
      JSON.parse(readFileSync(join(completedDir, f), 'utf-8')),
    )
    const byId = Object.fromEntries(results.map(r => [r.id, r.result.doubled]))
    expect(byId).toEqual({ t1: 2, t2: 4, t3: 6, t4: 8, t5: 10 })

    // 队列应清空
    const pending = readdirSync(join(taskDir, 'queue'))
    expect(pending).toHaveLength(0)

    pool.shutdown()
    void q
  }, 30_000)

  it('常驻模式下 worker 空闲被回收、任务到来时补充并全部处理', async () => {
    // 关键：验证「空闲回收」而非仅 shutdown。
    // runForever 常驻；先空转让 worker 被 idleTimeout 回收，
    // 再涌入任务——池必须补充 worker 并完成全部任务。
    // 若回收逻辑缺失：workerCount 不下降（下方断言失败）。
    // 若补充逻辑缺失：任务无人处理（下方完成数断言失败）。
    const dir = tmp()
    const workerFile = join(dir, 'test-worker.cjs')
    writeFileSync(workerFile, TEST_WORKER)

    const { WorkerPool } = await import('../WorkerPool.js')
    const { TaskQueue } = await import('../TaskQueue.js')

    const taskDir = join(dir, 'tasks')
    const q = new TaskQueue(taskDir)
    await q.init()

    const pool = new WorkerPool({
      concurrency: 2,
      taskDir,
      workerFile,
      idleTimeoutMs: 120, // 快速空闲回收
      pollIntervalMs: 20,
    })
    await pool.init()

    const runPromise = pool.runForever(async () => ({}) as never)
    // 先等 worker 建立，再等其空闲被回收
    await new Promise(r => setTimeout(r, 400))
    expect(pool.workerCount()).toBe(0)

    // 投入任务：池应补充 worker 并处理
    for (let i = 1; i <= 3; i++) {
      await q.enqueue({ id: `t${i}`, data: { n: i } })
    }

    // 等待处理完成
    const completedDir = join(taskDir, 'completed')
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (readdirSync(completedDir).length === 3) break
      await new Promise(r => setTimeout(r, 50))
    }
    expect(readdirSync(completedDir)).toHaveLength(3)

    pool.shutdown()
    await runPromise
  }, 30_000)
})
