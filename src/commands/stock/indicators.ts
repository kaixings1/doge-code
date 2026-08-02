// ============================================================================
// Stock Command - Technical Indicators
// 技术指标计算：MA, MACD, RSI, KDJ, BOLL, 成交量分析
// ============================================================================

import type { KLinePoint, TechnicalIndicators } from './types.js'

// ============================================================================
// 移动平均线 (Moving Average)
// ============================================================================

/**
 * 计算简单移动平均线 (SMA)
 * @param data 收盘价数组
 * @param period 周期
 */
export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      const slice = data.slice(i - period + 1, i + 1)
      const avg = slice.reduce((a, b) => a + b, 0) / period
      result.push(avg)
    }
  }
  return result
}

/**
 * 计算指数移动平均线 (EMA)
 * @param data 收盘价数组
 * @param period 周期
 */
export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = []
  const multiplier = 2 / (period + 1)

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0])
    } else {
      const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1]
      result.push(ema)
    }
  }
  return result
}

/**
 * 计算加权移动平均线 (WMA)
 * @param data 收盘价数组
 * @param period 周期
 */
export function calculateWMA(data: number[], period: number): number[] {
  const result: number[] = []
  const denominator = (period * (period + 1)) / 2

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * (j + 1)
      }
      result.push(sum / denominator)
    }
  }
  return result
}

// ============================================================================
// MACD (Moving Average Convergence Divergence)
// ============================================================================

/**
 * 计算 MACD 指标
 * @param data 收盘价数组
 * @param fastPeriod 快线周期（默认12）
 * @param slowPeriod 慢线周期（默认26）
 * @param signalPeriod 信号线周期（默认9）
 */
export function calculateMACD(
  data: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { dif: number[]; dea: number[]; histogram: number[] } {
  const fastEMA = calculateEMA(data, fastPeriod)
  const slowEMA = calculateEMA(data, slowPeriod)

  // DIF = 快线EMA - 慢线EMA
  const dif: number[] = []
  for (let i = 0; i < data.length; i++) {
    dif.push(fastEMA[i] - slowEMA[i])
  }

  // DEA = DIF的EMA
  const dea = calculateEMA(dif, signalPeriod)

  // MACD柱 = (DIF - DEA) * 2
  const histogram: number[] = []
  for (let i = 0; i < data.length; i++) {
    histogram.push((dif[i] - dea[i]) * 2)
  }

  return { dif, dea, histogram }
}

// ============================================================================
// RSI (Relative Strength Index)
// ============================================================================

/**
 * 计算 RSI 指标
 * @param data 收盘价数组
 * @param period 周期（默认6/12/24）
 */
export function calculateRSI(data: number[], period = 6): number[] {
  const result: number[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN)
      continue
    }

    let gains = 0
    let losses = 0

    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j] - data[j - 1]
      if (change > 0) {
        gains += change
      } else {
        losses -= change
      }
    }

    const avgGain = gains / period
    const avgLoss = losses / period

    if (avgLoss === 0) {
      result.push(100)
    } else {
      const rs = avgGain / avgLoss
      result.push(100 - 100 / (1 + rs))
    }
  }

  return result
}

// ============================================================================
// KDJ (Stochastic Oscillator)
// ============================================================================

/**
 * 计算 KDJ 指标
 * @param highs 最高价数组
 * @param lows 最低价数组
 * @param closes 收盘价数组
 * @param period 周期（默认9）
 */
export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9
): { k: number[]; d: number[]; j: number[] } {
  const k: number[] = []
  const d: number[] = []
  const j: number[] = []

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      k.push(50)
      d.push(50)
      j.push(50)
      continue
    }

    const highSlice = highs.slice(i - period + 1, i + 1)
    const lowSlice = lows.slice(i - period + 1, i + 1)

    const highestHigh = Math.max(...highSlice)
    const lowestLow = Math.min(...lowSlice)

    const rsv = highestHigh === lowestLow ? 50 : ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100

    const prevK = i > 0 ? k[i - 1] : 50
    const prevD = i > 0 ? d[i - 1] : 50

    const currentK = (2 / 3) * prevK + (1 / 3) * rsv
    const currentD = (2 / 3) * prevD + (1 / 3) * currentK
    const currentJ = 3 * currentK - 2 * currentD

    k.push(currentK)
    d.push(currentD)
    j.push(currentJ)
  }

  return { k, d, j }
}

