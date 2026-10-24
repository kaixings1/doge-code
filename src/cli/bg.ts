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
    console.log(sessionId ? `未找到会话: ${sessionId}` : '用法: claude kill <session-id>')
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

/**
 * 删除后台会话记录（不杀进程）。对应官方 `claude rm <id>`。
 * 运行中的会话会拒绝删除，避免"记录没了但进程还在"。
 */
export async function removeHandler(sessionId?: string): Promise<void> {
  if (!sessionId) {
    console.log('用法: claude rm <session-id>')
    return
  }
  const records = listRecords().filter(r => r.id === sessionId)
  if (records.length === 0) {
    console.log(`未找到会话: ${sessionId}`)
    return
  }
  const r = records[0]!
  if (isAlive(r.pid)) {
    console.log(`会话 ${r.id} 仍在运行（pid=${r.pid}），请先执行 claude stop ${r.id}`)
    return
  }
  try {
    rmSync(recordPath(r.id), { force: true })
    console.log(`已删除会话记录: ${r.id}`)
  } catch (e: any) {
    console.error(`删除 ${r.id} 失败: ${e.message}`)
  }
}

/**
 * 重启已退出的后台会话（沿用原命令与工作目录）。对应官方 `claude respawn`。
 * `--all` 重启全部已退出会话；运行中的跳过。
 */
export async function respawnHandler(args: string[]): Promise<void> {
  const all = args.includes('--all')
  const target = args.find(a => !a.startsWith('-'))
  const records = all
    ? listRecords()
    : target
      ? listRecords().filter(r => r.id === target)
      : listRecords().slice(-1)

  if (records.length === 0) {
    console.log(target ? `未找到会话: ${target}` : '没有后台进程')
    return
  }

  for (const r of records) {
    if (isAlive(r.pid)) {
      console.log(`会话 ${r.id} 仍在运行，跳过`)
      continue
    }
    await spawnBackground(r.command, r.args, r.cwd)
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
  await spawnBackground(cmd!, cmdArgs, process.cwd())
}

/**
 * 启动一个后台进程并落盘记录。`--bg` 与 `respawn` 共用。
 * @returns 新会话 ID
 */
export async function spawnBackground(
  cmd: string,
  cmdArgs: string[],
  cwd: string,
): Promise<string> {
  const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  ensureDir()
  const logFile = join(bgDir(), `${id}.log`)
  const logFd = openSync(logFile, 'a')

  const child = spawn(cmd, cmdArgs, {
    cwd,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    windowsHide: true,
  })

  const record: BgProcess = {
    id,
    pid: child.pid ?? 0,
    command: cmd,
    args: cmdArgs,
    cwd,
    startedAt: new Date().toISOString(),
    logFile,
  }
  writeFileSync(recordPath(id), JSON.stringify(record, null, 2), 'utf-8')
  child.unref()

  console.log(`后台启动: ${id}（pid=${child.pid}）`)
  console.log(`查看日志: claude logs ${id}`)
  console.log(`停止会话: claude stop ${id}`)
  return id
}
