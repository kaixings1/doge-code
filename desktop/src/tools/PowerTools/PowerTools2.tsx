// ============================================================================
// PowerTools2 — 第二波强大工具，吸收更多代理优秀功能
// ============================================================================

import type { Tool, ToolUseContext } from '../../Tool.js'
import { z } from 'zod/v4'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'node:child_process'

// ============================================================================
// 5. DataAnalysisTool — 数据分析（吸收 data-analyst 能力）
// ============================================================================

const DataAnalysisInputSchema = z.object({
  action: z.enum(['analyze', 'visualize', 'stats', 'trends']).describe('分析类型'),
  path: z.string().describe('数据文件路径'),
  format: z.enum(['json', 'csv', 'tsv', 'txt']).describe('文件格式'),
})

export const DataAnalysisTool: Tool = {
  name: 'DataAnalysis',
  description: `数据分析工具 — 分析数据文件并生成报告。
- analyze: 综合分析数据结构和内容
- visualize: 生成数据可视化建议
- stats: 统计数据分析
- trends: 趋势分析`,

  inputSchema: DataAnalysisInputSchema,

  async call(input: z.infer<typeof DataAnalysisInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath, format } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: ` 文件不存在: ${resolvedPath}` }
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8')

      // 根据 action 执行不同的分析
      switch (action) {
        case 'analyze': {
          const lines: string[] = ['# 📈 数据分析报告\n']
          const stats = fs.statSync(resolvedPath)
          lines.push(`## 📊 文件概览`)
          lines.push(`- 路径: ${resolvedPath}`)
          lines.push(`- 大小: ${(stats.size / 1024).toFixed(2)} KB`)
          lines.push(`- 修改时间: ${stats.mtime.toLocaleString('zh-CN')}`)
          lines.push('')

          switch (format) {
            case 'json':
              return analyzeJson(content, lines)
            case 'csv':
            case 'tsv':
              return analyzeDelimited(content, lines, format === 'csv' ? ',' : '\t')
            default:
              return analyzeText(content, lines)
          }
        }
        case 'visualize':
          return visualizeData(content, format)
        case 'stats':
          return statsAnalysis(content, format)
        case 'trends':
          return trendsAnalysis(content, format)
        default:
          return { type: 'text', value: ` 未知操作: ${action}` }
      }
    } catch (err) {
      return { type: 'text', value: ` 分析失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

// ============================================================================
// 数据可视化建议 — 基于数据结构推荐图表类型
// ============================================================================

function visualizeData(content: string, format: string) {
  const lines: string[] = ['# 📊 数据可视化建议\n']
  const suggestions: string[] = []

  if (format === 'json') {
    try {
      const data = JSON.parse(content)
      if (Array.isArray(data) && data.length > 0) {
        lines.push(`## 📋 数据结构`)
        lines.push(`- 数组长度: ${data.length}`)
        if (typeof data[0] === 'object' && data[0] !== null) {
          const fields = Object.keys(data[0])
          lines.push(`- 字段: ${fields.join(', ')}`)
          lines.push('')

          lines.push('## 💡 可视化建议')
          for (const field of fields) {
            const values = data.map((item: any) => item[field]).filter((v: any) => v != null)
            if (values.length === 0) continue
            const numericCount = values.filter((v: any) => typeof v === 'number').length
            const isNumeric = numericCount / values.length > 0.8
            const unique = new Set(values.map((v: any) => String(v))).size

            if (isNumeric) {
              suggestions.push(`**${field}**（数值型）`)
              suggestions.push(`  - 📈 折线图 — 展示 ${field} 随时间/序号的趋势变化`)
              suggestions.push(`  - 📊 柱状图 — 对比不同类别的 ${field} 值`)
              suggestions.push(`  - 🎯 散点图 — 分析 ${field} 与其它数值字段的相关性`)
              if (unique <= 20 && values.length > 10) {
                suggestions.push(`  - 📦 箱线图 — 展示 ${field} 的分布和离群值`)
              }
            } else {
              suggestions.push(`**${field}**（类别型）`)
              suggestions.push(`  - 🍩 饼图 — 展示 ${field} 的占比分布（${unique} 个唯一值）`)
              suggestions.push(`  - 📊 水平柱状图 — 对比 ${field} 各类别数量`)
              if (values.length > 100) {
                suggestions.push(`  - ☁ 词云 — 高频 ${field} 值可视化`)
              }
            }
          }
        }
      } else if (typeof data === 'object' && data !== null) {
        lines.push(`## 💡 可视化建议`)
        lines.push('- 对象类型数据，建议按键值对绘制：')
        for (const [key, val] of Object.entries(data)) {
          suggestions.push(`- **${key}** → ${Array.isArray(val) ? `数组(${val.length}项)` : typeof val}`)
        }
        suggestions.push('')
        suggestions.push('- 📊 横向条形图 — 对比各键对应的数值')
      } else {
        lines.push('## 💡 可视化建议')
        suggestions.push('- 单值数据，建议直接展示数字（KPI 卡片）')
      }
    } catch {
      return { type: 'text', value: ' JSON 解析失败，无法生成可视化建议' }
    }
  } else if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t'
    const rows = content.split('\n').filter(r => r.trim())
    if (rows.length < 2) {
      return { type: 'text', value: ' 数据行数不足，无法生成可视化建议' }
    }
    const headers = rows[0].split(delimiter)
    lines.push(`## 📋 数据结构`)
    lines.push(`- 列数: ${headers.length}`)
    lines.push(`- 数据行数: ${rows.length - 1}`)
    lines.push('')

    lines.push('## 💡 可视化建议')
    for (let i = 0; i < headers.length; i++) {
      const values = rows.slice(1).map(row => Number(row.split(delimiter)[i]?.trim())).filter(v => !isNaN(v))
      const isNumeric = values.length / Math.max(1, rows.length - 1) > 0.8

      if (isNumeric && values.length > 0) {
        const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
        suggestions.push(`**${headers[i]}**（数值列，均值 ${avg}）`)
        suggestions.push(`  - 📈 折线图 — 展示 ${headers[i]} 的序列趋势`)
        suggestions.push(`  - 📊 柱状图 — 对比 ${headers[i]} 各数据点`)
      } else {
        const unique = new Set(rows.slice(1).map(row => row.split(delimiter)[i]?.trim())).size
        suggestions.push(`**${headers[i]}**（类别列，${unique} 个唯一值）`)
        suggestions.push(`  - 🍩 饼图 — 展示 ${headers[i]} 占比分布`)
        suggestions.push(`  - 📊 柱状图 — 对比各类别数量`)
      }
    }
  } else {
    lines.push('## 💡 可视化建议')
    suggestions.push('- 📊 词云 — 展示文本高频词汇')
    suggestions.push('- 📉 柱状图 — 展示词频分布')
    suggestions.push('- 📈 趋势图 — 若文本包含时间信息可绘制时间线')
  }

  suggestions.forEach(s => lines.push(`- ${s}`))

  lines.push('')
  lines.push('## 🛠 推荐工具')
  lines.push('- 前端图表: ECharts / Chart.js / Recharts')
  lines.push('- 数据分析: Python Matplotlib / Plotly')
  lines.push('- 快速可视化: 在线工具（Datawrapper / Flourish）')

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 统计分析 — 均值/中位数/众数/标准差/极值等
// ============================================================================

