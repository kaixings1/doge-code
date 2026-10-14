import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, closeSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'

function pidFile(): string {
  return join(homedir(), '.doge', 'daemon.pid')
}

/**
 * 以 O_EXCL 原子地占位锁文件，防止并发 `daemon start` 同时通过
 * readPid 检查而各起一个 daemon worker（旧实现的 check→spawn 窗口）。
 * 返回释放函数；已被占用时返回 null。
 */
export function acquireStartLock(): (() => void) | null {
  const lockPath = pidFile() + '.lock'
  const dir = dirname(lockPath)
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  let fd: number
  try {
    fd = openSync(lockPath, 'wx')
  } catch {
    return null
  }
  return () => {
    try { closeSync(fd) } catch { /* ignore */ }
    try { rmSync(lockPath, { force: true }) } catch { /* ignore */ }
  }
}

function readPid(): number | null {
  if (!existsSync(pidFile())) return null
  try {
    const pid = parseInt(readFileSync(pidFile(), 'utf-8').trim(), 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function writePid(pid: number): void {
  const dir = dirname(pidFile())
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  writeFileSync(pidFile(), String(pid), 'utf-8')
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * `claude daemon` — 守护进程管理入口。
 *
 * 用法：
 *   claude daemon start    启动守护进程（后台 worker）
 *   claude daemon stop     停止守护进程
 *   claude daemon status   查看运行状态
 */
export async function daemonMain(args: string[]): Promise<void> {
  const cmd = args[0] || 'status'

  switch (cmd) {
    case 'start': {
      // 原子占位：并发 start 只有一个能进入 spawn 段。
      const releaseLock = acquireStartLock()
      if (!releaseLock) {
        console.log('守护进程正在启动中（另一个 start 已在进行）')
        return
      }
      try {
        const existing = readPid()
        if (existing && isAlive(existing)) {
          console.log(`守护进程已在运行（pid=${existing}）`)
          return
        }
        // 以 --daemon-worker main 参数 spawn 自身，脱离父进程
        const child = spawn(process.execPath, [process.argv[1], '--daemon-worker', 'main'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
        child.unref()
        const pid = child.pid
        if (pid == null) {
          console.error('守护进程启动失败：无法获取子进程 PID')
          return
        }
        writePid(pid)
        child.on('exit', () => {
          try { rmSync(pidFile(), { force: true }) } catch { /* ignore */ }
        })
        console.log(`守护进程已启动（pid=${pid}）`)
      } finally {
        releaseLock()
      }
      return
    }

    case 'stop': {
      const pid = readPid()
      if (pid && isAlive(pid)) {
        try {
          process.kill(pid, 'SIGTERM')
          console.log(`已停止守护进程（pid=${pid}）`)
        } catch (e: any) {
          console.error(`停止失败: ${e.message}`)
        }
      } else {
        console.log('守护进程未在运行')
      }
      rmSync(pidFile(), { force: true })
      return
    }

    case 'status': {
      const pid = readPid()
      if (pid && isAlive(pid)) {
        console.log(`守护进程运行中（pid=${pid}）`)
      } else {
        console.log('守护进程未在运行')
      }
      return
    }

    default:
      console.log('用法: claude daemon <start|stop|status>')
  }
}
