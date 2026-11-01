/**
 * `permissions.blockWritesOutsideWorkingDirectories`（官方 2.1.314）与
 * `permissions.blockReadsOutsideWorkingDirectories`。
 *
 * 官方语义（从 2.1.316 二进制提取的错误文案）：
 *   "Writes outside the working directories are blocked
 *    (permissions.blockWritesOutsideWorkingDirectories).
 *    Add the directory with /add-dir, or remove that setting."
 *   "Writes to Claude Code settings files are blocked while
 *    permissions.blockWritesOutsideWorkingDirectories is on,
 *    because a settings file can lift that block."
 *
 * 关键点（安全设计，不是可选项）：
 * 开启写限制时必须同时拦住对 Claude Code 设置文件的写入 —— 否则一次
 * 「改 settings.json 把开关关掉」就能绕过限制，限制形同虚设。
 * 官方在无法解析 managed 设置目录时，把任何 .json 都当设置文件处理。
 *
 * 本模块只放纯判据，不碰文件系统（路径解析由调用方传入），便于单测。
 */

/** 设置文件判定：这些文件名在任何目录下都被视为 Claude Code 设置。 */
const SETTINGS_FILE_NAMES = new Set([
  'settings.json',
  'settings.local.json',
  '.claude.json',
])

/**
 * 路径是否看起来是 Claude Code 的设置文件。
 *
 * 两道判据：
 *   1. 位于 .claude 目录下的 .json（settings.json / settings.local.json 等）
 *   2. 任意目录下名为 settings.json / settings.local.json / .claude.json
 *
 * `strictJson` 为真时（无法解析 managed 设置目录），**任何 .json 都算**，
 * 与官方 "While a managed settings folder cannot be resolved, any .json
 * file counts as one" 一致。
 */
export function looksLikeClaudeSettingsFile(
  filePath: string,
  strictJson: boolean,
): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)

  if (strictJson && base.endsWith('.json')) {
    return true
  }
  if (SETTINGS_FILE_NAMES.has(base)) {
    return true
  }
  // .claude 目录下的 json（含 settings.json / hooks 配置等）
  if (base.endsWith('.json') && /(^|\/)\.claude\//.test(normalized)) {
    return true
  }
  return false
}

export type ScopeBlockDecision =
  | { blocked: false }
  | { blocked: true; message: string }

/**
 * 判定一次写操作是否应被 working-directory 限制拦下。
 *
 * @param enabled        是否开启 blockWritesOutsideWorkingDirectories
 * @param path           要写的路径（绝对路径）
 * @param insideWorking  path 是否在某个工作目录内
 * @param strictJson     无法解析 managed 设置目录时传 true（任何 .json 都算设置文件）
 */
export function evaluateWriteScopeBlock(args: {
  enabled: boolean
  path: string
  insideWorking: boolean
  strictJson: boolean
}): ScopeBlockDecision {
  const { enabled, path, insideWorking, strictJson } = args
  if (!enabled) return { blocked: false }

  // 设置文件保护必须排在「在工作目录内」之前：
  // 项目里的 .claude/settings.json 也在工作目录内，但改它就能关掉本开关，
  // 所以即使在工作目录内也要拦（官方文案明确写了这条理由）。
  if (looksLikeClaudeSettingsFile(path, strictJson)) {
    return {
      blocked: true,
      message:
        'Writes to Claude Code settings files are blocked while ' +
        'permissions.blockWritesOutsideWorkingDirectories is on, because a ' +
        'settings file can lift that block.',
    }
  }

  if (insideWorking) return { blocked: false }

  return {
    blocked: true,
    message:
      'Writes outside the working directories are blocked ' +
      '(permissions.blockWritesOutsideWorkingDirectories). ' +
      'Add the directory with /add-dir, or remove that setting.',
  }
}

/**
 * 判定一次读操作是否应被拦下（blockReadsOutsideWorkingDirectories）。
 * 读限制没有「设置文件」例外，语义简单。
 */
export function evaluateReadScopeBlock(args: {
  enabled: boolean
  insideWorking: boolean
}): ScopeBlockDecision {
  const { enabled, insideWorking } = args
  if (!enabled || insideWorking) return { blocked: false }
  return {
    blocked: true,
    message:
      'Reads outside the working directories are blocked ' +
      '(permissions.blockReadsOutsideWorkingDirectories). ' +
      'Add the directory with /add-dir, or remove that setting.',
  }
}
