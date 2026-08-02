// ============================================================================
// Stock Command - Type Definitions
// ============================================================================

/** 股票行情数据 */
export interface StockQuote {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  prevClose: number
  volume: number
  amount: number
  turnoverRate: number
  pe: number
  pb: number
  marketCap: number
  totalShares: float
  floatShares: float
  high52w: number
  low52w: number
  amplitude: number
  volumeRatio: number
  timestamp: string
}

/** K线数据点 */
export interface KLinePoint {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount: number
  changePercent: number
  turnoverRate: number
}

/** 技术指标 */
export interface TechnicalIndicators {
  ma5: number[]
  ma10: number[]
  ma20: number[]
  ma60: number[]
  macd: { dif: number[]; dea: number[]; histogram: number[] }
  rsi6: number[]
  rsi12: number[]
  rsi24: number[]
  kdj: { k: number[]; d: number[]; j: number[] }
  bollinger: { upper: number[]; middle: number[]; lower: number[] }
  volumeMA5: number[]
  volumeMA10: number[]
}

/** 股票筛选条件 */
export interface ScreenCriteria {
  pe?: { min?: number; max?: number }
  pb?: { min?: number; max?: number }
  roe?: { min?: number; max?: number }
  marketCap?: { min?: number; max?: number }
  price?: { min?: number; max?: number }
  changePercent?: { min?: number; max?: number }
  turnoverRate?: { min?: number; max?: number }
  volumeRatio?: { min?: number; max?: number }
  industry?: string[]
}

/** 股票筛选结果 */
export interface ScreenResult {
  code: string
  name: string
  price: number
  changePercent: number
  pe: number
  pb: number
  roe: number
  marketCap: number
  industry: string
  turnoverRate: number
}

/** 自选股条目 */
export interface WatchlistEntry {
  code: string
  name: string
  group: string
  addedAt: string
  note: string
  alertAbove?: number
  alertBelow?: number
  costPrice?: number
  shares?: number
}

/** 自选股列表 */
export interface Watchlist {
  version: string
  updatedAt: string
  groups: string[]
  entries: WatchlistEntry[]
}

/** 持仓条目 */
export interface PortfolioEntry {
  code: string
  name: string
  shares: number
  costPrice: number
  currentPrice: number
  marketValue: number
  profit: number
  profitPercent: number
  addedAt: string
}

/** 投资组合 */
export interface Portfolio {
  version: string
  updatedAt: string
  totalCost: number
  totalValue: number
  totalProfit: number
  totalProfitPercent: number
  entries: PortfolioEntry[]
}

/** 价格提醒 */
export interface PriceAlert {
  id: string
  code: string
  name: string
  type: 'above' | 'below' | 'change_up' | 'change_down'
  targetPrice: number
  targetPercent: number
  triggered: boolean
  triggeredAt?: string
  createdAt: string
  note: string
}

/** 价格提醒列表 */
export interface AlertList {
  version: string
  updatedAt: string
  alerts: PriceAlert[]
}

/** 市场概览 */
export interface MarketOverview {
  indices: IndexInfo[]
  sectors: SectorInfo[]
  topGainers: StockBrief[]
  topLosers: StockBrief[]
  topVolume: StockBrief[]
  topAmount: StockBrief[]
}

/** 指数信息 */
export interface IndexInfo {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
}

/** 板块信息 */
export interface SectorInfo {
  name: string
  changePercent: number
  leader: string
  leaderPrice: number
  leaderChange: number
  stockCount: number
  upCount: number
  downCount: number
}

/** 股票简要信息 */
export interface StockBrief {
  code: string
  name: string
  price: number
  changePercent: number
  volume: number
  amount: number
}

/** 资金流向 */
export interface FundFlow {
  code: string
  name: string
  mainInflow: number
  mainOutflow: number
  mainNetInflow: number
  retailInflow: number
  retailOutflow: number
  retailNetInflow: number
  date: string
}

/** 分红信息 */
export interface DividendInfo {
  code: string
  name: string
  year: number
  plan: string
  cashPerShare: number
  stockPerShare: number
  reservePerShare: number
  exDividendDate: string
  recordDate: string
  paymentDate: string
  dividendYield: number
}

/** 新闻/公告 */
export interface StockNews {
  title: string
  source: string
  time: string
  url: string
  summary: string
  type: 'news' | 'announcement' | 'research'
}

/** 行业对比 */
export interface IndustryComparison {
  industry: string
  avgPE: number
  avgPB: number
  avgROE: number
  avgChangePercent: number
  stockCount: number
  leader: string
  stocks: StockBrief[]
}

/** K线周期类型 */
export type KLinePeriod = 'daily' | 'weekly' | 'monthly' | '5min' | '15min' | '30min' | '60min'

/** 图表类型 */
export type ChartType = 'line' | 'candlestick' | 'volume' | 'comparison'

/** 股票搜索模式 */
export interface SearchConfig {
  query: string
  type: 'code' | 'name' | 'pinyin'
  market: 'all' | 'sh' | 'sz' | 'bj' | 'hk' | 'us'
}

/** 历史数据请求 */
export interface HistoryRequest {
  code: string
  period: KLinePeriod
  startDate?: string
  endDate?: string
  count: number
  fq: 'pre' | 'post' | 'none'
}
