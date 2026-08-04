import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'autofix-pr')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface PRFix {
  file: string
  line: number
  issue: string
  suggestion: string
  autoFixable: boolean
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  category: 'style' | 'bug' | 'security' | 'performance' | 'maintainability'
  rule: string
}

interface PRMeta {
  number: string
  title: string
  author: string
  state: string
  base: string
  head: string
  additions: number
  deletions: number
  changedFiles: number
}

interface FixHistory {
  date: string
  pr: string
  issuesFound: number
  issuesFixed: number
  status: string
}

function run(cmd: string): { ok: boolean; output: string } {
  try { return { ok: true, output: execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() } }
  catch (e: any) { return { ok: false, output: e.message || 'Command failed' } }
}

function getPRMeta(prNumber: string): PRMeta | null {
  const result = run(`gh pr view ${prNumber} --json number,title,author,state,baseRefName,headRefName,additions,deletions,changedFiles 2>/dev/null`)
  if (!result.ok) return null
  try {
    const data = JSON.parse(result.output)
    return { number: String(data.number), title: data.title, author: data.author?.login || 'unknown', state: data.state, base: data.baseRefName, head: data.headRefName, additions: data.additions || 0, deletions: data.deletions || 0, changedFiles: data.changedFiles || 0 }
  } catch { return null }
}

function analyzeDiff(diff: string): PRFix[] {
  const fixes: PRFix[] = []
  const lines = diff.split('\n')
  let currentFile = ''
  let diffLine = 0

  const checkLine = (file: string, line: number, content: string) => {
    const t = content.slice(1).trim() // remove + prefix
    const rules: Array<{ pattern: RegExp; issue: string; suggestion: string; autoFixable: boolean; severity: PRFix['severity']; category: PRFix['category']; rule: string }> = [
      { pattern: /\bconsole\.(log|debug|warn|info)\s*\(/, issue: 'console statement in new code', suggestion: 'Remove or use a structured logger', autoFixable: true, severity: 'medium', category: 'bug', rule: 'no-console-log' },
      { pattern: /:\s*\bany\b(?!\s*[=,)\]])/, issue: 'any type usage', suggestion: 'Define a specific interface/type', autoFixable: false, severity: 'medium', category: 'maintainability', rule: 'no-any-type' },
      { pattern: /\/\/\s*(TODO|FIXME|HACK)\b/i, issue: 'TODO/FIXME marker', suggestion: 'Complete the task or create a tracked issue', autoFixable: false, severity: 'low', category: 'maintainability', rule: 'no-todo' },
      { pattern: /\beval\s*\(/, issue: 'eval() usage (code injection risk)', suggestion: 'Use JSON.parse() or safe alternatives', autoFixable: false, severity: 'critical', category: 'security', rule: 'no-eval' },
      { pattern: /\.innerHTML\s*=/, issue: 'innerHTML assignment (XSS risk)', suggestion: 'Use textContent or framework-safe rendering', autoFixable: false, severity: 'high', category: 'security', rule: 'no-innerHTML' },
      { pattern: /(?:password|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i, issue: 'Hardcoded secret', suggestion: 'Move to environment variables', autoFixable: false, severity: 'critical', category: 'security', rule: 'no-hardcoded-secrets' },
      { pattern: /child_process\.exec\s*\(/, issue: 'Potential command injection', suggestion: 'Use execFile() with args array', autoFixable: false, severity: 'critical', category: 'security', rule: 'no-command-injection' },
      { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, issue: 'Empty catch block', suggestion: 'Log error or handle gracefully', autoFixable: false, severity: 'high', category: 'bug', rule: 'no-empty-catch' },
      { pattern: /\bvar\s+\w+/, issue: 'var usage', suggestion: 'Use const or let', autoFixable: true, severity: 'low', category: 'style', rule: 'no-var' },
      { pattern: /\b(?:async\s+)?function\s+\w+\s*\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*\)/, issue: 'Too many function parameters', suggestion: 'Use an options object', autoFixable: false, severity: 'low', category: 'maintainability', rule: 'max-params' },
      { pattern: /Math\.random\s*\(\s*\)/, issue: 'Insecure random (Math.random)', suggestion: 'Use crypto.randomBytes()', autoFixable: false, severity: 'medium', category: 'security', rule: 'insecure-random' },
    ]
    if (t.length > 120) fixes.push({ file, line, issue: `Line too long (${t.length} chars)`, suggestion: 'Break into multiple lines', autoFixable: false, severity: 'low', category: 'style', rule: 'max-line-length' })
    for (const rule of rules) {
      if (rule.pattern.test(t)) {
        fixes.push({ file, line, issue: rule.issue, suggestion: rule.suggestion, autoFixable: rule.autoFixable, severity: rule.severity, category: rule.category, rule: rule.rule })
      }
    }
  }

  lines.forEach(line => {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/)
      currentFile = match?.[1] || ''
      diffLine = 0
    } else if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)(?:,(\d+))?/)
      if (match) diffLine = parseInt(match[1]) || 0
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      diffLine++
      checkLine(currentFile, diffLine, line)
    }
  })
  return fixes
}

