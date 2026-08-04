import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.doge', 'performance')
const HISTORY_FILE = join(CONFIG_DIR, 'perf-history.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')

interface PerfIssue {
  file: string
  line: number
  type: 'cpu' | 'memory' | 'io' | 'network' | 'render' | 'bundle' | 'algorithm'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  impact: string
  suggestion: string
  effort: 'trivial' | 'easy' | 'medium' | 'hard'
  category: string
}

interface FunctionMetrics {
  name: string
  file: string
  line: number
  length: number
  complexity: number
  depth: number
  params: number
  async: boolean
  hasTryCatch: boolean
  hasLoop: boolean
  hasAwait: boolean
}

interface FileMetrics {
  file: string
  lines: number
  codeLines: number
  blankLines: number
  commentLines: number
  functions: FunctionMetrics[]
  classes: number
  imports: number
  exports: number
  avgComplexity: number
  maxComplexity: number
  totalComplexity: number
  longestFunction: string
  deepestNesting: number
  hasTests: boolean
  testCoverage: number
}

interface PerfReport {
  files: FileMetrics[]
  summary: {
    totalFiles: number
    totalLines: number
    totalFunctions: number
    totalClasses: number
    avgComplexity: number
    maxComplexity: number
    avgFunctionLength: number
    longestFile: string
    mostComplexFile: string
    filesWithTests: number
    testCoverage: number
  }
  issues: PerfIssue[]
  score: number
  grade: string
  bottlenecks: string[]
  recommendations: string[]
  trends?: { date: string; score: number; issues: number }[]
}

function analyzeFile(file: string): FileMetrics | null {
  if (!existsSync(file)) return null
  const ext = extname(file).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp'].includes(ext)) return null

  try {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const functions: FunctionMetrics[] = []
    let funcStart = -1
    let funcName = ''
    let funcLine = 0
    let funcComplexity = 0
    let funcDepth = 0
    let funcMaxDepth = 0
    let funcParams = 0
    let funcAsync = false
    let funcHasTryCatch = false
    let funcHasLoop = false
    let funcHasAwait = false
    let braceCount = 0
    let codeLines = 0
    let blankLines = 0
    let commentLines = 0
    let maxNesting = 0

    lines.forEach((line, i) => {
      const t = line.trim()
      const lineNum = i + 1

      if (!t) { blankLines++; return }
      if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*')) { commentLines++; return }
      codeLines++

      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)\s*(?:\w+)/)
      if (funcMatch && funcStart === -1) {
        const nameMatch = line.match(/(?:function|def|func|fn)\s+(\w+)|const\s+(\w+)\s*=/)
        funcName = nameMatch?.[1] || nameMatch?.[2] || 'anonymous'
        funcStart = lineNum
        funcLine = lineNum
        funcComplexity = 1
        funcDepth = 0
        funcMaxDepth = 0
        funcParams = (line.match(/\(([^)]*)\)/)?.[1] || '').split(',').filter(p => p.trim()).length
        funcAsync = line.includes('async')
        funcHasTryCatch = false
        funcHasLoop = false
        funcHasAwait = false
        braceCount = 0
      }

      if (funcStart >= 0) {
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
        if (braceCount > funcMaxDepth) funcMaxDepth = braceCount
        if (/\b(if|else|for|while|switch|catch|&&|\?|match)\b/.test(t)) funcComplexity++
        if (/try\s*\{/.test(t)) funcHasTryCatch = true
        if (/\b(for|while|do)\b/.test(t)) funcHasLoop = true
        if (/\bawait\b/.test(t)) funcHasAwait = true

        if (braceCount === 0 && line.includes('}') && funcStart !== lineNum) {
          functions.push({
            name: funcName, file, line: funcLine,
            length: lineNum - funcStart + 1,
            complexity: funcComplexity,
            depth: funcMaxDepth,
            params: funcParams,
            async: funcAsync,
            hasTryCatch: funcHasTryCatch,
            hasLoop: funcHasLoop,
            hasAwait: funcHasAwait,
          })
          funcStart = -1
          funcName = ''
        }
      }

      const nesting = (line.match(/\{/g) || []).length
      if (nesting > maxNesting) maxNesting = nesting
    })

    const classes = (content.match(/class\s+\w+/g) || []).length
    const imports = (content.match(/^(?:import|from|require)\s/gm) || []).length
    const exports = (content.match(/^export\s/gm) || []).length
    const avgComplexity = functions.length > 0 ? Math.round(functions.reduce((s, f) => s + f.complexity, 0) / functions.length) : 0
    const maxComplexity = functions.length > 0 ? Math.max(...functions.map(f => f.complexity)) : 0
    const totalComplexity = functions.reduce((s, f) => s + f.complexity, 0)
    const longestFunction = functions.length > 0 ? functions.reduce((a, b) => a.length > b.length ? a : b).name : ''
    const hasTests = basename(file).includes('.test.') || basename(file).includes('.spec.')

    return {
      file, lines: lines.length, codeLines, blankLines, commentLines,
      functions, classes, imports, exports,
      avgComplexity, maxComplexity, totalComplexity,
      longestFunction, deepestNesting: maxNesting, hasTests, testCoverage: 0,
    }
  } catch { return null }
}

