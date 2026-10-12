/**
 * 移动桥接的 UDP 多播广播（beacon）。
 *
 * ## 为什么需要它
 *
 * 手机端发现电脑上的会话，现有方式是**主动扫描**（遍历本机网段的
 * 每个 IP × 端口段）。这有三个问题：
 * 1. **慢**：254 个 IP × 11 个端口，实测 3-8 秒
 * 2. **费电**：一次扫描要并发发几千个 TCP 连接
 * 3. **不实时**：新会话启动后，手机不重新扫描就看不到
 *
 * 广播把这三件事一起解决：服务端**主动**每 3 秒喊一声，
 * 手机**被动**监听即可，毫秒级感知、几乎不耗电。
 *
 * ## 但广播不可靠，故必须与扫描并存
 *
 * 广播在很多真实环境下会被拦掉：
 * · **AP 隔离**（路由器默认禁止客户端互访）—— 最常见的失败原因
 * · 组播过滤（部分企业/公共 WiFi 只放行单播）
 * · 虚拟网卡/多网卡时组播走错接口
 *
 * 所以客户端**广播与扫描两条路都要走**：广播快、扫描兜底。
 * 只要有任一条通，用户就能发现会话。**不要因为做了广播就删掉扫描**。
 *
 * ## 报文设计
 *
 * 用 JSON 而非自定义二进制：手机上排查问题时可以直接
 * `adb logcat` 看到可读内容，且与 HTTP 接口的字段名保持一致
 *（同一个 `MobileSessionInfo` 概念，不该有两套命名）。
 */

/** 广播使用的多播地址。 */
export const BEACON_GROUP = '239.255.42.99'

/**
 * 广播端口。
 *
 * ## 必须远离桥接端口段（修掉的一个真实设计缺陷）
 *
 * 最初选了 5681 —— 理由是「UDP 与 TCP 是独立命名空间，同号无害」。
 * **这个理由是错的**：桥接端口会**自动顺延**（5680 被占就试 5681…），
 * 第二个 CLI 实例**恰好占到了 5681**（实测：`TCP 0.0.0.0:5681 LISTENING`）。
 *
 * 虽然 UDP/TCP 号技术上不冲突，但造成实际困扰：
 * 「5681」既是广播端口又是某个桥接端口，排查时极易混淆 ——
 * 本项目已经在真机排查中因此绕过弯路。
 *
 * 改用 **5600**：远低于桥接起始端口 5680，与 10 个顺延端口
 * （5680-5689）**完全不相交**，不会再有任何歧义。
 */
export const BEACON_PORT = 5600

/** 广播间隔。 */
export const BEACON_INTERVAL_MS = 3000

/**
 * 广播报文。
 *
 * 字段与 `/mobile/session-info` 保持一致（同一个概念不该有两套命名），
 * 并加一个 `beacon` 标识 —— 客户端据此区分「这是广播」而非
 * 「某处转发的 HTTP 响应」，也便于将来协议演进时做版本判断。
 */
export interface BeaconPayload {
  /** 协议标识（固定值，客户端据此识别） */
  beacon: 'doge-mobile'
  /**
   * 协议版本。
   *
   * 客户端遇到不认识的版本应**忽略该报文**而非猜测 —— 新旧版本
   * 字段语义可能不同，猜错比不认更糟。
   */
  v: number
  sessionId: string
  /** 真实会话 ID（供 --resume 用；取不到时省略） */
  resumeSessionId?: string
  /** 实际监听的端口（**不是起始端口** —— 自动顺延后两者不同） */
  port: number
  cwd: string
  label: string
  /** 非交互终端下消息不会被消费，客户端据此提示 */
  interactive: boolean
  /** 当前连接的手机数（客户端可据此显示「已连 N 台」） */
  clients: number
  /** 发送时间戳（客户端据此判断广播是否新鲜） */
  ts: number
  /**
   * 当前公网隧道地址（`wss://<子域>.trycloudflare.com/mobile/ws`）。
   *
   * 仅在**已用 `--tunnel` 起了快隧道**时存在。用途：手机在同一局域网
   * 收到广播后，**自动记住隧道地址** —— 出门切流量时无需手输。
   *
   * **可选字段，且不升协议版本**：快隧道的子域每次启动都变，加字段是
   * 向后兼容的（旧客户端 `parse` 忽略未知字段）；若升版本，旧客户端会
   * 因版本不符**丢弃整条广播**，反而让它们连局域网发现都失效。
   */
  tunnelUrl?: string
}

