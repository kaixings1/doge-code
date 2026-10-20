/**
 * [2026-10-20] 后台 bash 任务的 PID 注册表。
 *
 * 问题：`LocalShellTask` 的 `shellCommand` 是内存对象，PID 从未落盘。doge-code
 * 崩溃、被强杀、或会话被压缩后，界面上那条"运行中"的任务既没有进程句柄，
 * 也无法判断进程是否还活着 —— 表现为"子代理一直卡死，且无法终止"。
 *
 * 做法：后台任务启动时写一条记录（taskId/pid/agentId/command 摘要），结束时
 * 删除。会话启动时扫描本项目的**所有会话目录**，把"记录还在但进程已不存在"
 * 的条目标记为失效，"进程仍活着但当前会话没有对应任务"的条目列为孤儿，
 * 供上层提示并允许清理。
 *
 * 存储位置：`<projectTempDir><sessionId>/tasks/<taskId>.pid`（JSON）。
 * 放在 session 子目录内，使得跨会话扫描只需遍历项目临时目录的子目录。
 */
import { readdir, readFile, unlink, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getProjectTempDir } from '../permissions/filesystem.js'
import { getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../debug.js'

export type BgTaskRecord = {
  taskId: string
  pid: number
  agentId?: string
  command: string
  startedAt: number
  /** 仅孤儿检测填充：pid 是否仍存活 */
  alive?: boolean
}

function recordPath(dir: string, taskId: string): string {
  return join(dir, `${taskId}.pid`)
}

async function currentDir(): Promise<string> {
  const dir = join(getProjectTempDir(), getSessionId(), 'tasks')
  await mkdir(dir, { recursive: true })
  return dir
}

/** 登记一个后台任务（覆盖同 taskId 的旧记录）。失败不影响主流程。 */
export async function registerBgTask(rec: BgTaskRecord): Promise<void> {
  try {
    const dir = await currentDir()
    await writeFile(recordPath(dir, rec.taskId), JSON.stringify(rec), 'utf8')
  } catch (error) {
    logForDebugging(`registerBgTask 失败: ${error}`)
  }
}

/** 任务结束（完成/失败/被杀）时注销。 */
export async function unregisterBgTask(taskId: string): Promise<void> {
  try {
    const dir = await currentDir()
    await unlink(recordPath(dir, taskId)).catch(() => {})
  } catch (error) {
    logForDebugging(`unregisterBgTask 失败: ${error}`)
  }
}

/**
 * 判断 PID 是否仍存活。
 * Windows: `tasklist /FI "PID eq N"`；POSIX: `kill -0`。
 */
export async function isPidAlive(pid: number): Promise<boolean> {
  const { execFile } = await import('child_process')
  const [cmd, args] = process.platform === 'win32'
    ? ['tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']]
    : ['kill', ['-0', String(pid)]]
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (process.platform === 'win32') {
        // 找不到时 tasklist 输出 "INFO: No tasks are running..."，退出码仍为 0
        resolve(!err && String(stdout).includes(String(pid)))
      } else {
        resolve(!err)
      }
    })
  })
}

/**
 * 扫描本项目所有会话的后台任务记录，返回仍存活、但不在 `knownTaskIds`
 * 中的孤儿进程。
 *
 * @param knownTaskIds 当前内存中已知的任务 id（这些不算孤儿）
 */
let scanStarted = false

/**
 * 一次性孤儿扫描（会话内首次调用执行，之后为空操作）。
 *
 * 挂载点：`pollTasks()` —— 任务轮询主循环，天然是"任务系统已就绪"的信号。
 * 扫描结果通过 `onFound` 交给调用方（通常是入队一条通知），
 * 不在这里直接操作 UI，避免工具层依赖 state 层。
 */
export function ensureOrphanScan(
  knownTaskIds: Set<string>,
  onFound: (orphans: BgTaskRecord[]) => void,
): void {
  if (scanStarted) return
  scanStarted = true
  void findOrphanBgTasks(knownTaskIds)
    .then(orphans => {
      if (orphans.length > 0) onFound(orphans)
    })
    .catch(error => {
      logForDebugging(`孤儿后台任务扫描失败: ${error}`)
    })
}

export async function findOrphanBgTasks(
  knownTaskIds: Set<string>,
): Promise<BgTaskRecord[]> {
  const orphans: BgTaskRecord[] = []
  const root = getProjectTempDir()
  let sessionDirs: string[]
  try {
    sessionDirs = await readdir(root, { withFileTypes: true }).then(es =>
      es.filter(e => e.isDirectory()).map(e => join(root, e.name)),
    )
  } catch {
    return orphans
  }

  const current = getSessionId()
  for (const sessionDir of sessionDirs) {
    const taskDir = join(sessionDir, 'tasks')
    let files: string[]
    try {
      files = await readdir(taskDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.pid')) continue
      const taskId = file.slice(0, -4)
      try {
        const raw = await readFile(join(taskDir, file), 'utf8')
        const rec = JSON.parse(raw) as BgTaskRecord
        if (!rec?.pid) continue
        const alive = await isPidAlive(rec.pid)
        if (!alive) {
          // 记录失效：进程已退出，清理记录
          await unlink(join(taskDir, file)).catch(() => {})
          continue
        }
        // 进程活着：当前会话已知的除外
        if (sessionDir.endsWith(current) && knownTaskIds.has(taskId)) continue
        orphans.push({ ...rec, alive: true })
      } catch (error) {
        logForDebugging(`读取后台任务记录失败 ${file}: ${error}`)
      }
    }
  }
  return orphans
}
