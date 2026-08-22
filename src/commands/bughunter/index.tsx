// ============================================================================
// Bughunter Command - Enhanced Version
// Bug 扫描：多模式/严重级别/自动修复/忽略列表/自定义规则/统计/导出/基线对比
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, basename, extname } from 'path'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface BugFinding {
  id: string
  file: string
  line: number
  column?: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: 'security' | 'performance' | 'style' | 'docs' | 'logic' | 'type' | 'accessibility'
  message: string
  rule: string
  suggestion?: string
  fixable: boolean
  fixSnippet?: string
  context?: string
  suppressed: boolean
  suppressionReason?: string
}

interface ScanConfig {
  patterns: ScanPattern[]
  ignoreList: IgnoreEntry[]
  customRules: CustomRule[]
  severityOverrides: Record<string, BugFinding['severity']>
  fileTypes: string[]
  excludeDirs: string[]
  maxDepth: number
  parallel: boolean
  contextLines: number
  baselineEnabled: boolean
  fixSuggestions: boolean
}

interface ScanPattern {
  id: string
  name: string
  pattern: string
  severity: BugFinding['severity']
  category: BugFinding['category']
  message: string
  suggestion?: string
  fixSnippet?: string
  enabled: boolean
}

interface IgnoreEntry {
  id: string
  file?: string
  line?: number
  rule?: string
  pattern?: string
  reason: string
  createdAt: string
}

interface CustomRule {
  id: string
  name: string
  pattern: string
  severity: BugFinding['severity']
  category: BugFinding['category']
  message: string
  suggestion?: string
  enabled: boolean
  createdAt: string
}

interface ScanResult {
  findings: BugFinding[]
  scannedFiles: number
  scannedLines: number
  duration: number
  timestamp: string
  stats: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    fixable: number
    suppressed: number
    byCategory: Record<string, number>
  }
}

interface BaselineResult {
  current: ScanResult
  previous: ScanResult | null
  newFindings: BugFinding[]
  fixedFindings: BugFinding[]
  unchangedFindings: BugFinding[]
  summary: string
}

interface ScanHistory {
  version: string
  scans: Array<{
    timestamp: string
    findings: number
    duration: number
    files: number
    topRules: Array<{ rule: string; count: number }>
  }>
}

interface BugHunterStats {
  totalScans: number
  totalFindings: number
  totalFiles: number
  avgFindings: number
  avgDuration: number
  topRules: Array<{ rule: string; count: number }>
  topFiles: Array<{ file: string; count: number }>
  topCategories: Array<{ category: string; count: number }>
  fixableRatio: number
  trends: Array<{ date: string; findings: number; files: number }>
}

// ============================================================================
// Constants
// ============================================================================

const BUG_HUNTER_DIR = join(process.cwd(), '.doge', 'bughunter')
const HISTORY_FILE = join(BUG_HUNTER_DIR, 'history.json')
const BASELINE_FILE = join(BUG_HUNTER_DIR, 'baseline.json')
const CONFIG_FILE = join(BUG_HUNTER_DIR, 'config.json')
const IGNORE_FILE = join(BUG_HUNTER_DIR, 'ignore.json')

const DEFAULT_CONFIG: ScanConfig = {
  patterns: getDefaultPatterns(),
  ignoreList: [],
  customRules: [],
  severityOverrides: {},
  fileTypes: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp'],
  excludeDirs: ['node_modules', 'dist', 'build', '.git', '.doge', 'coverage', '.next', '.nuxt', 'vendor'],
  maxDepth: 10,
  parallel: true,
  contextLines: 2,
  baselineEnabled: true,
  fixSuggestions: true,
}

