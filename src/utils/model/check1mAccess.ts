import type { OverageDisabledReason } from '../../services/claudeAiLimits.js'
import { isClaudeAISubscriber } from '../auth.js'
import { getGlobalConfig } from '../config.js'
import { is1mContextDisabled } from '../context.js'

/**
 * 根据缓存的禁用原因检查额外用量是否已启用。
 * 如果没有禁用原因，或者禁用原因表明已配置但暂时不可用，则认为额外用量已启用。
 */
function isExtraUsageEnabled(): boolean {
  const reason = getGlobalConfig().cachedExtraUsageDisabledReason
  // undefined = 尚无缓存，视为未启用（保守策略）
  if (reason === undefined) {
    return false
  }
  // null = API 未返回禁用原因，额外用量已启用
  if (reason === null) {
    return true
  }
  // 检查哪些禁用原因仍意味着“已配置”
  switch (reason as OverageDisabledReason) {
    // 已配置但余额耗尽 — 仍算作已启用
    case 'out_of_credits':
      return true
    // 未配置或主动禁用
    case 'overage_not_provisioned':
    case 'org_level_disabled':
    case 'org_level_disabled_until':
    case 'seat_tier_level_disabled':
    case 'member_level_disabled':
    case 'seat_tier_zero_credit_limit':
    case 'group_zero_credit_limit':
    case 'member_zero_credit_limit':
    case 'org_service_level_disabled':
    case 'org_service_zero_credit_limit':
    case 'no_limits_configured':
    case 'unknown':
      return false
    default:
      return false
  }
}

// @[MODEL LAUNCH]: 检查新模型是否支持 1M 上下文
export function checkOpus1mAccess(): boolean {
  if (is1mContextDisabled()) {
    return false
  }

  if (isClaudeAISubscriber()) {
    // 订阅用户如果账户已启用额外用量，则具有访问权限
    return isExtraUsageEnabled()
  }

  // 非订阅用户（API/PAYG）具有访问权限
  return true
}

export function checkSonnet1mAccess(): boolean {
  if (is1mContextDisabled()) {
    return false
  }

  if (isClaudeAISubscriber()) {
    // 订阅用户如果账户已启用额外用量，则具有访问权限
    return isExtraUsageEnabled()
  }

  // 非订阅用户（API/PAYG）具有访问权限
  return true
}