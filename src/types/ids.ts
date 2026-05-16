/**
 * 会话 ID 和代理 ID 的品牌类型。
 * 防止在编译时意外混淆会话 ID 和代理 ID。
 */

/**
 * 会话 ID，唯一标识一个 Claude Code 会话。
 * 由 getSessionId() 返回。
 */
export type 会话ID = string & { readonly __brand: 'SessionId' }

/**
 * 代理ID唯一标识会话中的子代理。
 * 由createAgentId()返回。
 * 当存在时，表示上下文是子代理（非主会话）。
 */
export type 代理ID = string & { readonly __brand: 'AgentId' }

/**
 * 将原始字符串转换为 SessionId。
 * 谨慎使用 — 尽可能使用 getSessionId()。
 */
export function asSessionId(id: string): SessionId {
  return id as SessionId
}

/**
 * 将原始字符串转换为 AgentId。
 * 谨慎使用 — 尽可能使用 createAgentId()。
 */
export function asAgentId(id: string): AgentId {
  return id as AgentId
}

const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/

/**
 * 验证并将字符串标记为 AgentId。
 * 匹配 createAgentId() 生成的格式：`a` + 可选的 `<label>-` + 16 位十六进制字符。
 * 若字符串不匹配则返回 null（例如队友名称、团队地址）。
 */
export function toAgentId(s: string): AgentId | null {
  return AGENT_ID_PATTERN.test(s) ? (s as AgentId) : null
}
