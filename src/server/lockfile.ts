import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * 服务器锁文件信息
 */
export interface ServerLockInfo {
  pid: number
  httpUrl: string
  unix?: string
  authToken?: string
  port?: number
  startedAt: string
}

function lockPath(): string {
  return join(homedir(), '.doge', 'server.lock')
}

/**
 * 写入服务器锁文件（记录 PID 与地址，用于探测重复启动）
 */
export async function writeServerLock(info: ServerLockInfo): Promise<void> {
  const path = lockPath()
  const dir = path.substring(0, path.lastIndexOf('\\'))
  if (dir) {
    try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
  writeFileSync(path, JSON.stringify(info, null, 2), 'utf-8')
}

/**
 * 移除服务器锁文件
 */
export async function removeServerLock(): Promise<void> {
  try {
    rmSync(lockPath(), { force: true })
  } catch { /* ignore */ }
}

/**
 * 探测是否已有服务器在运行。
 * 读取锁文件并检查 PID 是否存活；进程不存在时清理过期锁。
 */
export async function probeRunningServer(): Promise<{ pid: number; httpUrl: string } | null> {
  const path = lockPath()
  if (!existsSync(path)) return null
  try {
    const info = JSON.parse(readFileSync(path, 'utf-8')) as ServerLockInfo
    if (typeof info.pid !== 'number' || typeof info.httpUrl !== 'string') {
      rmSync(path, { force: true })
      return null
    }
    try {
      // 信号 0 用于探测进程是否存在（不发送实际信号）
      process.kill(info.pid, 0)
      return { pid: info.pid, httpUrl: info.httpUrl }
    } catch {
      // 进程已退出：清理过期锁
      rmSync(path, { force: true })
      return null
    }
  } catch {
    // 锁文件损坏：清理
    try { rmSync(path, { force: true }) } catch { /* ignore */ }
    return null
  }
}
