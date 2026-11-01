/**
 * `CLAUDE_CODE_SUBAGENT_EFFORT`（官方 2.1.316）。
 *
 * 官方描述：Added `CLAUDE_CODE_SUBAGENT_EFFORT` to set the effort level
 * subagents run at **when nothing else names one**, instead of inheriting
 * the session's.
 *
 * 语义要点（容易实现错的三个地方）：
 *  1. 只在「没有别的东西指定 effort」时生效 —— 即子代理自己显式传了
 *     effort（agent 定义、调用参数）时，不能被这个变量覆盖。
 *  2. 它替代的是「继承会话 effort」这一步，不是覆盖整条解析链。
 *  3. 未设置时行为完全不变（仍继承会话）。
 *
 * 因此本函数接受「子代理自己是否已显式指定」这一信息，只在未指定时给出默认值。
 */
import { parseEffortValue } from './effort.js'
import type { EffortValue } from './effort.js'

/** 读取环境变量并解析为 EffortValue；未设置/非法返回 undefined。 */
export function getSubagentEffortOverride(
  env: NodeJS.ProcessEnv = process.env,
): EffortValue | undefined {
  const raw = env.CLAUDE_CODE_SUBAGENT_EFFORT
  if (raw == null || raw.trim() === '') return undefined
  return parseEffortValue(raw.trim())
}

/**
 * 计算子代理实际使用的 effort。
 *
 * @param explicitlySet  子代理是否已显式指定 effort（agent 定义 / 调用参数）。
 *                       为真时**不**应用环境变量，保证「只在没有别的东西指定时生效」。
 * @param sessionEffort  会话当前的 effort（原本会被继承的那个值）。
 */
export function resolveSubagentEffort(args: {
  explicitlySet: EffortValue | undefined
  sessionEffort: EffortValue | undefined
  env?: NodeJS.ProcessEnv
}): EffortValue | undefined {
  const { explicitlySet, sessionEffort, env } = args
  if (explicitlySet !== undefined) return explicitlySet
  const override = getSubagentEffortOverride(env)
  if (override !== undefined) return override
  return sessionEffort
}
