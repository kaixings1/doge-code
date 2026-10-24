/**
 * --permission-prompts <host|none>（对齐官方 v2.1.259）
 *
 * `none`：无人值守的无头主机上，任何本该弹窗询问的调用**自动拒绝**，
 * 而不是挂起等待一个永远不会来的回答（此前会一直卡住直到超时）。
 * 显式权限规则（allow/deny）仍然优先——本设置只影响「需要询问用户」这一结局。
 *
 * `host`（默认）：保持原有行为，交给宿主（终端 UI / SDK 回调）决定。
 */

export type PermissionPromptsMode = 'host' | 'none'

const VALID: readonly PermissionPromptsMode[] = ['host', 'none']

/**
 * 解析 CLI 取值。非法值回落到 `host`——不能让一个拼写错误把整个会话
 * 变成「一律拒绝」。返回是否合法，供 CLI 层在非法时提示用户。
 */
export function parsePermissionPromptsMode(raw: unknown): {
  mode: PermissionPromptsMode
  valid: boolean
} {
  if (raw === undefined || raw === null) return { mode: 'host', valid: true }
  const text = String(raw).trim().toLowerCase()
  if (text === '') return { mode: 'host', valid: true }
  if ((VALID as readonly string[]).includes(text)) {
    return { mode: text as PermissionPromptsMode, valid: true }
  }
  return { mode: 'host', valid: false }
}

/** 当前生效的模式（供权限决策路径读取）。 */
export function permissionPromptsMode(): PermissionPromptsMode {
  return parsePermissionPromptsMode(process.env.CLAUDE_CODE_PERMISSION_PROMPTS).mode
}

export const NONE_MODE_DENY_MESSAGE =
  '权限提示已被禁用（--permission-prompts none），本次调用自动拒绝'

export type NoneModeDenyDecision = {
  behavior: 'deny'
  message: string
  decisionReason: { type: 'other'; reason: string }
}

/**
 * 把「需要询问」的权限结果按当前模式转换。
 *
 * 只在 mode === 'none' 且结果为 `ask` 时改成 deny；`allow` / `deny` 一律原样返回
 * （显式规则优先）。无头路径（src/cli/print.ts）在三条分支外统一调用它。
 *
 * 抽成独立函数是为了能脱离 print.ts 的重依赖单独测试。
 */
export function applyNoneModeToDecision<T extends { behavior: string }>(
  result: T,
  mode: PermissionPromptsMode = permissionPromptsMode(),
): T | NoneModeDenyDecision {
  if (mode !== 'none' || result.behavior !== 'ask') return result
  return {
    behavior: 'deny',
    message: NONE_MODE_DENY_MESSAGE,
    decisionReason: { type: 'other', reason: 'permission-prompts: none' },
  }
}
