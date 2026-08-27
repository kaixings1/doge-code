import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

const HELP = `Pipeline — 数据流管道处理

用法: /pipeline <操作> [数据]

操作:
  --sort <field>         按字段排序 (支持 -field 降序)
  --where <expr>         过滤条件 (支持 ==, !=, >, <, >=, <=)
  --map <expr>           字段映射 (key:value, 支持简单计算)
  --dedupe <field>       按字段去重
  --limit <n>            限制输出条数
  --count                只输出计数
  --json                  JSON 格式输出
  --help                  显示帮助

示例:
  /pipeline --sort age --where "age > 25" --map "name"
  /pipeline --dedupe category --limit 10 --json
  /pipeline --sort -price --where "price > 100"
`

interface DataRow {
  [key: string]: unknown
}

function parseValue(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  const num = Number(v)
  if (!Number.isNaN(num)) return num
  return v
}

function evaluateExpr(row: DataRow, expr: string): boolean {
  const operators = ['>=', '<=', '!=', '==', '>', '<']
  for (const op of operators) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue
    const field = expr.slice(0, idx).trim()
    const valueStr = expr.slice(idx + op.length).trim()
    const left = row[field]
    const right = parseValue(valueStr)
    switch (op) {
      case '==': return left == right
      case '!=': return left != right
      case '>': return (left as number) > (right as number)
      case '<': return (left as number) < (right as number)
      case '>=': return (left as number) >= (right as number)
      case '<=': return (left as number) <= (right as number)
    }
  }
  return false
}

function transformMap(row: DataRow, expr: string): DataRow {
  const result: DataRow = { ...row }
  const parts = expr.split(',').map(p => p.trim())
  for (const part of parts) {
    if (part.includes(':')) {
      const [k, v] = part.split(':').map(s => s.trim())
      if (v.startsWith('$')) {
        const field = v.slice(1)
        result[k] = row[field]
      } else if (v.startsWith('"') || v.startsWith("'")) {
        result[k] = v.slice(1, -1)
      } else {
        result[k] = parseValue(v)
      }
    }
  }
  return result
}

const MOCK_DATA: DataRow[] = [
  { name: 'Alice', age: 30, city: 'Beijing', salary: 15000, department: 'Engineering' },
  { name: 'Bob', age: 25, city: 'Shanghai', salary: 18000, department: 'Engineering' },
  { name: 'Carol', age: 35, city: 'Beijing', salary: 22000, department: 'Design' },
  { name: 'Dave', age: 28, city: 'Shenzhen', salary: 16000, department: 'Engineering' },
  { name: 'Eve', age: 32, city: 'Shanghai', salary: 25000, department: 'Product' },
  { name: 'Frank', age: 40, city: 'Beijing', salary: 30000, department: 'Management' },
  { name: 'Grace', age: 27, city: 'Shenzhen', salary: 17000, department: 'Design' },
  { name: 'Henry', age: 33, city: 'Shanghai', salary: 20000, department: 'Product' },
  { name: 'Ivy', age: 29, city: 'Beijing', salary: 19000, department: 'Engineering' },
  { name: 'Jack', age: 45, city: 'Shenzhen', salary: 35000, department: 'Management' },
]

function sortData(data: DataRow[], field: string): DataRow[] {
  const desc = field.startsWith('-')
  const key = desc ? field.slice(1) : field
  return [...data].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av == null || bv == null) return 0
    if (typeof av === 'number' && typeof bv === 'number') {
      return desc ? bv - av : av - bv
    }
    const as = String(av)
    const bs = String(bv)
    return desc ? bs.localeCompare(as) : as.localeCompare(bs)
  })
}

function filterData(data: DataRow[], expr: string): DataRow[] {
  return data.filter(row => evaluateExpr(row, expr))
}

function mapData(data: DataRow[], expr: string): DataRow[] {
  return data.map(row => transformMap(row, expr))
}

function dedupeData(data: DataRow[], field: string): DataRow[] {
  const seen = new Set<unknown>()
  return data.filter(row => {
    const val = row[field]
    if (seen.has(val)) return false
    seen.add(val)
    return true
  })
}

function limitData(data: DataRow[], n: number): DataRow[] {
  return data.slice(0, n)
}

function formatMarkdown(data: DataRow[], countOnly = false): string {
  if (countOnly) {
    return `# Pipeline Result\n\nTotal: ${data.length} records\n`
  }
  if (data.length === 0) return '# Pipeline Result\n\nNo matching records found.\n'

  const keys = Object.keys(data[0])
  let md = `# Pipeline Result\n\n`
  md += `Total: ${data.length} records\n\n`
  md += '| ' + keys.join(' | ') + ' |\n'
  md += '| ' + keys.map(() => '---').join(' | ') + ' |\n'
  for (const row of data.slice(0, 50)) {
    md += '| ' + keys.map(k => String(row[k] ?? '')).join(' | ') + ' |\n'
  }
  if (data.length > 50) {
    md += `\n... and ${data.length - 50} more rows (use --json for full output)\n`
  }
  return md
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s === '--help' || s === '') {
    return { type: 'text', value: HELP }
  }

  const json = s.includes('--json')
  const countOnly = s.includes('--count')

  let data = [...MOCK_DATA]

  const sortMatch = s.match(/--sort\s+(-?\w+)/)
  const whereMatch = s.match(/--where\s+"([^"]+)"/) || s.match(/--where\s+'([^']+)'/)
  const mapMatch = s.match(/--map\s+"([^"]+)"/) || s.match(/--map\s+'([^']+)'/)
  const dedupeMatch = s.match(/--dedupe\s+(\w+)/)
  const limitMatch = s.match(/--limit\s+(\d+)/)

  if (sortMatch) {
    data = sortData(data, sortMatch[1])
  }

  if (whereMatch) {
    data = filterData(data, whereMatch[1])
  }

  if (mapMatch) {
    data = mapData(data, mapMatch[1])
  }

  if (dedupeMatch) {
    data = dedupeData(data, dedupeMatch[1])
  }

  if (limitMatch) {
    data = limitData(data, parseInt(limitMatch[1]))
  }

  if (json) {
    return { type: 'text', value: JSON.stringify({ total: data.length, data }, null, 2) }
  }

  return { type: 'text', value: formatMarkdown(data, countOnly) }
}

const pipeline: Command = {
  type: 'local',
  name: 'pipeline',
  description: '数据流管道处理 — 支持 sort/filter/map/dedupe 链式操作',
  aliases: ['pipeline', 'pipe'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default pipeline
