import { z } from 'zod/v4'
import { getFeatureValue_DEPRECATED } from '../services/analytics/growthbook.js'
import { lazySchema } from '../utils/lazySchema.js'
import { lt } from '../utils/semver.js'
import { isEnvLessBridgeEnabled } from './bridgeEnabled.js'

export type EnvLessBridgeConfig = {
  // withRetry — 初始化阶段退避（createSession、POST /bridge、恢复 /bridge）
  init_retry_max_attempts: number
  init_retry_base_delay_ms: number
  init_retry_jitter_fraction: number
  init_retry_max_delay_ms: number
  // POST /sessions、POST /bridge、POST /archive 的 axios 超时
  http_timeout_ms: number
  // BoundedUUIDSet 环大小（回显 + 重新投递去重）
  uuid_dedup_buffer_size: number
  // CCRClient 工作节点心跳节奏。服务端 TTL 为 60 秒——20 秒提供 3 倍余量。
  heartbeat_interval_ms: number
  // 间隔的 ± 比例——每次心跳的抖动以分散集群负载。
  heartbeat_jitter_fraction: number
  // 在 expires_in 前提前多久触发主动 JWT 刷新。缓冲越大，刷新越频繁（刷新节奏 ≈ expires_in - buffer）。
  token_refresh_buffer_ms: number
  // teardown() 中的存档 POST 超时。与 http_timeout_ms 不同，因为 gracefulShutdown 会将 runCleanupFunctions() 与 2 秒上限竞速——
  // 在缓慢或停滞的存档请求上，10 秒的 axios 超时会烧掉整个预算，而 forceExit 无论如何都会终止该请求。
  teardown_archive_timeout_ms: number
  // transport.connect() 后 onConnect 的截止时间。如果在此之前既未触发 onConnect 也未触发 onClose，
  // 则发出 tengu_bridge_repl_connect_timeout —— 这是约 1% 的会话的唯一遥测，这些会话发出 `started` 后便沉默（无错误、无事件，什么都没有）。
  connect_timeout_ms: number
  // 无环境桥接器路径的 Semver 下限。与 v1 的 tengu_bridge_min_version 配置分开，
  // 以便 v2 特定的错误可以强制升级，而不会阻塞 v1（基于环境）的客户端，反之亦然。
  min_version: string
  // 当为 true 时，告知用户他们的 claude.ai 应用版本可能太旧而无法查看 v2 会话——
  // 这允许我们在应用发布新的会话列表查询之前先行推出 v2 桥接器。
  should_show_app_upgrade_message: boolean
}

export const DEFAULT_ENV_LESS_BRIDGE_CONFIG: EnvLessBridgeConfig = {
  init_retry_max_attempts: 3,
  init_retry_base_delay_ms: 500,
  init_retry_jitter_fraction: 0.25,
  init_retry_max_delay_ms: 4000,
  http_timeout_ms: 10_000,
  uuid_dedup_buffer_size: 2000,
  heartbeat_interval_ms: 20_000,
  heartbeat_jitter_fraction: 0.1,
  token_refresh_buffer_ms: 400_000,
  teardown_archive_timeout_ms: 1500,
  connect_timeout_ms: 15_000,
  min_version: '0.0.0',
  should_show_app_upgrade_message: false,
}

