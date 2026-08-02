// ============================================================================
// Stock Command - Price Alerts
// 价格提醒：设置/检查/触发/管理提醒
// ============================================================================

import type { PriceAlert, AlertList } from './types.js'
import { loadAlerts, saveAlerts, loadWatchlist, saveWatchlist } from './utils.js'
import { getRealtimeQuote } from './api.js'
import { formatPrice, formatPercent, formatDateTime } from './utils.js'

// ============================================================================
// 提醒操作
// ============================================================================

/**
 * 添加价格提醒
 * @param code 股票代码
 * @param type 提醒类型: 'above' / 'below' / 'change_up' / 'change_down'
 * @param target 目标价格或涨跌幅
 * @param note 备注
 */
export async function addAlert(
  code: string,
  type: PriceAlert['type'],
  target: number,
  note = ''
): Promise<string> {
  const list = loadAlerts()

  // 获取股票名称
  let name = code
  try {
    const quote = await getRealtimeQuote(code)
    name = quote.name
  } catch {
    // use code as name
  }

  const alert: PriceAlert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code,
    name,
    type,
    targetPrice: type === 'above' || type === 'below' ? target : 0,
    targetPercent: type === 'change_up' || type === 'change_down' ? target : 0,
    triggered: false,
    createdAt: new Date().toISOString(),
    note,
  }

  list.alerts.push(alert)
  list.updatedAt = new Date().toISOString()

  if (saveAlerts(list)) {
    const typeLabel = type === 'above' ? '上涨超过' : type === 'below' ? '下跌超过' : type === 'change_up' ? '涨幅超过' : '跌幅超过'
    const targetLabel = type === 'above' || type === 'below' ? formatPrice(target) : formatPercent(target)
    return `✅ 已设置 ${name} (${code}) ${typeLabel} ${targetLabel} 时提醒`
  }

  return `❌ 设置失败`
}

/**
 * 移除提醒
 * @param alertId 提醒ID
 */
export function removeAlert(alertId: string): string {
  const list = loadAlerts()
  const idx = list.alerts.findIndex(a => a.id === alertId)

  if (idx === -1) {
    return `⚠️ 未找到提醒 ${alertId}`
  }

  const removed = list.alerts.splice(idx, 1)[0]
  list.updatedAt = new Date().toISOString()

  if (saveAlerts(list)) {
    return `✅ 已移除提醒: ${removed.name} (${removed.code})`
  }

  return `❌ 移除失败`
}

/**
 * 列出所有提醒
 */
