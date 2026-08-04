import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.doge', 'code-health')
const HISTORY_FILE = join(CONFIG_DIR, 'health-history.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface HealthMetrics {
  file: string
  lines: number
  codeLines: number
  blankLines: number
  commentLines: number
  commentRatio: number
  functions: number
  classes: number
  complexity: number
  avgComplexity: number
  maxComplexity: number
  longFunctions: number
  deeplyNested: number
  largeObjects: number
  duplicateBlocks: number
  unusedImports: number
  missingTests: boolean
  documentationScore: number
}

interface HealthIssue {
  file: string
  line: number
  category: 'complexity' | 'size' | 'documentation' | 'testing' | 'duplication' | 'dead-code' | 'style' | 'security'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  message: string
  suggestion: string
  rule: string
  effort: 'trivial' | 'easy' | 'medium' | 'hard'
}

interface HealthConfig {
  thresholds: {
    maxLinesPerFile: number
    maxLinesPerFunction: number
    maxComplexity: number
    maxNestingDepth: number
    maxParameters: number
    minCommentRatio: number
    maxFileSize: number
  }
  weights: {
    complexity: number
    size: number
    documentation: number
    testing: number
    duplication: number
    deadCode: number
    style: number
    security: number
  }
  rules: Record<string, boolean>
  excludePatterns: string[]
  languages: string[]
  customRules: Array<{ name: string; pattern: string; category: string; severity: string }>
}

interface HealthHistory {
  date: string
  score: number
  grade: string
  filesScanned: number
  issuesFound: number
  topIssues: string[]
}

