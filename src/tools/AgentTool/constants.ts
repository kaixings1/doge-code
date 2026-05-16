export const AGENT_TOOL_NAME = 'Agent'
// 旧版线缆名称，用于向后兼容（权限规则、钩子、恢复的会话）
export const LEGACY_AGENT_TOOL_NAME = 'Task'
export const VERIFICATION_AGENT_TYPE = 'verification'

// 一次性内置代理——运行一次即返回报告，
// 父代理不会通过 SendMessages 继续执行它们。
// 跳过这些代理的 agentId/SendMessage/usage 尾缀以节省令牌（约 135 字符 × 每周 3400 万次 Explore 运行）。
export const ONE_SHOT_BUILTIN_AGENT_TYPES: ReadonlySet<string> = new Set([
  'Explore',
  'Plan',
])
