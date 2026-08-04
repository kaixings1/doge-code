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
  const typeLabels: Record<string, string> = { feat: 'Features', fix: 'Bug Fixes', docs: 'Documentation', style: 'Styles', refactor: 'Refactoring', perf: 'Performance', test: 'Tests', build: 'Build', ci: 'CI', chore: 'Chores', revert: 'Reverts' }
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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Changelog Generator', '', 'Usage:', '  /changelog-gen [format]         Generate changelog (md/json/html)', '  /changelog-gen since <tag>      Generate since tag', '  ​​/changelog-gen preview          Preview without saving', '  /changelog-gen save [file]       Save to file', '  /changelog-gen unreleased        Show unreleased changes', '  /changelog-gen stats             Commit statistics', '  /changelog-gen types             Show commit type distribution', '  /changelog-gen authors           Changes per author', '  /changelog-gen diff <t1> <t2]    Changes between tags', ''].join('\n') }

  if (cmd === 'preview' || cmd === '') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'No commits found' }
    return { type: 'text', value: generateChangelog(commits, 'markdown') }
  }

  if (cmd === 'since') {
    const tag = parts[1] || ''
    const commits = parseCommits(tag)
    if (commits.length === 0) return { type: 'text', value: 'No commits since ' + tag }
    return { type: 'text', value: generateChangelog(commits, 'markdown') }
  }

  if (cmd === 'save') {
    const file = parts[1] || 'CHANGELOG.md'
    const format = (parts[2] as 'markdown' | 'json' | 'html') || 'markdown'
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'No commits found' }
    writeFileSync(file, generateChangelog(commits, format), 'utf-8')
    return { type: 'text', value: '[OK] Saved to ' + file }
  }

  if (cmd === 'json' || cmd === 'html' || cmd === 'md') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'No commits found' }
    return { type: 'text', value: generateChangelog(commits, cmd as any) }
  }

  if (cmd === 'unreleased') {
    try {
      const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const commits = parseCommits(lastTag || undefined)
      if (commits.length === 0) return { type: 'text', value: 'No unreleased changes since ' + lastTag }
      return { type: 'text', value: '# Unreleased Changes\n\n' + generateChangelog(commits, 'markdown') }
    } catch { return { type: 'text', value: 'No tags found' } }
  }

  if (cmd === 'stats') {
    const commits = parseCommits()
    if (commits.length === 0) return { type: 'text', value: 'No commits found' }
    const byType: Record<string, number> = {}
    commits.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1 })
    const lines = ['Commit Statistics:', '===================', '', 'Total: ' + commits.length, '']
    Object.entries(byType).sort((a: any, b: any) => b[1] - a[1]).forEach(([t, c]) => lines.push('  ' + t + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'types') {
    const commits = parseCommits()
    const byType: Record<string, number> = {}
    commits.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1 })
    const lines = ['Type Distribution:', '===================', '']
    Object.entries(byType).sort((a: any, b: any) => b[1] - a[1]).forEach(([t, c]) => lines.push('  ' + t + ': ' + c + ' (' + Math.round(c / commits.length * 100) + '%)'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'authors') {
    const commits = parseCommits()
    const byAuthor: Record<string, number> = {}
    commits.forEach(c => { byAuthor[c.author] = (byAuthor[c.author] || 0) + 1 })
    const lines = ['Changes per Author:', '====================', '']
    Object.entries(byAuthor).sort((a: any, b: any) => b[1] - a[1]).forEach(([a, c]) => lines.push('  ' + a + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'diff') {
    const t1 = parts[1] || 'HEAD~10'
    const t2 = parts[2] || 'HEAD'
    try {
      const output = execSync('git log --oneline ' + t1 + '..' + t2, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Changes ' + t1 + ' -> ' + t2 + ':\n' + output }
    } catch { return { type: 'text', value: '[ERROR] Diff failed' } }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const changelogGen: Command = {
  type: 'local', name: 'changelog-gen',
  description: 'Changelog - generate/since/preview/save/json/html/unreleased/stats/types',
  aliases: '/changelog-gen, /clg, /cl'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default changelogGen