// ============================================================================
// BOLL (Bollinger Bands)
// ============================================================================

/**
 * 计算布林带
 * @param data 收盘价数组
 * @param period 周期（默认20）
 * @param multiplier 标准差倍数（默认2）
 */
export function calculateBollinger(
  data: number[],
  period = 20,
  multiplier = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = calculateSMA(data, period)
  const upper: number[] = []
  const lower: number[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN)
      lower.push(NaN)
      continue
    }

    const slice = data.slice(i - period + 1, i + 1)
    const avg = middle[i]
    const variance = slice.reduce((sum, val) => sum + (val - avg) ** 2, 0) / period
    const std = Math.sqrt(variance)

    upper.push(avg + multiplier * std)
    lower.push(avg - multiplier * std)
  }

  return { upper, middle, lower }
}

// ============================================================================
// 成交量分析
// ============================================================================

/**
 * 计算成交量移动平均
 * @param volumes 成交量数组
 * @param period 周期
 */
export function calculateVolumeMA(volumes: number[], period: number): number[] {
  return calculateSMA(volumes, period)
}

/**
 * 计算量比
 * @param currentVolume 当前成交量
 * @param avgVolume 平均成交量
 */
export function calculateVolumeRatio(currentVolume: number, avgVolume: number): number {
  return avgVolume === 0 ? 0 : currentVolume / avgVolume
}

/**
 * 计算成交额
 * @param price 价格
 * @param volume 成交量
 */
export function calculateAmount(price: number, volume: number): number {
  return price * volume
}

/**
 * 量价分析
 * @param data K线数据
 */
export function analyzeVolumePrice(data: KLinePoint[]): string {
  if (data.length < 5) return '数据不足，无法分析'

  const recent = data.slice(-5)
  const lines: string[] = []

  // 放量/缩量判断
  const avgVolume = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length
  const lastVolume = recent[recent.length - 1].volume
  const volumeRatio = lastVolume / avgVolume

  lines.push(`量比: ${volumeRatio.toFixed(2)} ${volumeRatio > 1.5 ? '(放量)' : volumeRatio < 0.7 ? '(缩量)' : '(平量)'}`)

  // 量价关系
  const priceUp = recent[recent.length - 1].close > recent[recent.length - 2].close
  const volumeUp = lastVolume > avgVolume

  if (priceUp && volumeUp) {
    lines.push('量价配合: 放量上涨，趋势健康')
  } else if (priceUp && !volumeUp) {
    lines.push('量价配合: 缩量上涨，注意量能不足')
  } else if (!priceUp && volumeUp) {
    lines.push('量价配合: 放量下跌，可能出货')
  } else {
    lines.push('量价配合: 缩量下跌，观望为主')
  }

  // 连续涨跌
  let upDays = 0
  let downDays = 0
  for (let i = recent.length - 1; i > 0; i--) {
    if (recent[i].close > recent[i - 1].close) upDays++
    else if (recent[i].close < recent[i - 1].close) downDays++
  }

  if (upDays >= 3) lines.push(`连续${upDays}天上涨，注意回调风险`)
  if (downDays >= 3) lines.push(`连续${downDays}天下跌，关注支撑位`)

  return lines.join('\n')
}

// ============================================================================
// 趋势分析
// ============================================================================

/**
 * 趋势判断
 * @param data K线数据
 */