const DEFAULT_CONFIG: HealthConfig = {
  thresholds: {
    maxLinesPerFile: 500,
    maxLinesPerFunction: 50,
    maxComplexity: 10,
    maxNestingDepth: 4,
    maxParameters: 5,
    minCommentRatio: 10,
    maxFileSize: 1000,
  },
  weights: {
    complexity: 25,
    size: 15,
    documentation: 15,
    testing: 15,
    duplication: 10,
    deadCode: 10,
    style: 5,
    security: 5,
  },
  rules: {
    'max-file-length': true,
    'max-function-length': true,
    'max-complexity': true,
    'max-nesting-depth': true,
    'max-parameters': true,
    'min-comment-ratio': true,
    'no-duplicate-code': true,
    'no-dead-code': true,
    'require-tests': true,
    'no-unused-imports': true,
    'no-console-log': true,
    'no-any-type': true,
    'no-magic-numbers': true,
    'no-todo-fixme': false,
    'require-jsdoc': false,
    'no-eval': true,
    'no-innerHTML': true,
    'no-hardcoded-secrets': true,
    'no-empty-catch': true,
    'no-floating-promises': true,
    'prefer-const': true,
    'no-var': true,
  },
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', '.nuxt/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/*.min.js', '**/vendor/**'],
  languages: ['typescript', 'javascript', 'python', 'go', 'java', 'rust'],
  customRules: [],
}

function loadConfig(): HealthConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: HealthConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): HealthHistory[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(entry: HealthHistory) {
  const history = loadHistory()
  history.push(entry)
  if (history.length > 100) history.splice(0, history.length - 100)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function analyzeFile(file: string, config: HealthConfig): { metrics: HealthMetrics; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []
  const metrics: HealthMetrics = {
    file, lines: 0, codeLines: 0, blankLines: 0, commentLines: 0, commentRatio: 0,
    functions: 0, classes: 0, complexity: 0, avgComplexity: 0, maxComplexity: 0,
    longFunctions: 0, deeplyNested: 0, largeObjects: 0, duplicateBlocks: 0,
    unusedImports: 0, missingTests: true, documentationScore: 0,
  }

  if (!existsSync(file)) return { metrics, issues }

  try {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    metrics.lines = lines.length

    let funcStart = -1
    let funcName = ''
    let funcComplexity = 0
    let funcDepth = 0
    let funcMaxDepth = 0
    let braceCount = 0
    let totalComplexity = 0
    let maxComplexity = 0
    let longFunctions = 0
    let deeplyNested = 0
    const seenBlocks: Record<string, number> = {}

    lines.forEach((line, i) => {
      const t = line.trim()
      const lineNum = i + 1

      if (!t) { metrics.blankLines++; return }
      if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*')) { metrics.commentLines++; return }
      metrics.codeLines++

      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)\s*(?:\w+)/)
      if (funcMatch && funcStart === -1) {
        const nameMatch = line.match(/(?:function|def|func|fn)\s+(\w+)|const\s+(\w+)\s*=/)
        funcName = nameMatch?.[1] || nameMatch?.[2] || 'anonymous'
        funcStart = lineNum
        funcComplexity = 1
        funcDepth = 0
        funcMaxDepth = 0
        braceCount = 0
      }

      if (funcStart >= 0) {
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
        if (braceCount > funcMaxDepth) funcMaxDepth = braceCount
        if (/\b(if|else|for|while|switch|catch|&&|\?|match)\b/.test(t)) funcComplexity++
        if (/\b(if|for|while|switch)\b/.test(t) && braceCount > config.thresholds.maxNestingDepth) {
          deeplyNested++
          if (config.rules['max-nesting-depth']) {
            issues.push({ file, line: lineNum, category: 'complexity', severity: 'medium', message: `Deep nesting (depth: ${braceCount})`, suggestion: 'Extract nested logic into functions', rule: 'max-nesting-depth', effort: 'medium' })
          }
        }
        if (braceCount === 0 && line.includes('}') && funcStart !== lineNum) {
          metrics.functions++
          totalComplexity += funcComplexity
          if (funcComplexity > maxComplexity) maxComplexity = funcComplexity
          if (funcComplexity > config.thresholds.maxComplexity) {
            if (config.rules['max-complexity']) issues.push({ file, line: funcStart, category: 'complexity', severity: funcComplexity > 20 ? 'critical' : 'high', message: `High complexity: ${funcName} (${funcComplexity})`, suggestion: 'Simplify logic, extract helper functions', rule: 'max-complexity', effort: 'hard' })
          }
          if (lineNum - funcStart > config.thresholds.maxLinesPerFunction) {
            longFunctions++
            if (config.rules['max-function-length']) issues.push({ file, line: funcStart, category: 'size', severity: lineNum - funcStart > 100 ? 'high' : 'medium', message: `Long function: ${funcName} (${lineNum - funcStart} lines)`, suggestion: 'Extract smaller functions', rule: 'max-function-length', effort: 'hard' })
          }
          funcStart = -1
        }
      }

      if (config.rules['max-file-length'] && lines.length > config.thresholds.maxLinesPerFile) {
        if (lineNum === 1) issues.push({ file, line: 1, category: 'size', severity: lines.length > 1000 ? 'high' : 'medium', message: `File too long (${lines.length} lines)`, suggestion: 'Split into smaller modules', rule: 'max-file-length', effort: 'hard' })
      }

      if (config.rules['no-console-log'] && /\bconsole\.(log|debug)\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: 'console statement', suggestion: 'Use structured logger', rule: 'no-console-log', effort: 'trivial' })
      }

      if (config.rules['no-any-type'] && /:\s*\bany\b(?!\s*[=,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'medium', message: 'Usage of any type', suggestion: 'Define specific type', rule: 'no-any-type', effort: 'medium' })
      }

      if (config.rules['no-var'] && /\bvar\s+\w+/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: 'Usage of var', suggestion: 'Use const or let', rule: 'no-var', effort: 'trivial' })
      }

      if (config.rules['no-eval'] && /\beval\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, category: 'security', severity: 'critical', message: 'eval() usage', suggestion: 'Use safe alternatives', rule: 'no-eval', effort: 'hard' })
      }

      if (config.rules['no-innerHTML'] && /\.innerHTML\s*=/.test(t)) {
        issues.push({ file, line: lineNum, category: 'security', severity: 'high', message: 'innerHTML assignment', suggestion: 'Use textContent', rule: 'no-innerHTML', effort: 'easy' })
      }

      if (config.rules['no-empty-catch'] && /catch\s*\([^)]*\)\s*\{\s*\}/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'high', message: 'Empty catch block', suggestion: 'Add error handling', rule: 'no-empty-catch', effort: 'easy' })
      }

      if (config.rules['no-magic-numbers'] && /\b(?!0\b)(?!1\b)(?!2\b)(?!10\b)(?!100\b)\d{2,}\b(?!\s*[;,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: 'Magic number', suggestion: 'Extract to constant', rule: 'no-magic-numbers', effort: 'easy' })
      }

      if (config.rules['no-todo-fixme'] && /\/\/\s*(TODO|FIXME|HACK)\b/i.test(t)) {
        issues.push({ file, line: lineNum, category: 'documentation', severity: 'low', message: 'TODO/FIXME marker', suggestion: 'Complete or create issue', rule: 'no-todo-fixme', effort: 'medium' })
      }

      if (/(?:password|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(t) && !t.includes('process.env') && !t.includes('example')) {
        if (config.rules['no-hardcoded-secrets']) issues.push({ file, line: lineNum, category: 'security', severity: 'critical', message: 'Hardcoded secret detected', suggestion: 'Use environment variables', rule: 'no-hardcoded-secrets', effort: 'easy' })
      }

      if (t.length > 120) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: `Line too long (${t.length} chars)`, suggestion: 'Break line', rule: 'max-line-length', effort: 'trivial' })
      }

      const block = t.slice(0, 80)
      if (block.length > 20 && !block.includes('import') && !block.includes('//')) {
        seenBlocks[block] = (seenBlocks[block] || 0) + 1
      }
    })

    Object.entries(seenBlocks).forEach(([block, count]) => {
      if (count >= 3) {
        metrics.duplicateBlocks++
        if (config.rules['no-duplicate-code']) issues.push({ file, line: 1, category: 'duplication', severity: 'medium', message: `Duplicate code (${count}x): ${block.slice(0, 50)}...`, suggestion: 'Extract to shared function', rule: 'no-duplicate-code', effort: 'medium' })
      }
    })

    metrics.avgComplexity = metrics.functions > 0 ? Math.round(totalComplexity / metrics.functions) : 0
    metrics.maxComplexity = maxComplexity
    metrics.longFunctions = longFunctions
    metrics.deeplyNested = deeplyNested
    metrics.commentRatio = metrics.lines > 0 ? Math.round((metrics.commentLines / metrics.lines) * 100) : 0
    metrics.classes = (content.match(/class\s+\w+/g) || []).length
    metrics.missingTests = !basename(file).includes('.test.') && !basename(file).includes('.spec.')

    if (metrics.commentRatio < config.thresholds.minCommentRatio && config.rules['require-jsdoc']) {
      issues.push({ file, line: 1, category: 'documentation', severity: 'low', message: `Low comment ratio (${metrics.commentRatio}%)`, suggestion: 'Add more documentation', rule: 'require-jsdoc', effort: 'medium' })
    }

    if (metrics.missingTests && config.rules['require-tests']) {
      issues.push({ file, line: 1, category: 'testing', severity: 'medium', message: 'Missing tests', suggestion: 'Add test file', rule: 'require-tests', effort: 'hard' })
    }

  } catch { /* ignore */ }

  return { metrics, issues }
}

