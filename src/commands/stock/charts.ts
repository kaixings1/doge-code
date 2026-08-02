// ============================================================================
// Stock Command - ASCII Chart Generation
// ASCII 图表生成：折线图/K线图/成交量图/对比图
// ============================================================================

import type { KLinePoint, ChartType } from './types.js'
import { getKLineData } from './api.js'
import { calculateSMA, calculateBollinger } from './indicators.js'

// ============================================================================
// 图表配置
// ============================================================================

interface ChartConfig {
  width: number
  height: number
  type: ChartType
  code: string
  showVolume: boolean
  showMA: boolean
  showBollinger: boolean
  period: 'daily' | 'weekly' | 'monthly'
  count: number
}

const DEFAULT_CONFIG: ChartConfig = {
  width: 80,
  height: 20,
  type: 'candlestick',
  code: '',
  showVolume: true,
  showMA: true,
  showBollinger: false,
  period: 'daily',
  count: 60,
}

// ============================================================================
// 折线图
// ============================================================================

/**
 * 生成 ASCII 折线图
 * @param data K线数据
 * @param width 图表宽度
 * @param height 图表高度
 */
export function generateLineChart(data: KLinePoint[], width = 80, height = 20): string {
  if (data.length === 0) return '无数据'

  const closes = data.map(d => d.close)
  const minPrice = Math.min(...closes)
  const maxPrice = Math.max(...closes)
  const priceRange = maxPrice - minPrice || 1

  const lines: string[] = []
  lines.push(`价格折线图 (${data.length} 个数据点)`)
  lines.push('')

  // Y轴宽度
  const yAxisWidth = 8

  for (let row = height; row >= 0; row--) {
    const price = minPrice + (priceRange * row) / height
    const priceStr = price.toFixed(2).padStart(yAxisWidth)

    let line = `${priceStr} │`

    for (let col = 0; col < width && col < data.length; col++) {
      const dataIdx = Math.floor((col / width) * data.length)
      const normalizedPrice = ((closes[dataIdx] - minPrice) / priceRange) * height
      const ma5Idx = Math.floor((col / width) * data.length)

      if (Math.abs(normalizedPrice - row) < 0.5) {
        line += '●'
      } else if (row === 0) {
        line += '─'
      } else {
        line += ' '
      }
    }

    lines.push(line)
  }

  // X轴
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(width))
  lines.push(' '.repeat(yAxisWidth) + `  ${data[0].date}  ...  ${data[data.length - 1].date}`)

  return lines.join('\n')
}

// ============================================================================
// K线图（蜡烛图）
// ============================================================================

/**
 * 生成 ASCII K线图
 * @param data K线数据
 * @param width 图表宽度
 * @param height 图表高度
 */
export function generateCandlestickChart(data: KLinePoint[], width = 80, height = 20): string {
  if (data.length === 0) return '无数据'

  // 计算价格范围
  const allPrices = data.flatMap(d => [d.high, d.low])
  const minPrice = Math.min(...allPrices)
  const maxPrice = Math.max(...allPrices)
  const priceRange = maxPrice - minPrice || 1

  const lines: string[] = []
  lines.push(`K线图 (${data.length} 根K线)`)
  lines.push('')

  const yAxisWidth = 8

  for (let row = height; row >= 0; row--) {
    const price = minPrice + (priceRange * row) / height
    const priceStr = price.toFixed(2).padStart(yAxisWidth)

    let line = `${priceStr} │`

    for (let col = 0; col < Math.min(width, data.length); col++) {
      const d = data[col]
      const highNorm = ((d.high - minPrice) / priceRange) * height
      const lowNorm = ((d.low - minPrice) / priceRange) * height
      const openNorm = ((d.open - minPrice) / priceRange) * height
      const closeNorm = ((d.close - minPrice) / priceRange) * height

      if (row <= highNorm && row >= lowNorm) {
        if (row <= Math.max(openNorm, closeNorm) && row >= Math.min(openNorm, closeNorm)) {
          line += d.close >= d.open ? '█' : '░' // 实体
        } else {
          line += '│' // 影线
        }
      } else {
        line += ' '
      }
    }

    lines.push(line)
  }

  // X轴
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(Math.min(width, data.length)))
  lines.push(' '.repeat(yAxisWidth) + `  ${data[0].date}  ...  ${data[data.length - 1].date}`)

  return lines.join('\n')
}

// ============================================================================
// 成交量图
// ============================================================================

/**
 * 生成 ASCII 成交量图
 * @param data K线数据
 * @param width 图表宽度
 * @param height 图表高度
 */
export function generateVolumeChart(data: KLinePoint[], width = 80, height = 10): string {
  if (data.length === 0) return '无数据'

  const volumes = data.map(d => d.volume)
  const maxVolume = Math.max(...volumes)

  const lines: string[] = []
  lines.push(`成交量图 (${data.length} 个交易日)`)
  lines.push('')

  const yAxisWidth = 10

  for (let row = height; row >= 0; row--) {
    const volume = (maxVolume * row) / height
    const volStr = (volume / 10000).toFixed(0).padStart(yAxisWidth)

    let line = `${volStr}万│`

    for (let col = 0; col < Math.min(width, data.length); col++) {
      const d = data[col]
      const volNorm = (d.volume / maxVolume) * height

      if (row <= volNorm) {
        line += d.close >= d.open ? '█' : '░'
      } else {
        line += ' '
      }
    }

    lines.push(line)
  }

  // X轴
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(Math.min(width, data.length)))

  return lines.join('\n')
}

