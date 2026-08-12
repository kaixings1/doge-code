import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, existsSync, statSync } from 'fs'

interface FileChange {
  date: string
  hash: string
  author: string
  message: string
  additions: number
  deletions: number
}

function getFileHistory(file: string, count = 20): FileChange[] {
  try {
    const output = execSync('git log --follow --pretty=format:"%h|%an|%ad|%s" --date=short --numstat -' + count + ' -- "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const changes: FileChange[] = []
    let current: Partial<FileChange> = {}
    output.split('\n').forEach(line => {
      const parts = line.split('|')
      if (parts.length >= 4) {
        if (current.hash) changes.push(current as FileChange)
        current = { hash: parts[0], author: parts[1], date: parts[2], message: parts[3], additions: 0, deletions: 0 }
      } else if (line.match(/^\d+\s+\d+/)) {
        const nums = line.split('\t')
        current.additions = parseInt(nums[0]) || 0
        current.deletions = parseInt(nums[1]) || 0
      }
    })
    if (current.hash) changes.push(current as FileChange)
    return changes
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      '📅 文件历史', '', '📖 用法：',
      '  /file-history <文件>          查看文件变更历史',
      '  /file-history diff <文件>     查看版本差异',
      '  /file-history restore <文件>  恢复到上一版本',
      '  /file-history authors <文件>  查看文件作者',
      '  /file-history trend <文件>    查看变更频率',
    ].join('\n') }
  }

  if (cmd === 'diff') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + (file || '') }
    try {
      const diff = execSync('git diff HEAD~1 HEAD -- "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: diff || 'ℹ️ 上次提交无变更' }
    } catch { return { type: 'text', value: '❌ 对比失败' } }
  }

  if (cmd === 'restore') {
    const file = parts[1]; const version = parts[2] || 'HEAD~1'
    if (!file) return { type: 'text', value: '📖 用法：/file-history restore <文件> [版本]' }
    try {
      execSync('git checkout ' + version + ' -- "' + file + '"', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已恢复：' + file + ' → ' + version }
    } catch { return { type: 'text', value: '❌ 恢复失败' } }
  }

  if (cmd === 'authors') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + (file || '') }
    try {
      const output = execSync('git log --pretty=format:"%an" --follow -- "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const authors: Record<string, number> = {}
      output.split('\n').forEach(a => { if (a) authors[a] = (authors[a] || 0) + 1 })
      const lines = ['👥 文件作者：' + file, '═══════════════════════════', '']
      Object.entries(authors).sort((a: any, b: any) => b[1] - a[1]).forEach(([a, c]) => lines.push(a + ': ' + c + ' commits'))
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: '❌ 获取失败' } }
  }

  if (cmd === 'trend') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + (file || '') }
    const history = getFileHistory(file, 30)
    if (history.length === 0) return { type: 'text', value: 'ℹ️ 无历史记录' }
    const lines = ['📈 变更趋势：' + file, '════════════════════', '']
    history.forEach(h => {
      const bar = '+'.repeat(Math.min(h.additions, 20)) + '-'.repeat(Math.min(h.deletions, 20))
      lines.push(h.date + ' ' + bar + ' (+' + h.additions + '/-' + h.deletions + ')')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  // Default: show history
  const file = cmd
  if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + (file || '') }
  const history = getFileHistory(file)
  if (history.length === 0) return { type: 'text', value: 'ℹ️ 无历史记录：' + file }
  const lines = ['📅 历史：' + file + '（' + history.length + ' commits）', '════════════════════════', '']
  history.forEach(h => lines.push(h.hash + ' [' + h.date + '] ' + h.author + ' - ' + h.message.slice(0, 50) + ' (+' + h.additions + '/-' + h.deletions + ')'))
  return { type: 'text', value: lines.join('\n') }
}

const fileHistory: Command = {
  type: 'local', name: 'file-history',
  description: '📅 文件历史 - 变更/对比/恢复/作者/趋势',
  aliases: ['/file-history', '/fh'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default fileHistory