function analyzeProject(dir: string, config: HealthConfig): { metrics: HealthMetrics[]; issues: HealthIssue[] } {
  const metrics: HealthMetrics[] = []
  const issues: HealthIssue[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(d, entry.name)
        if (config.excludePatterns.some(p => fp.includes(p.replace('**/', '')))) continue
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && /\.(ts|tsx|js|jsx|py|go|java|rs)$/.test(extname(entry.name))) {
          const result = analyzeFile(fp, config)
          metrics.push(result.metrics)
          issues.push(...result.issues)
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return { metrics, issues }
}

function calculateHealthScore(metrics: HealthMetrics[], issues: HealthIssue[], config: HealthConfig): { score: number; grade: string; categoryScores: Record<string, number> } {
  const categoryScores: Record<string, number> = { complexity: 100, size: 100, documentation: 100, testing: 100, duplication: 100, deadCode: 100, style: 100, security: 100 }
  const categoryIssues: Record<string, number> = {}
  issues.forEach(i => { categoryIssues[i.category] = (categoryIssues[i.category] || 0) + 1; const penalty = i.severity === 'critical' ? 25 : i.severity === 'high' ? 15 : i.severity === 'medium' ? 8 : i.severity === 'low' ? 3 : 1; categoryScores[i.category] = Math.max(0, categoryScores[i.category] - penalty) })
  let totalScore = 0
  let totalWeight = 0
  for (const [cat, weight] of Object.entries(config.weights)) { totalScore += (categoryScores[cat] || 0) * weight; totalWeight += weight }
  const score = Math.round(totalScore / totalWeight)
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  return { score, grade, categoryScores }
}

function formatTextReport(metrics: HealthMetrics[], issues: HealthIssue[], score: number, grade: string, categoryScores: Record<string, number>): string {
  const totalLines = metrics.reduce((s, m) => s + m.lines, 0)
  const totalFuncs = metrics.reduce((s, m) => s + m.functions, 0)
  const avgComp = metrics.length > 0 ? Math.round(metrics.reduce((s, m) => s + m.avgComplexity, 0) / metrics.length) : 0
  const maxComp = metrics.length > 0 ? Math.max(...metrics.map(m => m.maxComplexity)) : 0

  const lines = [
    'Code Health Dashboard',
    '═════════════════════',
    '',
    `Overall Score: ${score}/100 (${grade})`,
    '',
    'Category Scores:',
    `  🧠 Complexity: ${categoryScores.complexity || 0}/100`,
    `  📏 Size: ${categoryScores.size || 0}/100`,
    `  📖 Documentation: ${categoryScores.documentation || 0}/100`,
    `  🧪 Testing: ${categoryScores.testing || 0}/100`,
    `  🔄 Duplication: ${categoryScores.duplication || 0}/100`,
    `  💀 Dead Code: ${categoryScores.deadCode || 0}/100`,
    `  🎨 Style: ${categoryScores.style || 0}/100`,
    `  🔒 Security: ${categoryScores.security || 0}/100`,
    '',
    'Summary:',
    `  Files: ${metrics.length}`,
    `  Total Lines: ${totalLines}`,
    `  Functions: ${totalFuncs}`,
    `  Avg Complexity: ${avgComp}`,
    `  Max Complexity: ${maxComp}`,
    `  Issues: ${issues.length}`,
    '',
    'Issues by Severity:',
  ]

  const bySev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  issues.forEach(i => bySev[i.severity]++)
  lines.push(`  🔴 Critical: ${bySev.critical}`)
  lines.push(`  🟠 High: ${bySev.high}`)
  lines.push(`  🟡 Medium: ${bySev.medium}`)
  lines.push(`  🔵 Low: ${bySev.low}`)
  lines.push('')
  lines.push('Top Issues:')
  issues.filter(i => ['critical', 'high'].includes(i.severity)).slice(0, 15).forEach((i, idx) => {
    const icon = i.severity === 'critical' ? '🔴' : '🟠'
    lines.push(`  ${icon} ${idx + 1}. [${i.file}:${i.line}] ${i.message}`)
    lines.push(`     → ${i.suggestion}`)
  })
  return lines.join('\n')
}

function formatMarkdownReport(metrics: HealthMetrics[], issues: HealthIssue[], score: number, grade: string, categoryScores: Record<string, number>): string {
  const lines = ['# Code Health Report', '', `**Score: ${score}/100 (${grade})**`, '', '## Category Scores', '', '| Category | Score |', '|----------|-------|']
  for (const [cat, val] of Object.entries(categoryScores)) lines.push(`| ${cat} | ${val}/100 |`)
  lines.push('', '## Issues', '')
  const grouped: Record<string, HealthIssue[]> = {}
  issues.forEach(i => { if (!grouped[i.severity]) grouped[i.severity] = []; grouped[i.severity].push(i) })
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    if (grouped[sev]?.length) {
      lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${grouped[sev].length})`)
      grouped[sev].slice(0, 10).forEach(i => lines.push(`- [${i.file}:${i.line}] ${i.message} → ${i.suggestion}`))
      lines.push('')
    }
  }
  return lines.join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Code Health (Deep)', '', 'Usage:', '  /code-health                    Full health report', '  /code-health file <path>        Single file', '  /code-health complexity         Complexity analysis', '  /code-health size               Size analysis', '  /code-health documentation      Documentation analysis', '  /code-health testing            Testing analysis', '  /code-health duplication        Duplication analysis', '  /code-health style              Style analysis', '  /code-health security           Security analysis', '  /code-health trend              Health trend', '  /code-health history            History', '  /code-health baseline           Save baseline', '  /code-health compare            Compare with baseline', '  /code-health config             View/edit config', '  /code-health rules              List rules', '  /code-health enable <rule>      Enable rule', '  /code-health disable <rule>     Disable rule', '  /code-health export [fmt]       Export (md/json/html)', ''].join('\n') }

  if (cmd === 'rules') {
    const lines = ['Health Rules:', '==============', '']
    for (const [rule, enabled] of Object.entries(config.rules)) lines.push(`  ${enabled ? '[ON]' : '[OFF]'} ${rule}`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    if (key in config.rules) { config.rules[key as keyof typeof config.rules] = value === 'true'; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const rule = parts[1]; if (!rule || !(rule in config.rules)) return { type: 'text', value: `Unknown: ${rule}` }
    config.rules[rule as keyof typeof config.rules] = cmd === 'enable'; saveConfig(config); return { type: 'text', value: `[OK] ${rule} ${cmd}d` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No history' }
    const lines = ['Health History:', '================', '']
    history.slice(-14).forEach(h => { const bar = '█'.repeat(Math.round(h.score / 10)) + '░'.repeat(10 - Math.round(h.score / 10)); lines.push(`${h.date.slice(0, 10)} [${bar}] ${h.score}/100 (${h.grade}) - ${h.issuesFound} issues`) })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trend') {
    const history = loadHistory()
    if (history.length < 2) return { type: 'text', value: 'Need at least 2 scans' }
    const lines = ['Health Trend:', '==============', '']
    history.slice(-14).forEach(h => { const bar = '█'.repeat(Math.round(h.score / 10)); lines.push(`${h.date.slice(0, 10)} ${bar} ${h.score}`) })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'baseline') {
    const { metrics, issues } = analyzeProject('.', config)
    writeFileSync(BASELINE_FILE, JSON.stringify({ metrics, issues }, null, 2), 'utf-8')
    return { type: 'text', value: `[OK] Baseline saved (${issues.length} issues)` }
  }

  if (cmd === 'compare') {
    const { issues } = analyzeProject('.', config)
    try {
      const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
      const newIssues = issues.filter(i => !baseline.issues.some((b: HealthIssue) => b.file === i.file && b.line === i.line && b.message === i.message))
      const fixed = baseline.issues.filter((b: HealthIssue) => !issues.some(i => i.file === b.file && i.line === b.line && i.message === b.message))
      return { type: 'text', value: `Baseline Comparison:\nNew Issues: ${newIssues.length}\nFixed: ${fixed.length}\nCurrent: ${issues.length}` }
    } catch { return { type: 'text', value: 'No baseline. Run /code-health baseline first.' } }
  }

  if (cmd === 'file') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: `File not found: ${file || ''}` }
    const { metrics, issues } = analyzeFile(file, config)
    return { type: 'text', value: `File: ${file}\nLines: ${metrics.lines}\nFunctions: ${metrics.functions}\nComplexity: ${metrics.avgComplexity}/${metrics.maxComplexity}\nComment Ratio: ${metrics.commentRatio}%\nIssues: ${issues.length}\n\n${issues.slice(0, 10).map(i => `[${i.severity}] ${i.message} → ${i.suggestion}`).join('\n')}` }
  }

  if (cmd === 'complexity' || cmd === 'size' || cmd === 'documentation' || cmd === 'testing' || cmd === 'duplication' || cmd === 'style' || cmd === 'security') {
    const { metrics, issues } = analyzeProject('.', config)
    const filtered = issues.filter(i => i.category === cmd)
    if (filtered.length === 0) return { type: 'text', value: `[OK] No ${cmd} issues!` }
    const lines = [`${cmd.charAt(0).toUpperCase() + cmd.slice(1)} Issues (${filtered.length}):`, '═══════════════════════════════════', '']
    filtered.slice(0, 20).forEach((i, idx) => lines.push(`${idx + 1}. [${i.file}:${i.line}] ${i.message}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const fmt = parts[1] || 'md'
    const { metrics, issues } = analyzeProject('.', config)
    const { score, grade, categoryScores } = calculateHealthScore(metrics, issues, config)
    const filename = `health-report.${fmt === 'markdown' ? 'md' : fmt}`
    const content = fmt === 'json' ? JSON.stringify({ score, grade, categoryScores, metrics, issues }, null, 2) : formatMarkdownReport(metrics, issues, score, grade, categoryScores)
    writeFileSync(filename, content, 'utf-8')
    return { type: 'text', value: `[OK] Exported: ${filename}` }
  }

  // Default: full report
  const { metrics, issues } = analyzeProject('.', config)
  const { score, grade, categoryScores } = calculateHealthScore(metrics, issues, config)
  saveHistory({ date: new Date().toISOString(), score, grade, filesScanned: metrics.length, issuesFound: issues.length, topIssues: issues.slice(0, 5).map(i => i.message) })
  return { type: 'text', value: formatTextReport(metrics, issues, score, grade, categoryScores) }
}

const codeHealth: Command = {
  type: 'local', name: 'code-health',
  description: 'Code health - file/complexity/size/docs/testing/duplication/style/security/history/baseline',
  aliases: ['/code-health', '/ch', '/health'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default codeHealth