export function listAlerts(): string {
  const list = loadAlerts()

  if (list.alerts.length === 0) {
    return '📋 没有设置价格提醒'
  }

  const lines: string[] = []
  lines.push(`📋 价格提醒列表 (${list.alerts.length} 个)`)
  lines.push('═'.repeat(50))

  for (const alert of list.alerts) {
    const status = alert.triggered ? '🔔 已触发' : '⏳ 等待中'
    const typeLabel = alert.type === 'above' ? '上涨超过' : alert.type === 'below' ? '下跌超过' : alert.type === 'change_up' ? '涨幅超过' : '跌幅超过'
    const target = alert.type === 'above' || alert.type === 'below' ? formatPrice(alert.targetPrice) : formatPercent(alert.targetPercent)

    lines.push(`  ${status} ${alert.name} (${alert.code})`)
    lines.push(`     ${typeLabel} ${target}`)
    if (alert.note) lines.push(`     备注: ${alert.note}`)
    lines.push(`     ID: ${alert.id}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 列出已触发的提醒
 */
export function listTriggeredAlerts(): string {
  const list = loadAlerts()
  const triggered = list.alerts.filter(a => a.triggered)

  if (triggered.length === 0) {
    return '📋 没有已触发的提醒'
  }

  const lines: string[] = []
  lines.push(`📋 已触发的提醒 (${triggered.length} 个)`)
  lines.push('═'.repeat(50))

  for (const alert of triggered) {
    const typeLabel = alert.type === 'above' ? '上涨超过' : alert.type === 'below' ? '下跌超过' : alert.type === 'change_up' ? '涨幅超过' : '跌幅超过'
    const target = alert.type === 'above' || alert.type === 'below' ? formatPrice(alert.targetPrice) : formatPercent(alert.targetPercent)

    lines.push(`  🔔 ${alert.name} (${alert.code})`)
    lines.push(`     ${typeLabel} ${target}`)
    lines.push(`     触发时间: ${alert.triggeredAt ? formatDateTime(alert.triggeredAt) : '--'}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 检查提醒是否触发
 * @param code 股票代码
 */
export async function checkAlerts(code: string): Promise<string> {
  const list = loadAlerts()
  const alertsForCode = list.alerts.filter(a => a.code === code && !a.triggered)

  if (alertsForCode.length === 0) {
    return `📋 ${code} 没有待触发的提醒`
  }

  let triggered = 0
  const lines: string[] = []

  try {
    const quote = await getRealtimeQuote(code)

    for (const alert of alertsForCode) {
      let isTriggered = false

      switch (alert.type) {
        case 'above':
          isTriggered = quote.price >= alert.targetPrice
          break
        case 'below':
          isTriggered = quote.price <= alert.targetPrice
          break
        case 'change_up':
          isTriggered = quote.changePercent >= alert.targetPercent
          break
        case 'change_down':
          isTriggered = quote.changePercent <= -alert.targetPercent
          break
      }

      if (isTriggered) {
        alert.triggered = true
        alert.triggeredAt = new Date().toISOString()
        triggered++
        lines.push(`🔔 触发: ${alert.name} (${code}) ${alert.type === 'above' ? '上涨超过' : alert.type === 'below' ? '下跌超过' : alert.type === 'change_up' ? '涨幅超过' : '跌幅超过'} ${alert.type === 'above' || alert.type === 'below' ? formatPrice(alert.targetPrice) : formatPercent(alert.targetPercent)}`)
        lines.push(`   当前价格: ${formatPrice(quote.price)} (${formatPercent(quote.changePercent)})`)
        if (alert.note) lines.push(`   备注: ${alert.note}`)
        lines.push('')
      }
    }

    if (triggered > 0) {
      list.updatedAt = new Date().toISOString()
      saveAlerts(list)
      lines.unshift(`📊 ${code} 提醒检查: 触发 ${triggered} 个提醒`)
    } else {
      lines.push(`📊 ${code} 提醒检查: 未触发任何提醒`)
    }
  } catch (err) {
    lines.push(`❌ 检查失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  return lines.join('\n')
}

/**
 * 检查所有股票的提醒
 */
export async function checkAllAlerts(): Promise<string> {
  const list = loadAlerts()
  const pendingAlerts = list.alerts.filter(a => !a.triggered)

  if (pendingAlerts.length === 0) {
    return '📋 没有待触发的提醒'
  }

  const lines: string[] = []
  lines.push('📊 检查所有提醒...')
  lines.push('')

  let totalTriggered = 0

  // 按股票代码分组
  const byCode = new Map<string, typeof pendingAlerts>()
  for (const alert of pendingAlerts) {
    if (!byCode.has(alert.code)) byCode.set(alert.code, [])
    byCode.get(alert.code)!.push(alert)
  }

  for (const [code, alerts] of byCode) {
    try {
      const quote = await getRealtimeQuote(code)

      for (const alert of alerts) {
        let isTriggered = false

        switch (alert.type) {
          case 'above':
            isTriggered = quote.price >= alert.targetPrice
            break
          case 'below':
            isTriggered = quote.price <= alert.targetPrice
            break
          case 'change_up':
            isTriggered = quote.changePercent >= alert.targetPercent
            break
          case 'change_down':
            isTriggered = quote.changePercent <= -alert.targetPercent
            break
        }

        if (isTriggered) {
          alert.triggered = true
          alert.triggeredAt = new Date().toISOString()
          totalTriggered++
          lines.push(`🔔 ${alert.name} (${code}) 当前 ${formatPrice(quote.price)} (${formatPercent(quote.changePercent)})`)
        }
      }
    } catch {
      // skip
    }
  }

  if (totalTriggered > 0) {
    list.updatedAt = new Date().toISOString()
    saveAlerts(list)
    lines.push('')
    lines.push(`📊 共触发 ${totalTriggered} 个提醒`)
  } else {
    lines.push('')
    lines.push('📊 没有触发任何提醒')
  }

  return lines.join('\n')
}

/**
 * 清空已触发的提醒
 */
export function clearTriggeredAlerts(): string {
  const list = loadAlerts()
  const before = list.alerts.length
  list.alerts = list.alerts.filter(a => !a.triggered)
  const removed = before - list.alerts.length
  list.updatedAt = new Date().toISOString()

  if (saveAlerts(list)) {
    return `✅ 已清除 ${removed} 个已触发的提醒`
  }

  return `❌ 清除失败`
}

/**
 * 清空所有提醒
 */
export function clearAllAlerts(): string {
  const list: AlertList = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    alerts: [],
  }

  if (saveAlerts(list)) {
    return '✅ 已清空所有提醒'
  }

  return `❌ 清空失败`
}

/**
 * 获取提醒详情
 * @param alertId 提醒ID
 */
export function getAlertDetail(alertId: string): string {
  const list = loadAlerts()
  const alert = list.alerts.find(a => a.id === alertId)

  if (!alert) {
    return `⚠️ 未找到提醒 ${alertId}`
  }

  const lines: string[] = []
  lines.push(`📊 提醒详情: ${alert.name} (${alert.code})`)
  lines.push(`   ID: ${alert.id}`)
  lines.push(`   类型: ${alert.type}`)
  lines.push(`   目标: ${alert.type === 'above' || alert.type === 'below' ? formatPrice(alert.targetPrice) : formatPercent(alert.targetPercent)}`)
  lines.push(`   状态: ${alert.triggered ? '已触发' : '等待中'}`)
  lines.push(`   创建时间: ${formatDateTime(alert.createdAt)}`)
  if (alert.triggeredAt) lines.push(`   触发时间: ${formatDateTime(alert.triggeredAt)}`)
  if (alert.note) lines.push(`   备注: ${alert.note}`)

  return lines.join('\n')
}
