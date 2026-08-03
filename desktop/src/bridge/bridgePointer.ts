import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { z } from 'zod/v4'
import { logForDebugging } from '../utils/debug.js'
import { isENOENT } from '../utils/errors.js'
import { getWorktreePathsPortable } from '../utils/getWorktreePathsPortable.js'
import { lazySchema } from '../utils/lazySchema.js'
import {
  getProjectsDir,
  sanitizePath,
} from '../utils/sessionStoragePortable.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

/**
 * 工作树扇出的上限。git worktree list 天然有限
 *（50 已经很"多"了），但这限制了并发的 stat() 突发并防范
 * 病态配置。超过此值，--continue 回退到仅当前目录。
 */
const MAX_WORKTREE_FANOUT = 50

/**
 * 远程控制会话的崩溃恢复指针。
 *
 * 在桥接器会话创建后立即写入，会话期间定期刷新，
 * 在正常关闭时清除。如果进程非正常退出（崩溃、kill -9、终端关闭），
 * 指针会持久存在。下次启动时，`claude remote-control` 会检测到它并
 * 通过 #20460 的 --session-id 流程提供恢复选项。
 *
 * 过时检查基于文件的 mtime（而非内嵌的时间戳），
 * 因此使用相同内容的定期重写充当刷新 —
 * 匹配后端滚动的 BRIDGE_LAST_POLL_TTL（4小时）语义。
 * 桥接器轮询了 5 小时以上然后崩溃，只要刷新在窗口内运行，
 * 指针仍然新鲜。
 *
 * 按工作目录范围创建（与转录 JSONL 文件一起），因此
 * 不同仓库中的两个并发桥接器不会互相冲突。
 */

export const BRIDGE_POINTER_TTL_MS = 4 * 60 * 60 * 1000

const BridgePointerSchema = lazySchema(() =>
  z.object({
    sessionId: z.string(),
    environmentId: z.string(),
    source: z.enum(['standalone', 'repl']),
  }),
)

export type BridgePointer = z.infer<ReturnType<typeof BridgePointerSchema>>

export function getBridgePointerPath(dir: string): string {
  return join(getProjectsDir(), sanitizePath(dir), 'bridge-pointer.json')
}

/**
 * 写入指针。也用于在长时间会话期间刷新 mtime —
 * 使用相同 ID 调用是一种廉价的无内容变更写入，会更新
 * 过时时钟。尽力而为 — 崩溃恢复文件绝不应
 * 自身导致崩溃。出错时记录日志并静默吞掉。
 */
export async function writeBridgePointer(
  dir: string,
  pointer: BridgePointer,
): Promise<void> {
  const path = getBridgePointerPath(dir)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, jsonStringify(pointer), 'utf8')
    logForDebugging(`[bridge:pointer] wrote ${path}`)
  } catch (err: unknown) {
    logForDebugging(`[bridge:pointer] write failed: ${err}`, { level: 'warn' })
  }
}

/**
 * 读取指针及其年龄（自上次写入以来的毫秒数）。直接操作
 * 并处理错误 — 不检查存在性（CLAUDE.md TOCTOU 规则）。在以下情况返回 null：
 * 文件丢失、JSON 损坏、模式不匹配或
 * 过时（mtime 超过 4 小时）。过期/无效的指针会被删除，以免
 * 在后端已经 GC 了环境后继续反复提示。
 */
export async function readBridgePointer(
  dir: string,
): Promise<(BridgePointer & { ageMs: number }) | null> {
  const path = getBridgePointerPath(dir)
  let raw: string
  let mtimeMs: number
  try {
    // stat 获取 mtime（过时锚点），然后读取。两个系统调用，但都需要
    // — mtime 就是我们返回的数据，不是 TOCTOU 守卫。
    mtimeMs = (await stat(path)).mtimeMs
    raw = await readFile(path, 'utf8')
  } catch {
    return null
  }

  const parsed = BridgePointerSchema().safeParse(safeJsonParse(raw))
  if (!parsed.success) {
    logForDebugging(`[bridge:pointer] invalid schema, clearing: ${path}`)
    await clearBridgePointer(dir)
    return null
  }

  const ageMs = Math.max(0, Date.now() - mtimeMs)
  if (ageMs > BRIDGE_POINTER_TTL_MS) {
    logForDebugging(`[bridge:pointer] stale (>4h mtime), clearing: ${path}`)
    await clearBridgePointer(dir)
    return null
  }

  return { ...parsed.data, ageMs }
}