function analyzeProject(dir: string): FileMetrics[] {
  const results: FileMetrics[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile()) {
          const m = analyzeFile(fp)
          if (m) results.push(m)
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return results
}

function generateIssues(files: FileMetrics[]): PerfIssue[] {
  const issues: PerfIssue[] = []
  files.forEach(f => {
    if (f.lines > 500) issues.push({ file: f.file, line: 1, type: 'bundle', severity: f.lines > 1000 ? 'high' : 'medium', title: 'File too large', description: `${f.file} has ${f.lines} lines`, impact: 'Harder to maintain, slower to review', suggestion: 'Split into smaller modules', effort: f.lines > 1000 ? 'hard' : 'medium', category: 'Size' })
    if (f.avgComplexity > 10) issues.push({ file: f.file, line: 1, type: 'algorithm', severity: f.avgComplexity > 20 ? 'high' : 'medium', title: 'High average complexity', description: `Average cyclomatic complexity: ${f.avgComplexity}`, impact: 'Harder to test and debug', suggestion: 'Refactor complex functions', effort: 'medium', category: 'Complexity' })
    f.functions.forEach(fn => {
      if (fn.length > 50) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: fn.length > 100 ? 'high' : 'medium', title: `Long function: ${fn.name}`, description: `Function has ${fn.length} lines`, impact: 'Difficult to understand and test', suggestion: 'Extract smaller functions', effort: 'medium', category: 'Size' })
      if (fn.complexity > 10) issues.push({ file: f.file, line: fn.line, type: 'algorithm', severity: fn.complexity > 20 ? 'critical' : 'high', title: `High complexity: ${fn.name}`, description: `Cyclomatic complexity: ${fn.complexity}`, impact: 'Hard to test, high bug risk', suggestion: 'Simplify logic, extract helper functions', effort: 'hard', category: 'Complexity' })
      if (fn.depth > 4) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: 'medium', title: `Deep nesting: ${fn.name}`, description: `Nesting depth: ${fn.depth}`, impact: 'Hard to read and debug', suggestion: 'Extract nested logic, use early returns', effort: 'medium', category: 'Readability' })
      if (fn.params > 5) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: 'medium', title: `Too many params: ${fn.name}`, description: `Function has ${fn.params} parameters`, impact: 'Hard to use and test', suggestion: 'Use object parameter or split function', effort: 'easy', category: 'API Design' })
      if (fn.async && !fn.hasAwait) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: 'low', title: `Async without await: ${fn.name}`, description: 'Function is async but uses no await', impact: 'Unnecessary Promise wrapping', suggestion: 'Remove async keyword', effort: 'trivial', category: 'Best Practice' })
    })
  })
  return issues
}

function calculateScore(files: FileMetrics[], issues: PerfIssue[]): { score: number; grade: string } {
  let score = 100
  issues.forEach(i => { if (i.severity === 'critical') score -= 15; else if (i.severity === 'high') score -= 8; else if (i.severity === 'medium') score -= 4; else if (i.severity === 'low') score -= 1 })
  score = Math.max(0, Math.min(100, score))
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  return { score, grade }
}

