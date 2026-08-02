// ============================================================================
// Stock Command - Watchlist Management
// 自选股管理：添加/删除/分组/提醒
// ============================================================================

import type { Watchlist, WatchlistEntry } from './types.js'
import { loadWatchlist, saveWatchlist, getDataFile } from './utils.js'
import { getRealtimeQuote } from './api.js'
import { formatPrice, formatPercent, formatLargeNumber } from './utils.js'

// ============================================================================
// 自选股操作
// ============================================================================

/**
 * 添加自选股
 * @param code 股票代码
 * @param group 分组名称
 * @param note 备注
 */
export async function addToWatchlist(code: string, group = '默认', note = ''): Promise<string> {
  const wl = loadWatchlist()

  // 检查是否已存在
  if (wl.entries.some(e => e.code === code)) {
    return `⚠️ ${code} 已在自选股列表中`
  }

  // 获取股票名称
  let name = code
  try {
    const quote = await getRealtimeQuote(code)
    name = quote.name
  } catch {
    // 如果获取失败，使用代码作为名称
  }

  const entry: WatchlistEntry = {
    code,
    name,
    group,
    addedAt: new Date().toISOString(),
    note,
  }

  wl.entries.push(entry)
  wl.updatedAt = new Date().toISOString()

  // 确保分组存在
  if (!wl.groups.includes(group)) {
    wl.groups.push(group)
  }

  if (saveWatchlist(wl)) {
    return `✅ 已添加 ${name} (${code}) 到自选股 [${group}]`
  }
  return `❌ 添加失败`
}

/**
 * 从自选股列表移除
 * @param code 股票代码
 */
export async function removeFromWatchlist(code: string): Promise<string> {
  const wl = loadWatchlist()
  const idx = wl.entries.findIndex(e => e.code === code)
  if (idx === -1) {
    return `⚠️ ${code} 不在自选股列表中`
  }

  const removed = wl.entries.splice(idx, 1)[0]
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    return `✅ 已从自选股移除 ${removed.name} (${code})`
  }
  return `❌ 移除失败`
}

/**
 * 查看自选股列表（带实时行情）
 * @param group 分组筛选
 */
export async function listWatchlist(group?: string): Promise<string> {
  const wl = loadWatchlist()

  let entries = wl.entries
  if (group) {
    entries = entries.filter(e => e.group === group)
  }

  if (entries.length === 0) {
    return group ? `📋 分组 "${group}" 中没有自选股` : '📋 自选股列表为空'
  }

  const lines: string[] = []
  const header = `📋 自选股列表 ${group ? `[${group}]` : ''} (${entries.length} 只)`
  lines.push(header)
  lines.push(''.padEnd(header.length, '─'))

  // 表头
  lines.push(`代码    |名称      |现价    |涨跌幅   |市值(亿)  |备注`)
  lines.push(`--------|---------|--------|---------|---------|------`)

  for (const entry of entries) {
    try {
      const quote = await getRealtimeQuote(entry.code)
      lines.push(
        `${entry.code.padEnd(8)}|` +
        `${quote.name.padEnd(9)}|` +
        `${formatPrice(quote.price).padStart(8)}|` +
        `${formatPercent(quote.changePercent).padStart(9)}|` +
        `${formatLargeNumber(quote.marketCap).padStart(10)}|` +
        `${entry.note}`
      )
    } catch {
      lines.push(
        `${entry.code.padEnd(8)}|` +
        `${entry.name.padEnd(9)}|` +
        `${'--'.padStart(8)}|` +
        `${'--'.padStart(9)}|` +
        `${'--'.padStart(10)}|` +
        `${entry.note}`
      )
    }
  }

  return lines.join('\n')
}

/**
 * 列出所有分组
 */
export function listGroups(): string {
  const wl = loadWatchlist()

  if (wl.groups.length === 0) {
    return '📋 没有分组'
  }

  const lines: string[] = ['📁 自选股分组:']
  for (const group of wl.groups) {
    const count = wl.entries.filter(e => e.group === group).length
    lines.push(`  📂 ${group} (${count} 只)`)
  }

  return lines.join('\n')
}

/**
 * 创建新分组
 * @param name 分组名称
 */
export function createGroup(name: string): string {
  const wl = loadWatchlist()

  if (wl.groups.includes(name)) {
    return `⚠️ 分组 "${name}" 已存在`
  }

  wl.groups.push(name)
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    return `✅ 已创建分组 "${name}"`
  }
  return `❌ 创建失败`
}

/**
 * 删除分组
 * @param name 分组名称
 */