// 在违反时拒绝整个对象（回退到默认值），而非部分信任——与 pollConfig.ts 相同的纵深防御。
const envLessBridgeConfigSchema = lazySchema(() =>
  z.object({
    init_retry_max_attempts: z.number().int().min(1).max(10).default(3),
    init_retry_base_delay_ms: z.number().int().min(100).default(500),
    init_retry_jitter_fraction: z.number().min(0).max(1).default(0.25),
    init_retry_max_delay_ms: z.number().int().min(500).default(4000),
    http_timeout_ms: z.number().int().min(2000).default(10_000),
    uuid_dedup_buffer_size: z.number().int().min(100).max(50_000).default(2000),
    // 服务端 TTL 为 60 秒。下限 5 秒防止颠簸；上限 30 秒保持至少 2 倍余量。
    heartbeat_interval_ms: z
      .number()
      .int()
      .min(5000)
      .max(30_000)
      .default(20_000),
    // 每次心跳的 ± 比例。上限 0.5：在最坏情况下（间隔 30 秒 × 1.5 = 45 秒）仍低于 60 秒 TTL。
    heartbeat_jitter_fraction: z.number().min(0).max(0.5).default(0.1),
    // 下限 30 秒防止紧密循环。上限 30 分钟拒绝缓冲区与延迟的语义反转：
    // 操作错误地将 expires_in-5min（直到刷新的*延迟*）理解为 5min（到期前的*缓冲*），
    // 导致 delayMs = expires_in - buffer ≈ 5min 而非 ≈ 4h。两者均为正持续时间，仅靠 .min() 无法区分；
    // .max() 捕获反转的值，因为对于多小时的 JWT，缓冲区 ≥ 30 分钟是荒谬的。
    token_refresh_buffer_ms: z
      .number()
      .int()
      .min(30_000)
      .max(1_800_000)
      .default(600_000),
    // 上限 2000 使其保持在 gracefulShutdown 的 2 秒清理竞态之内——更高的超时只会对 axios 说谎，因为 forceExit 无论如何都会杀死 socket。
    teardown_archive_timeout_ms: z
      .number()
      .int()
      .min(500)
      .max(2000)
      .default(1500),
    // 观察到的 p99 连接时间约为 2-3 秒；15 秒约为 5 倍余量。下限 5 秒限制在瞬态缓慢下的假阳性率；上限 60 秒限制真正停滞的会话保持黑暗的时间。
    connect_timeout_ms: z.number().int().min(5_000).max(60_000).default(15_000),
    min_version: z
      .string()
      .refine(v => {
        try {
          lt(v, '0.0.0')
          return true
        } catch {
          return false
        }
      })
      .default('0.0.0'),
    should_show_app_upgrade_message: z.boolean().default(false),
  }),
)

/**
 * 从 GrowthBook 获取无环境桥接器时序配置。每次 initEnvLessBridgeCore 调用读取一次——配置在桥接器会话生命周期内固定不变。
 *
 * 使用阻塞式 getter（而非 _CACHED_MAY_BE_STALE），因为 /remote-control 在 GrowthBook 初始化之后很久才运行——
 * initializeGrowthBook() 立即解析，因此没有启动损耗，并且我们获得的是内存中的远程评估值，而非首次读取时的陈旧磁盘缓存。
 * _DEPRECATED 后缀警告不要在启动路径中使用，而这里不属于启动路径。
 */
export async function getEnvLessBridgeConfig(): Promise<EnvLessBridgeConfig> {
  const raw = await getFeatureValue_DEPRECATED<unknown>(
    'tengu_bridge_repl_v2_config',
    DEFAULT_ENV_LESS_BRIDGE_CONFIG,
  )
  const parsed = envLessBridgeConfigSchema().safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_ENV_LESS_BRIDGE_CONFIG
}

/**
 * 如果当前 CLI 版本低于无环境 (v2) 桥接器路径所需的最低版本，则返回错误消息；否则返回 null。
 *
 * v2 版本对标 checkBridgeMinVersion()——从 tengu_bridge_repl_v2_config 读取，
 * 而非 tengu_bridge_min_version，以便两种实现可以强制执行独立的下限。
 */
export async function checkEnvLessBridgeMinVersion(): Promise<string | null> {
  const cfg = await getEnvLessBridgeConfig()
  if (cfg.min_version && lt(MACRO.VERSION, cfg.min_version)) {
    return `您的 Claude Code 版本 (${MACRO.VERSION}) 太旧，无法使用远程控制。\n需要 ${cfg.min_version} 或更高版本。运行 \`claude update\` 进行更新。`
  }
  return null
}

/**
 * 当远程控制会话启动时是否提示用户升级其 claude.ai 应用。
 * 仅当 v2 桥接器处于活动状态且 should_show_app_upgrade_message 配置位已设置时才返回 true——
 * 这允许我们在应用发布新的会话列表查询之前先行推出 v2 桥接器。
 */
export async function shouldShowAppUpgradeMessage(): Promise<boolean> {
  if (!isEnvLessBridgeEnabled()) return false
  const cfg = await getEnvLessBridgeConfig()
  return cfg.should_show_app_upgrade_message
}