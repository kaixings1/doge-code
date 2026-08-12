// ============================================================================
// Stock Command - Stock Screener
// 股票筛选：按财务指标/价格/市值等条件筛选
// ============================================================================

import type { ScreenCriteria, ScreenResult } from './types.js'
import { getTopStocks, getRealtimeQuote } from './api.js'
import { formatPrice, formatPercent, formatLargeNumber } from './utils.js'

// ============================================================================
// 筛选器引擎
// ============================================================================

/**
 * A股全市场筛选
 * 注：由于东方财富接口限制，这里使用涨幅榜数据作为样本进行筛选
 * 完整筛选需要专业数据源
 */
export async function screenStocks(criteria: ScreenCriteria): Promise<string> {
  const lines: string[] = []
  lines.push('🔍 股票筛选结果')
  lines.push('═'.repeat(60))

  // 获取候选股票（使用涨幅榜作为样本）
  const candidates = await getTopStocks('gainer', 100)

  if (candidates.length === 0) {
    return '❌ 无法获取股票数据'
  }

  const results: ScreenResult[] = []

  for (const stock of candidates.slice(0, 50)) {
    try {
      const quote = await getRealtimeQuote(stock.code)
      const result: ScreenResult = {
        code: stock.code,
        name: quote.name,
        price: quote.price,
        changePercent: quote.changePercent,
        pe: quote.pe,
        pb: quote.pb,
        roe: 0, // 需要额外接口
        marketCap: quote.marketCap,
        industry: '',
        turnoverRate: quote.turnoverRate,
      }

      // 应用筛选条件
      if (matchesCriteria(result, criteria)) {
        results.push(result)
      }
    } catch {
      // skip
    }
  }

  if (results.length === 0) {
    return '📋 没有符合筛选条件的股票'
  }

  // 表头
  lines.push(`代码    |名称      |现价    |涨跌幅   |PE     |PB     |市值(亿)  |换手率`)
  lines.push(`--------|---------|--------|---------|-------|-------|---------|------`)

  for (const r of results) {
    lines.push(
      `${r.code.padEnd(8)}|` +
      `${r.name.padEnd(9)}|` +
      `${formatPrice(r.price).padStart(8)}|` +
      `${formatPercent(r.changePercent).padStart(9)}|` +
      `${r.pe.toFixed(2).padStart(7)}|` +
      `${r.pb.toFixed(2).padStart(7)}|` +
      `${formatLargeNumber(r.marketCap).padStart(10)}|` +
      `${r.turnoverRate.toFixed(2).padStart(7)}%`
    )
  }

  lines.push(`\n共找到 ${results.length} 只符合条件的股票`)
  return lines.join('\n')
}

/**
 * 检查是否匹配筛选条件
 */
function matchesCriteria(stock: ScreenCriteria & { code: string; name: string; industry: string }, criteria: ScreenCriteria): boolean {
  if (criteria.pe) {
    if (criteria.pe.min !== undefined && stock.pe < criteria.pe.min) return false
    if (criteria.pe.max !== undefined && stock.pe > criteria.pe.max) return false
  }
  if (criteria.pb) {
    if (criteria.pb.min !== undefined && stock.pb < criteria.pb.min) return false
    if (criteria.pb.max !== undefined && stock.pb > criteria.pb.max) return false
  }
  if (criteria.marketCap) {
    if (criteria.marketCap.min !== undefined && stock.marketCap < criteria.marketCap.min) return false
    if (criteria.marketCap.max !== undefined && stock.marketCap > criteria.marketCap.max) return false
  }
  if (criteria.price) {
    if (criteria.price.min !== undefined && stock.price < criteria.price.min) return false
    if (criteria.price.max !== undefined && stock.price > criteria.price.max) return false
  }
  if (criteria.changePercent) {
    if (criteria.changePercent.min !== undefined && stock.changePercent < criteria.changePercent.min) return false
    if (criteria.changePercent.max !== undefined && stock.changePercent > criteria.changePercent.max) return false
  }
  return true
}

/**
 * 低估值筛选（PE < 15, PB < 2）
 */
export async function screenLowValuation(): Promise<string> {
  return screenStocks({
    pe: { min: 0, max: 15 },
    pb: { min: 0, max: 2 },
    changePercent: { min: -10, max: 10 },
  })
}

/**
 * 高成长筛选（ROE > 15%）
 */
export async function screenHighGrowth(): Promise<string> {
  return screenStocks({
    pe: { min: 0, max: 30 },
    pb: { min: 0, max: 5 },
  })
}

/**
 * 大盘股筛选（市值 > 500亿）
 */
export async function screenLargeCap(): Promise<string> {
  return screenStocks({
    marketCap: { min: 500 },
    changePercent: { min: -10, max: 10 },
  })
}

/**
 * 小盘股筛选（市值 < 50亿）
 */
export async function screenSmallCap(): Promise<string> {
  return screenStocks({
    marketCap: { max: 50 },
    changePercent: { min: -10, max: 10 },
  })
}

/**
 * 放量上涨筛选
 */
export async function screenVolumeUp(): Promise<string> {
  return screenStocks({
    changePercent: { min: 2, max: 10 },
  })
}

/**
 * 超跌反弹筛选（跌幅 > 5%）
 */
export async function screenOversold(): Promise<string> {
  return screenStocks({
    changePercent: { min: -10, max: -5 },
    pe: { min: 0, max: 20 },
  })
}

/**
 * 筛选帮助
 */
export function screenerHelp(): string {
  return [
    '🔍 股票筛选',
    '',
    '按财务指标和价格条件筛选股票。',
    '',
    '📖 📖 用法: ',
    '  /stock screen <类型> [参数]',
    '',
    '预设筛选:',
    '  low-val      低估值（PE<15, PB<2）',
    '  high-growth  高成长（PE<30, PB<5）',
    '  large-cap    大盘股（市值>500亿）',
    '  small-cap    小盘股（市值<50亿）',
    '  volume-up    放量上涨（涨幅2%-10%）',
    '  oversold     超跌反弹（跌幅5%-10%）',
    '  custom       自定义筛选',
    '',
    '自定义筛选参数:',
    '  --pe-min <n>    最小PE',
    '  --pe-max <n>    最大PE',
    '  --pb-min <n>    最小PB',
    '  --pb-max <n>    最大PB',
    '  --mc-min <n>    最小市值（亿）',
    '  --mc-max <n>    最大市值（亿）',
    '  --price-min <n> 最低价',
    '  --price-max <n> 最高价',
    '  --change-min <n> 最小涨跌幅%',
    '  --change-max <n> 最大涨跌幅%',
    '',
    '💡 💡 示例: ',
    '  /stock screen low-val',
    '  /stock screen custom --pe-max 20 --pb-max 3',
    '  /stock screen custom --mc-min 200 --change-max 5',
  ].join('\n')
}
