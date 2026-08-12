import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

interface Contributor {
  name: string
  email: string
  commits: number
  additions: number
  deletions: number
  lastCommit: string
  files: Set<string>
}

function getContributors(): Contributor[] {
  const contribMap = new Map<string, Contributor>()
  try {
    const output = execSync('git log --pretty=format:"%an|%ae|%ad" --date=short --numstat --all', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    let current: Partial<Contributor> = {}
    output.split('\n').forEach(line => {
      const parts = line.split('|')
      if (parts.length >= 3) {
        if (current.name) {
          const key = current.email!
          if (!contribMap.has(key)) contribMap.set(key, { name: current.name!, email: current.email!, commits: 0, additions: 0, deletions: 0, lastCommit: current.lastCommit!, files: new Set() })
          const c = contribMap.get(key)!
          c.commits++
          c.lastCommit = current.lastCommit!
        }
        current = { name: parts[0], email: parts[1], lastCommit: parts[2] }
      } else if (line.match(/^\d+\s+\d+\s+.+/) && current.name) {
        const nums = line.split('\t')
        const key = current.email!
        if (!contribMap.has(key)) contribMap.set(key, { name: current.name!, email: current.email!, commits: 0, additions: 0, deletions: 0, lastCommit: current.lastCommit!, files: new Set() })
        const c = contribMap.get(key)!
        c.additions += parseInt(nums[0]) || 0
        c.deletions += parseInt(nums[1]) || 0
        c.files.add(nums[2] || '')
      }
    })
    if (current.name) {
      const key = current.email!
      if (!contribMap.has(key)) contribMap.set(key, { name: current.name!, email: current.email!, commits: 0, additions: 0, deletions: 0, lastCommit: current.lastCommit!, files: new Set() })
      contribMap.get(key)!.commits++
    }
  } catch { /* ignore */ }
  return Array.from(contribMap.values()).sort((a, b) => b.commits - a.commits)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  const contributors = getContributors()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['👥 贡献者分析', '', '📖 用法：', '  /contributors list [N]          显示前 N 位贡献者', '  /contributors graph             提交数 ASCII 图表', '  /contributors files <名称>      查看贡献者修改的文件', '  /contributors trend             提交活动趋势', '  /contributors email <邮箱>      查看贡献者详情', '  /contributors all               列出所有贡献者及提交', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    const n = parseInt(parts[1]) || 15
    if (contributors.length === 0) return { type: 'text', value: 'ℹ️ 未找到贡献者' }
    const lines = ['📋 贡献者排行：', '════════════════', '']
    contributors.slice(0, n).forEach((c, i) => {
      lines.push((i + 1) + '. ' + c.name + ' - ' + c.commits + ' commits (+' + c.additions + '/-' + c.deletions + ', ' + c.files.size + ' files)')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'graph') {
    if (contributors.length === 0) return { type: 'text', value: 'ℹ️ 未找到贡献者' }
    const max = contributors[0]?.commits || 1
    const lines = ['📊 每贡献者提交数：', '═════════════════════', '']
    contributors.slice(0, 15).forEach(c => {
      const barLen = Math.round((c.commits / max) * 30)
      lines.push(c.name.slice(0, 20).padEnd(22) + '█'.repeat(barLen) + ' ' + c.commits)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'files') {
    const name = parts.slice(1).join(' ')
    if (!name) return { type: 'text', value: '📖 用法：/contributors files <名称>' }
    const c = contributors.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
    if (!c) return { type: 'text', value: '❌ 未找到贡献者：' + name }
    const lines = ['📁 ' + c.name + ' 修改的文件：', '══════════════════════════════', '']
    Array.from(c.files).slice(0, 30).forEach(f => lines.push('  ' + f))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trend') {
    try {
      const output = execSync('git log --pretty=format:"%ad" --date=short --all | sort | uniq -c | sort -k2', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const lines = ['📈 提交活动趋势：', '══════════════════', '']
      output.split('\n').filter(Boolean).slice(-20).forEach(l => {
        const match = l.trim().match(/^(\d+)\s+(.+)$/)
        if (match) {
          const bar = '█'.repeat(Math.min(parseInt(match[1]), 40))
          lines.push(match[2] + ' ' + bar + ' (' + match[1] + ')')
        }
      })
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: '❌ 趋势分析失败' } }
  }

  if (cmd === 'email') {
    const email = parts.slice(1).join(' ')
    if (!email) return { type: 'text', value: '📖 用法：/contributors email <邮箱>' }
    const c = contributors.find(c => c.email.toLowerCase().includes(email.toLowerCase()))
    if (!c) return { type: 'text', value: '❌ 未找到：' + email }
    return { type: 'text', value: ['👤 贡献者：' + c.name, '📧 邮箱：' + c.email, '📊 提交数：' + c.commits, '➕ 新增：' + c.additions, '➖ 删除：' + c.deletions, '📁 文件数：' + c.files.size, '🕐 最近：' + c.lastCommit].join('\n') }
  }

  if (cmd === 'all') {
    if (contributors.length === 0) return { type: 'text', value: '⚠️ 未找到贡献者' }
    const lines = ['📋 所有贡献者（' + contributors.length + '）：', '════════════════════════', '']
    contributors.forEach(c => lines.push(c.name + ' <' + c.email + '> - ' + c.commits + ' commits'))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const contributors: Command = {
  type: 'local', name: 'contributors',
  description: '贡献者分析 - 列表/图表/文件/趋势/邮箱/全部',
  aliases: '/contributors, /contrib, /authors'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default contributors
