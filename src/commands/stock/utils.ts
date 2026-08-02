// ============================================================================
// Stock Command - Utility Functions
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { StockQuote, KLinePoint, WatchlistEntry, PortfolioEntry, PriceAlert, AlertList, Watchlist, Portfolio } from './types.js'

// ============================================================================
// Formatting Utilities
// ============================================================================

/** Format number with thousand separators */
export function formatNumber(num: number, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return '--'
  return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Format large number with unit (万/亿) */
export function formatLargeNumber(num: number): string {
  if (num === null || num === undefined || isNaN(num)) return '--'
  const abs = Math.abs(num)
  if (abs >= 1e8) return (num / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (num / 1e4).toFixed(2) + '万'
  return num.toFixed(2)
}

/** Format percentage */
export function formatPercent(num: number, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return '--'
  return (num >= 0 ? '+' : '') + num.toFixed(decimals) + '%'
}

/** Format price with color marker */
export function formatPrice(price: number): string {
  if (price === null || price === undefined || isNaN(price)) return '--'
  return price.toFixed(2)
}

/** Get price change direction arrow */
export function getChangeArrow(change: number): string {
  if (change > 0) return '▲'
  if (change < 0) return '▼'
  return '─'
}

/** Get price change color code */
export function getChangeColor(change: number): string {
  if (change > 0) return '\x1b[31m' // red for up in Chinese market
  if (change < 0) return '\x1b[32m' // green for down in Chinese market
  return '\x1b[37m'
}

/** Reset color code */
export const RESET_COLOR = '\x1b[0m'

/** Bold text */
export const BOLD = '\x1b[1m'

/** Dim text */
export const DIM = '\x1b[2m'

/** Format date string */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** Format datetime string */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Get current date string YYYYMMDD */
export function getTodayString(): string {
  const d = new Date()
  return d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0')
}

/** Get date string for N days ago */
export function getDaysAgoString(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0')
}

// ============================================================================
// Stock Code Utilities
// ============================================================================

/** Determine market prefix from stock code */
export function getMarketPrefix(code: string): string {
  if (code.startsWith('6')) return '1' // Shanghai
  if (code.startsWith('0') || code.startsWith('3')) return '0' // Shenzhen
  if (code.startsWith('8') || code.startsWith('4')) return '0' // Beijing
  if (code.startsWith('hk')) return '116' // Hong Kong
  return '0' // Default Shenzhen
}

/** Get secid for API calls */
export function getSecid(code: string): string {
  if (code.startsWith('6')) return '1.' + code
  if (code.startsWith('0') || code.startsWith('3')) return '0.' + code
  if (code.startsWith('8') || code.startsWith('4')) return '0.' + code
  return '0.' + code
}

/** Validate stock code format */
export function isValidStockCode(code: string): boolean {
  return /^\d{5,6}$/.test(code) || /^hk\d{4,5}$/.test(code)
}

/** Normalize stock code */
export function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/^(sh|sz|bj)/, '')
}

// ============================================================================
// Data Persistence
// ============================================================================

const DATA_DIR = join(process.cwd(), '.doge', 'stock')

function ensureDataDir(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    // ignore
  }
}

/** Get data file path */
export function getDataFile(filename: string): string {
  ensureDataDir()
  return join(DATA_DIR, filename)
}

