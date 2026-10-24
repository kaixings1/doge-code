/**
 * `--autocompact <auto|tokens>` 的解析层。
 *
 * 官方支持 `auto`（沿用模型默认窗口）或显式 token 预算（100k–1M）。
 * 本地此前只有环境变量 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`，没有 CLI 入口。
 * 这里把它翻译成同一个环境变量，避免另建一套配置读取路径。
 *
 * 纯函数，便于单测；接线在 main.tsx。
 */

export const AUTOCOMPACT_MIN_TOKENS = 100_000
export const AUTOCOMPACT_MAX_TOKENS = 1_000_000

export type AutoCompactFlagResult =
  | { kind: 'auto' }
  | { kind: 'tokens'; tokens: number }

/**
 * 解析 `--autocompact` 的取值。
 * - `auto` → 清除窗口覆盖（沿用模型默认）
 * - `100k` / `200K` / `500000` → 显式窗口
 * @throws 取值非法或超范围时抛错，由 CLI 层转成用户可读提示
 */
export function parseAutoCompactFlag(raw: string): AutoCompactFlagResult {
  const value = raw.trim().toLowerCase()
  if (value === 'auto') {
    return { kind: 'auto' }
  }

  const match = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(value)
  if (!match) {
    throw new Error(
      `--autocompact 取值范围无效："${raw}"。应为 auto，或 100k–1M 之间的 token 数（如 100k、200K、500000）。`,
    )
  }

  const amount = Number.parseFloat(match[1]!)
  const unit = match[2]
  const tokens =
    unit === 'm'
      ? Math.round(amount * 1_000_000)
      : unit === 'k'
        ? Math.round(amount * 1_000)
        : Math.round(amount)

  if (
    !Number.isFinite(tokens) ||
    tokens < AUTOCOMPACT_MIN_TOKENS ||
    tokens > AUTOCOMPACT_MAX_TOKENS
  ) {
    throw new Error(
      `--autocompact 窗口必须在 ${AUTOCOMPACT_MIN_TOKENS}–${AUTOCOMPACT_MAX_TOKENS} tokens 之间，收到 "${raw}"。`,
    )
  }

  return { kind: 'tokens', tokens }
}

/**
 * 把解析结果应用到进程环境变量。
 * `auto` 会显式删除覆盖变量，确保不会被外部遗留的 env 干扰。
 */
export function applyAutoCompactFlag(
  result: AutoCompactFlagResult,
  env: Record<string, string | undefined> = process.env,
): void {
  if (result.kind === 'auto') {
    delete env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
    return
  }
  env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(result.tokens)
}
