import { isEnvTruthy } from './envUtils.js'

/**
 * Whether to remove Glob/Grep tools from the tool registry.
 *
 * Doge Code 使用独立的 Glob/Grep 实现（非 bfs/ugrep），因此默认始终包含
 * Glob/Grep 工具。通过设置 DISABLE_GLOB_GREP_TOOLS=1 可强制移除。
 *
 * 原 EMBEDDED_SEARCH_TOOLS 保留兼容但不作为主要控制变量。
 */
let cachedHasEmbeddedSearchTools: boolean | null = null

export function hasEmbeddedSearchTools(): boolean {
  if (cachedHasEmbeddedSearchTools !== null) {
    return cachedHasEmbeddedSearchTools
  }
  // 优先使用 DISABLE_GLOB_GREP_TOOLS 控制（Doge Code 主控变量）
  if (isEnvTruthy(process.env.DISABLE_GLOB_GREP_TOOLS)) {
    cachedHasEmbeddedSearchTools = true
    return true
  }
  // 兼容旧版 EMBEDDED_SEARCH_TOOLS（ant-native 构建使用）
  if (!isEnvTruthy(process.env.EMBEDDED_SEARCH_TOOLS)) {
    cachedHasEmbeddedSearchTools = false
    return false
  }
  const e = process.env.CLAUDE_CODE_ENTRYPOINT
  const result = e !== 'sdk-ts' && e !== 'sdk-py' && e !== 'sdk-cli' && e !== 'local-agent'
  cachedHasEmbeddedSearchTools = result
  return result
}

/**
 * Path to the bun binary that contains the embedded search tools.
 * Only meaningful when hasEmbeddedSearchTools() is true.
 */
export function embeddedSearchToolsBinaryPath(): string {
  return process.execPath
}
// FORCE_RECOMPILE_2026_07_23_2300  