/** Save JSON data to file */
export function saveData(filename: string, data: unknown): boolean {
  try {
    ensureDataDir()
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** Load JSON data from file */
export function loadData<T>(filename: string, defaultValue: T): T {
  try {
    const path = join(DATA_DIR, filename)
    if (!existsSync(path)) return defaultValue
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return defaultValue
  }
}

// ============================================================================
// Watchlist Persistence
// ============================================================================

const WATCHLIST_FILE = 'watchlist.json'

const defaultWatchlist: Watchlist = {
  version: '1.0',
  updatedAt: new Date().toISOString(),
  groups: ['默认'],
  entries: [],
}

/** Load watchlist */
export function loadWatchlist(): Watchlist {
  return loadData(WATCHLIST_FILE, defaultWatchlist)
}

/** Save watchlist */
export function saveWatchlist(watchlist: Watchlist): boolean {
  return saveData(WATCHLIST_FILE, watchlist)
}

/** Add entry to watchlist */
export function addToWatchlist(entry: WatchlistEntry): boolean {
  const wl = loadWatchlist()
  if (wl.entries.some(e => e.code === entry.code)) return false
  wl.entries.push(entry)
  wl.updatedAt = new Date().toISOString()
  return saveWatchlist(wl)
}

/** Remove entry from watchlist */
export function removeFromWatchlist(code: string): boolean {
  const wl = loadWatchlist()
  const idx = wl.entries.findIndex(e => e.code === code)
  if (idx === -1) return false
  wl.entries.splice(idx, 1)
  wl.updatedAt = new Date().toISOString()
  return saveWatchlist(wl)
}

// ============================================================================
// Portfolio Persistence
// ============================================================================

const PORTFOLIO_FILE = 'portfolio.json'

const defaultPortfolio: Portfolio = {
  version: '1.0',
  updatedAt: new Date().toISOString(),
  totalCost: 0,
  totalValue: 0,
  totalProfit: 0,
  totalProfitPercent: 0,
  entries: [],
}

/** Load portfolio */
export function loadPortfolio(): Portfolio {
  return loadData(PORTFOLIO_FILE, defaultPortfolio)
}

/** Save portfolio */
export function savePortfolio(portfolio: Portfolio): boolean {
  return saveData(PORTFOLIO_FILE, portfolio)
}

// ============================================================================
// Alert Persistence
// ============================================================================

const ALERT_FILE = 'alerts.json'

const defaultAlertList: AlertList = {
  version: '1.0',
  updatedAt: new Date().toISOString(),
  alerts: [],
}

/** Load alerts */
export function loadAlerts(): AlertList {
  return loadData(ALERT_FILE, defaultAlertList)
}

/** Save alerts */
export function saveAlerts(alerts: AlertList): boolean {
  return saveData(ALERT_FILE, alerts)
}

/** Add alert */
export function addAlert(alert: PriceAlert): boolean {
  const list = loadAlerts()
  if (list.alerts.some(a => a.code === alert.code && a.type === alert.type && !a.triggered)) return false
  list.alerts.push(alert)
  list.updatedAt = new Date().toISOString()
  return saveAlerts(list)
}

// ============================================================================
// Math Utilities
// ============================================================================

/** Calculate average */
export function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

/** Calculate standard deviation */
export function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0
  const avg = average(arr)
  const squareDiffs = arr.map(v => (v - avg) ** 2)
  return Math.sqrt(average(squareDiffs))
}

/** Calculate sum */
export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

/** Get max value */
export function maxValue(arr: number[]): number {
  return arr.length === 0 ? 0 : Math.max(...arr)
}

/** Get min value */
export function minValue(arr: number[]): number {
  return arr.length === 0 ? 0 : Math.min(...arr)
}

/** Round to decimal places */
export function round(num: number, decimals = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

// ============================================================================
// Time Utilities
// ============================================================================

/** Debounce function */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/** Throttle function */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}

/** Sleep for ms */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Retry async function */
export async function retry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: Error | undefined
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries - 1) await sleep(delay)
    }
  }
  throw lastError
}

// ============================================================================
// Table Formatting
// ============================================================================

/** Create table row */
export function tableRow(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i])).join(' | ')
}

/** Create table separator */
export function tableSeparator(widths: number[]): string {
  return widths.map(w => '─'.repeat(w)).join('─┼─')
}

/** Create table header */
export function tableHeader(title: string, widths: number[]): string[] {
  const totalWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3
  const lines: string[] = []
  lines.push('┌' + '─'.repeat(totalWidth - 2) + '┐')
  lines.push('│' + title.padStart((totalWidth + title.length) / 2).padEnd(totalWidth - 2) + '│')
  lines.push('├' + widths.map(w => '─'.repeat(w)).join('─┼─') + '┤')
  return lines
}

// ============================================================================
// Cache Utilities
// ============================================================================

const cache = new Map<string, { data: unknown; expiry: number }>()

/** Get cached data */
export function getCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

/** Set cached data */
export function setCache<T>(key: string, data: T, ttlMs = 60000): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs })
}

/** Clear cache */
export function clearCache(): void {
  cache.clear()
}
