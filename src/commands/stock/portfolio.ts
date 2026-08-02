// ============================================================================
// Stock Command - Portfolio Tracking
// 投资组合跟踪：持仓/盈亏/资产配置
// ============================================================================

import type { Portfolio, PortfolioEntry } from './types.js'
import { loadPortfolio, savePortfolio } from './utils.js'
import { getRealtimeQuote } from './api.js'
import { formatPrice, formatPercent, formatLargeNumber } from './utils.js'

// ============================================================================
// 持仓操作
// ============================================================================

/**
 * 添加持仓
 * @param code 股票代码
 * @param shares 股数
 * @param costPrice 成本价（每股）
 */
export async function addHolding(code: string, shares: number, costPrice: number): Promise<string> {
  const portfolio = loadPortfolio()

  // 获取股票名称
  let name = code
  try {
    const quote = await getRealtimeQuote(code)
    name = quote.name
  } catch {
    // use code as name
  }

  // 检查是否已持有
  const existing = portfolio.entries.find(e => e.code === code)
  if (existing) {
    // 更新持仓（加权平均成本）
    const totalShares = existing.shares + shares
    const totalCost = existing.shares * existing.costPrice + shares * costPrice
    existing.shares = totalShares
    existing.costPrice = totalCost / totalShares
    existing.addedAt = new Date().toISOString()
  } else {
    const entry: PortfolioEntry = {
      code,
      name,
      shares,
      costPrice,
      currentPrice: 0,
      marketValue: 0,
      profit: 0,
      profitPercent: 0,
      addedAt: new Date().toISOString(),
    }
    portfolio.entries.push(entry)
  }

  if (savePortfolio(portfolio)) {
    return `✅ 已添加 ${name} (${code}) ${shares}股 @ ${costPrice.toFixed(2)}`
  }
  return `❌ 添加失败`
}

/**
 * 减少持仓
 * @param code 股票代码
 * @param shares 卖出股数
 * @param sellPrice 卖出价
 */
export async function removeHolding(code: string, shares?: number, sellPrice?: number): Promise<string> {
  const portfolio = loadPortfolio()
  const entry = portfolio.entries.find(e => e.code === code)

  if (!entry) {
    return `⚠️ 未持有 ${code}`
  }

  if (shares === undefined || shares >= entry.shares) {
    // 全部卖出
    const profit = sellPrice ? (sellPrice - entry.costPrice) * entry.shares : 0
    const idx = portfolio.entries.indexOf(entry)
    portfolio.entries.splice(idx, 1)
    if (savePortfolio(portfolio)) {
      return `✅ 已全部卖出 ${entry.name} (${code})${sellPrice ? `，盈亏: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}元` : ''}`
    }
  } else {
    // 部分卖出
    entry.shares -= shares
    if (savePortfolio(portfolio)) {
      return `✅ 已卖出 ${code} ${shares}股，剩余 ${entry.shares}股`
    }
  }

  return `❌ 操作失败`
}

/**
 * 查看投资组合
 */
export async function viewPortfolio(): Promise<string> {
  const portfolio = loadPortfolio()

  if (portfolio.entries.length === 0) {
    return '📊 投资组合为空，使用 /stock portfolio add <代码> <股数> <成本价> 添加持仓'
  }

  const lines: string[] = []
  lines.push('📊 投资组合')
  lines.push('═'.repeat(60))

  let totalCost = 0
  let totalValue = 0

  // 表头
  lines.push(`代码    |名称      |持仓   |成本     |现价     |市值      |盈亏      |盈亏%`)
  lines.push(`--------|---------|-------|---------|---------|----------|----------|------`)

  for (const entry of portfolio.entries) {
    try {
      const quote = await getRealtimeQuote(entry.code)
      const currentPrice = quote.price
      const marketValue = currentPrice * entry.shares
      const cost = entry.costPrice * entry.shares
      const profit = marketValue - cost
      const profitPercent = (profit / cost) * 100

      totalCost += cost
      totalValue += marketValue

      lines.push(
        `${entry.code.padEnd(8)}|` +
        `${quote.name.padEnd(9)}|` +
        `${entry.shares.toString().padStart(7)}|` +
        `${formatPrice(entry.costPrice).padStart(8)}|` +
        `${formatPrice(currentPrice).padStart(8)}|` +
        `${formatLargeNumber(marketValue).padStart(10)}|` +
        `${(profit >= 0 ? '+' : '') + profit.toFixed(2).padStart(10)}|` +
        `${formatPercent(profitPercent).padStart(7)}`
      )
    } catch {
      lines.push(
        `${entry.code.padEnd(8)}|` +
        `${entry.name.padEnd(9)}|` +
        `${entry.shares.toString().padStart(7)}|` +
        `${formatPrice(entry.costPrice).padStart(8)}|` +
        `${'--'.padStart(8)}|` +
        `${'--'.padStart(10)}|` +
        `${'--'.padStart(10)}|` +
        `${'--'.padStart(7)}`
      )
    }
  }

  const totalProfit = totalValue - totalCost
  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

  lines.push('─'.repeat(80))
  lines.push(`合计: 成本 ${formatLargeNumber(totalCost)} | 市值 ${formatLargeNumber(totalValue)} | 盈亏 ${(totalProfit >= 0 ? '+' : '') + formatLargeNumber(totalProfit)} | ${formatPercent(totalProfitPercent)}`)

  return lines.join('\n')
}

