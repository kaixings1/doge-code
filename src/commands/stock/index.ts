// ============================================================================
// Stock Command - Main Entry Point
// 股票行情/财务数据/技术分析/自选股/投资组合/筛选/图表/提醒
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

// Import all modules
import { getRealtimeQuote, getBatchQuotes, getCompanyOverview, getFinanceData, getKLineData, getFundFlow, getDividendHistory, getStockNews, getIndexQuotes, getSectorRanking, getTopStocks, searchStock, getIndustryComparison, getIncomeStatement, getBalanceSheet, getCashFlow, getFullAnalysis } from './api.js'
import { performTechnicalAnalysis, calculateAllIndicators } from './indicators.js'
import { addToWatchlist, removeFromWatchlist, listWatchlist, listGroups, createGroup, deleteGroup, moveToGroup, updateNote, clearWatchlist, exportWatchlist, setPriceAlert as setWatchlistPriceAlert, getWatchlistAlerts } from './watchlist.js'
import { addHolding, removeHolding, viewPortfolio, viewAllocation, viewProfitHistory, updateCost, clearPortfolio } from './portfolio.js'
import { screenStocks, screenLowValuation, screenHighGrowth, screenLargeCap, screenSmallCap, screenVolumeUp, screenOversold, screenerHelp } from './screener.js'
import { generateLineChart, generateCandlestickChart, generateVolumeChart, generateComparisonChart, generateComprehensiveChart, exportChartAsHTML } from './charts.js'
import { addAlert, removeAlert, listAlerts, listTriggeredAlerts, checkAlerts, checkAllAlerts, clearTriggeredAlerts, clearAllAlerts, getAlertDetail } from './alerts.js'
import { formatPrice, formatPercent, formatLargeNumber, formatDateTime, getChangeArrow, getChangeColor, RESET_COLOR, BOLD, DIM } from './utils.js'

// ============================================================================
// Command Router
// ============================================================================

type StockAction = 'quote' | 'batch' | 'finance' | 'overview' | 'history' | 'indicators' | 'analysis' | 'watchlist' | 'portfolio' | 'screen' | 'chart' | 'alert' | 'search' | 'market' | 'news' | 'fund' | 'dividend' | 'industry' | 'income' | 'balance' | 'cashflow'

interface ParsedArgs {
  action: StockAction
  code: string
  subAction: string
  extra: Record<string, string>
}

function parseArgs(args: string): ParsedArgs {
  const parts = args.trim().split(/\s+/)
  const result: ParsedArgs = {
    action: 'quote',
    code: '',
    subAction: '',
    extra: {},
  }

  if (parts.length === 0 || parts[0] === '') {
    result.action = 'market'
    return result
  }

  // Determine action
  const first = parts[0].toLowerCase()
  const actions: StockAction[] = ['quote', 'batch', 'finance', 'overview', 'history', 'indicators', 'analysis', 'watchlist', 'portfolio', 'screen', 'chart', 'alert', 'search', 'market', 'news', 'fund', 'dividend', 'industry', 'income', 'balance', 'cashflow']

  if (actions.includes(first as StockAction)) {
    result.action = first as StockAction
    result.code = parts[1] || ''
    result.subAction = parts[2] || ''
  } else {
    // Treat as stock code
    result.action = 'quote'
    result.code = first
    result.subAction = parts[1] || ''
  }

  // Parse extra flags
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const key = parts[i].slice(2)
      const value = parts[i + 1] && !parts[i + 1].startsWith('--') ? parts[i + 1] : 'true'
      result.extra[key] = value
      i++
    }
  }

  return result
}

