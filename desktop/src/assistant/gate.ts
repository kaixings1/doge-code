/**
 * 助手模式（KAIROS）门控模块
 * 
 * 该模块负责检查助手模式是否应该启用，基于以下条件：
 * 1. GrowthBook 门控 (tengu_kairos)
 * 2. 用户信任状态（信任对话框已接受）
 * 3. 目录可信度检查
 */

import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { checkHasTrustDialogAccepted } from '../utils/config.js'
import { isDirectoryTrusted } from '../utils/trust/index.js'

// 门控缓存，避免重复检查
let kairosEnabledCache: boolean | null = null
let lastTrustCheck: number = 0
const TRUST_CHECK_TTL = 5 * 60 * 1000 // 5分钟缓存

/**
 * 检查 Kairos (助手模式) 是否启用
 * 
 * @param options - 可选参数
 * @param options.forceRefresh - 是否强制刷新检查（忽略缓存）
 * @param options.skipTrustCheck - 是否跳过信任检查（用于守护进程模式）
 * @returns 是否启用助手模式
 */
export async function isKairosEnabled(options?: {
  forceRefresh?: boolean
  skipTrustCheck?: boolean
}): Promise<boolean> {
  const forceRefresh = options?.forceRefresh || false
  const skipTrustCheck = options?.skipTrustCheck || false

  // 检查缓存（除非强制刷新）
  if (!forceRefresh && kairosEnabledCache !== null) {
    const now = Date.now()
    if (now - lastTrustCheck < TRUST_CHECK_TTL) {
      return kairosEnabledCache
    }
  }

  // 1. 检查 GrowthBook 门控
  const growthBookEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos',
    false
  )

  if (!growthBookEnabled) {
    kairosEnabledCache = false
    lastTrustCheck = Date.now()
    return false
  }

  // 2. 检查信任状态
  if (!skipTrustCheck) {
    const hasAcceptedTrust = checkHasTrustDialogAccepted()
    if (!hasAcceptedTrust) {
      kairosEnabledCache = false
      lastTrustCheck = Date.now()
      return false
    }

    // 3. 检查目录是否可信
    const isTrusted = await isDirectoryTrusted()
    if (!isTrusted) {
      kairosEnabledCache = false
      lastTrustCheck = Date.now()
      return false
    }
  }

  // 所有检查通过，启用助手模式
  kairosEnabledCache = true
  lastTrustCheck = Date.now()
  return true
}

/**
 * 重置门控缓存
 * 
 * 当用户接受信任对话框或目录信任状态改变时调用
 */
export function resetCache(): void {
  kairosEnabledCache = null
  lastTrustCheck = 0
}

/**
 * 强制启用助手模式（绕过门控检查）
 * 
 * 仅用于守护进程模式或测试环境
 */
export function forceEnable(): void {
  kairosEnabledCache = true
  lastTrustCheck = Date.now()
}

/**
 * 强制禁用助手模式
 * 
 * 用于测试或用户明确禁用的情况
 */
export function forceDisable(): void {
  kairosEnabledCache = false
  lastTrustCheck = Date.now()
}

/**
 * 获取当前门控状态（不触发检查）
 */
export function getCachedState(): boolean | null {
  return kairosEnabledCache
}
