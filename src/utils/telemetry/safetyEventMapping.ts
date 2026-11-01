/**
 * safety_event 的语义映射：把内部的 source / decision / 工具名
 * 翻译成官方事件的枚举值。
 *
 * 单独成文件的原因：这些映射是纯函数，可单测；而发送逻辑（safetyEvent.ts）
 * 依赖 OTel，测试里不该拉起遥测栈。
 */
import type { SafetyGate, SafetyOutcome } from './safetyEvent.js'

/**
 * 权限来源 → 拦截闸门。
 *
 * 官方事件覆盖五类来源：permission rule / auto mode / safety check /
 * hook / sandbox。本地 sourceToString 的取值落进这几类（见下），
 * 无法归类的都给 'unknown'，绝不臆造。
 */
export function mapSourceToSafetyGate(source: string): SafetyGate {
  const s = source.toLowerCase()

  // 自动模式（含 yolo 分类器）
  if (s.includes('auto')) return 'auto_mode'
  // 分类器（yolo / classifier）
  if (s.includes('classifier') || s.includes('yolo')) return 'classifier'
  // 钩子
  if (s.includes('hook')) return 'hook'
  // 沙箱
  if (s.includes('sandbox')) return 'sandbox'
  // 用户主动批准/拒绝（对话框）
  if (s.includes('user') || s.includes('prompt') || s.includes('dialog')) {
    return 'user_prompt'
  }
  // 规则来源：config / settings / rule / allowlist / denylist
  if (
    s.includes('config') ||
    s.includes('setting') ||
    s.includes('rule') ||
    s.includes('allow') ||
    s.includes('deny')
  ) {
    return 'permission_rule'
  }
  // 安全检查（敏感文件、危险路径等）
  if (s.includes('safe') || s.includes('danger')) return 'safety_check'

  return 'unknown'
}

/**
 * 决策 → 结局。
 *
 * 本地只有 accept / reject 两态，官方还有 asked / sent_back。
 * 不臆造：本地没有「退回重写」这条路径，就不产出 sent_back。
 */
export function mapDecisionToSafetyOutcome(decision: string): SafetyOutcome {
  return decision === 'accept' ? 'allowed' : 'denied'
}

/**
 * 工具名 → 工具分类。
 *
 * 只做保守归类；未命中给 'other'，避免错误归类影响审计统计。
 */
export function toolClassForAnalytics(toolName: string): string {
  const n = toolName.toLowerCase()
  if (n === 'read' || n === 'glob' || n === 'grep' || n === 'ls') return 'read'
  if (n === 'write' || n === 'edit' || n === 'notebookedit') return 'write'
  if (n === 'bash' || n === 'powershell') return 'execute'
  if (n.startsWith('mcp__') || n.includes('mcp')) return 'mcp'
  return 'other'
}