// ============================================================================
// 多股对比图
// ============================================================================

/**
 * 生成多股对比图
 * @param stocksData 多只股票的数据 [{code, name, data}]
 * @param width 图表宽度
 * @param height 图表高度
 */
export function generateComparisonChart(
  stocksData: Array<{ code: string; name: string; data: KLinePoint[] }>,
  width = 80,
  height = 20
): string {
  if (stocksData.length === 0) return '无数据'

  const symbols = ['●', '○', '◆', '◇', '■', '□', '▲', '△']
  const lines: string[] = []

  lines.push('多股对比图（标准化涨跌幅%）')
  lines.push('')

  // 计算每只股票的标准化涨跌幅
  const allChanges: number[][] = []
  for (const stock of stocksData) {
    if (stock.data.length === 0) continue
    const basePrice = stock.data[0].close
    const changes = stock.data.map(d => ((d.close - basePrice) / basePrice) * 100)
    allChanges.push(changes)
  }

  if (allChanges.length === 0) return '无有效数据'

  const allValues = allChanges.flat()
  const minChange = Math.min(...allValues)
  const maxChange = Math.max(...allValues)
  const changeRange = maxChange - minChange || 1

  const yAxisWidth = 8

  for (let row = height; row >= 0; row--) {
    const change = minChange + (changeRange * row) / height
    const changeStr = `${change.toFixed(1)}%`.padStart(yAxisWidth)

    let line = `${changeStr} │`

    for (let col = 0; col < width; col++) {
      let char = ' '
      for (let s = 0; s < allChanges.length; s++) {
        const dataIdx = Math.floor((col / width) * allChanges[s].length)
        const normalizedChange = ((allChanges[s][dataIdx] - minChange) / changeRange) * height
        if (Math.abs(normalizedChange - row) < 0.8) {
          char = symbols[s % symbols.length]
          break
        }
      }
      line += char
    }

    lines.push(line)
  }

  // X轴
  lines.push(' '.repeat(yAxisWidth) + ' └' + '─'.repeat(width))

  // 图例
  lines.push('')
  lines.push('图例:')
  for (let i = 0; i < stocksData.length && i < symbols.length; i++) {
    lines.push(`  ${symbols[i]} ${stocksData[i].name} (${stocksData[i].code})`)
  }

  return lines.join('\n')
}

// ============================================================================
// 综合图表
// ============================================================================

/**
 * 生成综合图表（价格+成交量+均线）
 * @param code 股票代码
 * @param config 图表配置
 */
export async function generateComprehensiveChart(
  code: string,
  config: Partial<ChartConfig> = {}
): Promise<string> {
  const cfg = { ...DEFAULT_CONFIG, ...config, code }
  const data = await getKLineData(code, cfg.period, cfg.count)

  if (data.length === 0) {
    return `❌ 无法获取 ${code} 的K线数据`
  }

  const lines: string[] = []
  lines.push(`=== ${code} 综合图表 ===`)
  lines.push(`周期: ${cfg.period === 'daily' ? '日线' : cfg.period === 'weekly' ? '周线' : '月线'} | 数据量: ${data.length}`)
  lines.push('')

  // 价格图
  lines.push('--- 价格走势 ---')
  lines.push(generateCandlestickChart(data.slice(-40), 60, 15))
  lines.push('')

  // 成交量图
  if (cfg.showVolume) {
    lines.push('--- 成交量 ---')
    lines.push(generateVolumeChart(data.slice(-40), 60, 6))
    lines.push('')

    // 均线图
    if (cfg.showMA) {
      lines.push('--- 均线系统 ---')
      const closes = data.map(d => d.close)
      const ma5 = calculateSMA(closes, 5)
      const ma10 = calculateSMA(closes, 10)
      const ma20 = calculateSMA(closes, 20)

      const lastIdx = data.length - 1
      lines.push(`MA5:  ${ma5[lastIdx]?.toFixed(2) || '--'}`)
      lines.push(`MA10: ${ma10[lastIdx]?.toFixed(2) || '--'}`)
      lines.push(`MA20: ${ma20[lastIdx]?.toFixed(2) || '--'}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ============================================================================
// 图表导出
// ============================================================================

/**
 * 导出图表为HTML
 * @param data K线数据
 * @param code 股票代码
 */
export function exportChartAsHTML(data: KLinePoint[], code: string): string {
  const closes = data.map(d => d.close)
  const minPrice = Math.min(...closes)
  const maxPrice = Math.max(...closes)
  const priceRange = maxPrice - minPrice || 1

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = ((d.close - minPrice) / priceRange) * 100
    return `${x},${y}`
  }).join(' ')

  return `<!DOCTYPE html>
<html>
<head>
  <title>${code} 价格走势图</title>
  <style>
    body { font-family: monospace; text-align: center; }
    .chart { width: 800px; height: 400px; margin: 0 auto; }
  </style>
</head>
<body>
  <h2>${code} 价格走势图</h2>
  <svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="blue" stroke-width="0.5"/>
  </svg>
  <p>${data[0].date} ~ ${data[data.length - 1].date}</p>
</body>
</html>`
}
