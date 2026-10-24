/**
 * 后台会话 CLI（ps/logs/attach/kill/stop/rm/respawn）回归测试
 * （对应 diff_with_claude.md §2.2 / §7.5）。
 *
 * 用临时 HOME 隔离 ~/.doge/bg 注册表，直接驱动真实 handler。
 * 变异验证：把 removeHandler 的"运行中拒绝删除"判断去掉 → 对应用例失败。
 */
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let root: string
let bg: typeof import('../../src/cli/bg.js')
let originalHome: string | undefined

/** 收集 console.log 输出。 */
async function capture(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '))
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return lines.join('\n')
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'doge-bg-'))
  originalHome = process.env.HOME
  process.env.HOME = root
  process.env.USERPROFILE = root
  await mkdir(join(root, '.doge', 'bg'), { recursive: true })
  bg = await import('../../src/cli/bg.js')
})

afterEach(async () => {
  const dir = join(root, '.doge', 'bg')
  const files = await readdir(dir).catch(() => [] as string[])
  await Promise.all(files.map(f => rm(join(dir, f), { force: true })))
})

afterAll(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(root, { recursive: true, force: true })
})

/** 写一条注册表记录（pid 用一个必然不存在的值表示"已退出"）。 */
async function writeRecord(id: string, pid: number) {
  const dir = join(root, '.doge', 'bg')
  await writeFile(
    join(dir, `${id}.json`),
    JSON.stringify({
      id,
      pid,
      command: 'node',
      args: ['-e', 'setTimeout(()=>{},100)'],
      cwd: root,
      startedAt: new Date().toISOString(),
      logFile: join(dir, `${id}.log`),
    }),
    'utf-8',
  )
}

const DEAD_PID = 999_999

describe('后台会话 CLI', () => {
  it('ps 在无记录时给出空提示', async () => {
    expect(await capture(() => bg.psHandler([]))).toContain('没有后台进程')
  })

  it('ps 列出已退出的会话', async () => {
    await writeRecord('bg-dead', DEAD_PID)
    const out = await capture(() => bg.psHandler([]))
    expect(out).toContain('bg-dead')
    expect(out).toContain('已退出')
  })

  it('rm 删除已退出的会话记录', async () => {
    await writeRecord('bg-dead', DEAD_PID)
    const out = await capture(() => bg.removeHandler('bg-dead'))
    expect(out).toContain('已删除会话记录')
    const files = await readdir(join(root, '.doge', 'bg'))
    expect(files).not.toContain('bg-dead.json')
  })

  it('rm 拒绝删除仍在运行的会话', async () => {
    // 用当前进程 pid 表示"存活"
    await writeRecord('bg-live', process.pid)
    const out = await capture(() => bg.removeHandler('bg-live'))
    expect(out).toContain('仍在运行')
    const files = await readdir(join(root, '.doge', 'bg'))
    expect(files).toContain('bg-live.json')
  })

  it('rm 无参数时给出用法', async () => {
    expect(await capture(() => bg.removeHandler())).toContain('用法: claude rm')
  })

  it('respawn 在无记录时给出空提示', async () => {
    expect(await capture(() => bg.respawnHandler(['--all']))).toContain('没有后台进程')
  })

  it('respawn 跳过仍在运行的会话', async () => {
    await writeRecord('bg-live', process.pid)
    const out = await capture(() => bg.respawnHandler(['bg-live']))
    expect(out).toContain('仍在运行，跳过')
  })

  it('logs 对不存在的会话给出提示', async () => {
    expect(await capture(() => bg.logsHandler('bg-missing'))).toContain('未找到会话')
  })
})