function statsAnalysis(content: string, format: string) {
  const lines: string[] = ['# 📐 统计分析报告\n']

  // 提取数值数组
  let numericValues: number[] = []

  if (format === 'json') {
    try {
      const data = JSON.parse(content)
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if (typeof item === 'number') numericValues.push(item)
          else if (typeof item === 'object' && item !== null) {
            Object.values(item).forEach((v: any) => {
              if (typeof v === 'number') numericValues.push(v)
            })
          }
        })
      } else if (typeof data === 'object' && data !== null) {
        Object.values(data).forEach((v: any) => {
          if (typeof v === 'number') numericValues.push(v)
        })
      }
    } catch {
      return { type: 'text', value: ' JSON 解析失败' }
    }
  } else if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t'
    const rows = content.split('\n').filter(r => r.trim())
    for (const row of rows.slice(1)) {
      row.split(delimiter).forEach(cell => {
        const num = Number(cell.trim())
        if (!isNaN(num)) numericValues.push(num)
      })
    }
  } else {
    // 从文本中提取数字
    const matches = content.match(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g) || []
    numericValues = matches.map(Number).filter(v => !isNaN(v))
  }

  if (numericValues.length < 2) {
    return { type: 'text', value: ' 数值数据不足（至少需要2个数值），无法进行统计分析' }
  }

  const sorted = [...numericValues].sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2

  // 众数
  const freq = new Map<number, number>()
  sorted.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
  let mode = sorted[0]
  let maxFreq = 0
  freq.forEach((count, val) => {
    if (count > maxFreq) {
      maxFreq = count
      mode = val
    }
  })

  // 标准差（总体）
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)

  // 极值
  const min = sorted[0]
  const max = sorted[n - 1]
  const range = max - min

  // 四分位数
  const q1 = sorted[Math.floor(n * 0.25)]
  const q3 = sorted[Math.floor(n * 0.75)]
  const iqr = q3 - q1

  lines.push(`## 📊 数据规模`)
  lines.push(`- 样本数: ${n}`)
  lines.push('')

  lines.push(`## 📈 集中趋势`)
  lines.push(`- **均值**: ${mean.toFixed(4)}`)
  lines.push(`- **中位数**: ${median.toFixed(4)}`)
  lines.push(`- **众数**: ${mode}（出现 ${maxFreq} 次）`)
  lines.push('')

  lines.push(`## 📉 离散程度`)
  lines.push(`- **标准差**: ${stdDev.toFixed(4)}`)
  lines.push(`- **方差**: ${variance.toFixed(4)}`)
  lines.push(`- **极差**: ${range.toFixed(4)}`)
  lines.push(`- **四分位距(IQR)**: ${iqr.toFixed(4)}`)
  lines.push('')

  lines.push(`## 🎯 极值与分布`)
  lines.push(`- **最小值**: ${min}`)
  lines.push(`- **最大值**: ${max}`)
  lines.push(`- **Q1（25%）**: ${q1}`)
  lines.push(`- **Q3（75%）**: ${q3}`)
  lines.push('')

  // 偏度判断（基于均值 vs 中位数）
  lines.push(`## 🧭 分布形态`)
  const skew = mean - median
  if (Math.abs(skew) < stdDev * 0.1) {
    lines.push('- 分布近似对称（均值 ≈ 中位数）')
  } else if (skew > 0) {
    lines.push('- 分布右偏（正偏态），存在较大离群值拉高均值')
  } else {
    lines.push('- 分布左偏（负偏态），存在较小离群值拉低均值')
  }

  // 离群值检测（1.5倍IQR规则）
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  const outliers = sorted.filter(v => v < lowerBound || v > upperBound)
  if (outliers.length > 0) {
    lines.push('')
    lines.push(`##  离群值检测（${outliers.length} 个）`)
    lines.push(`- 范围: [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`)
    lines.push(`- 离群值: ${outliers.slice(0, 10).join(', ')}${outliers.length > 10 ? '...' : ''}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 趋势分析 — 时间序列趋势识别
// ============================================================================

function trendsAnalysis(content: string, format: string) {
  const lines: string[] = ['# 📈 趋势分析报告\n']

  // 尝试提取时间序列数据对（[时间, 值]）
  interface TimePoint { time: string; value: number }
  const points: TimePoint[] = []

  if (format === 'json') {
    try {
      const data = JSON.parse(content)
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const sample = data[0] as Record<string, any>
        // 寻找时间字段和数值字段
        const timeField = Object.keys(sample).find(k => /time|date|day|month|year|日期|时间/i.test(k))
        const valueFields = Object.keys(sample).filter(k => {
          const v = (data[0] as any)[k]
          return typeof v === 'number' || !isNaN(Number(v))
        })

        if (timeField && valueFields.length > 0) {
          data.forEach((item: any) => {
            const time = String(item[timeField])
            valueFields.forEach(vf => {
              const val = Number(item[vf])
              if (!isNaN(val)) points.push({ time: `${time}-${vf}`, value: val })
            })
          })
        } else if (valueFields.length > 0) {
          // 没有时间字段，使用序号作为时间
          data.forEach((item: any, idx: number) => {
            valueFields.forEach(vf => {
              const val = Number(item[vf])
              if (!isNaN(val)) points.push({ time: `#${idx + 1}`, value: val })
            })
          })
        }
      } else if (Array.isArray(data) && data.every((v: any) => typeof v === 'number')) {
        data.forEach((v: number, idx: number) => points.push({ time: `#${idx + 1}`, value: v }))
      }
    } catch {
      return { type: 'text', value: ' JSON 解析失败' }
    }
  } else if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t'
    const rows = content.split('\n').filter(r => r.trim())
    if (rows.length < 2) {
      return { type: 'text', value: ' 数据行数不足，无法进行趋势分析' }
    }
    const headers = rows[0].split(delimiter).map(h => h.trim())
    const timeIdx = headers.findIndex(h => /time|date|day|month|year|日期|时间/i.test(h))

    rows.slice(1).forEach(row => {
      const cells = row.split(delimiter)
      headers.forEach((h, idx) => {
        const val = Number(cells[idx]?.trim())
        if (!isNaN(val)) {
          const time = timeIdx >= 0 ? cells[timeIdx]?.trim() || `#${points.length + 1}` : `#${points.length + 1}`
          points.push({ time, value: val })
        }
      })
    })
  } else {
    // 文本中寻找 "时间 数值" 对
    const textLines = content.split('\n')
    for (const line of textLines) {
      const match = line.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}[-/]\d{1,2})\s*[,:\t]\s*(-?\d+\.?\d*)/)
      if (match) {
        points.push({ time: match[1], value: Number(match[2]) })
      }
    }
  }

  if (points.length < 3) {
    return { type: 'text', value: ` 有效数据点不足（${points.length}/3），无法进行趋势分析。\n\n请提供包含时间+数值的序列数据，例如：\n- CSV: 日期,销量\n2024-01-01,100\n2024-01-02,120` }
  }

  const values = points.map(p => p.value)
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n

  // 线性回归计算斜率
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  values.forEach((v, i) => {
    sumX += i
    sumY += v
    sumXY += i * v
    sumXX += i * i
  })
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // 相关系数
  const yMean = sumY / n
  let ssTot = 0, ssReg = 0
  values.forEach((v, i) => {
    ssTot += (v - yMean) ** 2
    const fitted = slope * i + intercept
    ssReg += (fitted - yMean) ** 2
  })
  const rSquared = ssTot > 0 ? ssReg / ssTot : 0
  const r = Math.sqrt(Math.max(0, rSquared)) * (slope >= 0 ? 1 : -1)

  // 趋势判断
  let trend: string
  if (Math.abs(r) < 0.3) {
    trend = '无明显趋势（数据波动较大，相关性弱）'
  } else if (slope > 0 && r > 0.7) {
    trend = '📈 上升趋势'
  } else if (slope < 0 && r < -0.7) {
    trend = '📉 下降趋势'
  } else if (slope > 0) {
    trend = '🟡 缓慢上升（相关性中等）'
  } else if (slope < 0) {
    trend = '🟡 缓慢下降（相关性中等）'
  } else {
    trend = '➡ 平稳'
  }

  lines.push(`## 📋 数据规模`)
  lines.push(`- 数据点: ${n} 个`)
  lines.push(`- 时间范围: ${points[0].time} → ${points[n - 1].time}`)
  lines.push('')

  lines.push(`## 🧭 趋势判断`)
  lines.push(`- **结论**: ${trend}`)
  lines.push(`- 斜率: ${slope.toFixed(4)}（${slope > 0 ? '每步上升' : slope < 0 ? '每步下降' : '平稳'} ${Math.abs(slope).toFixed(4)} 单位）`)
  lines.push(`- 相关系数 r: ${r.toFixed(4)}`)
  lines.push(`- 拟合优度 R²: ${rSquared.toFixed(4)}`)
  lines.push('')

  // 关键统计
  lines.push(`## 📊 关键指标`)
  lines.push(`- 首值: ${values[0]}`)
  lines.push(`- 末值: ${values[n - 1]}`)
  lines.push(`- 平均值: ${mean.toFixed(4)}`)
  lines.push(`- 最小值: ${Math.min(...values)}`)
  lines.push(`- 最大值: ${Math.max(...values)}`)
  lines.push(`- 变化幅度: ${(((values[n - 1] - values[0]) / Math.max(1, Math.abs(values[0]))) * 100).toFixed(1)}%`)
  lines.push('')

  // 周期检测（简单：比较前后半段均值）
  lines.push(`## 🔄 周期/波动检测`)
  const half = Math.floor(n / 2)
  if (half > 0) {
    const firstHalfMean = values.slice(0, half).reduce((a, b) => a + b, 0) / half
    const secondHalfMean = values.slice(n - half).reduce((a, b) => a + b, 0) / half
    lines.push(`- 前段均值: ${firstHalfMean.toFixed(4)}`)
    lines.push(`- 后段均值: ${secondHalfMean.toFixed(4)}`)
    if (Math.abs(secondHalfMean - firstHalfMean) > Math.abs(mean) * 0.1) {
      lines.push(`- 后段相对前段变化: ${(((secondHalfMean - firstHalfMean) / Math.max(1, Math.abs(firstHalfMean))) * 100).toFixed(1)}%`)
    }
  }

  // 预测
  lines.push('')
  lines.push(`## 🔮 简单预测（线性外推）`)
  for (let i = 1; i <= 3; i++) {
    const next = slope * (n - 1 + i) + intercept
    lines.push(`- 未来第${i}点: ${next.toFixed(2)}`)
  }
  lines.push('')
  lines.push(' 注：此预测基于线性回归的简单外推，未考虑季节性/周期性因素，仅供参考。')

  return { type: 'text', value: lines.join('\n') }
}

