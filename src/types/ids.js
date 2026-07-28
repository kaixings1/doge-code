/**
 * 会话 ID 和代理 ID 的品牌类型。
 * 防止在编译时意外混淆会话 ID 和代理 ID。
 */
/**
 * 将原始字符串转换为 SessionId。
 * 谨慎使用 — 尽可能使用 getSessionId()。
 */
export function asSessionId(id) {
    return id;
}
/**
 * 将原始字符串转换为 AgentId。
 * 谨慎使用 — 尽可能使用 createAgentId()。
 */
export function asAgentId(id) {
    return id;
}
const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/;
/**
 * 验证并将字符串标记为 AgentId。
 * 匹配 createAgentId() 生成的格式：`a` + 可选的 `<label>-` + 16 位十六进制字符。
 * 若字符串不匹配则返回 null（例如队友名称、团队地址）。
 */
export function toAgentId(s) {
    return AGENT_ID_PATTERN.test(s) ? s : null;
}
//# sourceMappingURL=ids.js.map