/** 当前协议版本。 */
export const BEACON_VERSION = 1

/**
 * 构造广播报文。
 *
 * 抽成纯函数以便单测：报文里最容易错的是 `port` ——
 * 它必须是**实际绑定**的端口（自动顺延后与起始端口不同），
 * 写错会让手机连到一个连不上的端口。
 */
export function buildBeaconPayload(input: {
  sessionId: string
  resumeSessionId?: string | null
  port: number
  cwd: string
  label: string
  interactive: boolean
  clients: number
  /** 公网隧道地址（可选；无隧道时省略）。 */
  tunnelUrl?: string | null
  now?: number
}): BeaconPayload {
  const payload: BeaconPayload = {
    beacon: 'doge-mobile',
    v: BEACON_VERSION,
    sessionId: input.sessionId,
    port: input.port,
    cwd: input.cwd,
    label: input.label,
    interactive: input.interactive,
    clients: input.clients,
    ts: input.now ?? Date.now(),
  }
  // 取不到真实会话 ID 时**省略字段**而非填空串：
  // 客户端据此区分「没有这个信息」与「信息是空的」
  if (input.resumeSessionId) {
    payload.resumeSessionId = input.resumeSessionId
  }
  // 同样省略空隧道的字段（没起隧道 ≠ 隧道地址为空串）。
  if (input.tunnelUrl) {
    payload.tunnelUrl = input.tunnelUrl
  }
  return payload
}

/**
 * 序列化广播报文。
 *
 * 失败时返回 null（而非抛异常）：广播是**尽力而为**的旁路能力，
 * 一次序列化失败不该影响 CLI 主流程。
 */
export function serializeBeacon(payload: BeaconPayload): Buffer | null {
  try {
    return Buffer.from(JSON.stringify(payload), 'utf8')
  } catch {
    return null
  }
}

/**
 * 解析收到的广播报文。
 *
 * 客户端也会用同样的判据，但实现分别在两端（Kotlin / TS）——
 * 这里定义的是**权威的字段要求**，两端测试都应对照它。
 *
 * @returns 解析成功返回 payload；不是本协议/字段缺失/版本不认识则返回 null
 */
export function parseBeacon(raw: string): BeaconPayload | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>

  // 三个必查项：协议标识、版本、端口。
  // 端口必须是正整数 —— 缺失/非法的端口会让客户端连到错的地方
  if (o.beacon !== 'doge-mobile') return null
  if (o.v !== BEACON_VERSION) return null
  if (typeof o.port !== 'number' || !Number.isInteger(o.port) || o.port <= 0) return null

  return {
    beacon: 'doge-mobile',
    v: BEACON_VERSION,
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
    port: o.port,
    cwd: typeof o.cwd === 'string' ? o.cwd : '',
    label: typeof o.label === 'string' ? o.label : '',
    interactive: o.interactive === true,
    clients: typeof o.clients === 'number' ? o.clients : 0,
    ts: typeof o.ts === 'number' ? o.ts : 0,
    ...(typeof o.resumeSessionId === 'string' && o.resumeSessionId
      ? { resumeSessionId: o.resumeSessionId }
      : {}),
    ...(typeof o.tunnelUrl === 'string' && o.tunnelUrl ? { tunnelUrl: o.tunnelUrl } : {}),
  }
}