function analyzeJson(content: string, lines: string[]) {
  try {
    const data = JSON.parse(content)
    lines.push('## 📋 JSON 结构分析')
    lines.push(`- 类型: ${Array.isArray(data) ? 'Array' : typeof data}`)

    if (Array.isArray(data)) {
      lines.push(`- 数组长度: ${data.length}`)
      if (data.length > 0) {
        const sample = data[0]
        if (typeof sample === 'object' && sample !== null) {
          lines.push(`- 字段数: ${Object.keys(sample).length}`)
          lines.push(`- 字段列表: ${Object.keys(sample).join(', ')}`)

          // 字段类型分析
          lines.push('\n## 📊 字段类型')
          for (const [key, val] of Object.entries(sample)) {
            lines.push(`- ${key}: ${typeof val}`)
          }

          // 数据分布
          lines.push('\n## 📈 数据分布')
          for (const key of Object.keys(sample)) {
            const values = data.map((item: any) => item[key]).filter((v: any) => v !== undefined)
            const unique = new Set(values)
            lines.push(`- ${key}: ${unique.size} 个唯一值`)
          }
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      lines.push(`- 键数: ${Object.keys(data).length}`)
      lines.push(`- 键列表: ${Object.keys(data).join(', ')}`)
    }

    return { type: 'text', value: lines.join('\n') }
  } catch (err) {
    return { type: 'text', value: ` JSON 解析失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function analyzeDelimited(content: string, lines: string[], delimiter: string) {
  const rows = content.split('\n').filter(row => row.trim())
  if (rows.length === 0) {
    return { type: 'text', value: ' 文件为空' }
  }

  const headers = rows[0].split(delimiter)
  lines.push('## 📋 数据结构')
  lines.push(`- 行数: ${rows.length - 1}`)
  lines.push(`- 列数: ${headers.length}`)
  lines.push(`- 列名: ${headers.join(', ')}`)
  lines.push('')

  lines.push('## 📊 列类型分析')
  for (let i = 0; i < headers.length; i++) {
    const values = rows.slice(1).map(row => row.split(delimiter)[i]?.trim()).filter(Boolean)
    const numeric = values.filter(v => !isNaN(Number(v)))
    const types = numeric.length > values.length * 0.8 ? 'number' : 'string'
    lines.push(`- ${headers[i]}: ${types} (${values.length} 个值)`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function analyzeText(content: string, lines: string[]) {
  const textLines = content.split('\n')
  const words = content.split(/\s+/).filter(Boolean)

  lines.push('## 📋 文本统计')
  lines.push(`- 总行数: ${textLines.length}`)
  lines.push(`- 总字数: ${words.length}`)
  lines.push(`- 总字符数: ${content.length}`)
  lines.push(`- 平均行长度: ${Math.round(content.length / textLines.length)}`)

  // 词频统计
  const freq = new Map<string, number>()
  for (const word of words) {
    const w = word.toLowerCase().slice(0, 50)
    freq.set(w, (freq.get(w) || 0) + 1)
  }

  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  lines.push('\n## 📊 高频词汇')
  top.forEach(([word, count]) => lines.push(`- "${word}": ${count} 次`))

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 6. PerformanceProfiler — 性能分析（吸收 site-reliability-engineer 能力）
// ============================================================================

const PerformanceInputSchema = z.object({
  action: z.enum(['profile', 'benchmark', 'bottlenecks', 'memory']).describe('分析类型'),
  path: z.string().describe('要分析的文件或目录'),
})

export const PerformanceProfiler: Tool = {
  name: 'Performance',
  description: `性能分析工具 — 分析代码性能瓶颈和优化建议。
- profile: 综合分析代码性能
- benchmark: 分析潜在的性能问题
- bottlenecks: 检测性能瓶颈
- memory: 分析内存使用`,

  inputSchema: PerformanceInputSchema,

  async call(input: z.infer<typeof PerformanceInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: ` 路径不存在: ${resolvedPath}` }
    }

    // 根据 action 选择不同的分析侧重
    switch (action) {
      case 'profile':
        return profilePerformance(resolvedPath)
      case 'benchmark':
        return benchmarkAnalysis(resolvedPath)
      case 'bottlenecks':
        return bottlenecksAnalysis(resolvedPath)
      case 'memory':
        return memoryAnalysis(resolvedPath)
      default:
        return { type: 'text', value: ` 未知操作: ${action}` }
    }
  },
}

// ============================================================================
// 性能综合分析 — 检测所有类型的性能问题
// ============================================================================

function profilePerformance(targetPath: string) {
  const lines: string[] = ['#  性能综合分析报告\n']
  const issues: Array<{ severity: string; type: string; detail: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()

      // 检测性能问题
      if (/\bfor\s*\(.*\.length/.test(trimmed)) {
        issues.push({ severity: '🟡', type: '循环中访问length', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/\bwhile\s*\(true\)/.test(trimmed)) {
        issues.push({ severity: '', type: '死循环风险', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/\bJSON\.parse\s*\(/.test(trimmed) && !trimmed.includes('try')) {
        issues.push({ severity: '🟡', type: 'JSON.parse无try-catch', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/\.forEach\s*\(/.test(trimmed) && fileLines[idx + 1]?.includes('.forEach')) {
        issues.push({ severity: '🟡', type: '嵌套forEach', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/\bconsole\.(log|debug|info|warn)\(/.test(trimmed)) {
        issues.push({ severity: '🟢', type: '控制台输出', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/\bawait\b/.test(trimmed) && fileLines[idx + 1]?.trim().startsWith('await')) {
        issues.push({ severity: '🟡', type: '串行await', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      if (/new\s+(Array|Object|Map|Set)\s*\(/.test(trimmed) && fileLines.slice(Math.max(0, idx - 5), idx).some(l => l.includes('for'))) {
        issues.push({ severity: '🟡', type: '循环中创建对象', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
    })
  }

  const filesChecked = scanProjectFiles(targetPath, checkFile)

  lines.push(`## 📋 结果`)
  lines.push(`- 检查文件数: ${filesChecked}`)
  lines.push(`- 发现问题: ${issues.length} 个`)
  lines.push('')

  const high = issues.filter(i => i.severity === '').length
  const medium = issues.filter(i => i.severity === '🟡').length
  const low = issues.filter(i => i.severity === '🟢').length

  lines.push(`## 📊 严重程度`)
  lines.push(`-  高危: ${high}`)
  lines.push(`- 🟡 中危: ${medium}`)
  lines.push(`- 🟢 低危: ${low}`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('##  问题列表（前20条）')
    issues.slice(0, 20).forEach(i => lines.push(`- ${i.severity} [${i.type}] ${i.detail}`))
  } else {
    lines.push('##  未发现明显性能问题')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 基准分析 — 重点检测循环/重复操作中的性能热点
// ============================================================================

function benchmarkAnalysis(targetPath: string) {
  const lines: string[] = ['# 📊 基准性能分析\n']
  const issues: Array<{ severity: string; type: string; detail: string; estimate: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()

      // 三重嵌套循环 — 最严重的性能热点
      if (/\bfor\b/.test(trimmed)) {
        const surrounding = fileLines.slice(Math.max(0, idx - 8), idx).join(' ')
        const forCount = (surrounding.match(/\bfor\b/g) || []).length
        if (forCount >= 2) {
          issues.push({
            severity: '',
            type: '多重嵌套循环',
            detail: `${path.basename(filePath)}:${idx + 1}`,
            estimate: forCount === 2 ? 'O(n²) 复杂度' : 'O(n³) 复杂度',
          })
        }
      }

      // 循环内调用函数/方法（可能造成函数调用开销）
      if (/for\s*\(/.test(trimmed) && /\.\w+\s*\(/.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '循环内函数调用',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          estimate: '每次迭代都调用，注意方法内联优化',
        })
      }

      // 大数组操作
      if (/\.map\(|\.filter\(|\.reduce\(|\.forEach\(/.test(trimmed) && /\.map\(|\.filter\(|\.reduce\(|\.forEach\(/.test(fileLines[Math.max(0, idx - 3)] || '')) {
        issues.push({
          severity: '🟡',
          type: '链式数组遍历',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          estimate: '多次遍历数组，考虑合并为单次循环',
        })
      }

      // 正则表达式在循环中使用
      if (/\bfor\b/.test(trimmed) && /\.test\(|\.match\(|\.replace\(/.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '循环内正则运算',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          estimate: '正则编译有开销，建议提前编译',
        })
      }

      // 字符串拼接
      if (/\+=\s*['"`]/.test(trimmed) && fileLines.slice(Math.max(0, idx - 5), idx).some(l => /\bfor\b/.test(l))) {
        issues.push({
          severity: '🟡',
          type: '循环内字符串拼接',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          estimate: '字符串不可变，建议用数组 join 替代',
        })
      }
    })
  }

  const filesChecked = scanProjectFiles(targetPath, checkFile)

  lines.push(`## 📋 结果`)
  lines.push(`- 检查文件数: ${filesChecked}`)
  lines.push(`- 发现性能热点: ${issues.length} 个`)
  lines.push('')

  const high = issues.filter(i => i.severity === '').length
  const medium = issues.filter(i => i.severity === '🟡').length

  lines.push('')
  lines.push(`## 📊 复杂度分布`)
  lines.push(`-  O(n²)/O(n³) 热点: ${high} 个`)
  lines.push(`- 🟡 可优化点: ${medium} 个`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('##  性能热点列表（前20条）')
    issues.slice(0, 20).forEach(i => {
      lines.push(`- ${i.severity} [${i.type}] ${i.detail} — ${i.estimate}`)
    })
  } else {
    lines.push('##  未发现明显的算法复杂度问题')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 瓶颈检测 — 检测阻塞主线程/阻塞 I/O 的操作
// ============================================================================

function bottlenecksAnalysis(targetPath: string) {
  const lines: string[] = ['# 🚧 性能瓶颈检测\n']
  const issues: Array<{ severity: string; type: string; detail: string; advice: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()

      // 同步文件操作
      if (/fs\.(readFileSync|writeFileSync|readdirSync|statSync|existsSync)/.test(trimmed)) {
        issues.push({
          severity: '',
          type: '同步文件操作',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '会阻塞事件循环，建议改用异步 API（fs.promises）',
        })
      }

      // 同步 HTTP 请求
      if (/https?\.[a-zA-Z]+Sync|XMLHttpRequest/.test(trimmed) && /sync/i.test(trimmed)) {
        issues.push({
          severity: '',
          type: '同步网络请求',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '同步网络请求会完全阻塞 UI，必须改为异步',
        })
      }

      // 深度递归（未发现递归函数定义，仅提示）
      if (/function\s+\w+.*\bfor\b/.test(trimmed)) {
        // 不误报，跳过
      }

      // CPU 密集型操作
      if (/while\s*\(/.test(trimmed) && /i\+\+|i--/.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '可能CPU密集型循环',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '大量计算会阻塞主线程，考虑 Web Worker',
        })
      }

      // 大量数据 JSON 解析
      if (/\bJSON\.(parse|stringify)\b/.test(trimmed) && /(big|large|huge|data)/i.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '大数据量JSON处理',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '大 JSON 解析耗时显著，考虑流式处理或分块',
        })
      }

      // execSync / spawnSync 同步子进程
      if (/execSync|spawnSync|execFileSync/.test(trimmed)) {
        issues.push({
          severity: '',
          type: '同步子进程调用',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '阻塞直到子进程完成，建议改用异步 spawn/exec',
        })
      }
    })
  }

  const filesChecked = scanProjectFiles(targetPath, checkFile)

  lines.push(`## 📋 结果`)
  lines.push(`- 检查文件数: ${filesChecked}`)
  lines.push(`- 发现瓶颈: ${issues.length} 个`)
  lines.push('')

  const high = issues.filter(i => i.severity === '').length
  const medium = issues.filter(i => i.severity === '🟡').length

  lines.push('')
  lines.push(`## 📊 瓶颈分布`)
  lines.push(`-  严重阻塞: ${high} 个`)
  lines.push(`- 🟡 中等风险: ${medium} 个`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('##  瓶颈列表（前20条）')
    issues.slice(0, 20).forEach(i => {
      lines.push(`- ${i.severity} [${i.type}] ${i.detail}`)
      lines.push(`  💡 ${i.advice}`)
    })
  } else {
    lines.push('##  未发现明显性能瓶颈')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 内存分析 — 检测内存泄漏和内存使用问题
// ============================================================================

function memoryAnalysis(targetPath: string) {
  const lines: string[] = ['# 🧠 内存使用分析\n']
  const issues: Array<{ severity: string; type: string; detail: string; advice: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()

      // 循环中创建对象/数组/Map/Set
      if (/new\s+(Array|Object|Map|Set)\s*\(/.test(trimmed)) {
        const inLoop = fileLines.slice(Math.max(0, idx - 8), idx).some(l => /\bfor\b|\bwhile\b|\bmap\s*\(|\bfilter\s*\(/.test(l))
        if (inLoop) {
          issues.push({
            severity: '🟡',
            type: '循环中创建对象',
            detail: `${path.basename(filePath)}:${idx + 1}`,
            advice: '每轮迭代创建新对象，会产生大量垃圾回收压力',
          })
        }
      }

      // 全局变量存储大数据
      if (/^(const|let|var)\s+\w+\s*=\s*\[\s*$/.test(trimmed) || /^(const|let|var)\s+\w+\s*=\s*new\s+Map/.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '全局大数据结构',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '全局持有的数据会一直驻留内存，注意生命周期管理',
        })
      }

      // 无限增长的缓存（无清理逻辑）
      if (/cache|memo|store|buffer/i.test(trimmed) && /\.set\(|\.push\(/.test(trimmed)) {
        const hasCleanup = fileLines.slice(idx, idx + 20).some(l => /delete|clear|splice|shift|remove/i.test(l))
        if (!hasCleanup) {
          issues.push({
            severity: '🟡',
            type: '缓存无清理机制',
            detail: `${path.basename(filePath)}:${idx + 1}`,
            advice: '缓存/存储持续增长，建议设置上限或定期清理',
          })
        }
      }

      // 事件监听器未移除
      if (/addEventListener|\.on\(|\.subscribe\(/.test(trimmed)) {
        issues.push({
          severity: '🟢',
          type: '事件监听器',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '确认监听器有对应的移除逻辑（removeEventListener/off/unsubscribe）',
        })
      }

      // 大数组字面量
      if (/=\s*\[.+\]/.test(trimmed) && trimmed.length > 200) {
        issues.push({
          severity: '🟢',
          type: '大数组字面量',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '超大数组字面量增加加载时间和内存占用',
        })
      }

      // 内存密集型函数（Array(n).fill）
      if (/new\s+Array\(\s*\w+\s*\)/.test(trimmed)) {
        issues.push({
          severity: '🟡',
          type: '动态分配大数组',
          detail: `${path.basename(filePath)}:${idx + 1}`,
          advice: '根据变量动态分配数组，注意数据规模上限',
        })
      }
    })
  }

  const filesChecked = scanProjectFiles(targetPath, checkFile)

  lines.push(`## 📋 结果`)
  lines.push(`- 检查文件数: ${filesChecked}`)
  lines.push(`- 发现内存问题: ${issues.length} 个`)
  lines.push('')

  const high = issues.filter(i => i.severity === '🟡').length
  const low = issues.filter(i => i.severity === '🟢').length

  lines.push('')
  lines.push(`## 📊 风险分布`)
  lines.push(`- 🟡 内存风险: ${high} 个`)
  lines.push(`- 🟢 建议关注: ${low} 个`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('##  内存问题列表（前20条）')
    issues.slice(0, 20).forEach(i => {
      lines.push(`- ${i.severity} [${i.type}] ${i.detail}`)
      lines.push(`  💡 ${i.advice}`)
    })
  } else {
    lines.push('##  未发现明显内存问题')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 通用：扫描项目文件并对每个文件执行回调
// ============================================================================

function scanProjectFiles(targetPath: string, checkFile: (filePath: string) => void): number {
  let fileCount = 0

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        fileCount++
        checkFile(fullPath)
      }
    }
  }

  if (fs.statSync(targetPath).isDirectory()) {
    scanDir(targetPath)
  } else {
    fileCount = 1
    checkFile(targetPath)
  }

  return fileCount
}

// ============================================================================
// 7. GitWorkflowTool — Git 工作流（吸收 devops-automation 能力）
// ============================================================================

const GitInputSchema = z.object({
  action: z.enum(['status', 'branches', 'log', 'stash', 'diff']).describe('操作类型'),
  path: z.string().describe('Git 仓库路径'),
})

export const GitWorkflowTool: Tool = {
  name: 'GitWorkflow',
  description: `Git 工作流工具 — 分析 Git 仓库状态。
- status: 查看仓库状态
- branches: 分析分支情况
- log: 查看提交历史
- stash: 查看暂存区
- diff: 查看未提交的更改`,

  inputSchema: GitInputSchema,

  async call(input: z.infer<typeof GitInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)
    const gitDir = path.join(resolvedPath, '.git')

    if (!fs.existsSync(gitDir)) {
      return { type: 'text', value: ` 不是 Git 仓库: ${resolvedPath}` }
    }

    const lines: string[] = ['# 🔀 Git 工作流报告\n']

    try {
      switch (action) {
        case 'status': {
          const status = execSync('git status --short', { cwd: resolvedPath, encoding: 'utf-8' })
          const branch = execSync('git branch --show-current', { cwd: resolvedPath, encoding: 'utf-8' }).trim()

          lines.push(`## 📊 仓库状态`)
          lines.push(`- 当前分支: ${branch}`)
          lines.push('')

          if (status.trim()) {
            const files = status.trim().split('\n')
            lines.push(`- 更改文件数: ${files.length}`)
            lines.push('')
            lines.push('## 📁 更改文件')
            files.forEach(f => lines.push(`- ${f}`))
          } else {
            lines.push('##  工作区干净')
          }

          // 检查远程同步
          try {
            const ahead = execSync('git rev-list --count @{u}..HEAD', { cwd: resolvedPath, encoding: 'utf-8' }).trim()
            const behind = execSync('git rev-list --count HEAD..@{u}', { cwd: resolvedPath, encoding: 'utf-8' }).trim()
            lines.push('')
            lines.push('## 🔄 远程同步')
            lines.push(`- 未推送提交: ${ahead}`)
            lines.push(`- 未拉取提交: ${behind}`)
          } catch { /* no remote */ }

          break
        }

        case 'branches': {
          const branches = execSync('git branch -a', { cwd: resolvedPath, encoding: 'utf-8' })
          const branchList = branches.split('\n').filter(Boolean)

          lines.push(`## 🌿 分支列表`)
          lines.push(`- 总分支数: ${branchList.length}`)
          lines.push('')

          const local = branchList.filter(b => !b.startsWith('remotes/'))
          const remote = branchList.filter(b => b.startsWith('remotes/'))

          lines.push(`- 本地分支: ${local.length}`)
          local.forEach(b => lines.push(`  - ${b.trim()}`))
          lines.push('')
          lines.push(`- 远程分支: ${remote.length}`)
          remote.forEach(b => lines.push(`  - ${b.trim()}`))

          break
        }

        case 'log': {
          const log = execSync('git log --oneline -20', { cwd: resolvedPath, encoding: 'utf-8' })
          const commits = log.split('\n').filter(Boolean)

          lines.push(`## 📜 提交历史（最近20条）`)
          lines.push('')
          commits.forEach(c => lines.push(`- ${c}`))

          // 统计
          const total = execSync('git rev-list --count HEAD', { cwd: resolvedPath, encoding: 'utf-8' }).trim()
          lines.push('')
          lines.push(`## 📊 统计`)
          lines.push(`- 总提交数: ${total}`)

          break
        }

        case 'stash': {
          const stash = execSync('git stash list', { cwd: resolvedPath, encoding: 'utf-8' })
          if (stash.trim()) {
            lines.push(`## 📦 暂存列表`)
            stash.split('\n').filter(Boolean).forEach(s => lines.push(`- ${s}`))
          } else {
            lines.push('##  暂存区为空')
          }
          break
        }

        case 'diff': {
          const diff = execSync('git diff --stat', { cwd: resolvedPath, encoding: 'utf-8' })
          if (diff.trim()) {
            lines.push(`## 📝 未提交更改`)
            lines.push('```')
            lines.push(diff)
            lines.push('```')
          } else {
            lines.push('##  无未提交更改')
          }
          break
        }
      }

      return { type: 'text', value: lines.join('\n') }
    } catch (err) {
      return { type: 'text', value: ` Git 操作失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

// ============================================================================
// 8. DependencyAnalyzer — 依赖分析（吸收 fullstack-engineer 能力）
// ============================================================================

const DependencyInputSchema = z.object({
  action: z.enum(['list', 'outdated', 'vulnerabilities', 'graph']).describe('分析类型'),
  path: z.string().describe('项目路径'),
})

export const DependencyAnalyzer: Tool = {
  name: 'DependencyAnalysis',
  description: `依赖分析工具 — 分析项目依赖关系。
- list: 列出所有依赖
- outdated: 检查过时依赖
- vulnerabilities: 检查安全漏洞
- graph: 生成依赖图描述`,

  inputSchema: DependencyInputSchema,

  async call(input: z.infer<typeof DependencyInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)
    const pkgPath = path.join(resolvedPath, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      return { type: 'text', value: ` 未找到 package.json: ${pkgPath}` }
    }

    const lines: string[] = ['# 📦 依赖分析报告\n']
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps = pkg.dependencies || {}
    const devDeps = pkg.devDependencies || {}
    const allDeps = { ...deps, ...devDeps }

    switch (action) {
      case 'list': {
        lines.push('## 📊 依赖概览')
        lines.push(`- 生产依赖: ${Object.keys(deps).length}`)
        lines.push(`- 开发依赖: ${Object.keys(devDeps).length}`)
        lines.push(`- 总依赖: ${Object.keys(allDeps).length}`)
        lines.push('')

        lines.push('## 📋 生产依赖')
        Object.entries(deps).slice(0, 20).forEach(([name, ver]) => {
          lines.push(`- ${name}: ${ver}`)
        })
        if (Object.keys(deps).length > 20) {
          lines.push(`- ... 还有 ${Object.keys(deps).length - 20} 个`)
        }
        break
      }

      case 'outdated': {
        lines.push('## 🔄 过时依赖检查')
        lines.push('')

        // 简单检查：比对 lock 文件中的版本
        const lockPath = path.join(resolvedPath, 'package-lock.json')
        if (fs.existsSync(lockPath)) {
          try {
            const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
            const locked = lock.packages || {}
            const outdated: string[] = []

            for (const [name, ver] of Object.entries(allDeps)) {
              const lockedVer = locked[`node_modules/${name}`]?.version
              if (lockedVer && !String(ver).includes(lockedVer)) {
                outdated.push(`${name}: 声明 ${ver} → 锁定 ${lockedVer}`)
              }
            }

            if (outdated.length > 0) {
              lines.push('##  版本不一致')
              outdated.forEach(o => lines.push(`- ${o}`))
            } else {
              lines.push('##  版本一致')
            }
          } catch {
            lines.push(' 无法解析 package-lock.json')
          }
        }
        break
      }

      case 'vulnerabilities': {
        lines.push('## 🔒 安全检查')
        lines.push('')

        const issues: string[] = []

        // 检查已知有问题的依赖
        if (allDeps['lodash'] && !allDeps['lodash'].includes('4.17.21')) {
          issues.push('lodash 版本可能有原型污染漏洞')
        }
        if (allDeps['minimatch'] && !allDeps['minimatch'].includes('3.1.2')) {
          issues.push('minimatch 版本可能有 ReDoS 漏洞')
        }
        if (allDeps['semver'] && !allDeps['semver'].includes('7.')) {
          issues.push('semver 版本可能有 ReDoS 漏洞')
        }

        // 检查依赖数量
        if (Object.keys(allDeps).length > 100) {
          issues.push(`依赖数量过多（${Object.keys(allDeps).length}个），增加攻击面`)
        }

        if (issues.length > 0) {
          lines.push('##  发现的问题')
          issues.forEach(i => lines.push(`- ${i}`))
        } else {
          lines.push('##  未发现明显安全问题')
        }
        break
      }

      case 'graph': {
        lines.push('## 🕸 依赖图描述')
        lines.push('')
        lines.push('```mermaid')
        lines.push('graph TD')
        lines.push(`  ${pkg.name || 'root'}[${pkg.name || '项目'}]`)

        const topDeps = Object.keys(deps).slice(0, 10)
        topDeps.forEach((dep, idx) => {
          lines.push(`  ${pkg.name || 'root'} --> dep${idx}[${dep}]`)
        })

        if (Object.keys(deps).length > 10) {
          lines.push(`  ${pkg.name || 'root'} --> more[... ${Object.keys(deps).length - 10} more]`)
        }

        lines.push('```')
        break
      }
    }

    return { type: 'text', value: lines.join('\n') }
  },
}

// ============================================================================
// 9. TestGenerator — 测试生成（吸收 qa-engineer 能力）
// ============================================================================

const TestGenInputSchema = z.object({
  action: z.enum(['suggest', 'coverage', 'missing']).describe('操作类型'),
  path: z.string().describe('要分析的文件或目录'),
})

export const TestGenerator: Tool = {
  name: 'TestGenerator',
  description: `测试生成工具 — 分析和生成测试建议。
- suggest: 为代码生成测试建议
- coverage: 分析测试覆盖率
- missing: 检测缺少测试的文件`,

  inputSchema: TestGenInputSchema,

  async call(input: z.infer<typeof TestGenInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: ` 路径不存在: ${resolvedPath}` }
    }

    switch (action) {
      case 'suggest':
        return suggestTests(resolvedPath, fs.statSync(resolvedPath).isDirectory())
      case 'coverage':
        return analyzeCoverage(resolvedPath)
      case 'missing':
        return findMissingTests(resolvedPath)
      default:
        return { type: 'text', value: ` 未知操作: ${action}` }
    }
  },
}

// ============================================================================
// 测试覆盖率分析 — 静态评估源文件的测试覆盖情况
// ============================================================================

function analyzeCoverage(targetPath: string) {
  const lines: string[] = ['# 🎯 测试覆盖率分析\n']

  interface SourceFile {
    path: string
    functions: string[]
    classes: string[]
    methods: number
  }

  const sourceFiles: SourceFile[] = []
  const testFiles: string[] = []

  function analyzeSourceFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')
    const functions: string[] = []
    const classes: string[] = []
    let methods = 0

    fileLines.forEach(line => {
      const trimmed = line.trim()
      // 函数声明
      const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      if (funcMatch) functions.push(funcMatch[1])
      // 箭头函数/变量函数
      const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>/)
      if (arrowMatch) functions.push(arrowMatch[1])
      // 类声明
      const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/)
      if (classMatch) classes.push(classMatch[1])
      // 类方法
      if (/^\s*(?:async\s+)?[a-zA-Z_$][\w$]*\s*\([^)]*\)\s*\{/.test(trimmed)) {
        methods++
      }
    })

    sourceFiles.push({ path: filePath, functions, classes, methods })
  }

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
          testFiles.push(fullPath)
        } else {
          analyzeSourceFile(fullPath)
        }
      }
    }
  }

  if (fs.statSync(targetPath).isDirectory()) {
    scanDir(targetPath)
  } else {
    analyzeSourceFile(targetPath)
  }

  // 统计测试用例数量（it/test/describe）
  let testCaseCount = 0
  const testedSymbols = new Set<string>()
  testFiles.forEach(tf => {
    try {
      const content = fs.readFileSync(tf, 'utf-8')
      const tests = content.match(/\b(it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/g) || []
      testCaseCount += tests.length
      // 提取测试中引用的函数名/类名
      const symbolMatches = content.match(/\b(?:new\s+)?([A-Za-z_$][\w$]*)\s*[\(\.,]/g) || []
      symbolMatches.forEach(s => {
        const name = s.replace(/[\(\.,\s]/g, '')
        if (name.length > 2) testedSymbols.add(name)
      })
    } catch { /* 忽略无法读取的文件 */ }
  })

  // 计算覆盖率
  const totalFiles = sourceFiles.length
  const fileHasTest = new Set<string>()
  sourceFiles.forEach(sf => {
    const base = path.basename(sf.path).replace(/\.(ts|tsx|js|jsx)$/, '')
    if (testFiles.some(tf => path.basename(tf).includes(base))) {
      fileHasTest.add(sf.path)
    }
  })

  const coveredFiles = fileHasTest.size
  const fileCoverage = totalFiles > 0 ? ((coveredFiles / totalFiles) * 100).toFixed(1) : '0'

  // 函数覆盖率（近似）
  let totalFunctions = 0
  let coveredFunctions = 0
  sourceFiles.forEach(sf => {
    totalFunctions += sf.functions.length + sf.classes.length
    sf.functions.forEach(fn => {
      if (testedSymbols.has(fn)) coveredFunctions++
    })
    sf.classes.forEach(cls => {
      if (testedSymbols.has(cls)) coveredFunctions++
    })
  })
  const functionCoverage = totalFunctions > 0 ? ((coveredFunctions / totalFunctions) * 100).toFixed(1) : '0'

  lines.push(`## 📋 统计概览`)
  lines.push(`- 源文件数: ${totalFiles}`)
  lines.push(`- 测试文件数: ${testFiles.length}`)
  lines.push(`- 测试用例数: ${testCaseCount}`)
  lines.push(`- 函数/类总数: ${totalFunctions}`)
  lines.push('')

  lines.push(`## 📊 覆盖率`)
  lines.push(`- **文件覆盖率**: ${fileCoverage}% (${coveredFiles}/${totalFiles})`)
  lines.push(`- **函数覆盖率(近似)**: ${functionCoverage}% (${coveredFunctions}/${totalFunctions})`)
  lines.push('')

  // 覆盖率评级
  const cov = parseFloat(fileCoverage)
  lines.push(`## 🏷 覆盖率评级`)
  if (cov >= 80) lines.push('- 🟢 优秀（≥80%），测试覆盖良好')
  else if (cov >= 50) lines.push('- 🟡 良好（50-80%），建议补充关键路径测试')
  else if (cov >= 20) lines.push('- 🟠 一般（20-50%），测试覆盖不足')
  else lines.push('-  偏低（<20%），急需补充测试')
  lines.push('')

  // 未覆盖的文件列表
  const uncoveredFiles = sourceFiles.filter(sf => !fileHasTest.has(sf.path))
  if (uncoveredFiles.length > 0) {
    lines.push(`##  未覆盖的文件（${uncoveredFiles.length} 个，前15个）`)
    uncoveredFiles.slice(0, 15).forEach(sf => {
      const funcNames = sf.functions.slice(0, 5).join(', ')
      lines.push(`- ${path.relative(targetPath, sf.path)}${funcNames ? ` [函数: ${funcNames}]` : ''}`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

function suggestTests(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 🧪 测试建议\n']
  const suggestions: Array<{ file: string; type: string; suggestion: string }> = []

  function analyzeFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    // 检测函数/类
    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()

      // 函数声明
      if (/^(export\s+)?(async\s+)?function\s+\w+/.test(trimmed)) {
        const funcName = trimmed.match(/function\s+(\w+)/)?.[1]
        suggestions.push({
          file: path.basename(filePath),
          type: '函数测试',
          suggestion: `为函数 ${funcName} 编写单元测试`
        })
      }

      // 类声明
      if (/^(export\s+)?class\s+\w+/.test(trimmed)) {
        const className = trimmed.match(/class\s+(\w+)/)?.[1]
        suggestions.push({
          file: path.basename(filePath),
          type: '类测试',
          suggestion: `为类 ${className} 编写测试用例`
        })
      }

      // API 端点
      if (/\b(get|post|put|delete|patch)\s*\(\s*['"/]/.test(trimmed)) {
        suggestions.push({
          file: path.basename(filePath),
          type: 'API测试',
          suggestion: `为 API 端点编写集成测试`
        })
      }

      // 错误处理
      if (/throw\s+new\b/.test(trimmed)) {
        suggestions.push({
          file: path.basename(filePath),
          type: '异常测试',
          suggestion: `为异常情况编写测试`
        })
      }
    })
  }

  if (isDir) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'test', 'tests', '__tests__'].includes(entry.name)) {
            scanDir(fullPath)
          }
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          analyzeFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    analyzeFile(targetPath)
  }

  lines.push(`## 📋 测试建议`)
  lines.push(`- 发现建议: ${suggestions.length} 个`)
  lines.push('')

  if (suggestions.length === 0) {
    lines.push('##  未发现需要测试的代码')
  } else {
    lines.push('##  建议列表（前20条）')
    suggestions.slice(0, 20).forEach(s => {
      lines.push(`- [${s.type}] ${s.file} — ${s.suggestion}`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

function findMissingTests(targetPath: string) {
  const lines: string[] = ['#  缺少测试的文件\n']
  const sourceFiles: string[] = []
  const testFiles = new Set<string>()

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const baseName = entry.name.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')
        if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
          testFiles.add(baseName)
        } else {
          sourceFiles.push(fullPath)
        }
      }
    }
  }

  scanDir(targetPath)

  const missing = sourceFiles.filter(f => {
    const baseName = path.basename(f).replace(/\.(ts|tsx|js|jsx)$/, '')
    return !testFiles.has(baseName)
  })

  lines.push(`## 📋 结果`)
  lines.push(`- 源文件: ${sourceFiles.length}`)
  lines.push(`- 有测试: ${sourceFiles.length - missing.length}`)
  lines.push(`- 缺测试: ${missing.length}`)
  lines.push('')

  if (missing.length > 0) {
    lines.push('##  缺少测试的文件（前20个）')
    missing.slice(0, 20).forEach(f => lines.push(`- ${path.relative(targetPath, f)}`))
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 10. APIAnalyzer — API 分析（吸收 backend-architect 能力）
// ============================================================================

const APIInputSchema = z.object({
  action: z.enum(['routes', 'endpoints', 'types']).describe('分析类型'),
  path: z.string().describe('项目路径'),
})

export const APIAnalyzer: Tool = {
  name: 'APIAnalysis',
  description: `API 分析工具 — 分析项目中的 API 定义。
- routes: 分析路由定义
- endpoints: 分析 API 端点
- types: 分析 API 类型定义`,

  inputSchema: APIInputSchema,

  async call(input: z.infer<typeof APIInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: ` 路径不存在: ${resolvedPath}` }
    }

    // 根据 action 执行不同分析
    switch (action) {
      case 'routes':
        return analyzeRoutes(resolvedPath)
      case 'endpoints':
        return analyzeEndpoints(resolvedPath)
      case 'types':
        return analyzeApiTypes(resolvedPath)
      default:
        return { type: 'text', value: ` 未知操作: ${action}` }
    }
  },
}

// ============================================================================
// 通用：扫描项目文件并收集 API 端点
// ============================================================================

interface ApiEndpoint {
  method: string
  path: string
  file: string
  line: number
  style: string
}

function collectEndpoints(targetPath: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = []

  function findEndpoints(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    const patterns = [
      { regex: /\b(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi, style: 'router' },
      { regex: /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]+)['"]/gi, style: 'decorator' },
      { regex: /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi, style: 'express' },
      { regex: /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi, style: 'express' },
    ]

    fileLines.forEach((line, idx) => {
      for (const { regex, style } of patterns) {
        let match
        while ((match = regex.exec(line)) !== null) {
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            file: path.basename(filePath),
            line: idx + 1,
            style,
          })
        }
      }
    })
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          findEndpoints(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    findEndpoints(targetPath)
  }

  return endpoints
}

// ============================================================================
// 路由分析 — 展示路由注册表（侧重 Express 风格路由）
// ============================================================================

function analyzeRoutes(targetPath: string) {
  const lines: string[] = ['# 🗺 路由定义分析\n']

  // 收集路由挂载（app.use('/api', router) 等）
  interface RouteMount { prefix: string; router: string; file: string; line: number }
  const mounts: RouteMount[] = []
  const routeFiles = new Map<string, number>()

  function scanForMounts(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()
      // app.use('/prefix', router) 或 app.use('/prefix', require('./router'))
      const mountMatch = trimmed.match(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/)
      if (mountMatch) {
        mounts.push({
          prefix: mountMatch[1],
          router: mountMatch[2],
          file: path.basename(filePath),
          line: idx + 1,
        })
      }
      // router.get('/x') 等路由注册
      const routeMatch = trimmed.match(/(?:app|router|[\w]+Router)\.(get|post|put|delete|patch|all)\(\s*['"]([^'"]+)['"]/)
      if (routeMatch) {
        const key = `${path.basename(filePath)}:${idx + 1}`
        routeFiles.set(key, (routeFiles.get(key) || 0) + 1)
      }
    })
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          scanForMounts(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    scanForMounts(targetPath)
  }

  const endpoints = collectEndpoints(targetPath)

  lines.push(`## 📋 路由概览`)
  lines.push(`- 路由挂载点: ${mounts.length} 个`)
  lines.push(`- 路由注册: ${routeFiles.size} 处`)
  lines.push(`- API 端点: ${endpoints.length} 个`)
  lines.push('')

  if (mounts.length > 0) {
    lines.push('## 🔗 路由挂载')
    mounts.forEach(m => {
      lines.push(`- \`${m.prefix}\` → ${m.router} (${m.file}:${m.line})`)
    })
    lines.push('')
  }

  if (endpoints.length > 0) {
    // 按路径前缀分组
    lines.push('## 🧩 路由表（按前缀分组）')
    const grouped = new Map<string, ApiEndpoint[]>()
    endpoints.forEach(ep => {
      const segments = ep.path.split('/').filter(Boolean)
      const prefix = segments.length > 0 ? `/${segments[0]}` : '/'
      const arr = grouped.get(prefix) || []
      arr.push(ep)
      grouped.set(prefix, arr)
    })

    grouped.forEach((eps, prefix) => {
      lines.push(`\n### ${prefix === '/' ? '(根路径)' : prefix}`)
      eps.slice(0, 15).forEach(ep => {
        lines.push(`- ${ep.method.padEnd(6)} ${ep.path} (${ep.file}:${ep.line})`)
      })
      if (eps.length > 15) lines.push(`- ... 还有 ${eps.length - 15} 个`)
    })
  } else {
    lines.push('##  未发现路由定义')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 端点分析 — 通用 API 端点分析（按方法分组）
// ============================================================================

function analyzeEndpoints(targetPath: string) {
  const lines: string[] = ['# 🔌 API 端点分析\n']
  const endpoints = collectEndpoints(targetPath)

  lines.push(`## 📋 发现 API 端点: ${endpoints.length}`)
  lines.push('')

  if (endpoints.length === 0) {
    lines.push('##  未发现 API 端点')
    return { type: 'text', value: lines.join('\n') }
  }

  // 按方法分组
  const byMethod = new Map<string, ApiEndpoint[]>()
  endpoints.forEach(ep => {
    const arr = byMethod.get(ep.method) || []
    arr.push(ep)
    byMethod.set(ep.method, arr)
  })

  lines.push('## 📊 端点分布')
  byMethod.forEach((eps, method) => lines.push(`- ${method}: ${eps.length} 个`))
  lines.push('')

  // 按定义方式统计
  const byStyle = new Map<string, number>()
  endpoints.forEach(ep => {
    byStyle.set(ep.style, (byStyle.get(ep.style) || 0) + 1)
  })
  lines.push('## 🏗 定义方式')
  byStyle.forEach((count, style) => lines.push(`- ${style}: ${count} 个`))
  lines.push('')

  lines.push('## 📁 端点列表（前30个）')
  endpoints.slice(0, 30).forEach(ep => {
    lines.push(`- ${ep.method.padEnd(6)} ${ep.path} (${ep.file}:${ep.line})`)
  })

  // RESTful 规范检查
  const restViolations = endpoints.filter(ep => {
    // 检查 GET 是否含动词（常见不规范）
    if (ep.method === 'GET') {
      const last = ep.path.split('/').filter(Boolean).pop() || ''
      return /^(get|create|add|delete|remove|update|edit|fetch|list|load)/i.test(last)
    }
    return false
  })
  if (restViolations.length > 0) {
    lines.push('')
    lines.push('## 💡 RESTful 建议')
    lines.push(`- ${restViolations.length} 个 GET 端点路径中包含动词，建议使用名词资源路径：`)
    restViolations.slice(0, 5).forEach(ep => {
      lines.push(`  - ${ep.method} ${ep.path} (${ep.file}:${ep.line})`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// API 类型分析 — 分析 TypeScript 接口/类型定义
// ============================================================================

function analyzeApiTypes(targetPath: string) {
  const lines: string[] = ['# 📐 API 类型定义分析\n']

  interface ApiType {
    name: string
    kind: 'interface' | 'type'
    file: string
    line: number
    fields: string[]
    related: boolean
  }

  const types: ApiType[] = []
  let totalInterfaces = 0
  let totalTypeAliases = 0

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    // 使用正则匹配顶层 interface/type 声明
    const interfaceRe = /^(?:export\s+)?interface\s+(\w+)/
    const typeRe = /^(?:export\s+)?type\s+(\w+)\s*=/

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()
      let name: string | null = null
      let kind: 'interface' | 'type' | null = null

      const im = trimmed.match(interfaceRe)
      if (im) {
        name = im[1]
        kind = 'interface'
        totalInterfaces++
      }
      const tm = trimmed.match(typeRe)
      if (tm) {
        name = tm[1]
        kind = 'type'
        totalTypeAliases++
      }

      if (name && kind) {
        // 收集字段（后续行直到匹配到下一个声明或 }）
        const fields: string[] = []
        for (let j = idx + 1; j < Math.min(idx + 30, fileLines.length); j++) {
          const next = fileLines[j].trim()
          if (next.startsWith('}')) break
          if (next.includes(':') && !next.startsWith('type') && !next.startsWith('interface')) {
            fields.push(next.slice(0, 60))
          }
        }

        // 判断是否与 API 相关（名称包含常见 API 关键词）
        const apiKeywords = /(response|request|api|dto|model|payload|result|params|body|data|error)/i
        types.push({
          name,
          kind,
          file: path.basename(filePath),
          line: idx + 1,
          fields,
          related: apiKeywords.test(name),
        })
      }
    })
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  const apiRelated = types.filter(t => t.related)

  lines.push(`## 📋 类型统计`)
  lines.push(`- interface 定义: ${totalInterfaces} 个`)
  lines.push(`- type 别名: ${totalTypeAliases} 个`)
  lines.push(`- 与 API 相关类型: ${apiRelated.length} 个`)
  lines.push('')

  if (apiRelated.length > 0) {
    lines.push(`## 🎯 API 相关类型（${apiRelated.length} 个）`)
    apiRelated.slice(0, 20).forEach(t => {
      lines.push(`- ${t.kind === 'interface' ? 'interface' : 'type'} **${t.name}** (${t.file}:${t.line})`)
      t.fields.slice(0, 5).forEach(f => lines.push(`  - ${f}`))
      if (t.fields.length > 5) lines.push(`  - ... ${t.fields.length - 5} 个字段`)
    })
    lines.push('')
  }

  if (totalInterfaces > 0 || totalTypeAliases > 0) {
    lines.push('## 📊 类型分布')
    lines.push(`- 接口: ${((totalInterfaces / Math.max(1, totalInterfaces + totalTypeAliases)) * 100).toFixed(0)}%`)
    lines.push(`- 类型别名: ${((totalTypeAliases / Math.max(1, totalInterfaces + totalTypeAliases)) * 100).toFixed(0)}%`)
    lines.push('')

    // 最复杂类型（字段最多）
    const topComplex = [...types].sort((a, b) => b.fields.length - a.fields.length).slice(0, 5)
    if (topComplex.length > 0) {
      lines.push('## 🏋 最复杂类型（字段最多）')
      topComplex.forEach(t => {
        lines.push(`- **${t.name}**: ${t.fields.length} 个字段 (${t.file}:${t.line})`)
      })
    }
  } else {
    lines.push('##  未发现 TypeScript 类型定义')
  }

  return { type: 'text', value: lines.join('\n') }
}

// 导出所有工具
export const PowerTools2 = [
  DataAnalysisTool,
  PerformanceProfiler,
  GitWorkflowTool,
  DependencyAnalyzer,
  TestGenerator,
  APIAnalyzer,
]
