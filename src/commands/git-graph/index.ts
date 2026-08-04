import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'git-graph')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface Commit {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  message: string
  refs: string[]
  files: number
  insertions: number
  deletions: number
}

interface Branch {
  name: string
  remote: string
  ahead: number
  behind: number
  lastCommit: string
  isCurrent: boolean
  isRemote: boolean
}

interface Contributor {
  name: string
  email: string
  commits: number
  insertions: number
  deletions: number
  firstCommit: string
  lastCommit: string
  files: Set<string>
  activeDays: Set<string>
}

interface GitStats {
  totalCommits: number
  totalAuthors: number
  totalBranches: number
  totalTags: number
  firstCommit: string
  lastCommit: string
  activeDays: number
  avgCommitsPerDay: number
  busiestDay: string
  mostProductiveHour: number
  avgCommitSize: number
  largestCommit: { hash: string; files: number }
  longestStreak: number
  currentStreak: number
  hotFiles: Array<{ file: string; changes: number; lastChange: string }>
  codeChurn: { added: number; deleted: number; modified: number }
}

function run(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function getCommits(range = 'HEAD', count = 50): Commit[] {
  const fmt = '%H|%h|%an|%ae|%ad|%s|%D'
  const output = run(`git log ${range} --pretty=format:"${fmt}" --date=short -${count} 2>/dev/null`)
  if (!output) return []
  return output.split('\n').filter(Boolean).map(line => {
    const [hash, shortHash, author, email, date, ...rest] = line.split('|')
    const refsMatch = rest.join('|').match(/(.+?)(?:\s*[\(,]\s*(.+?)\s*[\)])?$/)
    const message = refsMatch?.[1]?.trim() || ''
    const refsStr = refsMatch?.[2] || ''
    const refs = refsStr.split(',').map(r => r.trim()).filter(Boolean)
    const statOutput = run(`git show --stat --oneline ${shortHash} 2>/dev/null | tail -1`)
    const statMatch = statOutput.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/)
    return {
      hash, shortHash, author, email, date, message, refs,
      files: parseInt(statMatch?.[1] || '0'),
      insertions: parseInt(statMatch?.[2] || '0'),
      deletions: parseInt(statMatch?.[3] || '0'),
    }
  })
}

function getBranches(): Branch[] {
  const output = run('git branch -vv --format="%(refname:short)|%(upstream:short)|%(upstream:track)" 2>/dev/null')
  if (!output) return []
  const branches: Branch[] = []
  output.split('\n').filter(Boolean).forEach(line => {
    const [name, remote, track] = line.split('|')
    const aheadMatch = track?.match(/ahead (\d+)/)
    const behindMatch = track?.match(/behind (\d+)/)
    branches.push({
      name, remote: remote || '', ahead: parseInt(aheadMatch?.[1] || '0'), behind: parseInt(behindMatch?.[1] || '0'),
      lastCommit: run(`git log -1 --pretty=format:"%h %s" ${name} 2>/dev/null`),
      isCurrent: run('git branch --show-current') === name, isRemote: false,
    })
  })
  const remoteOutput = run('git branch -r --format="%(refname:short)" 2>/dev/null')
  if (remoteOutput) {
    remoteOutput.split('\n').filter(Boolean).forEach(name => {
      branches.push({ name, remote: '', ahead: 0, behind: 0, lastCommit: '', isCurrent: false, isRemote: true })
    })
  }
  return branches
}

function getContributors(): Contributor[] {
  const contribMap = new Map<string, Contributor>()
  const output = run('git shortlog -sne --all 2>/dev/null')
  if (!output) return []
  output.split('\n').filter(Boolean).forEach(line => {
    const match = line.match(/\s+(\d+)\s+(.+?)\s+<(.+?)>/)
    if (match) {
      const [, count, name, email] = match
      contribMap.set(email, { name, email, commits: parseInt(count), insertions: 0, deletions: 0, firstCommit: '', lastCommit: '', files: new Set(), activeDays: new Set() })
    }
  })
  const logOutput = run('git log --pretty=format:"%ae|%ad" --date=short --numstat --all 2>/dev/null')
  if (logOutput) {
    let currentEmail = ''
    logOutput.split('\n').forEach(line => {
      const emailMatch = line.match(/^(.+?)\|(\d{4}-\d{2}-\d{2})$/)
      if (emailMatch) { currentEmail = emailMatch[1]; const c = contribMap.get(currentEmail); if (c) c.activeDays.add(emailMatch[2]); return }
      if (line.match(/^\d+\s+\d+\s+.+/) && currentEmail) {
        const nums = line.split('\t')
        const c = contribMap.get(currentEmail)
        if (c) { c.insertions += parseInt(nums[0]) || 0; c.deletions += parseInt(nums[1]) || 0; c.files.add(nums[2] || '') }
      }
    })
  }
  return Array.from(contribMap.values()).sort((a, b) => b.commits - a.commits)
}

