import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  openSync,
  appendFileSync,
} from 'fs'
import { spawn } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'

interface BgProcess {
  id: string
  pid: number
  command: string
  args: string[]
  cwd: string
  startedAt: string
  logFile: string
}

function bgDir(): string {
  return join(homedir(), '.doge', 'bg')
}

function recordPath(id: string): string {
  return join(bgDir(), `${id}.json`)
}

function ensureDir(): void {
  try { mkdirSync(bgDir(), { recursive: true }) } catch { /* ignore */ }
}

function listRecords(): BgProcess[] {
  ensureDir()
  const records: BgProcess[] = []
  try {
    for (const f of readdirSync(bgDir())) {
      if (!f.endsWith('.json')) continue
      try {
        records.push(JSON.parse(readFileSync(join(bgDir(), f), 'utf-8')) as BgProcess)
      } catch { /* 忽略损坏记录 */ }
    }
  } catch { /* ignore */ }
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function isAlive(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 列出后台进程 */
export async function psHandler(args: string[]): Promise<void> {
  const records = listRecords()
  if (records.length === 0) {
    console.log('没有后台进程')
    return
  }
  console.log('后台进程：')
  for (const r of records) {
    const alive = isAlive(r.pid)
    const status = alive ? '运行中' : '已退出'
    console.log(`  [${r.id}] pid=${r.pid} ${status} | ${r.command} ${r.args.join(' ')} | 启动 ${r.startedAt}`)
  }
}

/** 读取会话日志 */
export async function logsHandler(sessionId?: string): Promise<void> {
  const records = sessionId
    ? listRecords().filter(r => r.id === sessionId)
    : listRecords().slice(-1)
  if (records.length === 0) {
    console.log(sessionId ? `未找到会话: ${sessionId}` : '没有后台进程日志')
    return
  }
  const r = records[0]
  if (!existsSync(r.logFile)) {
    console.log(`日志文件不存在: ${r.logFile}`)
    return
  }
  console.log(`=== ${r.id} (pid=${r.pid}) 日志 ===`)
  console.log(readFileSync(r.logFile, 'utf-8'))
}

/** 附加到后台进程（实时跟踪日志尾部） */
export async function attachHandler(sessionId?: string): Promise<void> {
  const records = sessionId
    ? listRecords().filter(r => r.id === sessionId)
    : listRecords().slice(-1)
  if (records.length === 0) {
    console.log(sessionId ? `未找到会话: ${sessionId}` : '没有后台进程')
    return
  }
  const r = records[0]
  if (!isAlive(r.pid)) {
    console.log(`会话 ${r.id} 已退出（pid=${r.pid}）`)
    return
  }
  console.log(`附加到 ${r.id}（pid=${r.pid}），按 Ctrl+C 退出跟踪`)
  // 简化附加：轮询日志文件增量输出
  const logFile = r.logFile
  if (!existsSync(logFile)) {
    console.log('日志文件不存在')
    return
  }
  let offset = 0
  const timer = setInterval(() => {
    try {
      const content = readFileSync(logFile, 'utf-8')
      if (content.length > offset) {
        process.stdout.write(content.slice(offset))
        offset = content.length
      }
      if (!isAlive(r.pid)) {
        clearInterval(timer)
        console.log('\n[进程已退出]')
      }
    } catch { /* ignore */ }
  }, 500)

  await new Promise<void>(resolve => {
    process.once('SIGINT', () => {
      clearInterval(timer)
      console.log('\n[已停止跟踪]')
      resolve()
    })
  })
}

/** 终止后台进程 */
export async function killHandler(sessionId?: string): Promise<void> {
  const records = sessionId
    ? listRecords().filter(r => r.id === sessionId)
    : []
  if (records.length === 0) {
    console.log(sessionId ? `未找到会话: ${sessionId}` : '用法: claude bg kill <session-id>')
    return
  }
  for (const r of records) {
    try {
      process.kill(r.pid, 'SIGKILL')
      console.log(`已终止 ${r.id}（pid=${r.pid}）`)
    } catch (e: any) {
      console.error(`终止 ${r.id} 失败: ${e.message}`)
    }
    try { rmSync(recordPath(r.id), { force: true }) } catch { /* ignore */ }
  }
}

/** 处理 --bg 标志：将命令作为后台进程启动 */
export async function handleBgFlag(args: string[]): Promise<void> {
  const bgIdx = args.indexOf('--bg')
  if (bgIdx === -1) return

  const rest = args.slice(0, bgIdx).concat(args.slice(bgIdx + 1)).filter(a => a !== '')
  if (rest.length === 0) {
    console.error('--bg 需要指定要后台运行的命令')
    return
  }

  const [cmd, ...cmdArgs] = rest
  const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  ensureDir()
  const logFile = join(bgDir(), `${id}.log`)
  const logFd = openSync(logFile, 'a')

  const child = spawn(cmd, cmdArgs, {
    cwd: process.cwd(),
    stdio: ['ignore', logFd, logFd],
    detached: true,
    windowsHide: true,
  })

  const record: BgProcess = {
    id,
    pid: child.pid ?? 0,
    command: cmd,
    args: cmdArgs,
    cwd: process.cwd(),
    startedAt: new Date().toISOString(),
    logFile,
  }
  writeFileSync(recordPath(id), JSON.stringify(record, null, 2), 'utf-8')
  child.unref()

  console.log(`后台启动: ${id}（pid=${child.pid}）`)
  console.log(`查看日志: claude bg logs ${id}`)
  console.log(`终止进程: claude bg kill ${id}`)
}
