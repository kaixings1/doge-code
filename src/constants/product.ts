export const PRODUCT_URL = 'https://claude.com/claude-code'

// Claude Code 远程会话 URL
export const CLAUDE_AI_BASE_URL = 'https://claude.ai'
export const CLAUDE_AI_STAGING_BASE_URL = 'https://claude-ai.staging.ant.dev'
export const CLAUDE_AI_LOCAL_BASE_URL = 'http://localhost:4000'

/**
 * 判断是否处于远程会话的预发布环境。
 * 检查会话 ID 格式和入口 URL。
 */
export function isRemoteSessionStaging(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_staging_') === true ||
    ingressUrl?.includes('staging') === true
  )
}

/**
 * 判断是否处于远程会话的本地开发环境。
 * 检查会话 ID 格式（例如 `session_local_...`）和入口 URL。
 */
export function isRemoteSessionLocal(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_local_') === true ||
    ingressUrl?.includes('localhost') === true
  )
}

/**
 * 根据环境获取 Claude AI 的基础 URL。
 */
export function getClaudeAiBaseUrl(
  sessionId?: string,
  ingressUrl?: string,
): string {
  if (isRemoteSessionLocal(sessionId, ingressUrl)) {
    return CLAUDE_AI_LOCAL_BASE_URL
  }
  if (isRemoteSessionStaging(sessionId, ingressUrl)) {
    return CLAUDE_AI_STAGING_BASE_URL
  }
  return CLAUDE_AI_BASE_URL
}

/**
 * 获取远程会话的完整会话 URL。
 *
 * cse_→session_ 转换是一个临时垫片，由
 * tengu_bridge_repl_v2_cse_shim_enabled 控制（见 isCseShimEnabled）。Worker
 * 端点（/v1/code/sessions/{id}/worker/*）需要 `cse_*`，但 claude.ai
 * 前端当前使用 `session_*` 进行路由（compat/convert.go:27 验证
 * TagSession）。相同的 UUID 主体，不同的标签前缀。一旦服务器按
 * environment_kind 进行标记且前端直接接受 `cse_*`，则关闭此垫片。
 * 对已经是 `session_*` 形式的 ID 无效。参见 src/bridge/sessionIdCompat.ts
 * 中的 toCompatSessionId 以获取规范辅助函数（此处延迟加载
 * 以保持 constants/ 在模块加载时为 DAG 叶子节点）。
 */
export function getRemoteSessionUrl(
  sessionId: string,
  ingressUrl?: string,
): string {
   
  const { toCompatSessionId } =
    require('../bridge/sessionIdCompat.js') as typeof import('../bridge/sessionIdCompat.js')
   
  const compatId = toCompatSessionId(sessionId)
  const baseUrl = getClaudeAiBaseUrl(compatId, ingressUrl)
  return `${baseUrl}/code/${compatId}`
}