function formatTextReport(report: PerfReport): string {
  const lines = ['Performance Report', '═════════════════', '', `Score: ${report.score}/100 (${report.grade})`, '', 'Summary:', `  Files: ${report.summary.totalFiles}`, `  Lines: ${report.summary.totalLines}`, `  Functions: ${report.summary.totalFunctions}`, `  Avg Complexity: ${report.summary.avgComplexity}`, `  Max Complexity: ${report.summary.maxComplexity}`, `  Test Coverage: ${report.summary.testCoverage}%`, '', 'Issues (' + report.issues.length + '):', '──────────────']
  report.issues.filter(i => ['high', 'critical'].includes(i.severity)).slice(0, 15).forEach((i, idx) => {
    const icon = i.severity === 'critical' ? '🔴' : '🟠'
    lines.push(`${icon} ${idx + 1}. [${i.file}:${i.line}] ${i.title}`)
    lines.push(`   ${i.description}`)
    lines.push(`   → ${i.suggestion} (${i.effort})`)
  })
  if (report.recommendations.length > 0) { lines.push('', 'Recommendations:', '────────────────'); report.recommendations.forEach(r => lines.push(`  • ${r}`)) }
  return lines.join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Performance Profiler (Deep)', '', 'Usage:', '  /performance                    Full analysis', '  /performance file <path>        Single file', '  /performance functions          Function metrics', '  /performance hotspots           Hotspots', '  /performance complexity         Complexity analysis', '  /performance size               Size analysis', '  /performance async              Async patterns', '  /performance loops              Loop analysis', '  /performance baseline           Save baseline', '  /performance compare            Compare', '  /performance history            History', '  /performance export [fmt]       Export (md/json/html)', ''].join('\n') }

  if (cmd === 'file') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const m = analyzeFile(file)
    if (!m) return { type: 'text', value: 'Cannot analyze: ' + file }
    const lines = ['File: ' + file, 'Lines: ' + m.lines, 'Functions: ' + m.functions.length, 'Avg Complexity: ' + m.avgComplexity, 'Max Complexity: ' + m.maxComplexity, '', 'Functions:', '──────────']
    m.functions.forEach(f => {
      const warn = f.complexity > 10 ? ' [!]' : f.length > 50 ? ' [LONG]' : ''
      lines.push(`  ${f.name}() - line ${f.line}, ${f.length} lines, complexity ${f.complexity}, depth ${f.depth}${warn}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'functions') {
    const files = analyzeProject('.')
    const allFuncs = files.flatMap(f => f.functions.map(fn => ({ ...fn, file: f.file })))
    const sorted = allFuncs.sort((a, b) => b.complexity - a.complexity).slice(0, 20)
    const lines = ['Top 20 Functions by Complexity:', '═════════════════════════════════', '']
    sorted.forEach((f, i) => lines.push(`${i + 1}. ${f.name}() in ${f.file}:${f.line} (complexity: ${f.complexity}, ${f.length} lines, depth: ${f.depth})`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'hotspots' || cmd === 'complexity') {
    const files = analyzeProject('.')
    const hotspots = files.filter(f => f.avgComplexity > 10 || f.maxComplexity > 20).sort((a, b) => b.avgComplexity - a.avgComplexity).slice(0, 15)
    if (hotspots.length === 0) return { type: 'text', value: '[OK] No hotspots!' }
    const lines = ['Performance Hotspots:', '══════════════════════', '']
    hotspots.forEach(f => lines.push(`${f.file} (avg: ${f.avgComplexity}, max: ${f.maxComplexity}, ${f.functions.length} funcs)`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'size') {
    const files = analyzeProject('.')
    const sorted = files.sort((a, b) => b.lines - a.lines).slice(0, 20)
    const lines = ['Largest Files:', '═══════════════', '']
    sorted.forEach(f => lines.push(`${f.file}: ${f.lines} lines, ${f.functions.length} functions`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'async') {
    const files = analyzeProject('.')
    const asyncFuncs = files.flatMap(f => f.functions.filter(fn => fn.async).map(fn => ({ ...fn, file: f.file })))
    const noAwait = asyncFuncs.filter(f => !f.hasAwait)
    const lines = ['Async Analysis:', '════════════════', '', `Total async: ${asyncFuncs.length}`, `Without await: ${noAwait.length}`, '']
    if (noAwait.length > 0) { lines.push('Async without await:'); noAwait.slice(0, 10).forEach(f => lines.push(`  ${f.name}() in ${f.file}:${f.line}`)) }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'loops') {
    const files = analyzeProject('.')
    const loopFuncs = files.flatMap(f => f.functions.filter(fn => fn.hasLoop).map(fn => ({ ...fn, file: f.file })))
    const nested = loopFuncs.filter(f => f.hasLoop && f.depth > 3)
    return { type: 'text', value: `Loop Analysis:\nTotal with loops: ${loopFuncs.length}\nDeep nesting (>3): ${nested.length}\n\n${nested.slice(0, 10).map(f => `${f.name}() in ${f.file}:${f.line} (depth: ${f.depth})`).join('\n')}` }
  }

  if (cmd === 'baseline') {
    const files = analyzeProject('.')
    writeFileSync(BASELINE_FILE, JSON.stringify(files, null, 2), 'utf-8')
    return { type: 'text', value: '[OK] Baseline saved' }
  }

  if (cmd === 'compare') {
    const files = analyzeProject('.')
    try {
      const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
      const newFiles = files.filter(f => !baseline.some((b: FileMetrics) => b.file === f.file))
      const removed = baseline.filter((b: FileMetrics) => !files.some(f => f.file === b.file))
      return { type: 'text', value: `New files: ${newFiles.length}\nRemoved: ${removed.length}\nCurrent: ${files.length}` }
    } catch { return { type: 'text', value: 'No baseline. Run /performance baseline first.' } }
  }

  if (cmd === 'history') {
    try {
      const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
      return { type: 'text', value: 'History:\n' + history.slice(-10).map((h: any) => `${h.date.slice(0, 19)} | Score: ${h.score} | Issues: ${h.issues}`).join('\n') }
    } catch { return { type: 'text', value: 'No history' } }
  }

  if (cmd === 'export') {
    const files = analyzeProject('.')
    const issues = generateIssues(files)
    const { score, grade } = calculateScore(files, issues)
    const file = parts[1] || 'performance-report.md'
    const content = '# Performance Report\n\nScore: ' + score + '/100 (' + grade + ')\n\nIssues: ' + issues.length + '\n\n' + issues.map(i => '- [' + i.file + ':' + i.line + '] ' + i.title + ': ' + i.suggestion).join('\n')
    writeFileSync(file, content, 'utf-8')
    return { type: 'text', value: '[OK] Exported: ' + file }
  }

  // Default: full analysis
  const files = analyzeProject('.')
  const issues = generateIssues(files)
  const { score, grade } = calculateScore(files, issues)
  const totalFuncs = files.reduce((s, f) => s + f.functions.length, 0)
  const avgComp = files.length > 0 ? Math.round(files.reduce((s, f) => s + f.avgComplexity, 0) / files.length) : 0
  const maxComp = files.length > 0 ? Math.max(...files.map(f => f.maxComplexity)) : 0
  const summary = {
    totalFiles: files.length, totalLines: files.reduce((s, f) => s + f.lines, 0),
    totalFunctions: totalFuncs, totalClasses: files.reduce((s, f) => s + f.classes, 0),
    avgComplexity: avgComp, maxComplexity: maxComp,
    avgFunctionLength: totalFuncs > 0 ? Math.round(files.reduce((s, f) => s + f.functions.reduce((a, b) => a + b.length, 0), 0) / totalFuncs) : 0,
    longestFile: files.length > 0 ? files.reduce((a, b) => a.lines > b.lines ? a : b).file : '',
    mostComplexFile: files.length > 0 ? files.reduce((a, b) => a.avgComplexity > b.avgComplexity ? a : b).file : '',
    filesWithTests: files.filter(f => f.hasTests).length, testCoverage: 0,
  }
  const report: PerfReport = {
    files, summary, issues, score, grade,
    bottlenecks: issues.filter(i => ['high', 'critical'].includes(i.severity)).slice(0, 5).map(i => i.title),
    recommendations: ['Reduce cyclomatic complexity in top functions', 'Split files over 500 lines', 'Add error handling to async functions', 'Reduce nesting depth'],
  }
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8').catch(() => '[]')); history.push({ date: new Date().toISOString(), score, issues: issues.length }); writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2), 'utf-8') } catch { /* ignore */ }
  return { type: 'text', value: formatTextReport(report) }
}

const performance: Command = {
  type: 'local', name: 'performance',
  description: 'Performance profiler - file/functions/hotspots/complexity/size/async/baseline',
  aliases: ['/performance', '/perf'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default performance