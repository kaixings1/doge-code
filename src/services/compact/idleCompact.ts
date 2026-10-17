import {
  type CompactionResult,
  compactConversation,
  type RecompactionInfo,
} from './compact.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import { isAutoCompactEnabled, getAutoCompactThreshold } from './autoCompact.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { getGlobalConfig } from '../../utils/config.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'

/**
 * Idle compaction（空闲自动压缩）
 *
 * 对齐官方 v2.1.299（2026-10-14）：200K+ token 对话闲置约 54 分钟后自动压缩，
 * 避开服务端 prompt cache 的 1 小时 TTL——cache 一旦过期，下次请求会把整
 * 个 prefix 重写一遍（带返回的写入成本 + 大额 input token），不如提前主动
 * 压缩掉，让重写的是一个更小的、压缩后的 prefix。
 *
 * 与 auto-compact（按 token 阈值、turn 边界触发）的关系：互补。
 * auto-compact 在「对话很短但 token 已经超阈」时不触发（用户也还没发新消
 * 息，没有 turn 边界）；idle compaction 正好覆盖「对话很长 + 用户离开一段
 * 时间」的场景。
 *
 * 触发条件（全部满足才触发）：
 * 1. auto-compact 未被禁用（复用 isAutoCompactEnabled，保持一处开关来源）
 * 2. 闲置时长 ≥ IDLE_COMPACT_DELAY_MS（默认 54 分钟）
 * 3. token 数 ≥ IDLE_COMPACT_MIN_TOKENS（默认 200K）
 *
 * 关闭方式（任一）：
 * - `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS=0`：让 token 阈值变 0 → 条件 3
 *   永不满足
 * - 设置文件 `"idleCompaction": false`（对齐官方字段名）
 * - 关闭 auto-compact（DISABLE_AUTO_COMPACT / DISABLE_COMPACT / autoCompactEnabled=false）
 *   也会连带关闭 idle compaction
 *
 * 触发后：
 * - 调 compactConversation（与 auto-compact 同一条路径），isAutoCompact=true
 *   以便复用整条压缩链（sessionMemory / microcompact / postCompactCleanup）
 * - 复用 auto-compact 的 circuit breaker（连续失败 3 次熔断），但本函数不持
 *   有 failure 计数——idle 触发频率低（小时级），不像 turn 边界那样密集，
 *   不需要熔断；失败仅 logError 并退出
 */

/** 闲置多久（毫秒）后允许触发 idle compaction。默认 54 分钟。 */
export const IDLE_COMPACT_DELAY_MS = 54 * 60 * 1000

/** 触发 idle compaction 的最小 token 阈值。默认 200K，对齐官方 v2.1.299。 */
export const IDLE_COMPACT_MIN_TOKENS_DEFAULT = 200_000

/**
 * 从环境变量读取 token 阈值。
 * 返回 0 表示用户想关闭此功能（条件 3 永不满足）。
 */
export function getIdleCompactMinTokens(): number {
  const raw = process.env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS
  if (!raw) return IDLE_COMPACT_MIN_TOKENS_DEFAULT
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed) || parsed < 0) return IDLE_COMPACT_MIN_TOKENS_DEFAULT
  return parsed
}

/**
 * Idle compaction 是否启用（不检查当前是否满足触发条件，只看开关）。
 *
 * 关闭路径（任一）：
 * - auto-compact 全局关闭时连带关闭（DISABLE_AUTO_COMPACT / DISABLE_COMPACT /
 *   autoCompactEnabled=false）——保持「压缩总开关」语义单一来源
 * - 设置文件 `"idleCompaction": false`（对齐官方 v2.1.299 字段名）
 * - `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS=0` 让 token 阈值变 0（条件永不满足）
 *
 * 不用 feature() 门控：本 fork（USER_TYPE=ant0）编译时 feature flag
 * 机制对 ant-only 字符串的求值不可靠（外部构建里 DCE 为 false，但 ant0
 * 构建是否为 true 需编译产物验证）。改用配置 + 环境变量，开关显式可控。
 */
