// 定时任务，存储在 <项目根目录>/.claude/scheduled_tasks.json 中。
//
// 任务分为两种类型：
//   - 一次性任务（recurring: false/未定义）—— 触发一次后自动删除。
//   - 重复性任务（recurring: true）—— 按计划触发，并从当前时间重新调度，
//     持久保存，直到通过 CronDelete 显式删除，或在可配置的限制（DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs）后自动过期。
//
// 文件格式：
//   { "tasks": [{ id, cron, prompt, createdAt, recurring?, permanent? }] }

import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  addSessionCronTask,
  getProjectRoot,
  getSessionCronTasks,
  removeSessionCronTasks,
} from '../bootstrap/state.js'
import { computeNextCronRun, parseCronExpression } from './cron.js'
import { logForDebugging } from './debug.js'
import { isFsInaccessible } from './errors.js'
import { getFsImplementation } from './fsOperations.js'
import { safeParseJSON } from './json.js'
import { logError } from './log.js'
import { jsonStringify } from './slowOperations.js'

export type CronTask = {
  id: string
  /** 5 字段 cron 字符串（本地时间）—— 写入时验证，读取时重新验证。 */
  cron: string
  /** 任务触发时要排队的提示词。 */
  prompt: string
  /** 任务创建时的纪元毫秒数。用于检测遗漏任务的基准。 */
  createdAt: number
  /**
   * 最近一次触发的纪元毫秒数。每次重复触发后由调度器写回，
   * 以便下次触发时间的计算在进程重启后仍能延续。
   * 调度器从 `lastFiredAt ?? createdAt` 确定首次发现基准 ——
   * 从未触发过的任务使用 createdAt（对于固定 cron 如
   * `30 14 27 2 *` 来说这是正确的，其下次触发可能在明年）；
   * 曾经触发过的任务会重建先前进程内存中的相同 `nextFireAt`。
   * 一次性任务不会设置此字段（它们在触发时被删除）。
   */
  lastFiredAt?: number
  /** 当为 true 时，任务在触发后会重新调度，而不是被删除。 */
  recurring?: boolean
  /**
   * 当为 true 时，任务免于 recurringMaxAgeMs 自动过期。
   * 这是助手模式内置任务（catch-up/morning-checkin/dream）的系统逃生通道 ——
   * 安装程序的 writeIfMissing() 会跳过已存在的文件，因此重新安装无法重新创建它们。
   * 无法通过 CronCreateTool 设置；仅由 src/assistant/install.ts 直接写入 scheduled_tasks.json。
   */
  permanent?: boolean
  /**
   * 仅运行时标志。false → 会话作用域（从不写入磁盘）。
   * 文件支持的任务不定义此字段；writeCronTasks 会剥离它，
   * 因此磁盘上的形状保持为 { id, cron, prompt, createdAt, lastFiredAt?, recurring?, permanent? }。
   */
  durable?: boolean
  /**
   * 仅运行时标志。设置时表示任务由进程内队友创建。
   * 调度器会将触发路由到该队友的队列，而不是主 REPL 队列。
   * 从不写入磁盘（队友 cron 始终仅会话有效）。
   */
  agentId?: string
}

type CronFile = { tasks: CronTask[] }

const CRON_FILE_REL = join('.claude', 'scheduled_tasks.json')

/**
 * cron 文件的路径。`dir` 默认为 getProjectRoot() ——
 * 对于不通过 main.tsx 运行的上下文（例如没有引导状态的 Agent SDK 守护进程），
 * 请显式传递该参数。
 */
export function getCronFilePath(dir?: string): string {
  return join(dir ?? getProjectRoot(), CRON_FILE_REL)
}

/**
 * 读取并解析 .claude/scheduled_tasks.json。如果文件缺失、为空或格式错误，
 * 则返回空任务列表。cron 字符串无效的任务会被静默丢弃（在调试级别记录日志），
 * 因此单个错误条目永远不会阻塞整个文件。
 */
