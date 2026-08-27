import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

const HELP = `Data Query — 查询和过滤 JSON/CSV 数据

用法: /data-query [选项]

选项:
  --filter <expr>     过滤条件 (field == value, field > num)
  --select <fields>   选择字段 (逗号分隔)
  --limit <n>         限制输出条数
  --format <json|table|raw>  输出格式 (默认: table)
  --count             只输出计数
  --json              JSON 格式输出 (等价于 --format json)
  --help             显示帮助

示例:
  /data-query --filter "department == Engineering" --select name,age
  /data-query --filter "salary > 20000" --format json
  /data-query --limit 5 --count
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

function evaluateFilter(row: DataRow, expr: string): boolean {
  const operators = ['>=', '<=', '!=', '==', '>', '<']
  for (const op of operators) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue
    const field = expr.slice(0, idx).trim()
    const valueStr = expr.slice(idx + op.length).trim()
    const left = row[field]
    const right = parseValue(valueStr)
    if (left == null) return false
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

function selectFields(row: DataRow, fields: string[]): DataRow {
  const result: DataRow = {}
  for (const f of fields) {
    if (f in row) {
      result[f] = row[f]
    }
  }
  return result
}

const MOCK_DATA: DataRow[] = [
  { id: 1, name: 'Alice', age: 30, city: 'Beijing', salary: 15000, department: 'Engineering', level: 'Senior' },
  { id: 2, name: 'Bob', age: 25, city: 'Shanghai', salary: 18000, department: 'Engineering', level: 'Junior' },
  { id: 3, name: 'Carol', age: 35, city: 'Beijing', salary: 22000, department: 'Design', level: 'Senior' },
  { id: 4, name: 'Dave', age: 28, city: 'Shenzhen', salary: 16000, department: 'Engineering', level: 'Junior' },
  { id: 5, name: 'Eve', age: 32, city: 'Shanghai', salary: 25000, department: 'Product', level: 'Senior' },
  { id: 6, name: 'Frank', age: 40, city: 'Beijing', salary: 30000, department: 'Management', level: 'Director' },
  { id: 7, name: 'Grace', age: 27, city: 'Shenzhen', salary: 17000, department: 'Design', level: 'Junior' },
  { id: 8, name: 'Henry', age: 33, city: 'Shanghai', salary: 20000, department: 'Product', level: 'Senior' },
  { id: 9, name: 'Ivy', age: 29, city: 'Beijing', salary: 19000, department: 'Engineering', level: 'Mid' },
  { id: 10, name: 'Jack', age: 45, city: 'Shenzhen', salary: 35000, department: 'Management', level: 'VP' },
]

function formatJson(data: DataRow[]): string {
  return JSON.stringify({ total: data.length, data }, null, 2)
}

function formatTable(data: DataRow[]): string {
  if (data.length === 0) return '# Data Query Result\n\nNo matching records found.\n'
  const keys = Object.keys(data[0])
  let md = `# Data Query Result\n\n`
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

function formatRaw(data: DataRow[]): string {
  return data.map(row => JSON.stringify(row)).join('\n')
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s === '--help' || s === '') {
    return { type: 'text', value: HELP }
  }

  const jsonOutput = s.includes('--json')
  const countOnly = s.includes('--count')
  const filterMatch = s.match(/--filter\s+"([^"]+)"/) || s.match(/--filter\s+'([^']+)'/)
  const selectMatch = s.match(/--select\s+(\S+)/)
  const limitMatch = s.match(/--limit\s+(\d+)/)
  const formatMatch = s.match(/--format\s+(\w+)/)

  let data = [...MOCK_DATA]

  if (filterMatch) {
    data = data.filter(row => evaluateFilter(row, filterMatch[1]))
  }

  if (selectMatch) {
    const fields = selectMatch[1].split(',').map(f => f.trim())
    data = data.map(row => selectFields(row, fields))
  }

  if (limitMatch) {
    data = data.slice(0, parseInt(limitMatch[1]))
  }

  if (countOnly) {
    return { type: 'text', value: JSON.stringify({ total: data.length }, null, 2) }
  }

  const fmt = jsonOutput ? 'json' : (formatMatch?.[1] || 'table')

  let output: string
  switch (fmt) {
    case 'json':
      output = formatJson(data)
      break
    case 'table':
      output = formatTable(data)
      break
    case 'raw':
      output = formatRaw(data)
      break
    default:
      output = formatTable(data)
  }

  return { type: 'text', value: output }
}

const dataQuery: Command = {
  type: 'local',
  name: 'data-query',
  description: '查询和过滤 JSON/CSV 数据 — 支持 filter/select/limit/format',
  aliases: ['data-query', 'dq'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default dataQuery