export function isIdleCompactionEnabled(): boolean {
  if (!isAutoCompactEnabled()) return false
  // 显式关闭：设置文件里 idleCompaction: false
  const cfg = getGlobalConfig() as { idleCompaction?: boolean }
  if (cfg.idleCompaction === false) return false
  // 显式关闭：环境变量阈值=0
  if (getIdleCompactMinTokens() === 0) return false
  return true
}

/**
 * 判定当前是否应该触发 idle compaction。纯函数，便于单测。
 *
 * @param idleMs       距上一次 query 完成的毫秒数
 * @param tokenCount   当前对话的 token 估算
 * @param minTokens    getIdleCompactMinTokens() 的返回值，传入以便测试
 * @param delayMs      触发延迟，默认 IDLE_COMPACT_DELAY_MS，传入以便测试
 * @returns            true=应该触发
 */
export function shouldIdleCompact(
  idleMs: number,
  tokenCount: number,
  minTokens: number = getIdleCompactMinTokens(),
  delayMs: number = IDLE_COMPACT_DELAY_MS,
): boolean {
  if (!isIdleCompactionEnabled()) return false
  if (minTokens <= 0) return false
  if (idleMs < delayMs) return false
  if (tokenCount < minTokens) return false
  return true
}

/**
 * 执行 idle compaction。复用 auto-compact 的 compactConversation 调用路径，
 * 但不持 circuit breaker（idle 触发稀疏，不需要熔断）。
 *
 * 失败仅 logError 退出，不抛——因为这是后台异步触发，抛错会变成 unhandled
 * rejection。
 */
export async function tryIdleCompaction(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
): Promise<{ wasCompacted: boolean; compactionResult?: CompactionResult }> {
  if (!isIdleCompactionEnabled()) {
    return { wasCompacted: false }
  }
  const model = toolUseContext.options.mainLoopModel
  const tokenCount = tokenCountWithEstimation(messages)
  if (!shouldIdleCompact(0, tokenCount)) {
    // 这里 idleMs 传 0 是因为调用方已确认闲置时长足够；本函数只复核 token。
    // 真实判定在 REPL 的 useEffect 里，它知道 lastQueryCompletionTime。
    return { wasCompacted: false }
  }

  const recompactionInfo: RecompactionInfo = {
    isRecompactionInChain: false,
    turnsSincePreviousCompact: -1,
    previousCompactTurnId: undefined,
    autoCompactThreshold: getAutoCompactThreshold(model),
    querySource: 'compact',
  }

  logForDebugging(
    `idle compaction: triggering (tokens=${tokenCount}, threshold=${getIdleCompactMinTokens()})`,
  )

  try {
    const compactionResult = await compactConversation(
      messages,
      toolUseContext,
      cacheSafeParams,
      true, // suppressFollowUpQuestions（与 auto-compact 一致）
      undefined, // 无自定义指令
      true, // isAutoCompact=true，复用压缩链
      recompactionInfo,
    )
    runPostCompactCleanup('compact')
    logForDebugging('idle compaction: done')
    return { wasCompacted: true, compactionResult }
  } catch (error) {
    logError(error)
    logForDebugging(`idle compaction: failed — ${error instanceof Error ? error.message : String(error)}`)
    return { wasCompacted: false }
  }
}

/**
 * 计算距下次 idle compaction 触发的剩余毫秒。供 REPL 的 useEffect 用
 * `setTimeout(cb, remaining)` 调度触发——若用户提前活跃了，effect 重跑
 * 会清掉旧 timer，不会误触发。
 */
export function getIdleCompactRemainingMs(
  lastQueryCompletionTime: number,
  now: number = Date.now(),
): number {
  if (!isIdleCompactionEnabled()) return -1
  const elapsed = now - lastQueryCompletionTime
  return Math.max(0, IDLE_COMPACT_DELAY_MS - elapsed)
}