export async function readCronTasks(dir?: string): Promise<CronTask[]> {
  const fs = getFsImplementation()
  let raw: string
  try {
    raw = await fs.readFile(getCronFilePath(dir), { encoding: 'utf-8' })
  } catch (e: unknown) {
    if (isFsInaccessible(e)) return []
    logError(e)
    return []
  }

  const parsed = safeParseJSON(raw, false)
  if (!parsed || typeof parsed !== 'object') return []
  const file = parsed as Partial<CronFile>
  if (!Array.isArray(file.tasks)) return []

  const out: CronTask[] = []
  for (const t of file.tasks) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      typeof t.cron !== 'string' ||
      typeof t.prompt !== 'string' ||
      typeof t.createdAt !== 'number'
    ) {
      logForDebugging(
        `[定时任务] 跳过格式错误的任务：${jsonStringify(t)}`,
      )
      continue
    }
    if (!parseCronExpression(t.cron)) {
      logForDebugging(
        `[定时任务] 跳过任务 ${t.id}，因其 cron 表达式无效 '${t.cron}'`,
      )
      continue
    }
    out.push({
      id: t.id,
      cron: t.cron,
      prompt: t.prompt,
      createdAt: t.createdAt,
      ...(typeof t.lastFiredAt === 'number'
        ? { lastFiredAt: t.lastFiredAt }
        : {}),
      ...(t.recurring ? { recurring: true } : {}),
      ...(t.permanent ? { permanent: true } : {}),
    })
  }
  return out
}

/**
 * 同步检查 cron 文件是否包含任何有效任务。由 cronScheduler.start() 用于决定是否自动启用。
 * 仅一次文件读取。
 */
export function hasCronTasksSync(dir?: string): boolean {
  let raw: string
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs -- 仅在 cronScheduler.start() 中调用一次
    raw = readFileSync(getCronFilePath(dir), 'utf-8')
  } catch {
    return false
  }
  const parsed = safeParseJSON(raw, false)
  if (!parsed || typeof parsed !== 'object') return false
  const tasks = (parsed as Partial<CronFile>).tasks
  return Array.isArray(tasks) && tasks.length > 0
}

/**
 * 用给定的任务覆盖写入 .claude/scheduled_tasks.json。如果 .claude/ 目录缺失则创建。
 * 空任务列表会写入一个空文件（而不是删除），以便文件监视器在最后一个任务被移除时能检测到变更事件。
 */
export async function writeCronTasks(
  tasks: CronTask[],
  dir?: string,
): Promise<void> {
  const root = dir ?? getProjectRoot()
  await mkdir(join(root, '.claude'), { recursive: true })
  // 剥离仅运行时的 `durable` 标志 —— 磁盘上的所有内容按定义都是持久化的，
  // 不保留该标志意味着 readCronTasks() 会自然地产生 durable: undefined，而无需显式设置。
  const body: CronFile = {
    tasks: tasks.map(({ durable: _durable, ...rest }) => rest),
  }
  await writeFile(
    getCronFilePath(root),
    jsonStringify(body, null, 2) + '\n',
    'utf-8',
  )
}

/**
 * 追加一个任务。返回生成的 ID。调用者需确保 cron 字符串已经过验证（工具通过 validateInput 完成此操作）。
 *
 * 当 `durable` 为 false 时，任务仅保存在进程内存中（bootstrap/state.ts）——
 * 它会在本次会话中按计划触发，但从不写入 .claude/scheduled_tasks.json，并在进程结束时消亡。
 * 调度器会将会话任务直接合并到其时钟循环中，因此不需要文件变更事件。
 */
