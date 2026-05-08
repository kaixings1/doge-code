/**
 * Branded types for session and agent IDs.
 * These prevent accidentally mixing up session IDs and agent IDs at compile time.
 */

/**
 * A session ID uniquely identifies a Claude Code session.
 * Returned by getSessionId().
 */
export type 会话ID = string & { readonly __brand: 'SessionId' }

/**
 * 代理ID唯一标识会话中的子代理。
 * 由createAgentId()返回。
 * 当存在时，表示上下文是子代理（非主会话）。
 */
export type 代理ID = string & { readonly __brand: 'AgentId' }

/**
 * Cast a raw string to SessionId.
 * Use sparingly - prefer getSessionId() when possible.
 */
export function asSessionId(id: string): SessionId {
  return id as SessionId
}

/**
 * Cast a raw string to AgentId.
 * Use sparingly - prefer createAgentId() when possible.
 */
export function asAgentId(id: string): AgentId {
  return id as AgentId
}

const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/

/**
 * Validate and brand a string as AgentId.
 * Matches the format produced by createAgentId(): `a` + optional `<label>-` + 16 hex chars.
 * Returns null if the string doesn't match (e.g. teammate names, team-addressing).
 */
export function toAgentId(s: string): AgentId | null {
  return AGENT_ID_PATTERN.test(s) ? (s as AgentId) : null
}
