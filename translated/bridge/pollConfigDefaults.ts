/**
 * 桥接轮询间隔默认值。从pollConfig.ts中提取而来，使调用者无需使用实时调整GrowthBook（守护进程通过Agent SDK）即可避免
 * growthbook.ts → config.ts → file.ts → sessionStorage.ts → commands.ts的传递性依赖链。
 */

/**
 * 当主动寻找工作且无传输连接/会话数低于最大值时的轮询间隔。
 * 决定初始任务分配和服务器重新分发任务项后的用户可见“正在连接…”延迟，
 * 以及恢复速度（即重传间隔）。
 */
const POLL_INTERVAL_MS_NOT_AT_CAPACITY = 2000

/**
 * 当传输已连接时的轮询间隔。此间隔独立于心跳机制；当两者均启用时，心跳循环将中断到以该间隔轮询。
 * 设置为0可完全禁用容量充足状态下的轮询。
 *
 * 约束此值的服务器端限制：
 * - BRIDGE_LAST_POLL_TTL = 4小时（Redis键过期时间 → 环境自动归档）
 * - max_poll_stale_seconds = 24小时（会话创建健康门限，当前禁用）
 *
 * 设置为10分钟可提供24倍的Redis TTL缓冲空间，同时确保服务器发起的令牌轮转重发能在一个轮询周期内完成。
 * 内部传输会在瞬态WebSocket失败时自动重新连接长达10分钟，因此轮询并非恢复路径——它仅作为存活信号和永久关闭后的备用机制。
 */
const POLL_INTERVAL_MS_AT_CAPACITY = 600_000

/**
 * 多会话桥接（bridgeMain.ts）的轮询间隔。默认值与单会话设置相同，
 * 现有不包含这些字段的GrowthBook配置将保持当前行为。运维人员可通过
 * tengu_bridge_poll_interval_config GB标志独立调整这些值。
 */
const MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY
const MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY
const MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY = POLL_INTERVAL_MS_AT_CAPACITY

export type PollIntervalConfig = {
  poll_interval_ms_not_at_capacity: number
  poll_interval_ms_at_capacity: number
}<｜end▁of▁sentence｜>需要汉化的内容是:
  non_exclusive_heartbeat_interval_ms: number
  multisession_poll_interval_ms_not_at_capacity: number
  multisession_poll_interval_ms_partial_capacity: number
  multisession_poll_interval_ms_at_capacity: number
  reclaim_older_than_ms: number
  session_keepalive_interval_v2_ms: number
}

export const DEFAULT_POLL_CONFIG: PollIntervalConfig = {
  poll_interval_ms_not_at_capacity: POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  poll_interval_ms_at_capacity: POLL_INTERVAL_MS_AT_CAPACITY,
  // 0 表示禁用。当值大于 0 时，在此间隔内，处于全容量模式的循环会定期发送心跳。
  // 这个设置独立于 poll_interval_ms_at_capacity —— 如果两个都启用，则心跳会优先执行（但每次心跳都会让轮询暂停）。
  // 默认是 60 秒，而服务器的心跳超时时间为 300 秒，所以这个间隔提供了 5 倍的余量。
  // 注意：为了避免与旧版配置混淆，在非独占心跳字段中命名为 non_exclusive_heartbeat_interval_ms。
  // 而旧版本客户端忽略此设置；在新旧协议切换期间，操作人员可以同时设置两个字段。

  non_exclusive_heartbeat_interval_ms: 0,
  multisession_poll_interval_ms_not_at_capacity:
    MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  multisession_poll_interval_ms_partial_capacity:
    MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY,
  multisession_poll_interval_ms_at_capacity:
    MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY,

  // 此参数用于清理：回收站将自动删除未被确认的工作项，其年龄超过此设置。
  // 默认值与服务器端保持一致（work_service.py:24），确保同步性。

  reclaim_older_than_ms: 5000,

  // 0 表示禁用。当值大于 0 时，在此间隔内向会话入口推送一个静默的 {类型:'keep_alive'} 帧，
  // 目的是防止上游代理因为远程控制会话空闲而进行垃圾回收。
  // 默认是 2 分钟，后缀 _v2 表示仅适用于桥接版本（旧版客户端忽略此字段）。

  session_keepalive_interval_v2_ms: 120_000,
}<｜end▁of▁sentence｜>