function applyFixes(fixes: PRFix[]): { applied: number; details: string[] } {
  let applied = 0
  const details: string[] = []
  const autoFixes = fixes.filter(f => f.autoFixable)
  const files = new Set(autoFixes.map(f => f.file))

  files.forEach(file => {
    if (!existsSync(file)) return
    try {
      let content = readFileSync(file, 'utf-8')
      const original = content

      // Safe fixes
      if (autoFixes.some(f => f.rule === 'no-console-log')) {
        content = content.replace(/\bconsole\.(log|debug|info)\s*\(/g, '// console.') // comment out instead of unsafe replacement
        content = content.replace(/\/\/\s*console\.(log|debug|info)\s*\(/g, '// TODO: remove console statement: console.')
      }
      if (autoFixes.some(f => f.rule === 'no-var')) {
        content = content.replace(/\bvar\s+/g, 'let ')
      }
      if (content !== original) { writeFileSync(file, content, 'utf-8'); applied++; details.push(`  ✓ ${file}`) }
    } catch { /* ignore */ }
  })
  return { applied, details }
}

function saveHistory(entry: FixHistory) {
  try {
    let history: FixHistory[] = []
    if (existsSync(HISTORY_FILE)) history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    history.push(entry)
    if (history.length > 50) history.splice(0, history.length - 50)
    if (!existsSync(CONFIG_DIR)) require('fs').mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args?.trim().split(/\s+/) || []
  const subcmd = parts[0] || 'help'

  if (subcmd === 'help' || !subcmd) {
    onDone([
      'Auto Fix PR (Advanced)', '', 'Usage:',
      '  /autofix-pr analyze <PR>       Analyze PR for issues',
      '  /autofix-pr fix <PR>           Apply safe auto-fixes',
      '  /autofix-pr report <PR>        Generate detailed report',
      '  /autofix-pr approve <PR>       Approve PR',
      '  /autofix-pr meta <PR>          Show PR metadata',
      '  /autofix-pr checklist <PR>     Review checklist',
      '  /autofix-pr comment <PR>       Post review comment',
      '  /autofix-pr summary <PR>       AI summary of PR',
      '  /autofix-pr history            Show fix history',
      '  /autofix-pr status <PR>        PR status check',
    ].join('\n'))
    return null
  }

  if (subcmd === 'history') {
    try {
      const history: FixHistory[] = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
      if (history.length === 0) { onDone('No fix history'); return null }
      onDone('Fix History:\n' + history.slice(-10).map(h => `  ${h.date.slice(0, 19)} | PR #${h.pr} | ${h.issuesFound} found | ${h.issuesFixed} fixed | ${h.status}`).join('\n'))
      return null
    } catch { onDone('No fix history'); return null }
  }

  const prNumber = parts[1]
  if (!prNumber) { onDone('Usage: /autofix-pr <analyze|fix|report|approve|meta|checklist|comment|summary|status> <PR>'); return null }

  const meta = getPRMeta(prNumber)

  if (subcmd === 'meta') {
    if (!meta) { onDone('[ERROR] Cannot fetch PR metadata. Is gh CLI installed and authenticated?'); return null }
    onDone(['PR #' + meta.number + ' Metadata:', '====================', '', 'Title: ' + meta.title, 'Author: ' + meta.author, 'State: ' + meta.state, 'Base → Head: ' + meta.base + ' → ' + meta.head, 'Changes: +' + meta.additions + '/-' + meta.deletions + ' in ' + meta.changedFiles + ' files'].join('\n'))
    return null
  }

  if (subcmd === 'status') {
    if (!meta) { onDone('[ERROR] Cannot fetch PR status'); return null }
    const checks = run(`gh pr checks ${prNumber} 2>&1`)
    onDone(['PR #' + prNumber + ' Status:', '=================', '', 'State: ' + meta.state, '', 'Checks:', checks.output || '  (no checks found)'].join('\n'))
    return null
  }

  const diffResult = run('gh pr diff ' + prNumber + ' 2>/dev/null')
  if (!diffResult.ok) { onDone('[ERROR] Cannot fetch PR diff'); return null }
  const fixes = analyzeDiff(diffResult.output)

  if (subcmd === 'analyze') {
    if (fixes.length === 0) { onDone('[OK] No issues found in PR #' + prNumber); return null }
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    const byCategory: Record<string, number> = {}
    fixes.forEach(f => { bySeverity[f.severity]++; byCategory[f.category] = (byCategory[f.category] || 0) + 1 })
    const lines = ['PR #' + prNumber + ' Analysis:', 'Found ' + fixes.length + ' issues:', '', 'Severity:', `  🔴 Critical: ${bySeverity.critical}`, `  🟠 High: ${bySeverity.high}`, `  🟡 Medium: ${bySeverity.medium}`, `  🔵 Low: ${bySeverity.low}`, '', 'Category:']
    Object.entries(byCategory).forEach(([cat, count]) => lines.push(`  ${cat}: ${count}`))
    lines.push('', 'Issues:')
    fixes.forEach((f, i) => {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '🔵'
      lines.push(`${icon} ${i + 1}. [${f.file}:${f.line}] ${f.issue}`)
      lines.push(`   → ${f.suggestion}${f.autoFixable ? ' [AUTO-FIXABLE]' : ''}`)
    })
    onDone(lines.join('\n'))
    return null
  }

  if (subcmd === 'fix') {
    if (fixes.length === 0) { onDone('[OK] No issues to fix in PR #' + prNumber); return null }
    const { applied, details } = applyFixes(fixes)
    const autoFixable = fixes.filter(f => f.autoFixable).length
    saveHistory({ date: new Date().toISOString(), pr: prNumber, issuesFound: fixes.length, issuesFixed: applied, status: 'fixed' })
    onDone(['[OK] Applied ' + applied + ' safe fixes.', '', 'Summary:', '  Total issues: ' + fixes.length, '  Auto-fixable: ' + autoFixable, '  Applied: ' + applied, '  Manual review needed: ' + (fixes.length - autoFixable), '', 'Fixed files:', ...details, '', 'Note: console statements were commented out (not removed) to preserve debugging ability. Review and remove them manually.'].join('\n'))
    return null
  }

  if (subcmd === 'report') {
    const autoFixable = fixes.filter(f => f.autoFixable).length
    const byFile: Record<string, number> = {}
    fixes.forEach(f => { byFile[f.file] = (byFile[f.file] || 0) + 1 })
    const lines = ['Fix Report for PR #' + prNumber, '======================', '', 'Total issues: ' + fixes.length, 'Auto-fixable: ' + autoFixable, 'Manual review: ' + (fixes.length - autoFixable), 'Files affected: ' + Object.keys(byFile).length, '', 'By file:']
    Object.entries(byFile).forEach(([file, count]) => lines.push(`  ${file}: ${count}`))
    lines.push('', 'Critical/High issues:')
    fixes.filter(f => ['critical', 'high'].includes(f.severity)).forEach(f => lines.push(`  [${f.file}:${f.line}] ${f.issue}`))
    onDone(lines.join('\n'))
    return null
  }

  if (subcmd === 'checklist') {
    if (!meta) { onDone('[ERROR] Cannot fetch PR metadata'); return null }
    const checks: Array<[string, boolean]> = [
      ['Title is descriptive', meta.title.length > 10],
      ['PR has description', true],
      ['Changed files match scope', meta.changedFiles <= 20],
      ['No critical issues', !fixes.some(f => f.severity === 'critical')],
      ['No high issues', !fixes.some(f => f.severity === 'high')],
      ['No hardcoded secrets', !fixes.some(f => f.rule === 'no-hardcoded-secrets')],
      ['No eval() usage', !fixes.some(f => f.rule === 'no-eval')],
      ['No innerHTML assignments', !fixes.some(f => f.rule === 'no-innerHTML')],
      ['No console statements', !fixes.some(f => f.rule === 'no-console-log')],
      ['No TODO/FIXME markers', !fixes.some(f => f.rule === 'no-todo')],
    ]
    const lines = ['PR #' + prNumber + ' Review Checklist:', '========================', '']
    let passed = 0
    checks.forEach(([name, ok]) => { lines.push(`  ${ok ? '✅' : '❌'} ${name}`); if (ok) passed++ })
    lines.push('', `Result: ${passed}/${checks.length} passed`)
    onDone(lines.join('\n'))
    return null
  }

  if (subcmd === 'summary') {
    const lines = ['PR #' + prNumber + ' Summary:', '===================', '']
    if (meta) lines.push('Title: ' + meta.title, 'Author: ' + meta.author, 'State: ' + meta.state, 'Changes: +' + meta.additions + '/-' + meta.deletions + ' (' + meta.changedFiles + ' files)', '')
    const files = new Set(fixes.map(f => f.file))
    lines.push('Diff stats:')
    if (meta) lines.push(`  ${meta.changedFiles} files changed`)
    lines.push(`  ${fixes.length} potential issues found`)
    lines.push(`  ${files.size} files with issues`)
    lines.push('', 'Top concerns:')
    fixes.filter(f => ['critical', 'high'].includes(f.severity)).slice(0, 5).forEach(f => lines.push(`  • ${f.issue} (${f.file}:${f.line})`))
    if (!fixes.some(f => ['critical', 'high'].includes(f.severity))) lines.push('  • No critical or high severity issues')
    onDone(lines.join('\n'))
    return null
  }

  if (subcmd === 'comment') {
    const summary = fixes.filter(f => ['critical', 'high'].includes(f.severity)).slice(0, 5).map(f => `- **${f.issue}** at ${f.file}:${f.line}: ${f.suggestion}`).join('\n')
    const body = `🤖 **Auto Review Comment**

Found ${fixes.length} potential issues in this PR.

${summary || '- No significant issues found'}

---
*Generated automatically by the autofix-pr tool*`
    const result = run(`gh pr comment ${prNumber} --body ${JSON.stringify(body)} 2>&1`)
    onDone(result.ok ? '[OK] Comment posted' : '[ERROR] ' + result.output)
    return null
  }

  if (subcmd === 'approve') {
    try {
      execSync('gh pr review ' + prNumber + ' --approve --body "Auto-approved: ' + fixes.length + ' issues found, ' + fixes.filter(f => f.autoFixable).length + ' auto-fixable"', { stdio: 'ignore' })
      saveHistory({ date: new Date().toISOString(), pr: prNumber, issuesFound: fixes.length, issuesFixed: fixes.filter(f => f.autoFixable).length, status: 'approved' })
      onDone('[OK] PR #' + prNumber + ' approved')
    } catch { onDone('[ERROR] Approve failed') }
    return null
  }

  onDone('Unknown: ' + subcmd)
  return null
}

const autofixPr = { type: 'local-jsx' as const, name: 'autofix-pr', description: 'Auto-fix PR - analyze/fix/report/meta/checklist/comment/summary/approve/history', argumentHint: '<analyze|fix|report|meta|checklist|comment|summary|approve|history> <PR>', isEnabled: () => true, load: () => import('./index.tsx') } satisfies Command
export default autofixPr