export async function addCronTask(
  cron: string,
  prompt: string,
  recurring: boolean,
  durable: boolean,
  agentId?: string,
): Promise<string> {
  // 短 ID —— 8 个十六进制字符对于 MAX_JOBS=50 来说绰绰有余，避免了在工具层（显示短 ID）和磁盘之间切换前缀/切片。
  const id = randomUUID().slice(0, 8)
  const task = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...(recurring ? { recurring: true } : {}),
  }
  if (!durable) {
    addSessionCronTask({ ...task, ...(agentId ? { agentId } : {}) })
    return id
  }
  const tasks = await readCronTasks()
  tasks.push(task)
  await writeCronTasks(tasks)
  return id
}

/**
 * 根据 ID 移除任务。如果没有匹配项（例如另一个会话抢先一步），则不执行任何操作。
 * 用于一次性任务的触发后清理和显式的 CronDelete。
 *
 * 当 `dir` 未定义（REPL 路径）时，也会清理内存中的会话存储 —— 调用者不知道 ID 属于哪个存储。
 * 守护进程调用者会显式传递 `dir`；它们没有会话存储，且 `dir !== undefined` 的守卫会阻止此函数在该路径上触碰引导状态（测试会强制执行此行为）。
 */
export async function removeCronTasks(
  ids: string[],
  dir?: string,
): Promise<void> {
  if (ids.length === 0) return
  // 首先清理会话存储。如果所有 ID 都在那里处理完毕，我们就完成了 —— 完全跳过文件读取。
  // removeSessionCronTasks 在未命中时是无操作（返回 0），因此预先存在的持久化删除路径会无分配地穿透。
  if (dir === undefined && removeSessionCronTasks(ids) === ids.length) {
    return
  }
  const idSet = new Set(ids)
  const tasks = await readCronTasks(dir)
  const remaining = tasks.filter(t => !idSet.has(t.id))
  if (remaining.length === tasks.length) return
  await writeCronTasks(remaining, dir)
}

/**
 * 在给定的重复性任务上标记 `lastFiredAt` 并写回。批量处理，
 * 以便调度器一个时钟周期内的 N 次触发只进行一次读取-修改-写入，而不是 N 次。
 * 仅影响文件支持的任务 —— 会话任务随进程消亡，持久化其触发时间没有意义。
 * 如果没有任何 ID 匹配（任务在触发和写入之间被删除，例如用户在时钟周期中途运行了 CronDelete），则不执行任何操作。
 *
 * 调度器锁意味着最多只有一个进程调用此函数；chokidar 会检测到写入并触发重新加载，
 * 该加载会从刚写入的 `lastFiredAt` 重新计算 `nextFireAt` —— 幂等的（相同的计算，相同的结果）。
 */
export async function markCronTasksFired(
  ids: string[],
  firedAt: number,
  dir?: string,
): Promise<void> {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const tasks = await readCronTasks(dir)
  let changed = false
  for (const t of tasks) {
    if (idSet.has(t.id)) {
      t.lastFiredAt = firedAt
      changed = true
    }
  }
  if (!changed) return
  await writeCronTasks(tasks, dir)
}

/**
 * 文件支持的任务 + 仅会话的任务，合并返回。会话任务会带有 `durable: false`，
 * 以便调用者区分它们。文件任务按原样返回（durable 未定义 → 真值）。
 *
 * 仅当 `dir` 未定义时才进行合并 —— 守护进程调用者（显式 `dir`）没有会话存储可供合并。
 */
export async function listAllCronTasks(dir?: string): Promise<CronTask[]> {
  const fileTasks = await readCronTasks(dir)
  if (dir !== undefined) return fileTasks
  const sessionTasks = getSessionCronTasks().map(t => ({
    ...t,
    durable: false as const,
  }))
  return [...fileTasks, ...sessionTasks]
}

/**
 * 返回给定 cron 字符串在严格晚于 `fromMs` 之后的下次触发时间（纪元毫秒）。
 * 如果无效或在未来 366 天内无匹配则返回 null。
 */
export function nextCronRunMs(cron: string, fromMs: number): number | null {
  const fields = parseCronExpression(cron)
  if (!fields) return null
  const next = computeNextCronRun(fields, new Date(fromMs))
  return next ? next.getTime() : null
}

