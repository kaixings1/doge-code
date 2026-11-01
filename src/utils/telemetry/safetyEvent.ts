/**
 * `claude_code.safety_event`（官方 2.1.307）。
 *
 * 官方描述：Added the `claude_code.safety_event` OpenTelemetry event for each
 * tool call a permission rule, auto mode, a safety check, a hook or the sandbox
 * stopped, prompted or sent back.
 *
 * 字段取自官方打包代码里的实际调用（不是猜）：
 *   emit("safety_event", { ...base, tool_use_id, sandbox_violation_count,
 *                          sandbox_enabled })
 *   emit("safety_event", { ...base, tool_name, classifier_category })
 * base 里含 mode / outcome / tool_class 等。
 *
 * 与既有 `tool_decision` 的关系：那条记录「最终决定」，本事件额外带上
 * **拦截来源**（哪一道闸门、为什么），用于安全审计。二者不重复：
 * tool_decision 回答「放行还是拒绝」，safety_event 回答「谁拦的、依据什么」。
 *
 * 隐私边界：只发枚举值与工具名，绝不放命令内容/文件路径。
 */
import { logOTelEvent } from './events.js'

/** 拦住/询问该工具调用的来源闸门。 */
export type SafetyGate =
  | 'permission_rule'
  | 'auto_mode'
  | 'safety_check'
  | 'hook'
  | 'sandbox'
  | 'classifier'
  | 'user_prompt'
  | 'unknown'

/** 该次调用的结局。 */
export type SafetyOutcome =
  | 'allowed'
  | 'denied'
  | 'asked'
  | 'sent_back'

export type SafetyEventInput = {
  gate: SafetyGate
  outcome: SafetyOutcome
  /** 权限模式（default/acceptEdits/bypassPermissions/plan/auto） */
  mode?: string
  /** 工具名（已由调用方脱敏） */
  toolName?: string
  /** 工具分类：read / write / execute / mcp / other */
  toolClass?: string
  /** 沙箱违规计数，仅 sandbox 闸门有意义 */
  sandboxViolationCount?: number
  /** 沙箱是否启用 */
  sandboxEnabled?: boolean
  /** 分类器类别，仅 classifier 闸门有意义 */
  classifierCategory?: string
}

const MAX_ATTR_LEN = 64

/** 只保留安全字符，避免把命令内容/路径带进遥测。 */
function safeToken(v: string | undefined): string | undefined {
  if (v == null) return undefined
  const s = v.trim()
  if (!s) return undefined
  if (!/^[A-Za-z0-9_.:-]+$/.test(s)) return undefined
  return s.length > MAX_ATTR_LEN ? s.slice(0, MAX_ATTR_LEN) : s
}

/**
 * 发出一条 safety_event。
 *
 * 注意：属性值全部为字符串（logOTelEvent 的 metadata 类型如此），
 * 数字需显式转换，否则会被静默丢弃。
 */
export function logSafetyEvent(input: SafetyEventInput): void {
  const metadata: Record<string, string | undefined> = {
    gate: input.gate,
    outcome: input.outcome,
    mode: safeToken(input.mode),
    tool_name: safeToken(input.toolName),
    tool_class: safeToken(input.toolClass),
  }
  if (input.sandboxViolationCount !== undefined) {
    metadata.sandbox_violation_count = String(input.sandboxViolationCount)
  }
  if (input.sandboxEnabled !== undefined) {
    metadata.sandbox_enabled = String(input.sandboxEnabled)
  }
  if (input.classifierCategory !== undefined) {
    metadata.classifier_category = safeToken(input.classifierCategory)
  }

  void logOTelEvent('safety_event', metadata)
}
