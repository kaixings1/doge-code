import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { writeFileSync, existsSync, readFileSync } from 'fs'

interface CommitEntry {
  hash: string
  type: string
  scope: string
  message: string
  author: string
  date: string
}

function parseCommits(since?: string): CommitEntry[] {
  try {
    const range = since ? since + '..HEAD' : 'HEAD~30..HEAD'
    const output = execSync('git log ' + range + ' --pretty=format:"%h|%s|%an|%ad" --date=short', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.split('\n').filter(Boolean).map(line => {
      const [hash, subject, author, date] = line.split('|')
      const match = subject.match(/^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(([^)]+)\))?:\s*(.+)$/)
      return { hash, type: match?.[1] || 'other', scope: match?.[2] || '', message: match?.[3] || subject, author, date }
    })
  } catch { return [] }
}

function generateChangelog(commits: CommitEntry[], format: 'markdown' | 'json' | 'html'): string {
  if (format === 'json') return JSON.stringify(commits, null, 2)
  if (format === 'html') {
    const rows = commits.map(c => '<tr><td>' + c.type + '</td><td>' + c.message + '</td><td>' + c.author + '</td><td>' + c.date + '</td></tr>').join('\n')
    return '<table><tr><th>Type</th><th>Message</th><th>Author</th><th>Date</th></tr>' + rows + '</table>'
  }
  const lines = ['# Changelog', '']
  const grouped: Record<string, CommitEntry[]> = {}
  commits.forEach(c => { const t = c.type || 'other'; if (!grouped[t]) grouped[t] = []; grouped[t].push(c) })
  const typeLabels: Record<string, string> = { feat: '新功能', fix: 'Bug 修复', docs: '文档', style: '样式', refactor: '重构', perf: '性能', test: '测试', build: '构建', ci: 'CI', chore: '杂项', revert: '回滚' }
  for (const [type, items] of Object.entries(grouped)) {
    lines.push('## ' + (typeLabels[type] || type))
    items.forEach(c => lines.push('- ' + (c.scope ? '**' + c.scope + ':** ' : '') + c.message + ' (' + c.hash + ')'))
    lines.push('')
  }
  return lines.join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📝 变更日志生成器', '', '📖 用法：', '  /changelog-gen [格式]        生成变更日志（md/json/html）', '  /changelog-gen since <标签>   自标签起生成', '  /changelog-gen preview         预览不保存', '  /changelog-gen save [文件]     保存到文件', '  /changelog-gen unreleased       显示未发布变更', '  /changelog-gen stats            提交统计', '  /changelog-gen types            提交类型分布', '  /changelog-gen authors          按作者查看变更', '  /changelog-gen diff <标签1> <标签2>  标签间变更', ''].join('\n') }

  if (cmd === 'preview' || cmd === '') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'ℹ️ 未找到提交记录' }
    return { type: 'text', value: generateChangelog(commits, 'markdown') }
  }

  if (cmd === 'since') {
    const tag = parts[1] || ''
    const commits = parseCommits(tag)
    if (commits.length === 0) return { type: 'text', value: 'ℹ️ 自 ' + tag + ' 以来无提交记录' }
    return { type: 'text', value: generateChangelog(commits, 'markdown') }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'CHANGELOG.md'
    const format = (parts[2] as 'markdown' | 'json' | 'html') || 'markdown'
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'ℹ️ 未找到提交记录' }
    writeFileSync(file, generateChangelog(commits, format), 'utf-8')
    return { type: 'text', value: '✅ 已保存到 ' + file }
  }

  if (cmd === 'json' || cmd === 'html' || cmd === 'md') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'ℹ️ 未找到提交记录' }
    return { type: 'text', value: generateChangelog(commits, cmd as any) }
  }

  if (cmd === 'unreleased') {
    try {
      const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const commits = parseCommits(lastTag || undefined)
      if (commits.length === 0) return { type: 'text', value: 'ℹ️ 自 ' + lastTag + ' 以来无未发布变更' }
      return { type: 'text', value: '# 未发布变更\n\n' + generateChangelog(commits, 'markdown') }
    } catch { return { type: 'text', value: '❌ 未找到标签' } }
  }

  if (cmd === 'stats') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'ℹ️ 未找到提交记录' }
    const byType: Record<string, number> = {}
    commits.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1 })
    const lines = ['📊 提交统计', '═══════════', '', '总计：' + commits.length, '']
    Object.entries(byType).sort((a: any, b: any) => b[1] - a[1]).forEach(([t, c]) => lines.push('  ' + t + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'types') {
    const commits = parseCommits()
    const byType: Record<string, number> = {}
    commits.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1 })
    const lines = ['📊 类型分布', '═══════════', '']
    Object.entries(byType).sort((a: any, b: any) => b[1] - a[1]).forEach(([t, c]) => lines.push('  ' + t + ': ' + c + '（' + Math.round(c / commits.length * 100) + '%）'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'authors') {
    const commits = parseCommits()
    const byAuthor: Record<string, number> = {}
    commits.forEach(c => { byAuthor[c.author] = (byAuthor[c.author] || 0) + 1 })
    const lines = ['📊 作者变更统计', '═══════════════', '']
    Object.entries(byAuthor).sort((a: any, b: any) => b[1] - a[1]).forEach(([a, c]) => lines.push('  ' + a + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'diff') {
    const t1 = parts[1] || 'HEAD~10'
    const t2 = parts[2] || 'HEAD'
    try {
      const output = execSync('git log --oneline ' + t1 + '..' + t2, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '📝 ' + t1 + ' → ' + t2 + ' 的变更：\n' + output }
    } catch { return { type: 'text', value: '❌ Diff 失败' } }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const changelogGen: Command = {
  type: 'local', name: 'changelog-gen',
  description: '变更日志 - 生成/历史/预览/保存/统计/类型/作者',
  aliases: '/changelog-gen, /clg, /cl'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default changelogGen