export function analyzeTrend(data: KLinePoint[]): string {
  if (data.length < 20) return '数据不足，无法判断趋势'

  const closes = data.map(d => d.close)
  const ma5 = calculateSMA(closes, 5)
  const ma10 = calculateSMA(closes, 10)
  const ma20 = calculateSMA(closes, 20)

  const lastMA5 = ma5[ma5.length - 1]
  const lastMA10 = ma10[ma10.length - 1]
  const lastMA20 = ma20[ma20.length - 1]

  const lines: string[] = []

  // 多头排列
  if (lastMA5 > lastMA10 && lastMA10 > lastMA20) {
    lines.push('趋势: 多头排列（上涨趋势）')
    lines.push(`MA5: ${lastMA5.toFixed(2)} > MA10: ${lastMA10.toFixed(2)} > MA20: ${lastMA20.toFixed(2)}`)
  }
  // 空头排列
  else if (lastMA5 < lastMA10 && lastMA10 < lastMA20) {
    lines.push('趋势: 空头排列（下跌趋势）')
    lines.push(`MA5: ${lastMA5.toFixed(2)} < MA10: ${lastMA10.toFixed(2)} < MA20: ${lastMA20.toFixed(2)}`)
  }
  // 交叉
  else {
    lines.push('趋势: 震荡整理')
    lines.push(`MA5: ${lastMA5.toFixed(2)} | MA10: ${lastMA10.toFixed(2)} | MA20: ${lastMA20.toFixed(2)}`)
  }

  // 金叉/死叉判断
  const prevMA5 = ma5[ma5.length - 2]
  const prevMA10 = ma10[ma10.length - 2]

  if (prevMA5 <= prevMA10 && lastMA5 > lastMA10) {
    lines.push('信号: 金叉（MA5上穿MA10），买入信号')
  } else if (prevMA5 >= prevMA10 && lastMA5 < lastMA10) {
    lines.push('信号: 死叉（MA5下穿MA10），卖出信号')
  }

  // 当前位置判断
  const lastClose = closes[closes.length - 1]
  if (lastClose > lastMA5) lines.push('位置: 在MA5上方，短期强势')
  else if (lastClose < lastMA5) lines.push('位置: 在MA5下方，短期弱势')

  return lines.join('\n')
}

// ============================================================================
// 支撑位/阻力位计算
// ============================================================================

/**
 * 计算支撑位和阻力位
 * @param data K线数据
 */
export function calculateSupportResistance(data: KLinePoint[]): { supports: number[]; resistances: number[]; current: number } {
  if (data.length < 20) return { supports: [], resistances: [], current: 0 }

  const recent = data.slice(-20)
  const current = recent[recent.length - 1].close

  // 找出局部高点和低点
  const highs: number[] = []
  const lows: number[] = []

  for (let i = 2; i < recent.length - 2; i++) {
    // 局部高点
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      highs.push(recent[i].high)
    }
    // 局部低点
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      lows.push(recent[i].low)
    }
  }

  // 阻力位：高于当前价格的高点
  const resistances = highs.filter(h => h > current).sort((a, b) => a - b).slice(0, 3)
  // 支撑位：低于当前价格的低点
  const supports = lows.filter(l => l < current).sort((a, b) => b - a).slice(0, 3)

  return { supports, resistances, current }
}

// ============================================================================
// 综合技术分析
// ============================================================================

/**
 * 执行完整技术分析
 * @param data K线数据
 */
