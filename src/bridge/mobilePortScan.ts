/**
 * 移动桥接的端口选择与自动递增（纯逻辑，可单测）。
 *
 * ## 为什么需要它
 *
 * 端口冲突（EADDRINUSE）在**多窗口并发**下是常态：每个 cmd 窗口跑一个
 * doge 实例，全都想监听 5680。原实现遇到冲突就**静默放弃** ——
 * 结果是 N 个实例里只有 1 个的桥接真正起来，其余的手机根本连不上，
 * 而用户只看到一句「未启动：端口被占用」，无从下手。
 *
 * 更糟的是所有实例共用同一份状态日志与历史文件，多个实例交替写入
 * 会让状态疯狂抖动（实测出现过 42MB 日志 + 界面永不静止）。
 *
 * ## 策略
 *
 * 从起始端口起**顺序试探**，命中第一个可用端口即用。
 * 上限 10 个（起始端口起的连续 10 个），全满才报错 —— 这与
 * 「多开几个窗口」的实际场景匹配：10 个并发实例已远超日常所需，
 * 真到 10 个都满时，报错比继续疯狂试探更有用（用户该清理进程了）。
 *
 * 为什么不随机挑端口：手机端要**扫描端口段**才能发现会话
 *（见 SessionScanner），随机端口会让扫描范围无限大。
 * 顺序递增保证所有实例集中在 [start, start+9] 这段可扫描范围内。
 */

/** 端口段大小：从起始端口起连续试探的个数。 */
export const PORT_SCAN_LIMIT = 10

/** 可用端口的合法范围（TCP 端口 1..65535，此处排除特权端口）。 */
export const MIN_PORT = 1024
export const MAX_PORT = 65535

/**
 * 生成候选端口列表。
 *
 * 从 [start] 起递增，遇到 65535 后**回绕到 5680 之前的常见段**吗？
 * 不回绕：回绕会让「扫描范围」变成两段不连续区间，客户端发现逻辑
 * 要处理更多分支；且起始端口 5680 离上限极远，回绕永不触发。
 * 超出上限的候选直接丢弃（列表可能短于 [PORT_SCAN_LIMIT]）。
 */
export function candidatePorts(start: number, limit: number = PORT_SCAN_LIMIT): number[] {
  if (!Number.isInteger(start) || start < MIN_PORT || start > MAX_PORT) return []
  const out: number[] = []
  for (let i = 0; i < limit; i++) {
    const p = start + i
    if (p > MAX_PORT) break
    out.push(p)
  }
  return out
}

/** 一次试探的结果。 */
export interface PortProbeResult {
  /** 最终选中的端口；全部失败时为 null。 */
  port: number | null
  /** 试过但被占用的端口（供日志与提示）。 */
  tried: number[]
}

/**
 * 依次试探候选端口，返回第一个可用的。
 *
 * 抽成「接受一个探测函数」的形式，而不是在这里直接 listen ——
 * 这样探测逻辑（真正 bind 端口）留在网络层，本模块保持纯逻辑、
 * 可在单测里用假的探测函数穷举各种组合（全空、全满、中间有洞、
 * 探测抛异常等）。
 *
 * @param start   起始端口
 * @param isFree  探测某端口是否可用（true = 可用）。可抛异常，视为不可用。
 * @param limit   最多试几个
 */
export function pickPort(
  start: number,
  isFree: (port: number) => boolean,
  limit: number = PORT_SCAN_LIMIT,
): PortProbeResult {
  const tried: number[] = []
  for (const port of candidatePorts(start, limit)) {
    tried.push(port)
    let free = false
    try {
      free = isFree(port)
    } catch {
      // 探测本身失败（如权限不足）→ 当作不可用继续试下一个。
      // 不中断：某个端口探测失败不代表后续端口也不行。
      free = false
    }
    if (free) return { port, tried }
  }
  return { port: null, tried }
}

/**
 * 全部失败时的错误提示。
 *
 * 措辞要点：
 * 1. 给出**试过的范围**（而非单个端口），否则用户以为只是 5680 的问题
 * 2. 明确「多开窗口」这个正常原因，避免误判为程序坏了
 * 3. 给出可执行的下一步（netstat / 设端口）
 *
 * 关键：区分「端口被别人占用」（EADDRINUSE）与「端口被系统保留」
 * （EACCES）。后者在 Windows 上由 Hyper-V / WSL 的保留区间引起，
 * `netstat` 查不到任何进程 —— 若提示用户去 netstat 找进程会走进死胡同
 * （实测踩过：5681-5880 被保留，报错却说「全部被占用」）。
 *
 * @param start      起始端口
 * @param tried      试过但不可用的端口
 * @param sawReserved 是否出现过 EACCES（系统保留）错误
 */
export function allPortsBusyMessage(
  start: number,
  tried: number[],
  sawReserved = false,
): string {
  const range =
    tried.length > 1 ? `${tried[0]}-${tried[tried.length - 1]}` : String(start)
  if (sawReserved) {
    return (
      `移动桥接启动失败：端口段 ${range} 共 ${tried.length} 个端口均不可用。\n` +
      `原因：这些端口被 **Windows 保留**（Hyper-V / WSL 会预留端口区间），` +
      `绑定被拒（EACCES）——不是被别的程序占用，netstat 查不到进程。\n` +
      `可执行：netsh int ipv4 show excludedportrange protocol=tcp 查看保留区间，` +
      `然后用 CLAUDE_CODE_MOBILE_PORT 指定一个区间外的端口（如 6000）。`
    )
  }
  return (
    `移动桥接启动失败：端口段 ${range} 共 ${tried.length} 个端口全部被占用。\n` +
    `常见原因：开了多个 doge 窗口（每个实例占一个端口）。\n` +
    `可执行：netstat -ano | findstr ":${tried[0]}" 查看占用进程；` +
    `或用 CLAUDE_CODE_MOBILE_PORT 指定其他起始端口。`
  )
}
