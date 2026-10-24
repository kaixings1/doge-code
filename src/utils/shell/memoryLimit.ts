/**
 * Bash 工具命令的内存限制（对齐官方 CLAUDE_CODE_TOOL_MEMORY_LIMIT，v2.1.233）。
 *
 * 官方用 cgroup 限制单条 Bash 命令的内存，避免失控构建把整机会话拖死。
 * 本实现走 systemd-run --scope：它按 cgroup v2 建一个瞬时 scope，把内存上限
 * 施加到整条命令的进程树上（含子进程），比手写 cgroupfs 更可移植，也不需要
 * 自己管理 cgroup 生命周期——命令结束 scope 自动消失。
 *
 * 只在 Linux 生效：
 *   - Windows / macOS 没有 cgroup，直接返回 null（不改变原有行为）
 *   - Linux 上若没有 systemd-run（容器、Alpine 等），同样返回 null 并记录一次
 *     原因，不阻断命令执行——限制是加固手段，不该成为可用性依赖
 */

export type MemoryLimitPlan = {
  /** 读取到的上限（字节） */
  bytes: number
  /** 用于展示与日志的原始值 */
  raw: string
}

/**
 * 解析 CLAUDE_CODE_TOOL_MEMORY_LIMIT。
 *
 * 接受纯字节数（`1073741824`）或带单位（`2G` / `512M` / `1.5G`）。
 * 非法值（NaN、<=0、无法识别的单位）一律返回 null——不静默套用一个
 * 用户没要求的限制。未设置时同样返回 null（默认关闭）。
 */
export function parseMemoryLimitBytes(
  raw: string | null | undefined,
): MemoryLimitPlan | null {
  if (raw == null) return null
  const text = raw.trim()
  if (!text) return null

  const m = text.match(/^(\d+(?:\.\d+)?)\s*([kmgti]?b?)?$/i)
  if (!m) return null

  const value = Number(m[1])
  if (!Number.isFinite(value) || value <= 0) return null

  const unit = (m[2] ?? '').toLowerCase().replace(/b$/, '')
  const multipliers: Record<string, number> = {
    '': 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
  }
  const mult = multipliers[unit]
  if (mult == null) return null

  const bytes = Math.floor(value * mult)
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  return { bytes, raw: text }
}

/**
 * 构造把目标命令包进 cgroup 内存限制的启动参数。
 *
 * 返回 null 表示「不做包装」——调用方应原样启动命令。
 *
 * @param plan    parseMemoryLimitBytes 的结果
 * @param bin     原命令二进制
 * @param args    原命令参数
 * @param platform 当前平台（默认 process.platform，便于测试）
 * @param hasSystemdRun 是否可用 systemd-run（默认真实检测，可注入）
 */
export function buildMemoryLimitedSpawn(
  plan: MemoryLimitPlan | null,
  bin: string,
  args: string[],
  platform: string = process.platform,
  hasSystemdRun = false,
): { bin: string; args: string[] } | null {
  if (!plan) return null
  // 非 Linux 无 cgroup，静默跳过（Windows/macOS 保持原行为）。
  if (platform !== 'linux') return null
  if (!hasSystemdRun) return null

  return {
    bin: 'systemd-run',
    args: [
      '--scope',
      '--quiet',
      '--collect',
      `--property=MemoryMax=${plan.bytes}`,
      '--',
      bin,
      ...args,
    ],
  }
}

/** 检测 systemd-run 是否可执行（结果缓存，避免每条命令都探测）。 */
let cachedSystemdRun: boolean | null = null

export async function detectSystemdRun(): Promise<boolean> {
  if (cachedSystemdRun !== null) return cachedSystemdRun
  // 只在 Linux 上探测；其它平台不必付这个成本。
  if (process.platform !== 'linux') {
    cachedSystemdRun = false
    return false
  }
  try {
    const { execFile } = await import('child_process')
    await new Promise<void>((resolve, reject) => {
      execFile('systemd-run', ['--version'], { timeout: 2000 }, err =>
        err ? reject(err) : resolve(),
      )
    })
    cachedSystemdRun = true
  } catch {
    cachedSystemdRun = false
  }
  return cachedSystemdRun
}

/** 测试用：重置探测缓存。 */
export function __resetSystemdRunCacheForTesting(): void {
  cachedSystemdRun = null
}