function getDefaultPatterns(): ScanPattern[] {
  return [
    { id: 'ts-any', name: 'bughunter', pattern: '\\bany\\b', severity: 'medium', category: 'type', message: '使用了 any 类型，建议指定具体类型', suggestion: '使用具体的类型替代 any', enabled: true },
    { id: 'ts-ignore', name: '@ts-ignore', pattern: '@ts-ignore', severity: 'high', category: 'type', message: '使用了 @ts-ignore 忽略类型错误', suggestion: '修复类型错误而不是忽略', enabled: true },
    { id: 'console-log', name: 'console.log', pattern: 'console\\.log', severity: 'low', category: 'style', message: '遗留的 console.log', suggestion: '移除或使用日志库', enabled: true },
    { id: 'console-debug', name: 'console.debug', pattern: 'console\\.(debug|trace|info|warn|error)', severity: 'info', category: 'style', message: '使用了 console 调试方法', suggestion: '考虑使用专业日志库', enabled: true },
    { id: 'todo', name: 'TODO 注释', pattern: 'TODO[:\\s]', severity: 'info', category: 'docs', message: '包含 TODO 注释', suggestion: '跟踪并处理 TODO', enabled: true },
    { id: 'fixme', name: 'FIXME 注释', pattern: 'FIXME[:\\s]', severity: 'medium', category: 'docs', message: '包含 FIXME 注释', suggestion: '修复标记的问题', enabled: true },
    { id: 'hack', name: 'HACK 注释', pattern: 'HACK[:\\s]', severity: 'medium', category: 'style', message: '包含 HACK 注释', suggestion: '重构 hack 代码', enabled: true },
    { id: 'xxx', name: 'XXX 注释', pattern: 'XXX[:\\s]', severity: 'medium', category: 'docs', message: '包含 XXX 注释', suggestion: '检查并处理 XXX 标记', enabled: true },
    { id: 'bug', name: 'BUG 注释', pattern: 'BUG[:\\s]', severity: 'high', category: 'logic', message: '包含 BUG 注释', suggestion: '修复标记的 Bug', enabled: true },
    { id: 'optimize', name: 'OPTIMIZE 注释', pattern: 'OPTIMIZE[:\\s]', severity: 'low', category: 'performance', message: '包含 OPTIMIZE 注释', suggestion: '优化标记的代码', enabled: true },
    { id: 'review', name: 'REVIEW 注释', pattern: 'REVIEW[:\\s]', severity: 'info', category: 'docs', message: '包含 REVIEW 注释', suggestion: '代码需要审查', enabled: true },
    { id: 'note', name: 'NOTE 注释', pattern: 'NOTE[:\\s]', severity: 'info', category: 'docs', message: '包含 NOTE 注释', suggestion: '确保注释清晰', enabled: true },
    { id: 'empty-catch', name: '空 catch 块', pattern: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}', severity: 'high', category: 'logic', message: '空的 catch 块', suggestion: '至少记录错误信息', enabled: true },
    { id: 'debugger', name: 'debugger 语句', pattern: '\\bdebugger\\b', severity: 'high', category: 'logic', message: '遗留的 debugger 语句', suggestion: '移除 debugger 语句', enabled: true },
    { id: 'no-unused', name: '未使用变量', pattern: '', severity: 'low', category: 'style', message: '存在未使用的变量', suggestion: '移除未使用的变量', enabled: false },
    { id: 'hardcoded-secret', name: '硬编码密钥', pattern: '(password|secret|token|key)\\s*[=:]\\s*["\'][^"\']{8,}["\']', severity: 'critical', category: 'security', message: '可能存在硬编码密钥', suggestion: '使用环境变量存储敏感信息', enabled: true },
    { id: 'eval-usage', name: 'eval 使用', pattern: '\\beval\\s*\\(', severity: 'critical', category: 'security', message: '使用了 eval() 函数', suggestion: '避免使用 eval()，使用更安全的替代方案', enabled: true },
    { id: 'inner-html', name: 'innerHTML 使用', pattern: '\\.innerHTML\\s*=', severity: 'high', category: 'security', message: '使用 innerHTML 可能导致 XSS', suggestion: '使用 textContent 或安全的 DOM 操作', enabled: true },
    { id: 'sql-injection', name: 'SQL 注入风险', pattern: '(query|execute)\\s*\\(.*\\+', severity: 'critical', category: 'security', message: '可能存在 SQL 注入风险', suggestion: '使用参数化查询', enabled: true },
    { id: 'weak-crypto', name: '弱加密算法', pattern: '(md5|sha1|des|rc4)\\s*\\(', severity: 'high', category: 'security', message: '使用了弱加密算法', suggestion: '使用更强的加密算法如 SHA-256', enabled: true },
    { id: 'infinite-loop', name: '可能的无限循环', pattern: 'while\\s*\\(\\s*true\\s*\\)', severity: 'medium', category: 'logic', message: '可能的无限循环', suggestion: '确保循环有退出条件', enabled: true },
    { id: 'missing-return', name: '缺少返回值', pattern: '', severity: 'medium', category: 'logic', message: '函数可能缺少返回值', suggestion: '检查所有路径是否都有返回值', enabled: false },
    { id: 'deep-nesting', name: '深层嵌套', pattern: '', severity: 'low', category: 'style', message: '代码嵌套层级过深', suggestion: '重构减少嵌套层级', enabled: false },
    { id: 'long-function', name: '函数过长', pattern: '', severity: 'low', category: 'style', message: '函数长度超过建议值', suggestion: '拆分为更小的函数', enabled: false },
    { id: 'magic-number', name: '魔术数字', pattern: '', severity: 'info', category: 'style', message: '使用了魔术数字', suggestion: '使用命名常量替代魔术数字', enabled: false },
    { id: 'duplicate-code', name: '重复代码', pattern: '', severity: 'medium', category: 'style', message: '检测到重复代码', suggestion: '提取公共逻辑为函数', enabled: false },
    { id: 'missing-error-handling', name: '缺少错误处理', pattern: '(async|await|Promise)\\s', severity: 'medium', category: 'logic', message: '异步操作缺少错误处理', suggestion: '添加 try-catch 或 .catch()', enabled: true },
    { id: 'race-condition', name: '可能的竞态条件', pattern: '', severity: 'high', category: 'logic', message: '检测到可能的竞态条件', suggestion: '使用适当的同步机制', enabled: false },
    { id: 'memory-leak', name: '可能的内存泄漏', pattern: '(setInterval|setTimeout)\\s*\\(', severity: 'medium', category: 'performance', message: '定时器未清理可能导致内存泄漏', suggestion: '在组件卸载时清除定时器', enabled: true },
    { id: 'missing-deps', name: '缺少依赖', pattern: '', severity: 'medium', category: 'logic', message: 'useEffect 可能缺少依赖', suggestion: '检查并添加所有依赖', enabled: false },
  ]
}