// ============================================================================
// Main Call Function
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parsed = parseArgs(args || '')
  const { action, code, subAction, extra } = parsed

  try {
    switch (action) {
      case 'quote':
        return await handleQuote(code, subAction)
      case 'batch':
        return await handleBatch(code)
      case 'finance':
        return await handleFinance(code)
      case 'overview':
        return await handleOverview(code)
      case 'history':
        return await handleHistory(code, subAction, extra)
      case 'indicators':
        return await handleIndicators(code)
      case 'analysis':
        return await handleAnalysis(code)
      case 'watchlist':
        return await handleWatchlist(subAction, code, extra)
      case 'portfolio':
        return await handlePortfolio(subAction, code, extra)
      case 'screen':
        return await handleScreen(subAction, extra)
      case 'chart':
        return await handleChart(code, subAction, extra)
      case 'alert':
        return await handleAlert(subAction, code, extra)
      case 'search':
        return await handleSearch(code)
      case 'market':
        return await handleMarket()
      case 'news':
        return await handleNews(code)
      case 'fund':
        return await handleFund(code)
      case 'dividend':
        return await handleDividend(code)
      case 'industry':
        return await handleIndustry(code)
      case 'income':
        return await handleIncome(code)
      case 'balance':
        return await handleBalance(code)
      case 'cashflow':
        return await handleCashflow(code)
      default:
        return { type: 'text', value: renderHelp() }
    }
  } catch (err) {
    return { type: 'text', value: `❌ 错误: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ============================================================================
// Handlers
// ============================================================================

async function handleQuote(code: string, type: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  if (type === 'finance') return await handleFinance(code)
  if (type === 'overview') return await handleOverview(code)

  const quote = await getRealtimeQuote(code)
  const lines: string[] = []
  lines.push(`${quote.name} (${quote.code}) ${getChangeArrow(quote.change)}`)
  lines.push(`现价: ${formatPrice(quote.price)} | 涨跌: ${formatPrice(quote.change)} (${formatPercent(quote.changePercent)})`)
  lines.push(`今开: ${formatPrice(quote.open)} | 最高: ${formatPrice(quote.high)} | 最低: ${formatPrice(quote.low)} | 昨收: ${formatPrice(quote.prevClose)}`)
  lines.push(`成交量: ${formatLargeNumber(quote.volume * 10000)}手 | 成交额: ${formatLargeNumber(quote.amount * 100000000)}`)
  lines.push(`换手率: ${quote.turnoverRate.toFixed(2)}% | 量比: ${quote.volumeRatio.toFixed(2)}`)
  lines.push(`PE: ${quote.pe.toFixed(2)} | PB: ${quote.pb.toFixed(2)} | 市值: ${formatLargeNumber(quote.marketCap * 100000000)}`)
  return { type: 'text', value: lines.join('\n') }
}

async function handleBatch(codesStr: string) {
  if (!codesStr) return { type: 'text', value: '❌ 请提供股票代码（逗号分隔）' }
  const codes = codesStr.split(',').map(c => c.trim()).filter(Boolean)
  const quotes = await getBatchQuotes(codes)

  const lines: string[] = ['📊 批量行情:']
  for (const q of quotes) {
    lines.push(`${q.code} ${q.name.padEnd(8)} ${formatPrice(q.price).padStart(8)} ${formatPercent(q.changePercent).padStart(9)}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

async function handleFinance(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getFinanceData(code)
  return { type: 'text', value: result }
}

async function handleOverview(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getCompanyOverview(code)
  return { type: 'text', value: result }
}

async function handleHistory(code: string, period: string, extra: Record<string, string>) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const count = extra.count ? parseInt(extra.count) : 30
  const kline = await getKLineData(code, (period || 'daily') as any, count)

  if (kline.length === 0) return { type: 'text', value: '❌ 无K线数据' }

  const lines: string[] = [`📈 ${code} K线数据 (${kline.length} 条):`]
  lines.push(`日期      |开盘    |收盘    |最高    |最低    |涨跌幅   |成交量`)
  lines.push(`----------|--------|--------|--------|--------|--------|--------`)

  for (const k of kline.slice(-20)) {
    lines.push(`${k.date}|${formatPrice(k.open).padStart(8)}|${formatPrice(k.close).padStart(8)}|${formatPrice(k.high).padStart(8)}|${formatPrice(k.low).padStart(8)}|${formatPercent(k.changePercent).padStart(8)}|${formatLargeNumber(k.volume).padStart(8)}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

async function handleIndicators(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const kline = await getKLineData(code, 'daily', 120)
  const result = performTechnicalAnalysis(kline)
  return { type: 'text', value: result }
}

async function handleAnalysis(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getFullAnalysis(code)
  return { type: 'text', value: result }
}

async function handleWatchlist(subAction: string, code: string, extra: Record<string, string>) {
  switch (subAction) {
    case 'add':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      return { type: 'text', value: await addToWatchlist(code, extra.group || '默认', extra.note || '') }
    case 'remove':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      return { type: 'text', value: await removeFromWatchlist(code) }
    case 'list':
      return { type: 'text', value: await listWatchlist(code || undefined) }
    case 'groups':
      return { type: 'text', value: listGroups() }
    case 'group-create':
      if (!code) return { type: 'text', value: '❌ 请提供分组名称' }
      return { type: 'text', value: createGroup(code) }
    case 'group-delete':
      if (!code) return { type: 'text', value: '❌ 请提供分组名称' }
      return { type: 'text', value: deleteGroup(code) }
    case 'move':
      return { type: 'text', value: moveToGroup(code, extra.to || '默认') }
    case 'note':
      return { type: 'text', value: updateNote(code, extra.text || '') }
    case 'clear':
      return { type: 'text', value: clearWatchlist() }
    case 'export':
      return { type: 'text', value: exportWatchlist(code || 'table') }
    case 'alert':
      return { type: 'text', value: setWatchlistPriceAlert(code, extra.above ? parseFloat(extra.above) : undefined, extra.below ? parseFloat(extra.below) : undefined) }
    case 'alerts':
      return { type: 'text', value: getWatchlistAlerts(code) }
    default:
      return { type: 'text', value: await listWatchlist() }
  }
}

async function handlePortfolio(subAction: string, code: string, extra: Record<string, string>) {
  switch (subAction) {
    case 'add':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      const shares = extra.shares ? parseFloat(extra.shares) : 0
      const cost = extra.cost ? parseFloat(extra.cost) : 0
      if (shares <= 0 || cost <= 0) return { type: 'text', value: '❌ 请提供有效的股数和成本价（--shares <股数> --cost <成本价>）' }
      return { type: 'text', value: await addHolding(code, shares, cost) }
    case 'remove':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      const sellShares = extra.shares ? parseFloat(extra.shares) : undefined
      const sellPrice = extra.price ? parseFloat(extra.price) : undefined
      return { type: 'text', value: await removeHolding(code, sellShares, sellPrice) }
    case 'view':
      return { type: 'text', value: await viewPortfolio() }
    case 'allocation':
      return { type: 'text', value: await viewAllocation() }
    case 'profit':
      return { type: 'text', value: await viewProfitHistory() }
    case 'update-cost':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      const newCost = extra.cost ? parseFloat(extra.cost) : 0
      return { type: 'text', value: updateCost(code, newCost) }
    case 'clear':
      return { type: 'text', value: clearPortfolio() }
    default:
      return { type: 'text', value: await viewPortfolio() }
  }
}

async function handleScreen(subAction: string, extra: Record<string, string>) {
  switch (subAction) {
    case 'low-val':
      return { type: 'text', value: await screenLowValuation() }
    case 'high-growth':
      return { type: 'text', value: await screenHighGrowth() }
    case 'large-cap':
      return { type: 'text', value: await screenLargeCap() }
    case 'small-cap':
      return { type: 'text', value: await screenSmallCap() }
    case 'volume-up':
      return { type: 'text', value: await screenVolumeUp() }
    case 'oversold':
      return { type: 'text', value: await screenOversold() }
    case 'custom': {
      const criteria: any = {}
      if (extra['pe-min'] || extra['pe-max']) criteria.pe = { min: extra['pe-min'] ? parseFloat(extra['pe-min']) : undefined, max: extra['pe-max'] ? parseFloat(extra['pe-max']) : undefined }
      if (extra['pb-min'] || extra['pb-max']) criteria.pb = { min: extra['pb-min'] ? parseFloat(extra['pb-min']) : undefined, max: extra['pb-max'] ? parseFloat(extra['pb-max']) : undefined }
      if (extra['mc-min'] || extra['mc-max']) criteria.marketCap = { min: extra['mc-min'] ? parseFloat(extra['mc-min']) : undefined, max: extra['mc-max'] ? parseFloat(extra['mc-max']) : undefined }
      if (extra['price-min'] || extra['price-max']) criteria.price = { min: extra['price-min'] ? parseFloat(extra['price-min']) : undefined, max: extra['price-max'] ? parseFloat(extra['price-max']) : undefined }
      if (extra['change-min'] || extra['change-max']) criteria.changePercent = { min: extra['change-min'] ? parseFloat(extra['change-min']) : undefined, max: extra['change-max'] ? parseFloat(extra['change-max']) : undefined }
      return { type: 'text', value: await screenStocks(criteria) }
    }
    case 'help':
      return { type: 'text', value: screenerHelp() }
    default:
      return { type: 'text', value: screenerHelp() }
  }
}

async function handleChart(code: string, subAction: string, extra: Record<string, string>) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const period = (extra.period || 'daily') as any
  const count = extra.count ? parseInt(extra.count) : 60

  const kline = await getKLineData(code, period, count)
  if (kline.length === 0) return { type: 'text', value: '❌ 无K线数据' }

  switch (subAction) {
    case 'line':
      return { type: 'text', value: generateLineChart(kline, 80, 20) }
    case 'candlestick':
      return { type: 'text', value: generateCandlestickChart(kline, 80, 20) }
    case 'volume':
      return { type: 'text', value: generateVolumeChart(kline, 80, 10) }
    case 'full':
      return { type: 'text', value: await generateComprehensiveChart(code, { period, count }) }
    default:
      return { type: 'text', value: generateCandlestickChart(kline, 80, 20) }
  }
}

async function handleAlert(subAction: string, code: string, extra: Record<string, string>) {
  switch (subAction) {
    case 'add':
      if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
      const type = (extra.type || 'above') as any
      const target = extra.target ? parseFloat(extra.target) : 0
      if (target <= 0) return { type: 'text', value: '❌ 请提供有效的目标价格' }
      return { type: 'text', value: await addAlert(code, type, target, extra.note || '') }
    case 'remove':
      if (!code) return { type: 'text', value: '❌ 请提供提醒ID' }
      return { type: 'text', value: removeAlert(code) }
    case 'list':
      return { type: 'text', value: listAlerts() }
    case 'triggered':
      return { type: 'text', value: listTriggeredAlerts() }
    case 'check':
      if (code) return { type: 'text', value: await checkAlerts(code) }
      return { type: 'text', value: await checkAllAlerts() }
    case 'clear':
      return { type: 'text', value: clearTriggeredAlerts() }
    case 'clear-all':
      return { type: 'text', value: clearAllAlerts() }
    case 'detail':
      if (!code) return { type: 'text', value: '❌ 请提供提醒ID' }
      return { type: 'text', value: getAlertDetail(code) }
    default:
      return { type: 'text', value: listAlerts() }
  }
}

async function handleSearch(keyword: string) {
  if (!keyword) return { type: 'text', value: '❌ 请提供搜索关键词' }
  const results = await searchStock(keyword)

  if (results.length === 0) return { type: 'text', value: `🔍 未找到 "${keyword}" 相关的股票` }

  const lines: string[] = [`🔍 搜索结果: "${keyword}"`]
  for (const r of results) {
    lines.push(`  ${r.code} ${r.name} ${formatPrice(r.price)} ${formatPercent(r.changePercent)}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

async function handleMarket() {
  const indices = await getIndexQuotes()
  const gainers = await getTopStocks('gainer', 5)
  const losers = await getTopStocks('loser', 5)

  const lines: string[] = []
  lines.push('📊 市场概览')
  lines.push('═'.repeat(40))
  lines.push('')
  lines.push('--- 主要指数 ---')
  for (const idx of indices) {
    lines.push(`  ${idx.name.padEnd(8)} ${formatPrice(idx.price).padStart(10)} ${formatPercent(idx.changePercent).padStart(9)}`)
  }
  lines.push('')
  lines.push('--- 涨幅榜 TOP5 ---')
  for (const s of gainers) {
    lines.push(`  ${s.code} ${s.name.padEnd(8)} ${formatPrice(s.price).padStart(8)} ${formatPercent(s.changePercent).padStart(9)}`)
  }
  lines.push('')
  lines.push('--- 跌幅榜 TOP5 ---')
  for (const s of losers) {
    lines.push(`  ${s.code} ${s.name.padEnd(8)} ${formatPrice(s.price).padStart(8)} ${formatPercent(s.changePercent).padStart(9)}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

async function handleNews(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const news = await getStockNews(code, 10)

  if (news.length === 0) return { type: 'text', value: `📰 ${code} 暂无新闻/公告` }

  const lines: string[] = [`📰 ${code} 最新公告 (${news.length} 条):`]
  for (const n of news.slice(0, 10)) {
    lines.push(`  • ${n.title}`)
    lines.push(`    ${n.time} | ${n.source}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

async function handleFund(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const flow = await getFundFlow(code)

  const lines: string[] = []
  lines.push(`💰 ${code} 资金流向`)
  lines.push(`日期: ${flow.date}`)
  lines.push(`主力流入: ${flow.mainInflow.toFixed(2)}亿`)
  lines.push(`主力流出: ${flow.mainOutflow.toFixed(2)}亿`)
  lines.push(`主力净流入: ${(flow.mainNetInflow >= 0 ? '+' : '') + flow.mainNetInflow.toFixed(2)}亿`)
  lines.push(`散户流入: ${flow.retailInflow.toFixed(2)}亿`)
  lines.push(`散户流出: ${flow.retailOutflow.toFixed(2)}亿`)
  lines.push(`散户净流入: ${(flow.retailNetInflow >= 0 ? '+' : '') + flow.retailNetInflow.toFixed(2)}亿`)

  return { type: 'text', value: lines.join('\n') }
}

async function handleDividend(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const dividends = await getDividendHistory(code)

  if (dividends.length === 0) return { type: 'text', value: `📋 ${code} 暂无分红记录` }

  const lines: string[] = [`📋 ${code} 分红历史:`]
  for (const d of dividends) {
    lines.push(`  ${d.year}: 每股派 ${d.cashPerShare.toFixed(4)}元 | 送股 ${d.stockPerShare} | 转增 ${d.reservePerShare} | ${d.plan}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

async function handleIndustry(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getIndustryComparison(code)
  const lines: string[] = [`🏭 ${code} 行业对比:`, `行业: ${result.industry}`, `行业平均PE: ${result.avgPE.toFixed(2)}`, `行业平均PB: ${result.avgPB.toFixed(2)}`]
  return { type: 'text', value: lines.join('\n') }
}

async function handleIncome(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getIncomeStatement(code)
  return { type: 'text', value: result }
}

async function handleBalance(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getBalanceSheet(code)
  return { type: 'text', value: result }
}

async function handleCashflow(code: string) {
  if (!code) return { type: 'text', value: '❌ 请提供股票代码' }
  const result = await getCashFlow(code)
  return { type: 'text', value: result }
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📈 股票行情与综合分析',
    '',
    '提供A股实时行情、技术分析、自选股管理、投资组合跟踪等功能。',
    '',
    '📖 用法: ',
    '  /stock <代码> [类型]          查看股票信息',
    '  /stock <命令> [参数]          执行管理操作',
    '',
    '⌨️ ⌨️ 查询命令: ',
    '  <代码>                       实时行情（默认）',
    '  <代码> finance               财务指标',
    '  <code> overview              公司概况',
    '  <code> history [period]      K线数据 (daily/weekly/monthly)',
    '  <code> indicators            技术分析 (MA/MACD/RSI/KDJ/BOLL)',
    '  <code> analysis              综合分析',
    '  <code> income               利润表',
    '  <code> balance              资产负债表',
    '  <code> cashflow             现金流量表',
    '  <code> fund                 资金流向',
    '  <code> dividend             分红历史',
    '  <code> news                 新闻公告',
    '  <code> industry             行业对比',
    '  batch <代码1,代码2,...>      批量行情',
    '',
    '自选股管理:',
    '  watchlist add <代码> [--group <分组>] [--note <备注>]',
    '  watchlist remove <代码>',
    '  watchlist list [分组]',
    '  watchlist groups',
    '  watchlist group-create <名称>',
    '  watchlist group-delete <名称>',
    '  watchlist move <代码> --to <分组>',
    '  watchlist note <代码> --text <备注>',
    '  watchlist alert <代码> --above <价格> --below <价格>',
    '  watchlist clear',
    '  watchlist export [json|csv|table]',
    '',
    '投资组合:',
    '  portfolio add <代码> --shares <股数> --cost <成本价>',
    '  portfolio remove <代码> [--shares <股数>] [--price <卖出价>]',
    '  portfolio view               查看持仓',
    '  portfolio allocation         资产配置',
    '  portfolio profit             盈亏明细',
    '  portfolio update-cost <代码> --cost <新成本价>',
    '  portfolio clear              清空组合',
    '',
    '股票筛选:',
    '  screen low-val      低估值（PE<15, PB<2）',
    '  screen high-growth  高成长（PE<30, PB<5）',
    '  screen large-cap    大盘股（市值>500亿）',
    '  screen small-cap    小盘股（市值<50亿）',
    '  screen volume-up    放量上涨',
    '  screen oversold     超跌反弹',
    '  screen custom       自定义筛选',
    '📖 用法:   screen help         筛选帮助',
    '',
    '图表:',
    '  chart <代码> line            折线图',
    '  chart <代码> candlestick     K线图',
    '  chart <代码> volume          成交量图',
    '  chart <代码> full            综合图表',
    '  (可选: --period daily/weekly/monthly --count <条数>)',
    '',
    '价格提醒:',
    '  alert add <代码> --type <above|below|change_up|change_down> --target <价格>',
    '  alert remove <ID>',
    '  alert list                   列出提醒',
    '  alert triggered              已触发提醒',
    '  alert check [代码]           检查提醒',
    '  alert clear                  清除已触发',
    '  alert detail <ID>            提醒详情',
    '',
    '其他:',
    '  search <关键词>              搜索股票',
    '  market                       市场概览',
    '',
    '💡 示例: ',
    '  /stock 600519                         查看贵州茅台行情',
    '  /stock 000001 finance                 查看平安银行财务',
    '  /stock 300750 indicators              宁德时代技术分析',
    '  /stock watchlist add 600519 --group 白酒',
    '  /stock portfolio add 600519 --shares 100 --cost 1500',
    '  /stock screen low-val                 低估值筛选',
    '  /stock chart 600519 candlestick       茅台K线图',
    '  /stock alert add 600519 --type above --target 2000',
    '  /stock market                          市场概览',
  ].join('\n')
}

// ============================================================================
// Command Definition
// ============================================================================

const stockCommand: Command = {
  type: 'local-jsx' as const,
  name: 'stock',
  description: '股票行情 - 实时行情/技术分析/自选股/投资组合/筛选/图表/提醒',
  aliases: ['/stock', '/st', '/quotes'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default stockCommand