function calculateStats(): GitStats {
  const commits = getCommits('HEAD', 1000)
  const branches = getBranches()
  const contributors = getContributors()
  const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0)
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0)

  const days = new Set(commits.map(c => c.date))
  const dayCount: Record<string, number> = {}
  commits.forEach(c => { dayCount[c.date] = (dayCount[c.date] || 0) + 1 })
  const busiestDay = Object.entries(dayCount).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || ''

  const hourCount: Record<number, number> = {}
  commits.forEach(c => { const h = new Date(c.date).getHours(); hourCount[h] = (hourCount[h] || 0) + 1 })
  const mostProductiveHour = parseInt(Object.entries(hourCount).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '0')

  const largestCommit = commits.length > 0 ? commits.reduce((a, b) => a.files > b.files ? a : b) : { hash: '', files: 0 }

  const fileChurn: Record<string, number> = {}
  const logOutput = run('git log --pretty=format:"" --name-only --all 2>/dev/null')
  if (logOutput) { logOutput.split('\n').filter(Boolean).forEach(f => { fileChurn[f] = (fileChurn[f] || 0) + 1 }) }
  const hotFiles = Object.entries(fileChurn).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15).map(([file, changes]) => ({ file, changes, lastChange: '' }))

  let longestStreak = 0
  let currentStreak = 0
  let lastDate = ''
  const sortedDays = Array.from(days).sort()
  sortedDays.forEach(day => {
    const diff = lastDate ? (new Date(day).getTime() - new Date(lastDate).getTime()) / 86400000 : 1
    if (diff <= 1) { currentStreak++ } else { currentStreak = 1 }
    if (currentStreak > longestStreak) longestStreak = currentStreak
    lastDate = day
  })

  return {
    totalCommits: commits.length, totalAuthors: contributors.length, totalBranches: branches.length,
    totalTags: parseInt(run('git tag | wc -l 2>/dev/null') || '0'),
    firstCommit: commits.length > 0 ? commits[commits.length - 1].date : '',
    lastCommit: commits.length > 0 ? commits[0].date : '',
    activeDays: days.size, avgCommitsPerDay: days.size > 0 ? Math.round(commits.length / days.size) : 0,
    busiestDay, mostProductiveHour,
    avgCommitSize: commits.length > 0 ? Math.round((totalInsertions + totalDeletions) / commits.length) : 0,
    largestCommit: { hash: largestCommit.hash, files: largestCommit.files },
    longestStreak, currentStreak,
    hotFiles, codeChurn: { added: totalInsertions, deleted: totalDeletions, modified: commits.reduce((s, c) => s + c.files, 0) },
  }
}