// ============================================================================
// File Discovery
// ============================================================================

function discoverFiles(config: ScanConfig): string[] {
  const results: string[] = []

  function scanDir(dir: string, depth: number): void {
    if (depth > config.maxDepth) return

    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        if (config.excludeDirs.includes(entry)) continue
        if (entry.startsWith('.') && entry !== '.') continue

        const fullPath = join(dir, entry)
        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            scanDir(fullPath, depth + 1)
          } else {
            const ext = extname(entry).toLowerCase()
            if (config.fileTypes.includes(ext)) {
              results.push(fullPath)
            }
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  scanDir(process.cwd(), 0)
  return results
}

// ============================================================================
// Scanning Engine
// ============================================================================

function scanFile(filePath: string, config: ScanConfig): BugFinding[] {
  const findings: BugFinding[] = []

  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNum = i + 1

      // Check each enabled pattern
      for (const pattern of config.patterns) {
        if (!pattern.enabled) continue

        // Check ignore list
        if (config.ignoreList.some(ig =>
          (ig.file === filePath && ig.line === lineNum) ||
          (ig.file === filePath && ig.rule === pattern.id) ||
          (ig.rule === pattern.id && !ig.file)
        )) {
          continue
        }

        try {
          const regex = new RegExp(pattern.pattern, 'i')
          const match = regex.exec(line)
          if (match) {
            const severity = config.severityOverrides[pattern.id] || pattern.severity
            const contextStart = Math.max(0, i - config.contextLines)
            const contextEnd = Math.min(lines.length, i + config.contextLines + 1)

            const finding: BugFinding = {
              id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              file: filePath,
              line: lineNum,
              column: match.index + 1,
              severity,
              category: pattern.category,
              message: pattern.message,
              rule: pattern.id,
              suggestion: pattern.suggestion,
              fixable: !!pattern.fixSnippet,
              fixSnippet: pattern.fixSnippet,
              context: lines.slice(contextStart, contextEnd).join('\n'),
              suppressed: false,
            }
            findings.push(finding)
          }
        } catch {
          // Invalid regex
        }
      }

      // Check custom rules
      for (const rule of config.customRules) {
        if (!rule.enabled) continue
        try {
          const regex = new RegExp(rule.pattern, 'i')
          if (regex.test(line)) {
            const contextStart = Math.max(0, i - config.contextLines)
            const contextEnd = Math.min(lines.length, i + config.contextLines + 1)

            const finding: BugFinding = {
              id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              file: filePath,
              line: lineNum,
              severity: rule.severity,
              category: rule.category,
              message: rule.message,
              rule: rule.id,
              suggestion: rule.suggestion,
              fixable: false,
              context: lines.slice(contextStart, contextEnd).join('\n'),
              suppressed: false,
            }
            findings.push(finding)
          }
        } catch {
          // Invalid regex
        }
      }
    }
  } catch {
    // skip
  }

  return findings
}

function runScan(config: ScanConfig): ScanResult {
  const start = Date.now()
  const files = discoverFiles(config)
  const allFindings: BugFinding[] = []
  let totalLines = 0

  for (const file of files) {
    const findings = scanFile(file, config)
    allFindings.push(...findings)

    try {
      const content = readFileSync(file, 'utf-8')
      totalLines += content.split('\n').length
    } catch {
      // skip
    }
  }

  const duration = Date.now() - start

  const stats = {
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
    info: allFindings.filter(f => f.severity === 'info').length,
    fixable: allFindings.filter(f => f.fixable).length,
    suppressed: allFindings.filter(f => f.suppressed).length,
    byCategory: {} as Record<string, number>,
  }

  for (const finding of allFindings) {
    stats.byCategory[finding.category] = (stats.byCategory[finding.category] || 0) + 1
  }

  return {
    findings: allFindings,
    scannedFiles: files.length,
    scannedLines: totalLines,
    duration,
    timestamp: new Date().toISOString(),
    stats,
  }
}

// ============================================================================
// Baseline Comparison
// ============================================================================