export function deleteGroup(name: string): string {
  const wl = loadWatchlist()

  if (name === '默认') {
    return `⚠️ 不能删除默认分组`
  }

  if (!wl.groups.includes(name)) {
    return `⚠️ 分组 "${name}" 不存在`
  }

  // 将该分组的股票移到默认分组
  for (const entry of wl.entries) {
    if (entry.group === name) {
      entry.group = '默认'
    }
  }

  const idx = wl.groups.indexOf(name)
  wl.groups.splice(idx, 1)
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    return `✅ 已删除分组 "${name}"，股票已移至默认分组`
  }
  return `❌ 删除失败`
}

/**
 * 移动股票到其他分组
 * @param code 股票代码
 * @param group 目标分组
 */
export function moveToGroup(code: string, group: string): string {
  const wl = loadWatchlist()

  if (!wl.groups.includes(group)) {
    return `⚠️ 分组 "${group}" 不存在`
  }

  const entry = wl.entries.find(e => e.code === code)
  if (!entry) {
    return `⚠️ ${code} 不在自选股列表中`
  }

  const oldGroup = entry.group
  entry.group = group
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    return `✅ 已将 ${code} 从 "${oldGroup}" 移到 "${group}"`
  }
  return `❌ 移动失败`
}

/**
 * 更新自选股备注
 * @param code 股票代码
 * @param note 新备注
 */
export function updateNote(code: string, note: string): string {
  const wl = loadWatchlist()

  const entry = wl.entries.find(e => e.code === code)
  if (!entry) {
    return `⚠️ ${code} 不在自选股列表中`
  }

  entry.note = note
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    return `✅ 已更新 ${code} 的备注`
  }
  return `❌ 更新失败`
}

/**
 * 清空自选股列表
 */
export function clearWatchlist(): string {
  const wl: Watchlist = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    groups: ['默认'],
    entries: [],
  }

  if (saveWatchlist(wl)) {
    return '✅ 已清空自选股列表'
  }
  return `❌ 清空失败`
}

/**
 * 导出自选股列表
 * @param format 导出格式: 'json' / 'csv' / 'table'
 */
export function exportWatchlist(format = 'table'): string {
  const wl = loadWatchlist()

  if (wl.entries.length === 0) {
    return '📋 自选股列表为空'
  }

  if (format === 'json') {
    return JSON.stringify(wl, null, 2)
  }

  if (format === 'csv') {
    const lines = ['代码,名称,分组,添加时间,备注']
    for (const entry of wl.entries) {
      lines.push(`${entry.code},${entry.name},${entry.group},${entry.addedAt},${entry.note}`)
    }
    return lines.join('\n')
  }

  // table format
  const lines: string[] = ['📋 自选股列表:']
  for (const entry of wl.entries) {
    lines.push(`  ${entry.code} ${entry.name} [${entry.group}] ${entry.note}`)
  }
  return lines.join('\n')
}

/**
 * 获取自选股提醒
 * @param code 股票代码
 */
export function getWatchlistAlerts(code: string): string {
  const wl = loadWatchlist()
  const entry = wl.entries.find(e => e.code === code)

  if (!entry) {
    return `⚠️ ${code} 不在自选股列表中`
  }

  const lines: string[] = [`📊 ${entry.name} (${code}) 提醒设置:`]

  if (entry.alertAbove !== undefined) {
    lines.push(`  ⬆️ 价格上限: ${entry.alertAbove.toFixed(2)}`)
  }
  if (entry.alertBelow !== undefined) {
    lines.push(`  ⬇️ 价格下限: ${entry.alertBelow.toFixed(2)}`)
  }
  if (entry.costPrice !== undefined) {
    lines.push(`  💰 成本价: ${entry.costPrice.toFixed(2)}`)
  }
  if (entry.shares !== undefined) {
    lines.push(`  📦 持仓数量: ${entry.shares}`)
  }

  if (entry.alertAbove === undefined && entry.alertBelow === undefined) {
    lines.push('  未设置价格提醒')
  }

  return lines.join('\n')
}

/**
 * 设置价格提醒
 * @param code 股票代码
 * @param above 价格上限
 * @param below 价格下限
 */
export function setPriceAlert(code: string, above?: number, below?: number): string {
  const wl = loadWatchlist()
  const entry = wl.entries.find(e => e.code === code)

  if (!entry) {
    return `⚠️ ${code} 不在自选股列表中`
  }

  if (above !== undefined) entry.alertAbove = above
  if (below !== undefined) entry.alertBelow = below
  wl.updatedAt = new Date().toISOString()

  if (saveWatchlist(wl)) {
    const alerts: string[] = []
    if (above !== undefined) alerts.push(`上限 ${above.toFixed(2)}`)
    if (below !== undefined) alerts.push(`下限 ${below.toFixed(2)}`)
    return `✅ 已设置 ${code} 价格提醒: ${alerts.join(', ')}`
  }
  return `❌ 设置失败`
}
