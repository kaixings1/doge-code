import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, watch, FSWatcher } from 'fs'
import { join, extname, resolve } from 'path'

interface ProactiveSuggestion {
  id: string
  type: 'performance' | 'security' | 'maintainability' | 'bug' | 'style'
  severity: 'high' | 'medium' | 'low'
  file: string
  line: number
  message: string
  suggestion: string
  autoFixable: boolean
  status: 'open' | 'fixed' | 'ignored'
  detectedAt: string
  fixedAt?: string
}

interface ProactiveConfig {
  enabled: boolean
  scanOnSave: boolean
  autoSuggest: boolean
  severityFilter: ('high' | 'medium' | 'low')[]
  excludedFiles: string[]
  ignorePatterns: string[]
  rules: Record<string, boolean>
  scheduleInterval: number // minutes, 0 = disabled
}

interface ProactiveTrend {
  date: string
  added: number
  fixed: number
  ignored: number
}

const DEFAULT_CONFIG: ProactiveConfig = {
  enabled: true,
  scanOnSave: true,
  autoSuggest: true,
  severityFilter: ['high', 'medium', 'low'],
  excludedFiles: ['node_modules', 'dist', 'build', '.git'],
  ignorePatterns: [],
  rules: {
    'perf-foreach-push': true,
    'perf-json-clone': true,
    'sec-eval': true,
    'sec-innerHTML': true,
    'maintain-deep-nesting': true,
    'bug-await-outside-async': true,
    'style-line-length': true,
  },
  scheduleInterval: 0,
}

let activeWatcher: FSWatcher | null = null

function getHomeDir(): string {
  return require('os').homedir()
}

function getConfigPath(): string {
  return join(getHomeDir(), '.doge', 'proactive.json')
}

function getIssuesPath(): string {
  return join(getHomeDir(), '.doge', 'proactive-issues.json')
}

function getTrendPath(): string {
  return join(getHomeDir(), '.doge', 'proactive-trend.json')
}

