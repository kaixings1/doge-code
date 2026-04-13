需要汉化的内容是:
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../services/analytics/growthbook.js'
import { lazySchema } from '../utils/lazySchema.js'
import {
  DEFAULT_POLL_CONFIG,
  type PollIntervalConfig,
} from './pollConfigDefaults.js'

// .min(100) 对 seek-work 时间间隔的限制恢复了旧的 Math.max(..., 100) 防线。
// 这是一种纵深防御策略，防止因误触 GrowthBook 值而导致配置错误。与钳制不同，
// Zod 在违反规则时拒绝整个对象——如果一个配置字段有误，则完全回退到 DEFAULT_POLL_CONFIG，
// 而不会部分信任该配置。

// at_capacity 时间间隔使用 0 或 ≥100 的精炼规则：0 表示“禁用”（仅心跳模式），
// ≥100 是防止误输入的下限。值在 1-99 之间将被拒绝，以避免因单位混淆
// （例如，开发人员认为秒，却输入了 10）导致每 10 毫秒轮询一次而带来的问题。

// 对象级别的精炼规则要求至少启用一种 at-capacity 的存活机制：心跳或相关轮询间隔。
// 如果没有这个条件，则使用 hb=0、atCapMs=0 的漂移配置（即开发人员禁用了心跳但保留了 at_capacity）
// 将在所有限流站点中完全失效，导致以 HTTP 回复往返速度进行高强度轮询。
const zeroOrAtLeast100 = {
  message: '必须是 0（禁用）或 ≥100 毫秒',
}
const pollIntervalConfigSchema = lazySchema(() =>
  z
    .object({
      poll_interval_ms_not_at_capacity: z.number().int().min(100),
      // 0 = 禁用 at-capacity 轮询。独立于心跳——两者可以同时启用（心跳运行，周期性轮询）。
      // Named non_exclusive to distinguish from the old heartbeat_interval_ms
      // (either-or semantics in pre-#22145 clients). .default(0) so existing<｜end▁of▁sentence｜>// 不包含以下字段的GrowthBook配置也能成功解析。
non_exclusive_heartbeat_interval_ms: z.number().int().min(0).default(0),
      // 多会话轮询间隔配置（来自bridgeMain.ts）。默认值与单会话一致，因此现有不包含这些字段的配置将保持当前行为。
      multisession_poll_interval_ms_not_at_capacity: z
        .number()
        .int()
        .min(100)
        .default(
          DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_not_at_capacity,
        ),
      multisession_poll_interval_ms_partial_capacity: z
        .number()
        .int()
        .min(100)
        .default(
          DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_partial_capacity,
        ),
      multisession_poll_interval_ms_at_capacity: z
        .number()
        .int()
        .refine(v => v === 0 || v >= 100, zeroOrAtLeast100)
        .default(DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_at_capacity),
      // 匹配服务器端ge=1约束（位于work_v1.py:230行）。
      reclaim_older_than_ms: z.number().int().min(1).default(5000),
      session_keepalive_interval_v2_ms: z
        .number()
        .int()
        .min(0)
        .default(120_000),
    })
    .refine(
      cfg =>
        cfg.non_exclusive_heartbeat_interval_ms > 0 ||
        cfg.poll_interval_ms_at_capacity > 0,
      {
        message:
          '容量充足时的心跳检测要求非独占心跳间隔大于0或轮询间隔大于0',
      },
    )
    .refine(
      cfg =>
        cfg.non_exclusive_heartbeat_interval_ms > 0 ||
        cfg.multisession_poll_interval_ms_at_capacity > 0,
      {
        message:
          '容量充足时的心跳检测要求非独占心跳间隔大于0或多会话轮询间隔大于0',
      },
    ),
)

/**
 * 从GrowthBook获取桥接轮询间隔配置，使用5分钟刷新窗口。验证服务端返回的JSON与模式匹配；若不匹配则回退到默认值。
 */<｜end▁of▁sentence｜>需要汉化的内容是:
 * 如果标志缺失、格式错误或部分指定，则使用默认值。
 *
 * 同时用于bridgeMain.ts（独立模式）和replBridge.ts（REPL环境），因此操作团队可以
 * 通过单一配置推送来调整全局轮询间隔。
 */
export function getPollIntervalConfig(): PollIntervalConfig {
  const raw = getFeatureValue_CACHED_WITH_REFRESH<unknown>(
    'tengu_bridge_poll_interval_config',
    DEFAULT_POLL_CONFIG,
    5 * 60 * 1000,
  )
  const parsed = pollIntervalConfigSchema().safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_POLL_CONFIG
}<｜end▁of▁sentence｜>