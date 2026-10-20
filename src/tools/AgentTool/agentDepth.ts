/**
 * 子代理嵌套深度计算。
 *
 * 单独成模块（无任何重型依赖）的原因：
 * 1. depth 语义分散在 AgentTool 与 resumeAgent 两处，易漂移；
 * 2. 从 agentToolUtils 导出会拖入整条导入链，测试里触发模块循环依赖。
 * 这里只包含纯算术，可被安全地单独导入与测试。
 */

type DepthOptions = Partial<{ agentDepth: number }> | null

/** 读取父代理深度（根代理无该字段，视为 0）。非法值同样回落为 0。 */
export function resolveAgentDepth(options: DepthOptions): number {
  const depth = options?.agentDepth
  return typeof depth === 'number' && Number.isFinite(depth) ? depth : 0
}

/** 派生子代理：父深度 + 1（根代理得到 1）。 */
export function computeNextDepth(options: DepthOptions): number {
  return resolveAgentDepth(options) + 1
}