/**
 * 查看资产配置
 */
export async function viewAllocation(): Promise<string> {
  const portfolio = loadPortfolio()

  if (portfolio.entries.length === 0) {
    return '📊 投资组合为空'
  }

  const lines: string[] = []
  lines.push('📊 资产配置')
  lines.push('═'.repeat(40))

  let totalValue = 0
  const values: Array<{ code: string; name: string; value: number }> = []

  for (const entry of portfolio.entries) {
    try {
      const quote = await getRealtimeQuote(entry.code)
      const value = quote.price * entry.shares
      totalValue += value
      values.push({ code: entry.code, name: quote.name, value })
    } catch {
      values.push({ code: entry.code, name: entry.name, value: entry.costPrice * entry.shares })
      totalValue += entry.costPrice * entry.shares
    }
  }

  // 按市值排序
  values.sort((a, b) => b.value - a.value)

  for (const v of values) {
    const percent = totalValue > 0 ? (v.value / totalValue) * 100 : 0
    const barLength = Math.round(percent / 2)
    const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength)
    lines.push(`${v.code} ${v.name.padEnd(8)} ${bar} ${percent.toFixed(1)}% (${formatLargeNumber(v.value)})`)
  }

  return lines.join('\n')
}

/**
 * 查看盈亏历史
 */
export async function viewProfitHistory(): Promise<string> {
  const portfolio = loadPortfolio()

  if (portfolio.entries.length === 0) {
    return '📊 投资组合为空'
  }

  const lines: string[] = []
  lines.push('📊 盈亏明细')
  lines.push('═'.repeat(50))

  for (const entry of portfolio.entries) {
    try {
      const quote = await getRealtimeQuote(entry.code)
      const profit = (quote.price - entry.costPrice) * entry.shares
      const profitPercent = ((quote.price - entry.costPrice) / entry.costPrice) * 100

      lines.push(`${entry.name} (${entry.code}): ${(profit >= 0 ? '+' : '')}${profit.toFixed(2)}元 (${formatPercent(profitPercent)})`)
    } catch {
      lines.push(`${entry.name} (${entry.code}): 无法获取行情`)
    }
  }

  return lines.join('\n')
}

/**
 * 更新持仓成本
 * @param code 股票代码
 * @param newCost 新成本价
 */
export function updateCost(code: string, newCost: number): string {
  const portfolio = loadPortfolio()
  const entry = portfolio.entries.find(e => e.code === code)

  if (!entry) {
    return `⚠️ 未持有 ${code}`
  }

  entry.costPrice = newCost
  if (savePortfolio(portfolio)) {
    return `✅ 已更新 ${code} 成本价为 ${newCost.toFixed(2)}`
  }
  return `❌ 更新失败`
}

/**
 * 清空投资组合
 */
export function clearPortfolio(): string {
  const portfolio: Portfolio = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    totalCost: 0,
    totalValue: 0,
    totalProfit: 0,
    totalProfitPercent: 0,
    entries: [],
  }

  if (savePortfolio(portfolio)) {
    return '✅ 已清空投资组合'
  }
  return `❌ 清空失败`
}