/**
 * Cron 调度器调优参数。运行时从 `tengu_kairos_cron_config` GrowthBook JSON 配置中获取
 * （参见 cronJitterConfig.ts），以便运维人员可以在不发布客户端版本的情况下全舰队调整行为。
 * 此处的默认值精确保留了配置前的行为。
 */
export type CronJitterConfig = {
  /** 重复任务的前向延迟，表示为两次触发间隔的分数。 */
  recurringFrac: number
  /** 无论间隔长度如何，重复任务前向延迟的上限。 */
  recurringCapMs: number
  /** 一次性任务的后向提前量：任务可以提前触发的最大毫秒数。 */
  oneShotMaxMs: number
  /**
   * 一次性任务的后向提前量：当分钟模数门控匹配时，任务提前触发的最小毫秒数。
   * 0 = 任务 ID 哈希接近零的任务会在精确时刻触发。提高此值可保证无人落在壁钟边界上。
   */
  oneShotFloorMs: number
  /**
   * 抖动触发落在 `minute % N === 0` 的分钟上。30 → :00/:30（人类取整的热点）。
   * 15 → :00/:15/:30/:45。1 → 每分钟。
   */
  oneShotMinuteMod: number
  /**
   * 重复任务在创建后经过这么多毫秒自动过期（除非标记为 `permanent`）。
   * Cron 是多天会话的主要驱动力（自 #19931 以来，p99 运行时间从 61 分钟提升至 53 小时），
   * 无限制的重复会让 Tier-1 堆泄漏无限累积。默认值（7 天）涵盖了“本周每小时检查我的 PR”这类工作流，
   * 同时限制了最坏情况下的会话生命周期。永久任务（助手模式的 catch-up/morning-checkin/dream）
   * 永不过期 —— 它们无法在删除后重建，因为 install.ts 的 writeIfMissing() 会跳过已存在的文件。
   *
   * `0` = 无限（任务永不过期）。
   */
  recurringMaxAgeMs: number
}

export const DEFAULT_CRON_JITTER_CONFIG: CronJitterConfig = {
  recurringFrac: 0.1,
  recurringCapMs: 15 * 60 * 1000,
  oneShotMaxMs: 90 * 1000,
  oneShotFloorMs: 0,
  oneShotMinuteMod: 30,
  recurringMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
}

/**
 * taskId 是 8 个十六进制字符的 UUID 切片（参见 {@link addCronTask}）→ 解析为 u32 → [0, 1)。
 * 在重启之间保持稳定，在整个舰队中均匀分布。非十六进制 ID（手工编辑的 JSON）回退到 0 = 无抖动。
 */
function jitterFrac(taskId: string): number {
  const frac = parseInt(taskId.slice(0, 8), 16) / 0x1_0000_0000
  return Number.isFinite(frac) ? frac : 0
}

/**
 * 与 {@link nextCronRunMs} 相同，但增加了一个确定性的每任务延迟，
 * 以避免当许多会话调度相同的 cron 字符串时出现惊群效应（例如 `0 * * * *` → 每个人都在 :00 时刻请求推理）。
 *
 * 延迟与当前两次触发之间的间隔成比例（{@link CronJitterConfig.recurringFrac}，
 * 上限为 {@link CronJitterConfig.recurringCapMs}），因此在默认设置下，
 * 每小时任务会分布在 [:00, :06) 之间，而每分钟任务仅分散几秒钟。
 *
 * 仅用于重复任务。一次性任务使用 {@link oneShotJitteredNextCronRunMs}（后向抖动，分钟门控）。
 */