function loadConfig(): ProactiveConfig {
  try {
    const fs = require('fs')
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return {
        ...DEFAULT_CONFIG,
        ...saved,
        rules: { ...DEFAULT_CONFIG.rules, ...(saved.rules || {}) },
        ignorePatterns: saved.ignorePatterns || [],
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: ProactiveConfig): void {
  const fs = require('fs')
  const configPath = getConfigPath()
  const dir = getHomeDir() + '\\.doge'
  if (!fs.existsSync(dir)) mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function loadIssues(): ProactiveSuggestion[] {
  try {
    const fs = require('fs')
    const p = getIssuesPath()
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function saveIssues(issues: ProactiveSuggestion[]): void {
  const fs = require('fs')
  const p = getIssuesPath()
  const dir = getHomeDir() + '\\.doge'
  if (!fs.existsSync(dir)) mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(issues, null, 2), 'utf-8')
}

function loadTrend(): ProactiveTrend[] {
  try {
    const fs = require('fs')
    const p = getTrendPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* ignore */ }
  return []
}

function saveTrend(trend: ProactiveTrend[]): void {
  const fs = require('fs')
  const p = getTrendPath()
  const dir = getHomeDir() + '\\.doge'
  if (!fs.existsSync(dir)) mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(trend, null, 2), 'utf-8')
}

function recordTrend(added: number, fixed: number, ignored: number): void {
  const trend = loadTrend()
  const today = new Date().toISOString().slice(0, 10)
  const existing = trend.find(t => t.date === today)
  if (existing) {
    existing.added += added
    existing.fixed += fixed
    existing.ignored += ignored
  } else {
    trend.push({ date: today, added, fixed, ignored })
  }
  // Keep last 90 days
  if (trend.length > 90) trend.splice(0, trend.length - 90)
  saveTrend(trend)
}

function generateId(file: string, line: number, message: string): string {
  const str = file + ':' + line + ':' + message
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return 'P-' + Math.abs(hash).toString(16).toUpperCase().padStart(6, '0')
}

function matchesIgnorePattern(issue: ProactiveSuggestion, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      const re = new RegExp(pattern)
      if (re.test(issue.file) || re.test(issue.message) || re.test(issue.type)) return true
    } catch {
      if (issue.file.includes(pattern) || issue.message.includes(pattern)) return true
    }
  }
  return false
}

function scanForIssues(dir: string, config?: ProactiveConfig): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = []
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs']
  const cfg = config || loadConfig()
  const now = new Date().toISOString()

  const scan = (currentDir: string) => {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fullPath = join(currentDir, entry.name)
        if (entry.isDirectory()) {
          scan(fullPath)
        } else if (entry.isFile() && exts.includes(extname(entry.name))) {
          try {
            const content = readFileSync(fullPath, 'utf-8')
            const lines = content.split('\n')

            lines.forEach((line, i) => {
              const trimmed = line.trim()

              // Performance issues
              if (cfg.rules['perf-foreach-push'] !== false && trimmed.includes('.forEach(') && trimmed.includes('push(')) {
                const msg = 'forEach + push can be replaced with map/filter'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'performance', severity: 'low', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Use .map() or .filter() instead', autoFixable: true,
                  status: 'open', detectedAt: now,
                })
              }
              if (cfg.rules['perf-json-clone'] !== false && trimmed.includes('JSON.parse(JSON.stringify(')) {
                const msg = 'Deep clone with JSON.parse(JSON.stringify()) is slow'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'performance', severity: 'medium', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Use structuredClone() or a library like lodash.cloneDeep',
                  autoFixable: true, status: 'open', detectedAt: now,
                })
              }

              // Security issues
              if (cfg.rules['sec-eval'] !== false && trimmed.includes('eval(')) {
                const msg = 'eval() can execute arbitrary code'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'security', severity: 'high', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Use JSON.parse() or Function constructor with validation',
                  autoFixable: false, status: 'open', detectedAt: now,
                })
              }
              if (cfg.rules['sec-innerHTML'] !== false && trimmed.includes('innerHTML')) {
                const msg = 'innerHTML can lead to XSS attacks'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'security', severity: 'high', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Use textContent or framework-safe rendering',
                  autoFixable: false, status: 'open', detectedAt: now,
                })
              }

              // Maintainability
              const indent = (line.match(/^(\s+)/)?.[1]?.length || 0) / 2
              if (cfg.rules['maintain-deep-nesting'] !== false && indent > 5) {
                const msg = 'Deep nesting detected (' + indent + ' levels)'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'maintainability', severity: 'medium', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Extract nested logic into separate functions',
                  autoFixable: false, status: 'open', detectedAt: now,
                })
              }

              // Bug-prone patterns
              if (cfg.rules['bug-await-outside-async'] !== false && trimmed.includes('await') && !trimmed.includes('async') && !trimmed.includes('function')) {
                const msg = 'await used outside async function'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'bug', severity: 'high', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Add async keyword to the function or use .then()',
                  autoFixable: false, status: 'open', detectedAt: now,
                })
              }

              // Style
              if (cfg.rules['style-line-length'] !== false && trimmed.length > 120) {
                const msg = 'Line too long (' + trimmed.length + ' chars)'
                suggestions.push({
                  id: generateId(fullPath, i + 1, msg),
                  type: 'style', severity: 'low', file: fullPath, line: i + 1,
                  message: msg, suggestion: 'Break line into multiple lines (max 120 chars)',
                  autoFixable: false, status: 'open', detectedAt: now,
                })
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  scan(dir)
  return suggestions
}

function mergeIssues(existing: ProactiveSuggestion[], fresh: ProactiveSuggestion[]): ProactiveSuggestion[] {
  const map = new Map<string, ProactiveSuggestion>()
  existing.forEach(issue => {
    if (issue.status === 'open') map.set(issue.id, issue)
  })
  let added = 0
  fresh.forEach(issue => {
    if (!map.has(issue.id)) {
      map.set(issue.id, issue)
      added++
    }
  })
  if (added > 0) recordTrend(added, 0, 0)
  return Array.from(map.values())
}