/**
 * 用于 `--continue` 的工作树感知读取。REPL 桥接器将其指针写入
 * `getOriginalCwd()`，EnterWorktreeTool/activeWorktreeSession 可能
 * 将其变为工作树路径 — 但 `claude remote-control --continue` 以
 * `resolve('.')` = shell CWD 运行。这会在 git 工作树兄弟中
 * 扇出扫描，以找到最新的指针，匹配 /resume 的语义。
 *
 * 快速路径：先检查 `dir`。仅当未命中时才执行 `git worktree list`
 * — 常见情况（指针在启动目录中）是一次 stat、零次 exec。
 * 扇出读取并行运行；上限为 MAX_WORKTREE_FANOUT。
 *
 * 返回指针及其所在的目录，以便调用者在恢复失败时
 * 清除正确的文件。
 */
export async function readBridgePointerAcrossWorktrees(
  dir: string,
): Promise<{ pointer: BridgePointer & { ageMs: number }; dir: string } | null> {
  // 快速路径：当前目录。覆盖独立桥接器（总是匹配）和
  // 在没有工作树变更时的 REPL 桥接器。
  const here = await readBridgePointer(dir)
  if (here) {
    return { pointer: here, dir }
  }

  // 扇出：扫描工作树兄弟目录。getWorktreePathsPortable 有 5 秒
  // 超时，在任何错误时返回 []（不是 git 仓库，git 未安装）。
  const worktrees = await getWorktreePathsPortable(dir)
  if (worktrees.length <= 1) return null
  if (worktrees.length > MAX_WORKTREE_FANOUT) {
    logForDebugging(
      `[bridge:pointer] ${worktrees.length} worktrees exceeds fanout cap ${MAX_WORKTREE_FANOUT}, skipping`,
    )
    return null
  }

  // 与 `dir` 去重，这样我们不需要再次 stat 它。sanitizePath 标准化
  // 大小写/分隔符，使得工作树列表输出与我们的快速路径键匹配，即使在
  // Windows 上 git 可能输出 C:/vs 存储的 c:/。
  const dirKey = sanitizePath(dir)
  const candidates = worktrees.filter(wt => sanitizePath(wt) !== dirKey)

  // 并行 stat+ 读取。每个 readBridgePointer 是一个 stat()，对于没有指针的
  // 工作树返回 ENOENT（便宜），对于有指针的稀有情况则进行约 100 字节的读取。Promise.all → 延迟≈最慢的单个 stat。
  const results = await Promise.all(
    candidates.map(async wt => {
      const p = await readBridgePointer(wt)
      return p ? { pointer: p, dir: wt } : null
    }),
  )

  // 选择最新的（最低 ageMs）。指针存储 environmentId，因此
  // 恢复时无论从哪个工作树调用 --continue，都会连接到正确的环境。
  let freshest: {
    pointer: BridgePointer & { ageMs: number }
    dir: string
  } | null = null
  for (const r of results) {
    if (r && (!freshest || r.pointer.ageMs < freshest.pointer.ageMs)) {
      freshest = r
    }
  }
  if (freshest) {
    logForDebugging(
      `[bridge:pointer] fanout found pointer in worktree ${freshest.dir} (ageMs=${freshest.pointer.ageMs})`,
    )
  }
  return freshest
}

/**
 * 删除指针。幂等 — 当进程先前正常关闭时，ENOENT 是预期的。
 * shut down clean previously.
 */
export async function clearBridgePointer(dir: string): Promise<void> {
  const path = getBridgePointerPath(dir)
  try {
    await unlink(path)
    logForDebugging(`[bridge:pointer] cleared ${path}`)
  } catch (err: unknown) {
    if (!isENOENT(err)) {
      logForDebugging(`[bridge:pointer] clear failed: ${err}`, {
        level: 'warn',
      })
    }
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return jsonParse(raw)
  } catch {
    return null
  }
}
