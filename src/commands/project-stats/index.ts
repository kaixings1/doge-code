import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'

interface ProjectStats {
  files: number
  lines: number
  codeLines: number
  blankLines: number
  commentLines: number
  languages: Record<string, { files: number; lines: number; percentage: number }>
  commits: number
  contributors: number
  branches: number
  tags: number
  age: string
  size: string
}

function getProjectStats(): Partial<ProjectStats> {
  const stats: Partial<ProjectStats> = { languages: {} }
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp', '.h', '.css', '.html', '.md', '.json', '.yaml', '.yml', '.toml', '.xml']
  let totalLines = 0
  const fs = require('fs')

  const scan = (dir: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          const ext = extname(entry.name).slice(1)
          if (!stats.languages![ext]) stats.languages![ext] = { files: 0, lines: 0, percentage: 0 }
          stats.languages![ext]!.files++
          stats.files = (stats.files || 0) + 1
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n')
            totalLines += lines.length
            stats.languages![ext]!.lines += lines.length
            lines.forEach(l => {
              const t = l.trim()
              if (!t) stats.blankLines = (stats.blankLines || 0) + 1
              else if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*')) stats.commentLines = (stats.commentLines || 0) + 1
              else stats.codeLines = (stats.codeLines || 0) + 1
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan('.')
  stats.lines = totalLines
  for (const lang of Object.keys(stats.languages!)) {
    stats.languages![lang]!.percentage = Math.round((stats.languages![lang]!.lines / totalLines) * 100)
  }
  return stats
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'all'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Project Stats', '', 'Usage:', '  /project-stats all               Full stats report', '  /project-stats files            File count by language', '  /project-stats lines            Line count by language', '  /project-stats git              Git stats', '  /project-stats contributors     Top contributors', '  /project-stats activity         Recent activity', '  /project-stats size             Disk usage', '  /project-stats health           Health score', '  /project-stats export           Export as JSON', ''].join('\n') }

  const stats = getProjectStats()

  if (cmd === 'all' || cmd === 'report') {
    const lines = ['Project Statistics', '==================', '', 'Files: ' + (stats.files || 0), 'Lines: ' + (stats.lines || 0), 'Code Lines: ' + (stats.codeLines || 0), 'Comment Lines: ' + (stats.commentLines || 0), 'Blank Lines: ' + (stats.blankLines || 0), '', 'Languages:']
    for (const [lang, data] of Object.entries(stats.languages || {}).sort((a: any, b: any) => b[1].lines - a[1].lines)) {
      lines.push('  ' + lang + ': ' + data.files + ' files, ' + data.lines + ' lines (' + data.percentage + '%)')
    }
    try {
      const commits = execSync('git rev-list --count HEAD 2>/dev/null || echo 0', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const branches = execSync('git branch | wc -l 2>/dev/null || echo 0', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const tags = execSync('git tag | wc -l 2>/dev/null || echo 0', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const contrib = execSync('git shortlog -sn --all | wc -l 2>/dev/null || echo 0', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const firstCommit = execSync('git log --reverse --pretty=format:"%ai" | head -1 2>/dev/null || echo "unknown"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      lines.push('', 'Git:', '  Commits: ' + commits, '  Branches: ' + branches, '  Tags: ' + tags, '  Contributors: ' + contrib, '  First Commit: ' + firstCommit)
    } catch { /* ignore */ }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'files') {
    const lines = ['Files by Language:', '===================', '']
    for (const [lang, data] of Object.entries(stats.languages || {}).sort((a: any, b: any) => b[1].files - a[1].files)) {
      lines.push(lang + ': ' + data.files)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'lines') {
    const lines = ['Lines by Language:', '===================', '']
    for (const [lang, data] of Object.entries(stats.languages || {}).sort((a: any, b: any) => b[1].lines - a[1].lines)) {
      lines.push(lang + ': ' + data.lines + ' (' + data.percentage + '%)')
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'git') {
    try {
      const commits = execSync('git rev-list --count HEAD 2>/dev/null || echo 0', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const branches = execSync('git branch | wc -l', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const tags = execSync('git tag | wc -l', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      return { type: 'text', value: 'Git Stats:\n  Commits: ' + commits + '\n  Branches: ' + branches + '\n  Tags: ' + tags }
    } catch { return { type: 'text', value: 'Not a git repository' } }
  }

  if (cmd === 'contributors') {
    try {
      const output = execSync('git shortlog -sn --all | head -15', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Top Contributors:\n' + output }
    } catch { return { type: 'text', value: '[ERROR]' } }
  }

  if (cmd === 'activity') {
    try {
      const output = execSync('git log --oneline -15', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Recent Activity:\n' + output }
    } catch { return { type: 'text', value: '[ERROR]' } }
  }

  if (cmd === 'size') {
    try {
      const du = execSync('du -sh . 2>/dev/null', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      const gitSize = execSync('du -sh .git 2>/dev/null', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      return { type: 'text', value: 'Disk Usage:\n  Total: ' + du + '\n  Git: ' + gitSize }
    } catch { return { type: 'text', value: '[ERROR]' } }
  }

  if (cmd === 'health') {
    const totalLines = stats.lines || 0
    const commentRatio = totalLines > 0 ? ((stats.commentLines || 0) / totalLines * 100).toFixed(1) : '0'
    const grade = parseFloat(commentRatio) > 15 ? 'A' : parseFloat(commentRatio) > 10 ? 'B' : parseFloat(commentRatio) > 5 ? 'C' : 'D'
    return { type: 'text', value: ['Health Score: ' + grade, '', 'Comment Ratio: ' + commentRatio + '%', 'Files: ' + (stats.files || 0), 'Lines: ' + totalLines].join('\n') }
  }

  if (cmd === 'export') {
    return { type: 'text', value: JSON.stringify(stats, null, 2) }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const projectStats: Command = {
  type: 'local', name: 'project-stats',
  description: 'Project stats - all/files/lines/git/contributors/activity/size/health/export',
  aliases: '/project-stats, /ps, /stats'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default projectStats
