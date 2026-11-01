/**
 * `--system-prompt-snapshot <on|off>`（对齐官方，语义见官方帮助原文）：
 *
 *   on（默认）：系统提示词在会话的**第一次请求**时渲染（含 --system-prompt /
 *     --append-system-prompt 的影响），随后被**记录**；之后的每次请求与 resume
 *     都原样发送这份记录，即使后续启动传入了不同的文本，直到该会话被压缩。
 *   off：从不记录，每次请求都重新渲染（便于迭代提示词文本）。
 *
 * 为什么要这个开关：系统提示词里含 cwd/git 状态/日期等每轮可能变化的内容，
 * 逐字复用能提升跨请求的 prompt cache 命中率；但开发提示词时需要看到改动
 * 立即生效，所以 off 也要保留。
 *
 * 本模块只做纯逻辑（解析开关、决定能否复用），副作用留在 query.ts 的调用点。
 */

export type SnapshotMode = 'on' | 'off'

/** 解析 `--system-prompt-snapshot` 的取值。非法值回落 'on'（官方默认）。 */
export function parseSystemPromptSnapshotMode(
  raw: string | undefined | null,
): SnapshotMode {
  if (raw == null) return 'on'
  const v = raw.trim().toLowerCase()
  return v === 'off' ? 'off' : 'on'
}

/** 从环境变量读取模式（CLI 参数会写到这里）。 */
export function getSystemPromptSnapshotMode(
  env: NodeJS.ProcessEnv = process.env,
): SnapshotMode {
  return parseSystemPromptSnapshotMode(env.CLAUDE_CODE_SYSTEM_PROMPT_SNAPSHOT)
}

/**
 * 是否应当复用已录制的快照而不是重新渲染。
 *
 * 快照按**数组**保存而不是拼接成字符串：SystemPrompt 是 readonly string[]，
 * 各段在语义上独立（缓存断点、段落边界），往返 join/split 会破坏结构。
 *
 * @param mode            on / off
 * @param snapshot        已录制的提示词；null 表示尚未录制
 * @param invalidated     是否因压缩而失效（压缩后需重新录制）
 */
export function shouldReuseSystemPromptSnapshot(
  mode: SnapshotMode,
  snapshot: readonly string[] | null,
  invalidated: boolean,
): boolean {
  if (mode === 'off') return false
  if (invalidated) return false
  return snapshot !== null && snapshot.length > 0
}

/**
 * 决定本次请求实际要用的系统提示词，并回写快照。
 *
 * 纯函数：不修改传入的 snapshot 变量，返回新的快照值供调用方保存。
 *
 * 三种情形：
 *   1. 可复用 → 用快照，快照不变
 *   2. on 且无快照（首次请求 / 压缩后）→ 用刚渲染的，并录下来
 *   3. off → 用刚渲染的，不录（快照保持 null）
 */
export function resolveSystemPromptSnapshot(args: {
  mode: SnapshotMode
  snapshot: readonly string[] | null
  invalidated: boolean
  rendered: readonly string[]
}): { prompt: readonly string[]; nextSnapshot: readonly string[] | null } {
  const { mode, snapshot, invalidated, rendered } = args
  if (shouldReuseSystemPromptSnapshot(mode, snapshot, invalidated)) {
    return { prompt: snapshot as readonly string[], nextSnapshot: snapshot }
  }
  if (mode === 'off') {
    return { prompt: rendered, nextSnapshot: null }
  }
  return { prompt: rendered, nextSnapshot: rendered }
}