export function performTechnicalAnalysis(data: KLinePoint[]): string {
  if (data.length < 30) return '数据不足（至少需要30条K线数据）'

  const closes = data.map(d => d.close)
  const highs = data.map(d => d.high)
  const lows = data.map(d => d.low)
  const volumes = data.map(d => d.volume)

  const lines: string[] = []
  lines.push('=== 技术分析 ===')
  lines.push('')

  // 移动平均线
  const ma5 = calculateSMA(closes, 5)
  const ma10 = calculateSMA(closes, 10)
  const ma20 = calculateSMA(closes, 20)
  const ma60 = calculateSMA(closes, 60)

  lines.push('--- 移动平均线 ---')
  lines.push(`MA5:  ${ma5[ma5.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`MA10: ${ma10[ma10.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`MA20: ${ma20[ma20.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`MA60: ${ma60[ma60.length - 1]?.toFixed(2) || '--'}`)
  lines.push('')

  // MACD
  const macd = calculateMACD(closes)
  lines.push('--- MACD ---')
  lines.push(`DIF:  ${macd.dif[macd.dif.length - 1]?.toFixed(3) || '--'}`)
  lines.push(`DEA:  ${macd.dea[macd.dea.length - 1]?.toFixed(3) || '--'}`)
  lines.push(`MACD: ${macd.histogram[macd.histogram.length - 1]?.toFixed(3) || '--'}`)
  lines.push('')

  // RSI
  const rsi6 = calculateRSI(closes, 6)
  const rsi12 = calculateRSI(closes, 12)
  const rsi24 = calculateRSI(closes, 24)

  lines.push('--- RSI ---')
  lines.push(`RSI6:  ${rsi6[rsi6.length - 1]?.toFixed(2) || '--'} ${getRSIComment(rsi6[rsi6.length - 1])}`)
  lines.push(`RSI12: ${rsi12[rsi12.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`RSI24: ${rsi24[rsi24.length - 1]?.toFixed(2) || '--'}`)
  lines.push('')

  // KDJ
  const kdj = calculateKDJ(highs, lows, closes)
  lines.push('--- KDJ ---')
  lines.push(`K: ${kdj.k[kdj.k.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`D: ${kdj.d[kdj.d.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`J: ${kdj.j[kdj.j.length - 1]?.toFixed(2) || '--'}`)
  lines.push('')

  // 布林带
  const boll = calculateBollinger(closes)
  lines.push('--- 布林带 ---')
  lines.push(`上轨: ${boll.upper[boll.upper.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`中轨: ${boll.middle[boll.middle.length - 1]?.toFixed(2) || '--'}`)
  lines.push(`下轨: ${boll.lower[boll.lower.length - 1]?.toFixed(2) || '--'}`)
  lines.push('')

  // 趋势分析
  lines.push('--- 趋势分析 ---')
  lines.push(analyzeTrend(data))
  lines.push('')

  // 支撑位/阻力位
  const sr = calculateSupportResistance(data)
  lines.push('--- 支撑位/阻力位 ---')
  lines.push(`当前价: ${sr.current.toFixed(2)}`)
  sr.resistances.forEach((r, i) => lines.push(`阻力位${i + 1}: ${r.toFixed(2)}`))
  sr.supports.forEach((s, i) => lines.push(`支撑位${i + 1}: ${s.toFixed(2)}`))
  lines.push('')

  // 量价分析
  lines.push('--- 量价分析 ---')
  lines.push(analyzeVolumePrice(data))

  return lines.join('\n')
}

/**
 * RSI 指标解读
 */
function getRSIComment(rsi: number): string {
  if (isNaN(rsi)) return ''
  if (rsi > 80) return '（超买区域，注意回调风险）'
  if (rsi > 60) return '（偏强）'
  if (rsi > 40) return '（中性）'
  if (rsi > 20) return '（偏弱）'
  return '（超卖区域，关注反弹机会）'
}

// ============================================================================
// 计算完整技术指标集
// ============================================================================

/**
 * 计算所有技术指标
 * @param data K线数据
 */
export function calculateAllIndicators(data: KLinePoint[]): TechnicalIndicators {
  const closes = data.map(d => d.close)
  const highs = data.map(d => d.high)
  const lows = data.map(d => d.low)
  const volumes = data.map(d => d.volume)

  return {
    ma5: calculateSMA(closes, 5),
    ma10: calculateSMA(closes, 10),
    ma20: calculateSMA(closes, 20),
    ma60: calculateSMA(closes, 60),
    macd: calculateMACD(closes),
    rsi6: calculateRSI(closes, 6),
    rsi12: calculateRSI(closes, 12),
    rsi24: calculateRSI(closes, 24),
    kdj: calculateKDJ(highs, lows, closes),
    bollinger: calculateBollinger(closes),
    volumeMA5: calculateVolumeMA(volumes, 5),
    volumeMA10: calculateVolumeMA(volumes, 10),
  }
}
