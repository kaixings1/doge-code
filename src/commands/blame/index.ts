import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

interface BlameLine {
  line: number
  author: string
  date: string
  hash: string
  text: string
}

function blameFile(file: string): BlameLine[] {
  try {
    const output = execSync('git blame --line-porcelain "' + file + '" 2>/dev/null', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const lines: BlameLine[] = []
    let current: Partial<BlameLine> = {}
    output.split('\n').forEach(rawLine => {
      if (rawLine.startsWith('author ')) current.author = rawLine.slice(7)
      else if (rawLine.startsWith('author-time ')) {
        const ts = parseInt(rawLine.slice(12))
        current.date = new Date(ts * 1000).toISOString().slice(0, 10)
      } else if (rawLine.startsWith('\t')) {
        current.text = rawLine.slice(1)
        if (current.line !== undefined) lines.push(current as BlameLine)
        current = {}
      } else if (rawLine.match(/^[a-f0-9]{40}/)) current.hash = rawLine.slice(0, 7)
      else if (rawLine.startsWith('filename ')) current.line = (current.line || 0) + 1
    })
    return lines
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      '📝 Git Blame', '', '📖 用法：',
      '  /blame <文件>               查看文件 blame',
      '  /blame <文件> <起> <止>     查看行范围 blame',
      '  /blame authors <文件>       作者统计',
      '  /blame heat <文件>          作者热力图',
      '  /blame recent <文件>        最近修改',
    ].join('\n') }
  }

  if (cmd === 'authors') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + (file || '') }
    const lines = blameFile(file)
    if (lines.length === 0) return { type: 'text', value: '⚠️ 无 blame 数据' }
    const authors: Record<string, number> = {}
    lines.forEach(l => { authors[l.author] = (authors[l.author] || 0) + 1 })
    const sorted = Object.entries(authors).sort((a: any, b: any) => b[1] - a[1])
    const result = ['📊 作者统计：' + file, '══════════════', '']
    sorted.forEach(([a, c]) => result.push(a + ': ' + c + ' 行 (' + Math.round(c / lines.length * 100) + '%)'))
    return { type: 'text', value: result.join('\n') }
  }

  if (cmd === 'heat') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + (file || '') }
    const lines = blameFile(file)
    if (lines.length === 0) return { type: 'text', value: '⚠️ 无 blame 数据' }
    const authors = new Set(lines.map(l => l.author))
    const result = ['🔥 作者热力图：' + file, '═════════════════', '']
    authors.forEach(a => {
      const count = lines.filter(l => l.author === a).length
      const bar = '#'.repeat(Math.min(count, 40))
      result.push(a.slice(0, 20).padEnd(22) + bar + ' (' + count + ')')
    })
    return { type: 'text', value: result.join('\n') }
  }

  if (cmd === 'recent') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + (file || '') }
    const lines = blameFile(file).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const result = ['🕐 最近修改：' + file, '════════════════', '']
    lines.slice(0, 15).forEach(l => result.push(l.date + ' ' + l.author.slice(0, 15) + ' - ' + l.text.slice(0, 50)))
    return { type: 'text', value: result.join('\n') }
  }

  // Default: show blame
  const file = cmd
  if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + (file || '') }
  const startLine = parseInt(parts[1]) || 1
  const endLine = parseInt(parts[2]) || startLine + 30
  const lines = blameFile(file).filter(l => l.line >= startLine && l.line <= endLine)
  if (lines.length === 0) return { type: 'text', value: '⚠️ 无 blame 数据：' + file }
  const result = ['📝 Blame: ' + file + ' (行 ' + startLine + '-' + endLine + ')', '══════════════════', '']
  lines.forEach(l => result.push(l.line.toString().padStart(4) + ' ' + l.hash + ' ' + l.author.slice(0, 12).padEnd(14) + ' ' + l.text.slice(0, 50)))
  return { type: 'text', value: result.join('\n') }
}

const blame: Command = {
  type: 'local', name: 'blame',
  description: 'Git Blame - 文件/作者统计/热力图/最近修改',
  aliases: ['/blame', '/bl'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default blame