function formatASCIIChart(data: Array<{ label: string; value: number }>, maxWidth = 40): string {
  const max = Math.max(...data.map(d => d.value), 1)
  const lines: string[] = []
  data.forEach(d => {
    const barLen = Math.round((d.value / max) * maxWidth)
    const bar = '█'.repeat(barLen)
    lines.push(d.label.slice(0, 15).padEnd(17) + bar + ' ' + d.value)
  })
  return lines.join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Git Graph (Advanced)', '', 'Usage:', '  /git-graph                      Commit graph + stats', '  /git-graph log [N]              Show last N commits', '  /git-graph branches             List branches', '  /git-graph authors              Show author stats', '  /git-graph timeline             Commit timeline', '  /git-graph search <query>       Search commits', '  /git-graph stats                Repository statistics', '  /git-graph hotfiles             Most changed files', '  /git-graph churn                Code churn analysis', '  /git-graph activity             Activity heatmap', '  /git-graph streaks              Contribution streaks', '  /git-graph export [fmt]         Export (md/json/dot)', '  /git-graph insights             AI-powered insights', ''].join('\n') }

  if (cmd === 'stats') {
    const stats = calculateStats()
    return { type: 'text', value: ['Repository Statistics:', '======================', '', 'Commits: ' + stats.totalCommits, 'Authors: ' + stats.totalAuthors, 'Branches: ' + stats.totalBranches, 'Tags: ' + stats.totalTags, 'Active Days: ' + stats.activeDays, 'First: ' + stats.firstCommit, 'Last: ' + stats.lastCommit, 'Busiest Day: ' + stats.busiestDay, 'Most Productive Hour: ' + stats.mostProductiveHour + ':00', 'Avg Commits/Day: ' + stats.avgCommitsPerDay, 'Longest Streak: ' + stats.longestStreak + ' days', 'Current Streak: ' + stats.currentStreak + ' days', 'Code Churn: +' + stats.codeChurn.added + '/-' + stats.codeChurn.deleted, '', 'Hot Files:', ...stats.hotFiles.slice(0, 10).map(f => '  ' + f.file + ' (' + f.changes + ' changes)')].join('\n') }
  }

  if (cmd === 'hotfiles' || cmd === 'churn') {
    const stats = calculateStats()
    const lines = ['Hot Files (Most Changed):', '==========================', '']
    stats.hotFiles.forEach((f, i) => lines.push(`${i + 1}. ${f.file} (${f.changes} changes)`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'activity') {
    const output = run('git log --pretty=format:"%ad" --date=short --all 2>/dev/null')
    if (!output) return { type: 'text', value: 'No commits' }
    const dayCount: Record<string, number> = {}
    output.split('\n').filter(Boolean).forEach(d => { dayCount[d] = (dayCount[d] || 0) + 1 })
    const sorted = Object.entries(dayCount).sort((a: any, b: any) => b[1] - a[1]).slice(0, 20)
    return { type: 'text', value: 'Activity (Last 20 Active Days):' + '\n\n' + formatASCIIChart(sorted.map(([label, value]) => ({ label, value }))) }
  }

  if (cmd === 'streaks') {
    const stats = calculateStats()
    return { type: 'text', value: ['Contribution Streaks:', '=====================', '', 'Longest Streak: ' + stats.longestStreak + ' days', 'Current Streak: ' + stats.currentStreak + ' days', '', 'Tips to improve:', '  - Commit at least once a day', '  - Use meaningful commit messages', '  - Keep commits small and focused'].join('\n') }
  }

  if (cmd === 'insights') {
    const stats = calculateStats()
    const insights: string[] = ['Git Insights:', '==============', '']
    if (stats.avgCommitsPerDay < 1) insights.push('• Low commit frequency. Try to commit at least once per day.')
    if (stats.longestStreak > 7) insights.push('• Great streak! Keep up the consistent work.')
    if (stats.totalAuthors === 1) insights.push('• Solo project. Consider collaborating with others.')
    if (stats.totalAuthors > 10) insights.push('• Large team! Ensure clear branch strategy.')
    if (stats.hotFiles.length > 0 && stats.hotFiles[0].changes > 50) insights.push(`• File "${stats.hotFiles[0].file}" changes frequently. Consider refactoring.`)
    if (stats.codeChurn.deleted > stats.codeChurn.added * 0.5) insights.push('• High deletion rate. Good cleanup or potential instability.')
    if (stats.mostProductiveHour >= 22 || stats.mostProductiveHour <= 5) insights.push('• Late night commits detected. Watch for burnout!')
    insights.push('', 'Suggestions:', '• Use conventional commits (feat:, fix:, docs:)', '• Keep pull requests small', '• Write meaningful commit messages', '• Delete merged branches regularly')
    return { type: 'text', value: insights.join('\n') }
  }

  if (cmd === 'export') {
    const stats = calculateStats()
    const fmt = parts[1] || 'md'
    const filename = `git-stats.${fmt === 'markdown' ? 'md' : fmt}`
    const content = fmt === 'json' ? JSON.stringify(stats, null, 2) : '# Git Stats\n\nCommits: ' + stats.totalCommits + '\nAuthors: ' + stats.totalAuthors
    writeFileSync(filename, content, 'utf-8')
    return { type: 'text', value: '[OK] Exported: ' + filename }
  }

  // Default: full graph + stats
  const stats = calculateStats()
  const commits = getCommits('HEAD', 20)
  const lines = ['Git Graph & Stats', '═════════════════', '', `Score: ${stats.totalCommits} commits by ${stats.totalAuthors} authors`, '', 'Recent Commits:', ...commits.slice(0, 10).map(c => `${c.shortHash} ${c.date} ${c.author} - ${c.message.slice(0, 50)}`), '', 'Hot Files:', ...stats.hotFiles.slice(0, 5).map(f => `  ${f.file} (${f.changes})`)]
  return { type: 'text', value: lines.join('\n') }
}

const gitGraph: Command = {
  type: 'local', name: 'git-graph',
  description: 'Git graph - stats/authors/timeline/hotfiles/churn/activity/streaks/insights',
  aliases: ['/git-graph', '/gg', '/gitlog'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default gitGraph