function loadBaseline(): ScanResult | null {
  try {
    if (existsSync(BASELINE_FILE)) {
      return JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return null
}

function saveBaseline(result: ScanResult): void {
  try {
    mkdirSync(BUG_HUNTER_DIR, { recursive: true })
    writeFileSync(BASELINE_FILE, JSON.stringify(result, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function compareWithBaseline(current: ScanResult): BaselineResult {
  const previous = loadBaseline()

  if (!previous) {
    return {
      current,
      previous: null,
      newFindings: current.findings,
      fixedFindings: [],
      unchangedFindings: [],
      summary: '📋 首次扫描，已建立基线',
    }
  }

  const prevKeys = new Set(previous.findings.map(f => `${f.file}:${f.line}:${f.rule}`))
  const currKeys = new Map(current.findings.map(f => [`${f.file}:${f.line}:${f.rule}`, f]))

  const newFindings: BugFinding[] = []
  const fixedFindings: BugFinding[] = []
  const unchangedFindings: BugFinding[] = []

  for (const finding of current.findings) {
    const key = `${finding.file}:${finding.line}:${finding.rule}`
    if (prevKeys.has(key)) {
      unchangedFindings.push(finding)
    } else {
      newFindings.push(finding)
    }
  }

  for (const finding of previous.findings) {
    const key = `${finding.file}:${finding.line}:${finding.rule}`
    if (!currKeys.has(key)) {
      fixedFindings.push(finding)
    }
  }

  return {
    current,
    previous,
    newFindings,
    fixedFindings,
    unchangedFindings,
    summary: `📊 新增 ${newFindings.length} | 修复 ${fixedFindings.length} | 未变 ${unchangedFindings.length}`,
  }
}

// ============================================================================
// History
// ============================================================================

function loadHistory(): ScanHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return { version: '1.0', scans: [] }
}

function saveHistory(history: ScanHistory): void {
  try {
    mkdirSync(BUG_HUNTER_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addScanToHistory(result: ScanResult): void {
  const history = loadHistory()
  const ruleCounts = new Map<string, number>()
  for (const finding of result.findings) {
    ruleCounts.set(finding.rule, (ruleCounts.get(finding.rule) || 0) + 1)
  }

  history.scans.push({
    timestamp: result.timestamp,
    findings: result.findings.length,
    duration: result.duration,
    files: result.scannedFiles,
    topRules: [...ruleCounts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  })

  if (history.scans.length > 100) {
    history.scans = history.scans.slice(-100)
  }

  saveHistory(history)
}

// ============================================================================
// Statistics
// ============================================================================

function calculateStats(): BugHunterStats {
  const history = loadHistory()
  const ruleCounts = new Map<string, number>()
  const fileCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  let totalFindings = 0
  let totalFiles = 0
  let totalDuration = 0

  for (const scan of history.scans) {
    totalFindings += scan.findings
    totalFiles += scan.files
    totalDuration += scan.duration

    for (const rule of scan.topRules) {
      ruleCounts.set(rule.rule, (ruleCounts.get(rule.rule) || 0) + rule.count)
    }
  }

  return {
    totalScans: history.scans.length,
    totalFindings,
    totalFiles,
    avgFindings: history.scans.length > 0 ? Math.round(totalFindings / history.scans.length) : 0,
    avgDuration: history.scans.length > 0 ? Math.round(totalDuration / history.scans.length) : 0,
    topRules: [...ruleCounts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topFiles: [...fileCounts.entries()].map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topCategories: [...categoryCounts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    fixableRatio: 0,
    trends: history.scans.slice(-30).map(s => ({ date: s.timestamp.slice(0, 10), findings: s.findings, files: s.files })),
  }
}

function formatStats(stats: BugHunterStats): string {
  const lines: string[] = []
  lines.push('📊 Bug 猎人统计')
  lines.push('═'.repeat(40))
  lines.push(`总扫描次数: ${stats.totalScans}`)
  lines.push(`总发现: ${stats.totalFindings}`)
  lines.push(`平均每次: ${stats.avgFindings}`)
  lines.push(`平均耗时: ${stats.avgDuration}ms`)
  lines.push('')

  if (stats.topRules.length > 0) {
    lines.push('--- 热门规则 ---')
    for (const r of stats.topRules.slice(0, 5)) {
      lines.push(`  ${r.rule}: ${r.count}次`)
    }
    lines.push('')
  }

  if (stats.trends.length > 0) {
    lines.push('--- 趋势 ---')
    for (const t of stats.trends.slice(-5)) {
      lines.push(`  ${t.date}: ${t.findings} 个问题 (${t.files} 文件)`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Export
// ============================================================================

function exportFindings(result: ScanResult, format: 'json' | 'csv' | 'html' | 'md'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `bughunter_${timestamp}`

  if (format === 'json') {
    const path = join(BUG_HUNTER_DIR, `${filename}.json`)
    writeFileSync(path, JSON.stringify(result, null, 2), 'utf-8')
    return path
  }

  if (format === 'csv') {
    const lines = ['文件,行号,严重级别,分类,消息,规则,建议']
    for (const f of result.findings) {
      lines.push(`"${f.file}",${f.line},${f.severity},${f.category},"${f.message}","${f.rule}","${f.suggestion || ''}"`)
    }
    const path = join(BUG_HUNTER_DIR, `${filename}.csv`)
    writeFileSync(path, lines.join('\n'), 'utf-8')
    return path
  }

  if (format === 'html') {
    const rows = result.findings.map(f =>
      `<tr><td>${basename(f.file)}</td><td>${f.line}</td><td class="${f.severity}">${f.severity}</td><td>${f.category}</td><td>${f.message}</td></tr>`
    ).join('\n')

    const html = `<!DOCTYPE html>
<html><head><title>Bug 猎人报告</title>
<style>body{font-family:sans-serif} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px} th{background:#f0f0f0} .critical{color:red} .high{color:orange} .medium{color:#cc0} .low{color:green} .info{color:gray}</style>
</head><body>
<h1>🐛 Bug 猎人报告</h1>
<p>扫描文件: ${result.scannedFiles} | 发现: ${result.findings.length} | 耗时: ${result.duration}ms</p>
<table><tr><th>文件</th><th>行</th><th>严重级别</th><th>分类</th><th>消息</th></tr>
${rows}</table></body></html>`

    const path = join(BUG_HUNTER_DIR, `${filename}.html`)
    writeFileSync(path, html, 'utf-8')
    return path
  }

  // Markdown
  const lines = ['# 🐛 Bug 猎人报告', '', `扫描文件: ${result.scannedFiles} | 发现: ${result.findings.length} | 耗时: ${result.duration}ms`, '']
  lines.push('## 统计')
  lines.push(`- 严重: ${result.stats.critical}`)
  lines.push(`- 高: ${result.stats.high}`)
  lines.push(`- 中: ${result.stats.medium}`)
  lines.push(`- 低: ${result.stats.low}`)
  lines.push(`- 信息: ${result.stats.info}`)
  lines.push(`- 可修复: ${result.stats.fixable}`)
  lines.push('')
  lines.push('## 发现详情')

  for (const f of result.findings) {
    lines.push(`### ${basename(f.file)}:${f.line}`)
    lines.push(`- **严重级别**: ${f.severity}`)
    lines.push(`- **分类**: ${f.category}`)
    lines.push(`- **消息**: ${f.message}`)
    if (f.suggestion) lines.push(`- **建议**: ${f.suggestion}`)
    lines.push('')
  }

  const path = join(BUG_HUNTER_DIR, `${filename}.md`)
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🐛 Bug 猎人 - 增强版',
    '',
    '扫描代码中的潜在问题，支持多种模式和自定义规则。',
    '',
    '用法:',
    '  /bughunter [选项]',
    '',
    '扫描选项:',
    '  --full                  完整扫描（默认）',
    '  --quick                 快速扫描（关键规则）',
    '  --security              只扫描安全相关',
    '  --performance           只扫描性能相关',
    '  --style                 只扫描代码风格',
    '  --severity <级别>       最低严重级别: critical / high / medium / low / info',
    '  --category <分类>       按分类过滤',
    '  --incremental           增量扫描（只扫描变更文件）',
    '',
    '对比选项:',
    '  --baseline              与基线对比',
    '  --save-baseline         保存当前结果为基线',
    '  --diff                  显示差异',
    '',
    '管理选项:',
    '  --ignore <文件> <行> <规则>  忽略特定发现',
    '  --unignore <ID>         取消忽略',
    '  --ignore-list           查看忽略列表',
    '  --rule-add              添加自定义规则',
    '  --rule-del <ID>         删除自定义规则',
    '  --rule-list             查看规则列表',
    '  --rule-toggle <ID>      启用/禁用规则',
    '',
    '修复选项:',
    '  --fix                   自动修复可修复的问题',
    '  --fix-dry-run           预览修复（不实际修改）',
    '',
    '信息选项:',
    '  --stats                 查看统计',
    '  --history               查看历史',
    '  --patterns              查看所有模式',
    '  --trends                查看趋势',
    '',
    '导出选项:',
    '  --export <格式>         导出报告: json / csv / html / md',
    '',
    'CI/CD 集成:',
    '  --ci-mode               CI 模式（发现严重问题则退出码非零）',
    '❌ 错误:   --fail-on <级别>        发现指定级别问题时失败',
    '  --junit <文件>         导出 JUnit XML 格式',
    '',
    '示例:',
    '  /bughunter                                   完整扫描',
    '  /bughunter --quick                           快速扫描',
    '  /bughunter --security                        安全扫描',
    '  /bughunter --baseline                        与基线对比',
    '  /bughunter --severity high                   只扫描高严重级别',
    '  /bughunter --export html                     导出 HTML 报告',
    '  /bughunter --ignore src/index.ts 10 ts-any   忽略特定发现',
    '  /bughunter --fix-dry-run                     预览自动修复',
    '  /bughunter --ci-mode --fail-on high         CI 模式',
  ].join('\n')
}

// ============================================================================
// Incremental Scanning - 增量扫描
// ============================================================================

function getChangedFilesSince(lastScanTime: number): string[] {
  try {
    const { execSync } = require('child_process')
    // Get files modified since last scan
    const output = execSync('git diff --name-only HEAD', { encoding: 'utf-8', timeout: 5000 })
    const changedFiles = output.split('\n').filter(Boolean)

    // Also check for untracked files
    const untrackedOutput = execSync('git ls-files --others --exclude-standard', { encoding: 'utf-8', timeout: 5000 })
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    return [...new Set([...changedFiles, ...untrackedFiles])]
  } catch {
    return []
  }
}

function runIncrementalScan(config: ScanConfig, lastScanTime: number): ScanResult {
  const start = Date.now()
  const changedFiles = getChangedFilesSince(lastScanTime)
  const allFindings: BugFinding[] = []
  let totalLines = 0

  // Filter to only relevant file types
  const relevantFiles = changedFiles.filter(f => {
    const ext = extname(f).toLowerCase()
    return config.fileTypes.includes(ext)
  })

  for (const file of relevantFiles) {
    const findings = scanFile(file, config)
    allFindings.push(...findings)

    try {
      const content = readFileSync(file, 'utf-8')
      totalLines += content.split('\n').length
    } catch {
      // skip
    }
  }

  const duration = Date.now() - start

  const stats = {
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
    info: allFindings.filter(f => f.severity === 'info').length,
    fixable: allFindings.filter(f => f.fixable).length,
    suppressed: allFindings.filter(f => f.suppressed).length,
    byCategory: {} as Record<string, number>,
  }

  for (const finding of allFindings) {
    stats.byCategory[finding.category] = (stats.byCategory[finding.category] || 0) + 1
  }

  return {
    findings: allFindings,
    scannedFiles: relevantFiles.length,
    scannedLines: totalLines,
    duration,
    timestamp: new Date().toISOString(),
    stats,
  }
}

// ============================================================================
// Auto-Fix - 自动修复
// ============================================================================

interface FixResult {
  file: string
  line: number
  original: string
  fixed: string
  rule: string
  success: boolean
  error?: string
}

function generateFix(finding: BugFinding, lineContent: string): string {
  switch (finding.rule) {
    case 'console-log':
      return '' // 移除 console.log
    case 'ts-ignore':
      return lineContent.replace('@ts-ignore', '❌ 错误: // TODO: 修复类型错误')
    case 'debugger':
      return '' // 移除 debugger
    case 'empty-catch':
      return lineContent.replace('{}', '❌ 错误: {\n    // TODO: 处理错误\n    console.error(error);\n  }')
    case 'missing-error-handling':
      return lineContent.replace(/await\s+(\w+)/, 'try {\n    await $1;\n  } catch (error) {\n    console.error(error);\n  }')
    default:
      return lineContent
  }
}

function applyFixes(findings: BugFinding[], dryRun: boolean): FixResult[] {
  const results: FixResult[] = []
  const fileModifications = new Map<string, Array<{ finding: BugFinding; line: number }>>()

  // Group findings by file
  for (const finding of findings) {
    if (!finding.fixable) continue
    if (!fileModifications.has(finding.file)) {
      fileModifications.set(finding.file, [])
    }
    fileModifications.get(finding.file)!.push({ finding, line: finding.line })
  }

  for (const [file, items] of fileModifications) {
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      // Sort by line number descending to avoid index shifting
      items.sort((a, b) => b.line - a.line)

      for (const item of items) {
        const lineIdx = item.line - 1
        if (lineIdx < 0 || lineIdx >= lines.length) continue

        const original = lines[lineIdx]
        const fixed = generateFix(item.finding, original)

        if (original !== fixed) {
          if (!dryRun) {
            if (fixed === '') {
              lines.splice(lineIdx, 1) // Remove line
            } else {
              lines[lineIdx] = fixed
            }
          }

          results.push({
            file,
            line: item.line,
            original,
            fixed,
            rule: item.finding.rule,
            success: true,
          })
        }
      }

      if (!dryRun && results.length > 0) {
        writeFileSync(file, lines.join('\n'), 'utf-8')
      }
    } catch (err) {
      results.push({
        file,
        line: 0,
        original: '',
        fixed: '',
        rule: '',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

function renderFixResults(results: FixResult[], dryRun: boolean): string {
  if (results.length === 0) return '📋 没有可修复的问题'

  const lines: string[] = [`🔧 ${dryRun ? '预览修复' : '修复结果'} (${results.length} 个):`]
  lines.push('')

  for (const result of results) {
    if (result.success) {
      lines.push(`  ✅ ${result.file}:${result.line} (${result.rule})`)
      if (dryRun) {
        lines.push(`     原文: ${result.original.trim()}`)
        lines.push(`     修复: ${result.fixed.trim()}`)
      }
    } else {
      lines.push(`  ❌ ${result.file}:${result.line} - ${result.error || '修复失败'}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// JUnit XML Export - JUnit XML 导出
// ============================================================================

function exportJunitXml(result: ScanResult): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `bughunter_${timestamp}.xml`

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="Bughunter Scan" tests="${result.findings.length}" failures="${result.stats.critical + result.stats.high}" time="${result.duration / 1000}">`,
    `  <testsuite name="Bughunter" tests="${result.findings.length}" failures="${result.stats.critical + result.stats.high}">`,
  ]

  for (const finding of result.findings) {
    const severity = finding.severity === 'critical' || finding.severity === 'high' ? 'failure' : 'testcase'
    lines.push(`    <testcase name="${finding.rule}" classname="${finding.file}" time="0">`)
    if (severity === 'failure') {
      lines.push(`      <failure message="${finding.message}">`)
      lines.push(`        ${finding.file}:${finding.line} - ${finding.message}`)
      if (finding.suggestion) lines.push(`        Suggestion: ${finding.suggestion}`)
      lines.push(`      </failure>`)
    }
    lines.push(`    </testcase>`)
  }

  lines.push('  </testsuite>')
  lines.push('</testsuites>')

  const path = join(BUG_HUNTER_DIR, filename)
  mkdirSync(BUG_HUNTER_DIR, { recursive: true })
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

// ============================================================================
// Trend Analysis - 趋势分析
// ============================================================================

function renderTrends(): string {
  const history = loadHistory()
  if (history.scans.length === 0) return '📋 没有历史数据'

  const lines: string[] = ['📈 Bug 猎人趋势分析:']
  lines.push('═'.repeat(50))

  // Recent 10 scans
  const recent = history.scans.slice(-10)
  lines.push('')
  lines.push('--- 最近 10 次扫描 ---')
  for (const scan of recent) {
    lines.push(`  ${scan.timestamp.slice(0, 16)}: ${scan.findings} 个问题 (${scan.files} 文件, ${scan.duration}ms)`)
  }

  // Trend
  if (recent.length >= 2) {
    const first = recent[0]
    const last = recent[recent.length - 1]
    const diff = last.findings - first.findings

    lines.push('')
    lines.push('--- 趋势 ---')
    if (diff > 0) {
      lines.push(`  📈 问题增加 ${diff} 个`)
    } else if (diff < 0) {
      lines.push(`  📉 问题减少 ${Math.abs(diff)} 个`)
    } else {
      lines.push(`  ➡️ 问题数量不变`)
    }
  }

  // Top rules
  const ruleCounts = new Map<string, number>()
  for (const scan of history.scans) {
    for (const rule of scan.topRules) {
      ruleCounts.set(rule.rule, (ruleCounts.get(rule.rule) || 0) + rule.count)
    }
  }

  lines.push('')
  lines.push('--- 热门规则 ---')
  for (const [rule, count] of [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    lines.push(`  ${rule}: ${count}次`)
  }

  return lines.join('\n')
}

// ============================================================================
// Main Call Function
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const config = { ...DEFAULT_CONFIG }
  const parts = (args || '').trim().split(/\s+/)
  const options = parts.filter(p => p.startsWith('--'))
  const nonOptions = parts.filter(p => !p.startsWith('--'))

  // Handle non-scan commands
  if (options.includes('--help')) {
    return { type: 'text', value: renderHelp() }
  }

  if (options.includes('--stats')) {
    return { type: 'text', value: formatStats(calculateStats()) }
  }

  if (options.includes('--history')) {
    const history = loadHistory()
    const lines: string[] = [`📋 扫描历史 (${history.scans.length} 次):`]
    for (const scan of history.scans.slice(-10).reverse()) {
      lines.push(`  ${scan.timestamp}: ${scan.findings} 个问题 (${scan.files} 文件, ${scan.duration}ms)`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (options.includes('--patterns')) {
    const lines: string[] = [`📋 扫描模式 (${config.patterns.length} 个):`]
    for (const p of config.patterns) {
      const status = p.enabled ? '✅' : '❌'
      lines.push(`  ${status} ${p.name} (${p.severity}) - ${p.message.slice(0, 40)}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (options.includes('--rule-list')) {
    return { type: 'text', value: '📋 自定义规则: ' + (config.customRules.length === 0 ? '无' : config.customRules.map(r => r.name).join(', ')) }
  }

  if (options.includes('--ignore-list')) {
    return { type: 'text', value: '📋 忽略列表: ' + (config.ignoreList.length === 0 ? '无' : config.ignoreList.map(i => `${i.file}:${i.line}`).join(', ')) }
  }

  // Configure scan
  if (options.includes('--quick')) {
    config.patterns = config.patterns.filter(p => ['ts-ignore', 'debugger', 'empty-catch', 'eval-usage'].includes(p.id))
  }

  if (options.includes('--security')) {
    config.patterns = config.patterns.filter(p => p.category === 'security')
  }

  if (options.includes('--performance')) {
    config.patterns = config.patterns.filter(p => p.category === 'performance')
  }

  if (options.includes('--style')) {
    config.patterns = config.patterns.filter(p => p.category === 'style')
  }

  const severityMatch = args.match(/--severity\s+(\S+)/)
  if (severityMatch) {
    const minSeverity = severityMatch[1]
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
    const minIdx = severityOrder.indexOf(minSeverity)
    config.patterns = config.patterns.filter(p => severityOrder.indexOf(p.severity) <= minIdx)
  }

  // Run scan
  const result = runScan(config)
  addScanToHistory(result)

  // Baseline
  if (options.includes('--save-baseline')) {
    saveBaseline(result)
  }

  if (options.includes('--baseline') || options.includes('--diff')) {
    const baseline = compareWithBaseline(result)
    const lines: string[] = ['📊 基线对比:', baseline.summary]
    if (baseline.newFindings.length > 0) {
      lines.push('', '--- 新增问题 ---')
      for (const f of baseline.newFindings.slice(0, 10)) {
        lines.push(`  ${f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '🔵'} ${basename(f.file)}:${f.line} ${f.message}`)
      }
    }
    if (baseline.fixedFindings.length > 0) {
      lines.push('', '--- 已修复 ---')
      for (const f of baseline.fixedFindings.slice(0, 10)) {
        lines.push(`  ✅ ${basename(f.file)}:${f.line} ${f.message}`)
      }
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Export
  const exportMatch = args.match(/--export\s+(\S+)/)
  if (exportMatch) {
    const path = exportFindings(result, exportMatch[1] as any)
    return { type: 'text', value: `✅ 已导出到: ${path}` }
  }

  // Render results
  return renderResultsUI(result, onDone, config)
}

// ============================================================================
// Results UI
// ============================================================================

interface ResultsUIProps {
  result: ScanResult
  onDone: () => void
  config: ScanConfig
}

const ResultsUI: React.FC<ResultsUIProps> = ({ result, onDone, _config }) => {
  const [selectedIdx, setSelectedIdx] = React.useState(0)
  const [filter, setFilter] = React.useState<string>('all')
  const [view, setView] = React.useState<'list' | 'stats'>('list')

  const filteredFindings = filter === 'all'
    ? result.findings
    : result.findings.filter(f => f.severity === filter || f.category === filter)

  useInput((input, key) => {
    if (key.escape) { onDone(); return }
    if (input === 'q') { onDone(); return }

    if (view === 'list') {
      if (key.upArrow && selectedIdx > 0) setSelectedIdx(selectedIdx - 1)
      if (key.downArrow && selectedIdx < filteredFindings.length - 1) setSelectedIdx(selectedIdx + 1)
      if (input === 's') setView('stats')
      if (input === 'f') {
        const severities = ['all', 'critical', 'high', 'medium', 'low', 'info']
        const currentIdx = severities.indexOf(filter)
        setFilter(severities[(currentIdx + 1) % severities.length])
      }
    } else {
      if (key.escape || input === 'b' || input === 'l') setView('list')
    }
  })

  const criticalCount = result.stats.critical
  const highCount = result.stats.high
  const mediumCount = result.stats.medium
  const lowCount = result.stats.low
  const infoCount = result.stats.info

  if (view === 'stats') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">📊 扫描统计</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>扫描文件: {result.scannedFiles}</Text>
          <Text>扫描行数: {result.scannedLines}</Text>
          <Text>耗时: {result.duration}ms</Text>
          <Text>发现总数: {result.findings.length}</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold>按严重级别:</Text>
          {criticalCount > 0 && <Text color="red">  🔴 严重: {criticalCount}</Text>}
          {highCount > 0 && <Text color="yellow">  🟠 高: {highCount}</Text>}
          {mediumCount > 0 && <Text color="yellow">  🟡 中: {mediumCount}</Text>}
          {lowCount > 0 && <Text color="green">  🔵 低: {lowCount}</Text>}
          {infoCount > 0 && <Text>  ⚪ 信息: {infoCount}</Text>}
        </Box>
        <Box marginTop={1}>
          <Text bold>按分类:</Text>
          {Object.entries(result.stats.byCategory).map(([cat, count]) => (
            <Text key={cat}>  {cat}: {count}</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>按 Esc/b 返回列表</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">🐛 Bug 猎人</Text>
        <Text dimColor> ({result.findings.length} 个发现)</Text>
      </Box>

      {/* Severity summary */}
      <Box marginBottom={1}>
        {criticalCount > 0 && <Text color="red">🔴 {criticalCount} </Text>}
        {highCount > 0 && <Text color="yellow">🟠 {highCount} </Text>}
        {mediumCount > 0 && <Text color="yellow">🟡 {mediumCount} </Text>}
        {lowCount > 0 && <Text color="blue">🔵 {lowCount} </Text>}
        {infoCount > 0 && <Text>⚪ {infoCount} </Text>}
      </Box>

      {/* Filter indicator */}
      {filter !== 'all' && (
        <Box marginBottom={1}>
          <Text color="cyan">🔍 过滤: {filter}</Text>
        </Box>
      )}

      {/* Findings list */}
      <Box flexDirection="column" height={15}>
        {filteredFindings.slice(0, 10).map((bug, i) => {
          const isSelected = i === selectedIdx
          const severityColor = bug.severity === 'critical' ? 'red' : bug.severity === 'high' ? 'yellow' : bug.severity === 'medium' ? 'yellow' : 'blue'
          const severityIcon = bug.severity === 'critical' ? '🔴' : bug.severity === 'high' ? '🟠' : bug.severity === 'medium' ? '🟡' : bug.severity === 'low' ? '🔵' : '⚪'

          return (
            <Box key={bug.id} flexDirection="row">
              <Text color={isSelected ? 'yellow' : severityColor}>
                {isSelected ? '▶' : ' '} {severityIcon}
              </Text>
              <Text color={isSelected ? 'yellow' : 'white'}>
                {' '}{basename(bug.file)}:{bug.line}
              </Text>
              <Text dimColor> {bug.message.slice(0, 40)}</Text>
            </Box>
          )
        })}
      </Box>

      {/* Selected bug details */}
      {filteredFindings[selectedIdx] && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>详情:</Text>
          <Text>  {filteredFindings[selectedIdx].message}</Text>
          {filteredFindings[selectedIdx].suggestion && (
            <Text color="green">  💡 {filteredFindings[selectedIdx].suggestion}</Text>
          )}
          {filteredFindings[selectedIdx].fixable && (
            <Text color="cyan">  🔧 可自动修复</Text>
          )}
        </Box>
      )}

      {/* Bottom hint */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ 选择 | f 过滤 | s 统计 | q/Esc 退出
        </Text>
      </Box>
    </Box>
  )
}

function renderResultsUI(result: ScanResult, onDone: () => void, config: ScanConfig) {
  return React.createElement(ResultsUI, { result, onDone, config })
}

// ============================================================================
// Command Definition
// ============================================================================

const bughunter: Command = {
  type: 'local-jsx' as const,
  name: 'bughunter',
  description: 'Bug 猎人 - 多模式扫描/严重级别/自动修复/基线对比/导出/统计',
  aliases: ['/bughunter', '/bug-hunter', '/scan-bugs'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default bughunter