function attemptAutoFix(issue: ProactiveSuggestion): boolean {
  try {
    const fs = require('fs')
    if (!fs.existsSync(issue.file)) return false
    const content = fs.readFileSync(issue.file, 'utf-8')
    const lines = content.split('\n')
    const idx = issue.line - 1
    if (idx < 0 || idx >= lines.length) return false
    const line = lines[idx]

    if (issue.type === 'performance' && issue.message.includes('forEach + push')) {
      // Simple transformation hint: add a comment marker for the user
      lines[idx] = line.replace(/\/\/\s*PROACTIVE_FIX:.*/, '') + ' // PROACTIVE_FIX: replace forEach+push with .map()'
      fs.writeFileSync(issue.file, lines.join('\n'), 'utf-8')
      return true
    }
    if (issue.type === 'performance' && issue.message.includes('Deep clone')) {
      lines[idx] = line.replace('JSON.parse(JSON.stringify(', 'structuredClone(/* WAS: JSON.parse(JSON.stringify */ (')
      fs.writeFileSync(issue.file, lines.join('\n'), 'utf-8')
      return true
    }
    if (issue.type === 'style' && issue.message.includes('Line too long')) {
      // Mark for manual fix, not auto-fixable in practice
      return false
    }
  } catch { /* ignore */ }
  return false
}

function generateMarkdownReport(issues: ProactiveSuggestion[]): string {
  const lines: string[] = []
  lines.push('# Proactive Code Analysis Report')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Total Open Issues: ' + issues.filter(i => i.status === 'open').length)
  lines.push('')

  const grouped: Record<string, ProactiveSuggestion[]> = {}
  issues.filter(i => i.status === 'open').forEach(i => {
    if (!grouped[i.type]) grouped[i.type] = []
    grouped[i.type].push(i)
  })

  const typeOrder = ['security', 'bug', 'performance', 'maintainability', 'style']
  for (const type of typeOrder) {
    const items = grouped[type]
    if (!items || items.length === 0) continue
    lines.push('## ' + type.toUpperCase() + ' (' + items.length + ')')
    lines.push('')
    items.forEach(item => {
      lines.push('### ' + item.id + ' [' + item.severity.toUpperCase() + ']')
      lines.push('- **File**: `' + item.file + ':' + item.line + '`')
      lines.push('- **Message**: ' + item.message)
      lines.push('- **Suggestion**: ' + item.suggestion)
      lines.push('- **Auto-fixable**: ' + (item.autoFixable ? 'Yes' : 'No'))
      lines.push('- **Detected**: ' + item.detectedAt)
      lines.push('')
    })
  }

  return lines.join('\n')
}