export function jitteredNextCronRunMs(
  cron: string,
  fromMs: number,
  taskId: string,
  cfg: CronJitterConfig = DEFAULT_CRON_JITTER_CONFIG,
): number | null {
  const t1 = nextCronRunMs(cron, fromMs)
  if (t1 === null) return null
  const t2 = nextCronRunMs(cron, t1)
  // 在下一年内没有第二次匹配（例如固定日期）→ 没有可供比例计算的参照，且几乎肯定不存在惊群风险。在 t1 触发。
  if (t2 === null) return t1
  const jitter = Math.min(
    jitterFrac(taskId) * cfg.recurringFrac * (t2 - t1),
    cfg.recurringCapMs,
  )
  return t1 + jitter
}

/**
 * 与 {@link nextCronRunMs} 相同，但当触发时间落在匹配 {@link CronJitterConfig.oneShotMinuteMod} 的分钟边界上时，
 * 会减去一个确定性的每任务提前量。
 *
 * 一次性任务是用户指定的（“下午 3 点提醒我”），因此延迟它们会破坏契约 ——
 * 但稍微提前触发是不可察觉的，并且可以分散因每个人选择相同的取整壁钟时间而产生的推理峰值。
 * 在默认设置下（模 30，最大 90 秒，下限 0），只有 :00 和 :30 会获得抖动，因为人类会取整到半小时。
 *
 * 在事故期间，运维人员可以推送例如 `{oneShotMinuteMod: 15, oneShotMaxMs: 300000, oneShotFloorMs: 30000}` 的
 * `tengu_kairos_cron_config`，将 :00/:15/:30/:45 的触发分散到 [t-5分钟, t-30秒] 的时间窗口内 ——
 * 每个任务至少提前 30 秒，因此无人落在精确时刻上。
 *
 * 检查计算出的触发时间而不是 cron 字符串，以便 `0 15 * * *`、步长表达式和 `0,30 9 * * *`
 * 在它们落在匹配分钟上时都能获得抖动。限制在 `fromMs` 之内，因此在其自身抖动窗口内创建的任务不会在创建之前触发。
 */
export function oneShotJitteredNextCronRunMs(
  cron: string,
  fromMs: number,
  taskId: string,
  cfg: CronJitterConfig = DEFAULT_CRON_JITTER_CONFIG,
): number | null {
  const t1 = nextCronRunMs(cron, fromMs)
  if (t1 === null) return null
  // Cron 分辨率为 1 分钟 → 计算出的时间总是 :00 秒，
  // 因此分钟字段检查足以识别热点标记。
  // 使用 getMinutes()（本地时间）而不是 getUTCMinutes()：cron 按本地时间计算，
  // “用户选择了取整时间”意味着在其 *所在时区* 取整。在半小时偏移时区（印度 UTC+5:30），
  // 本地 :00 是 UTC :30 —— 使用 UTC 检查会错误地抖动标记。
  if (new Date(t1).getMinutes() % cfg.oneShotMinuteMod !== 0) return t1
  // 下限 + 分数 * (最大值 - 下限) → 在 [下限, 最大值) 上均匀分布。当下限=0 时，
  // 这简化为原始的 分数 * 最大值。当下限>0 时，即使 taskId 哈希为 0 也会获得 `下限` 毫秒的提前量 —— 无人落在精确时刻上。
  const lead =
    cfg.oneShotFloorMs +
    jitterFrac(taskId) * (cfg.oneShotMaxMs - cfg.oneShotFloorMs)
  // t1 > fromMs 由 nextCronRunMs（严格晚于）保证，因此 max() 仅在任务在其自身提前窗口内创建时生效。
  return Math.max(t1 - lead, fromMs)
}

/**
 * 当任务的下次计划运行时间（从 createdAt 计算得出）在过去时，该任务被视为“遗漏”。
 * 在启动时向用户显示。适用于一次性任务和重复任务 —— 在 Claude 停机期间错过其窗口的重复任务仍被视为“遗漏”。
 */
export function findMissedTasks(tasks: CronTask[], nowMs: number): CronTask[] {
  return tasks.filter(t => {
    const next = nextCronRunMs(t.cron, t.createdAt)
    return next !== null && next < nowMs
  })
}