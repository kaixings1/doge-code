import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'

function pidFile(): string {
  return join(homedir(), '.doge', 'daemon.pid')
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
  const dir = pidFile().substring(0, pidFile().lastIndexOf('\\'))
  if (dir) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
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
      writePid(child.pid ?? 0)
      console.log(`守护进程已启动（pid=${child.pid}）`)
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