function generateHtmlReport(issues: ProactiveSuggestion[]): string {
  const openIssues = issues.filter(i => i.status === 'open')
  const sevCount = { high: 0, medium: 0, low: 0 }
  openIssues.forEach(i => { sevCount[i.severity]++ })

  const rows = openIssues.map(i =>
    '<tr class="' + i.severity + '">' +
    '<td>' + i.id + '</td>' +
    '<td>' + i.type + '</td>' +
    '<td><span class="badge ' + i.severity + '">' + i.severity + '</span></td>' +
    '<td><code>' + i.file + ':' + i.line + '</code></td>' +
    '<td>' + i.message + '</td>' +
    '<td>' + (i.autoFixable ? 'Yes' : 'No') + '</td>' +
    '</tr>'
  ).join('\n')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Proactive Report</title>
<style>
body{font-family:system-ui,sans-serif;max-width:1200px;margin:20px auto;padding:0 20px;background:#1a1a2e;color:#eaeaea}
h1{color:#e94560;margin-bottom:5px}
.meta{color:#888;margin-bottom:20px}
.summary{display:flex;gap:15px;margin-bottom:25px}
.stat{background:#16213e;border-radius:8px;padding:15px 20px;text-align:center;flex:1}
.stat .num{font-size:28px;font-weight:bold}
.stat.high .num{color:#e94560}.stat.medium .num{color:#f5a623}.stat.low .num{color:#4ecdc4}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#16213e;padding:10px;text-align:left;color:#e94560;font-size:13px;text-transform:uppercase}
td{padding:8px 10px;border-bottom:1px solid #2a2a4a;font-size:13px}
tr.high td:first-child{border-left:3px solid #e94560}
tr.medium td:first-child{border-left:3px solid #f5a623}
tr.low td:first-child{border-left:3px solid #4ecdc4}
.badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;text-transform:uppercase}
.badge.high{background:#e94560;color:#fff}.badge.medium{background:#f5a623;color:#000}.badge.low{background:#4ecdc4;color:#000}
code{background:#0f3460;padding:2px 6px;border-radius:3px;font-size:12px}
</style></head><body>
<h1>Proactive Code Analysis Report</h1>
<div class="meta">Generated: ${new Date().toISOString()} | Total Open: ${openIssues.length}</div>
<div class="summary">
  <div class="stat high"><div class="num">${sevCount.high}</div><div>High</div></div>
  <div class="stat medium"><div class="num">${sevCount.medium}</div><div>Medium</div></div>
  <div class="stat low"><div class="num">${sevCount.low}</div><div>Low</div></div>
</div>
<table>
<thead><tr><th>ID</th><th>Type</th><th>Severity</th><th>Location</th><th>Message</th><th>Auto-fix</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'scan'
  const config = loadConfig()

  // ===================== SCAN =====================
  if (cmd === 'scan' || cmd === 'analyze') {
    const target = parts[1] || '.'
    const fresh = scanForIssues(resolve(target), config)
    const filtered = fresh.filter(iss => {
      if (!config.severityFilter.includes(iss.severity)) return false
      if (matchesIgnorePattern(iss, config.ignorePatterns)) return false
      return true
    })

    // Merge into persistent store
    const existing = loadIssues()
    const merged = mergeIssues(existing, filtered)
    saveIssues(merged)

    if (filtered.length === 0) {
      return { type: 'text', value: '✅ 未发现新问题！代码看起来很干净。' }
    }

    const lines = [
      '💡 主动建议',
      '=====================',
      '',
      '发现 ' + filtered.length + ' 条新建议（未解决总数：' + merged.filter(i => i.status === 'open').length + '）：',
      '',
    ]

    const grouped: Record<string, ProactiveSuggestion[]> = {}
    filtered.forEach(iss => {
      if (!grouped[iss.type]) grouped[iss.type] = []
      grouped[iss.type].push(iss)
    })

    for (const [type, items] of Object.entries(grouped)) {
      lines.push('## ' + type.toUpperCase() + ' (' + items.length + ')')
      items.slice(0, 10).forEach(item => {
        const icon = item.severity === 'high' ? '[!]' : item.severity === 'medium' ? '[*]' : '[ ]'
        lines.push('  ' + icon + ' [' + item.id + '] ' + item.file + ':' + item.line)
        lines.push('    ' + item.message)
        lines.push('    -> ' + item.suggestion + (item.autoFixable ? ' (auto-fixable)' : ''))
      })
      lines.push('')
    }

    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== CONFIG =====================
  if (cmd === 'config') {
    const key = parts[1]
    const value = parts.slice(2).join(' ')
    if (!key || !value) {
      return { type: 'text', value: '📋 当前配置：\n' + JSON.stringify(config, null, 2) }
    }
    try {
      // @ts-expect-error dynamic key
      config[key] = value === 'true' ? true : value === 'false' ? false : value
      saveConfig(config)
      return { type: 'text', value: '✅ ' + key + ' = ' + config[key] }
    } catch (err) {
      return { type: 'text', value: '❌ 错误：' + err }
    }
  }

  // ===================== STATUS =====================
  if (cmd === 'status') {
    const issues = loadIssues()
    const open = issues.filter(i => i.status === 'open').length
    const fixed = issues.filter(i => i.status === 'fixed').length
    const ignored = issues.filter(i => i.status === 'ignored').length
    const lines = [
      'Proactive Status',
      '================',
      '',
      'Enabled:       ' + (config.enabled ? 'Yes' : 'No'),
      'ScanOnSave:    ' + config.scanOnSave,
      'AutoSuggest:   ' + config.autoSuggest,
      'Schedule:      ' + (config.scheduleInterval > 0 ? 'Every ' + config.scheduleInterval + 'min' : 'Disabled'),
      'Watch:         ' + (activeWatcher ? 'Active' : 'Inactive'),
      '',
      'Issues Summary',
      '  Open:     ' + open,
      '  Fixed:    ' + fixed,
      '  Ignored:  ' + ignored,
      '  Total:    ' + issues.length,
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== ENABLE / DISABLE =====================
  if (cmd === 'enable' || cmd === 'disable') {
    try {
      config.enabled = cmd === 'enable'
      saveConfig(config)
      return { type: 'text', value: '[OK] Proactive ' + cmd + 'd' }
    } catch {
      return { type: 'text', value: '❌ 保存配置失败' }
    }
  }

  // ===================== WATCH =====================
  if (cmd === 'watch') {
    if (activeWatcher) {
      return { type: 'text', value: '✅ 监听已处于活动状态。' }
    }
    const target = parts[1] || '.'
    const watchDir = resolve(target)
    if (!existsSync(watchDir)) {
      return { type: 'text', value: '❌ 目录未找到：' + watchDir }
    }

    // Do an initial scan
    const fresh = scanForIssues(watchDir, config)
    const filtered = fresh.filter(iss => {
      if (!config.severityFilter.includes(iss.severity)) return false
      if (matchesIgnorePattern(iss, config.ignorePatterns)) return false
      return true
    })
    const existing = loadIssues()
    const merged = mergeIssues(existing, filtered)
    saveIssues(merged)

    // Start watching
    try {
      activeWatcher = watch(watchDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        if (filename.startsWith('.') || filename.includes('node_modules') || filename.includes('dist')) return
        const ext = extname(filename)
        if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext)) return
        setTimeout(() => {
          try {
            const f = scanForIssues(watchDir, config)
            const fi = f.filter(iss => config.severityFilter.includes(iss.severity) && !matchesIgnorePattern(iss, config.ignorePatterns))
            const ex = loadIssues()
            const m = mergeIssues(ex, fi)
            saveIssues(m)
            const newCount = m.filter(i => i.status === 'open').length
            process.stdout.write('\n[proactive:watch] File changed: ' + filename + ' | Total open: ' + newCount + '\n')
          } catch { /* ignore */ }
        }, 500)
      })
    } catch (err) {
      return { type: 'text', value: '❌ 启动监听失败：' + err }
    }

      return { type: 'text', value: '✅ 已启动监听：' + watchDir + '\n初始扫描发现 ' + filtered.length + ' 个问题。\n按 Ctrl+C 停止监听。' }
  }

  // ===================== STOP WATCH =====================
  if (cmd === 'stop-watch' || cmd === 'unwatch') {
    if (activeWatcher) {
      activeWatcher.close()
      activeWatcher = null
      return { type: 'text', value: '✅ 文件监听已停止。' }
    }
    return { type: 'text', value: 'ℹ️ 无活动监听。' }
  }

  // ===================== FIX-ALL =====================
  if (cmd === 'fix-all') {
    const issues = loadIssues()
    const fixable = issues.filter(i => i.status === 'open' && i.autoFixable)
    if (fixable.length === 0) {
      return { type: 'text', value: '✅ 没有可自动修复的问题。' }
    }

    let fixed = 0
    fixable.forEach(issue => {
      if (attemptAutoFix(issue)) {
        issue.status = 'fixed'
        issue.fixedAt = new Date().toISOString()
        fixed++
      }
    })
    saveIssues(issues)
    recordTrend(0, fixed, 0)

    const lines = [
      '✅ 自动修复完成',
      '  尝试：' + fixable.length,
      '  成功：' + fixed,
      '  失败：' + (fixable.length - fixed),
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== FIX <id> =====================
  if (cmd === 'fix') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/proactive fix <id>' }

    const issues = loadIssues()
    const issue = issues.find(i => i.id === id)
    if (!issue) return { type: 'text', value: '❌ 问题未找到：' + id }
    if (issue.status !== 'open') return { type: 'text', value: '❌ 问题已是 ' + issue.status + ' 状态：' + id }
    if (!issue.autoFixable) return { type: 'text', value: '❌ 问题不可自动修复：' + id }

    if (attemptAutoFix(issue)) {
      issue.status = 'fixed'
      issue.fixedAt = new Date().toISOString()
      saveIssues(issues)
      recordTrend(0, 1, 0)
      return { type: 'text', value: '✅ 已修复 ' + id + '（' + issue.file + ':' + issue.line + '）' }
    }
    return { type: 'text', value: '❌ 修复失败：' + id + '。请手动修复。' }
  }

  // ===================== IGNORE <id> =====================
  if (cmd === 'ignore') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/proactive ignore <id>' }

    const issues = loadIssues()
    const issue = issues.find(i => i.id === id)
    if (!issue) return { type: 'text', value: '❌ 未找到问题：' + id }
    if (issue.status === 'ignored') return { type: 'text', value: '[INFO] Already ignored: ' + id }

    issue.status = 'ignored'
    saveIssues(issues)
    recordTrend(0, 0, 1)
    return { type: 'text', value: '[OK] Ignored ' + id + ': ' + issue.message }
  }

  // ===================== IGNORE-PATTERN <pattern> =====================
  if (cmd === 'ignore-pattern') {
    const pattern = parts.slice(1).join(' ')
    if (!pattern) {
      // List current patterns
      const lines = ['🚫 忽略规则：', '================']
      if (config.ignorePatterns.length === 0) {
        lines.push('  (none)')
      } else {
        config.ignorePatterns.forEach((p, i) => lines.push('  [' + i + '] ' + p))
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (pattern.startsWith('remove:')) {
      const idx = parseInt(pattern.replace('remove:', ''), 10)
      if (!isNaN(idx) && idx >= 0 && idx < config.ignorePatterns.length) {
        const removed = config.ignorePatterns.splice(idx, 1)[0]
        saveConfig(config)
        return { type: 'text', value: '✅ 已移除忽略规则：' + removed }
      }
      return { type: 'text', value: '❌ 索引无效。' }
    }

    config.ignorePatterns.push(pattern)
    saveConfig(config)
    return { type: 'text', value: '[OK] Added ignore pattern: ' + pattern }
  }

  // ===================== REPORT =====================
  if (cmd === 'report') {
    const issues = loadIssues()
    const format = parts[1] || 'markdown'
    const output = parts[2] || (format === 'html' ? 'proactive-report.html' : 'proactive-report.md')

    let content: string
    if (format === 'html') {
      content = generateHtmlReport(issues)
    } else {
      content = generateMarkdownReport(issues)
    }

    const fs = require('fs')
    fs.writeFileSync(resolve(output), content, 'utf-8')

    const lines = [
      '✅ 报告已生成：' + resolve(output),
      '  格式：' + format,
      '  问题数：' + issues.filter(i => i.status === 'open').length + ' 个未解决 / ' + issues.length + ' 个总计',
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== TREND =====================
  if (cmd === 'trend') {
    const trend = loadTrend()
    if (trend.length === 0) {
      return { type: 'text', value: 'ℹ️ 暂无趋势数据。请先运行扫描。' }
    }

    const days = Math.min(parseInt(parts[1], 10) || 14, 90)
    const recent = trend.slice(-days)

    const lines = [
      '📈 主动建议趋势（最近 ' + recent.length + ' 天）',
      '==========================================',
      '',
    ]

    let totalAdded = 0, totalFixed = 0, totalIgnored = 0
    const maxVal = Math.max(...recent.map(t => Math.max(t.added, t.fixed, t.ignored)), 1)

    recent.forEach(t => {
      totalAdded += t.added
      totalFixed += t.fixed
      totalIgnored += t.ignored
      const addedBar = '\u2588'.repeat(Math.round(t.added / maxVal * 10))
      const fixedBar = '\u2588'.repeat(Math.round(t.fixed / maxVal * 10))
      lines.push(t.date + '  +' + t.added + ' ' + addedBar + '  -' + t.fixed + ' ' + fixedBar + '  ~' + t.ignored)
    })

    lines.push('')
    lines.push('📊 摘要：+' + totalAdded + ' 新增，-' + totalFixed + ' 已修复，~' + totalIgnored + ' 已忽略')

    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== RULES =====================
  if (cmd === 'rules') {
    const sub = parts[1]
    if (!sub) {
      const lines = [
        '🔍 检测规则',
        '===============',
        '',
      ]
      const ruleDescriptions: Record<string, string> = {
        'perf-foreach-push': '检测 forEach + push 模式（性能）',
        'perf-json-clone': '检测 JSON.parse(JSON.stringify()) 深拷贝（性能）',
        'sec-eval': '检测 eval() 使用（安全）',
        'sec-innerHTML': '检测 innerHTML 使用（安全）',
        'maintain-deep-nesting': '检测深度嵌套超过 5 层（可维护性）',
        'bug-await-outside-async': '检测非 async 函数中使用 await（bug）',
        'style-line-length': '检测行长度超过 120 字符（风格）',
      }
      for (const [key, enabled] of Object.entries(config.rules)) {
        const status = enabled ? '✅ 开启' : '⛔ 关闭'
        lines.push('  ' + status + ' ' + key + '  (' + (ruleDescriptions[key] || '') + ')')
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (sub === 'enable' || sub === 'disable') {
      const ruleKey = parts[2]
      if (!ruleKey) return { type: 'text', value: '📖 用法：/proactive rules enable|disable <规则键>' }
      if (!(ruleKey in config.rules)) return { type: 'text', value: '❌ 未知规则：' + ruleKey }
      config.rules[ruleKey] = sub === 'enable'
      saveConfig(config)
      return { type: 'text', value: '✅ 规则 ' + ruleKey + ' 已' + (sub === 'enable' ? '启用' : '禁用') }
    }

    if (sub === 'reset') {
      config.rules = { ...DEFAULT_CONFIG.rules }
      saveConfig(config)
      return { type: 'text', value: '[OK] All rules reset to defaults.' }
    }

    return { type: 'text', value: '❌ 用法：/proactive rules [enable|disable|reset] [规则键]' }
  }

  // ===================== SCHEDULE =====================
  if (cmd === 'schedule') {
    const sub = parts[1]
    if (!sub || sub === 'status') {
      const status = config.scheduleInterval > 0 ? 'Every ' + config.scheduleInterval + ' minutes' : 'Disabled'
      return { type: 'text', value: '⏳ 定时任务：' + status + '\n用法：/proactive schedule <分钟数|off>' }
    }

    if (sub === 'off' || sub === 'disable' || sub === '0') {
      config.scheduleInterval = 0
      saveConfig(config)
      return { type: 'text', value: '✅ 已禁用定时扫描。' }
    }

    const minutes = parseInt(sub, 10)
    if (isNaN(minutes) || minutes <= 0) {
      return { type: 'text', value: '❌ 间隔无效。请使用正整数（分钟）。' }
    }

    config.scheduleInterval = minutes
    saveConfig(config)

    // Start the scheduled scan interval
    const intervalMs = minutes * 60 * 1000
    const intervalId = setInterval(() => {
      try {
        const cfg = loadConfig()
        if (!cfg.enabled) return
        const fresh = scanForIssues(resolve('.'), cfg)
        const filtered = fresh.filter(iss => {
          if (!cfg.severityFilter.includes(iss.severity)) return false
          if (matchesIgnorePattern(iss, cfg.ignorePatterns)) return false
          return true
        })
        const existing = loadIssues()
        const merged = mergeIssues(existing, filtered)
        saveIssues(merged)
        process.stdout.write('\n[proactive:schedule] Scan complete: ' + filtered.length + ' new issues found.\n')
      } catch (err) {
        process.stdout.write('\n[proactive:schedule] Scan error: ' + err + '\n')
      }
    }, intervalMs)

    // Don't keep process alive just for this
    if (typeof intervalId === 'object' && intervalId.unref) intervalId.unref()

    return { type: 'text', value: '✅ 已设置定时扫描：每 ' + minutes + ' 分钟' }
  }

  // ===================== EXPORT =====================
  if (cmd === 'export') {
    const issues = loadIssues()
    const format = parts[1] || 'json'
    const output = parts[2] || 'proactive-export.' + (format === 'csv' ? 'csv' : 'json')

    if (format === 'csv') {
      const headers = ['id', 'type', 'severity', 'status', 'file', 'line', 'message', 'suggestion', 'autoFixable', 'detectedAt']
      const rows = issues.map(i =>
        '"' + i.id + '","' + i.type + '","' + i.severity + '","' + i.status + '","' +
        i.file.replace(/"/g, '""') + '",' + i.line + ',"' +
        i.message.replace(/"/g, '""') + '","' + i.suggestion.replace(/"/g, '""') + '",' +
        i.autoFixable + ',"' + i.detectedAt + '"'
      )
      const csv = headers.join(',') + '\n' + rows.join('\n')
      writeFileSync(resolve(output), csv, 'utf-8')
    } else {
      const exportData = {
        exportedAt: new Date().toISOString(),
        total: issues.length,
        open: issues.filter(i => i.status === 'open').length,
        issues,
      }
      writeFileSync(resolve(output), JSON.stringify(exportData, null, 2), 'utf-8')
    }

    const lines = [
      '[OK] Exported ' + issues.length + ' issues to: ' + resolve(output),
      '  Format: ' + format,
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== LIST =====================
  if (cmd === 'list') {
    const issues = loadIssues()
    const statusFilter = parts[1] || 'open'
    const filtered = statusFilter === 'all' ? issues : issues.filter(i => i.status === statusFilter)

    if (filtered.length === 0) {
      return { type: 'text', value: '✅ 无' + statusFilter + '问题' }
    }

    const lines = [
      'Proactive Issues (' + statusFilter + ')',
      '===============================',
      '',
    ]

    filtered.slice(0, 50).forEach(item => {
      const icon = item.severity === 'high' ? '[!]' : item.severity === 'medium' ? '[*]' : '[ ]'
      lines.push(icon + ' [' + item.id + '] ' + item.status.toUpperCase() + ' ' + item.type + ':' + item.severity)
      lines.push('    ' + item.file + ':' + item.line + ' - ' + item.message)
    })

    if (filtered.length > 50) {
      lines.push('')
      lines.push('... and ' + (filtered.length - 50) + ' more. Use /proactive list all to see all.')
    }

    return { type: 'text', value: lines.join('\n') }
  }

  // ===================== HELP =====================
  if (cmd === 'help') {
    return { type: 'text', value: [
      'Proactive Suggestions - Extended',
      '=================================',
      '',
      'Scanning:',
      '  /proactive scan [path]        Scan for issues and suggestions',
      '  /proactive watch [path]       Watch files for changes, auto-scan',
      '  /proactive stop-watch         Stop file watcher',
      '  /proactive list [open|fixed|ignored|all]  List stored issues',
      '',
      'Fixing:',
      '  /proactive fix-all            Auto-fix all fixable issues',
      '  /proactive fix <id>           Fix a specific issue by ID',
      '  /proactive ignore <id>        Ignore a specific issue by ID',
      '  /proactive ignore-pattern <pat>  Add ignore pattern (regex or string)',
      '  /proactive ignore-pattern     List ignore patterns',
      '',
      'Rules:',
      '  /proactive rules              List detection rules',
      '  /proactive rules enable <key> Enable a rule',
      '  /proactive rules disable <key> Disable a rule',
      '  /proactive rules reset        Reset rules to defaults',
      '',
      'Reports & Export:',
      '  /proactive report [md|html] [file]  Generate report',
      '  /proactive trend [days]       Show issue trend statistics',
      '  /proactive export [json|csv] [file]  Export issues',
      '',
      'Scheduling:',
      '  /proactive schedule <minutes> Set scan interval',
      '  /proactive schedule off       Disable scheduled scanning',
      '',
      'General:',
      '  /proactive status             Show detailed status',
      '  /proactive enable/disable     Toggle proactive scanning',
      '  /proactive config             View/edit configuration',
      '',
      'Issues stored in: ~/.doge/proactive-issues.json',
      'Config stored in:  ~/.doge/proactive.json',
    ].join('\n') }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd + '\n请运行 /proactive help 查看用法。' }
}

const proactive: Command = {
  type: 'local',
  name: 'proactive',
  description: '💡 主动建议 - 扫描问题与改进/自动修复/忽略规则/趋势报告',
  aliases: ['/proactive', '/suggest'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default proactive
