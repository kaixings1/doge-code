import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve, dirname, normalize } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.doge', 'performance')
const HISTORY_FILE = join(CONFIG_DIR, 'perf-history.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_SCAN_FILES = 3000
const EXEC_TIMEOUT = 30000
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.gz', '.exe', '.dll'])

interface FunctionMetrics {
  name: string; file: string; line: number; length: number; complexity: number
  depth: number; params: number; async: boolean; hasTryCatch: boolean; hasLoop: boolean; hasAwait: boolean
}

interface FileMetrics {
  file: string; lines: number; codeLines: number; blankLines: number; commentLines: number
  functions: FunctionMetrics[]; classes: number; imports: number; exports: number
  avgComplexity: number; maxComplexity: number; totalComplexity: number
  longestFunction: string; deepestNesting: number; hasTests: boolean; testCoverage: number
}

interface PerfIssue {
  file: string; line: number; type: 'cpu' | 'memory' | 'io' | 'network' | 'render' | 'bundle' | 'algorithm'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; title: string; description: string
  impact: string; suggestion: string; effort: 'trivial' | 'easy' | 'medium' | 'hard'; category: string
}

// ====== UTILITY HELPERS ======

function safeReadFile(file: string): string | null {
  try {
    if (!existsSync(file)) return null
    const s = statSync(file)
    if (!s.isFile() || s.size > MAX_FILE_SIZE || s.size === 0) return null
    const ext = extname(file).toLowerCase()
    if (BINARY_EXTS.has(ext)) return null
    const content = readFileSync(file, 'utf-8')
    if (content.includes('\u0000')) return null
    return content
  } catch { return null }
}

function safeWriteFile(file: string, content: string): boolean {
  try { const d = dirname(file); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(file, content, 'utf-8'); return true } catch { return false }
}

function safeReaddir(dir: string): { name: string; isDir: boolean; isFile: boolean }[] {
  try { if (!existsSync(dir)) return []; return readdirSync(dir, { withFileTypes: true }).map(e => ({ name: e.name, isDir: e.isDirectory(), isFile: e.isFile() })) } catch { return [] }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200)
  return String(err).slice(0, 200)
}

function analyzeFile(file: string): FileMetrics | null {
  const content = safeReadFile(file)
  if (!content) return null
  const ext = extname(file).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp'].includes(ext)) return null

  const lines = content.split(/\r?\n/)
  const functions: FunctionMetrics[] = []
  let funcStart = -1, funcName = '', funcLine = 0, funcComplexity = 0, funcDepth = 0, funcMaxDepth = 0, funcParams = 0
  let funcAsync = false, funcHasTryCatch = false, funcHasLoop = false, funcHasAwait = false, braceCount = 0
  let codeLines = 0, blankLines = 0, commentLines = 0, maxNesting = 0

  try {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      const lineNum = i + 1
      if (!t) { blankLines++; continue }
      if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*')) { commentLines++; continue }
      codeLines++

      const funcMatch = lines[i].match(/(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)\s*(?:\w+)/)
      if (funcMatch && funcStart === -1) {
        const nameMatch = lines[i].match(/(?:function|def|func|fn)\s+(\w+)|const\s+(\w+)\s*=/)
        funcName = nameMatch?.[1] || nameMatch?.[2] || 'anonymous'
        funcStart = lineNum; funcLine = lineNum; funcComplexity = 1; funcDepth = 0; funcMaxDepth = 0
        funcParams = (lines[i].match(/\(([^)]*)\)/)?.[1] || '').split(',').filter(p => p.trim()).length
        funcAsync = lines[i].includes('async'); funcHasTryCatch = false; funcHasLoop = false; funcHasAwait = false; braceCount = 0
      }

      if (funcStart >= 0) {
        braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length
        if (braceCount > funcMaxDepth) funcMaxDepth = braceCount
        if (/\b(if|else|for|while|switch|catch|&&|\?|match)\b/.test(t)) funcComplexity++
        if (/try\s*\{/.test(t)) funcHasTryCatch = true
        if (/\b(for|while|do)\b/.test(t)) funcHasLoop = true
        if (/\bawait\b/.test(t)) funcHasAwait = true
        if (braceCount === 0 && lines[i].includes('}') && funcStart !== lineNum) {
          functions.push({ name: funcName, file, line: funcLine, length: lineNum - funcStart + 1, complexity: funcComplexity, depth: funcMaxDepth, params: funcParams, async: funcAsync, hasTryCatch: funcHasTryCatch, hasLoop: funcHasLoop, hasAwait: funcHasAwait })
          funcStart = -1; funcName = ''
        }
      }
      const nesting = (lines[i].match(/\{/g) || []).length
      if (nesting > maxNesting) maxNesting = nesting
    }
  } catch { /* partial analysis */ }

  const classes = (content.match(/\bclass\s+\w+/g) || []).length
  const imports = (content.match(/^(?:import|from|require)\s/gm) || []).length
  const exports = (content.match(/^export\s/gm) || []).length
  const avgComplexity = functions.length > 0 ? Math.round(functions.reduce((s, f) => s + f.complexity, 0) / functions.length) : 0
  const maxComplexity = functions.length > 0 ? Math.max(...functions.map(f => f.complexity)) : 0
  const totalComplexity = functions.reduce((s, f) => s + f.complexity, 0)
  const longestFunction = functions.length > 0 ? functions.reduce((a, b) => a.length > b.length ? a : b).name : ''
  const hasTests = basename(file).includes('.test.') || basename(file).includes('.spec.')

  return { file, lines: lines.length, codeLines, blankLines, commentLines, functions, classes, imports, exports, avgComplexity, maxComplexity, totalComplexity, longestFunction, deepestNesting: maxNesting, hasTests, testCoverage: 0 }
}

function analyzeProject(dir: string): FileMetrics[] {
  const results: FileMetrics[] = []
  let count = 0
  const scan = (d: string) => {
    if (count >= MAX_SCAN_FILES) return
    for (const entry of safeReaddir(d)) {
      if (count >= MAX_SCAN_FILES) break
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
      const fp = join(d, entry.name)
      if (entry.isDir) scan(fp)
      else if (entry.isFile) {
        const m = analyzeFile(fp)
        if (m) { results.push(m); count++ }
      }
    }
  }
  try { scan(dir) } catch { /* partial */ }
  return results
}

function generateIssues(files: FileMetrics[]): PerfIssue[] {
  const issues: PerfIssue[] = []
  for (const f of files) {
    if (f.lines > 500) issues.push({ file: f.file, line: 1, type: 'bundle', severity: f.lines > 1000 ? 'high' : 'medium', title: 'File too large', description: `${f.lines} lines`, impact: 'Harder to maintain, slower to review', suggestion: 'Split into smaller modules (< 500 lines)', effort: f.lines > 1000 ? 'hard' : 'medium', category: 'Size' })
    if (f.avgComplexity > 10) issues.push({ file: f.file, line: 1, type: 'algorithm', severity: f.avgComplexity > 20 ? 'high' : 'medium', title: 'High avg complexity', description: `Avg: ${f.avgComplexity}`, impact: 'Harder to test and debug', suggestion: 'Refactor complex functions', effort: 'medium', category: 'Complexity' })
    for (const fn of f.functions) {
      if (fn.length > 50) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: fn.length > 100 ? 'high' : 'medium', title: `Long function: ${fn.name}`, description: `${fn.length} lines`, impact: 'Difficult to understand', suggestion: 'Extract smaller functions', effort: 'medium', category: 'Size' })
      if (fn.complexity > 10) issues.push({ file: f.file, line: fn.line, type: 'algorithm', severity: fn.complexity > 20 ? 'critical' : 'high', title: `High complexity: ${fn.name}`, description: `Complexity: ${fn.complexity}`, impact: 'Hard to test', suggestion: 'Simplify logic', effort: 'hard', category: 'Complexity' })
      if (fn.depth > 4) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: 'medium', title: `Deep nesting: ${fn.name}`, description: `Depth: ${fn.depth}`, impact: 'Hard to read', suggestion: 'Extract nested logic', effort: 'medium', category: 'Readability' })
      if (fn.params > 5) issues.push({ file: f.file, line: fn.line, type: 'cpu', severity: 'medium', title: `Too many params: ${fn.name}`, description: `${fn.params} params`, impact: 'Hard to use', suggestion: 'Use object parameter', effort: 'easy', category: 'API Design' })
    }
  }
  return issues
}

function calculateScore(files: FileMetrics[], issues: PerfIssue[]): { score: number; grade: string } {
  let score = 100
  for (const issue of issues) { if (issue.severity === 'critical') score -= 15; else if (issue.severity === 'high') score -= 8; else if (issue.severity === 'medium') score -= 4; else if (issue.severity === 'low') score -= 1 }
  score = Math.max(0, Math.min(100, score))
  return { score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F' }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  try {
    if (cmd === 'help' || cmd === '') return { type: 'text', value: [
      'Performance Profiler', '', '📖 📖 Usage: ',
      '  /performance                    Full analysis',
      '  /performance file <path>        Analyze single file',
      '  /performance functions          List top 20 functions by complexity',
      '  /performance hotspots           Performance hotspots',
      '  /performance complexity         Complexity analysis',
      '  /performance size               Size analysis by file',
      '  /performance async              Async pattern analysis',
      '  /performance loops              Loop analysis',
      '  /performance baseline           Save current as baseline',
      '  /performance compare            Compare with baseline',
      '  /performance history            Scan history',
      '  /performance export [file]      Export report (md/json)',
    ].join('\n') }

    if (cmd === 'file') {
      const file = parts[1]
      if (!file) return { type: 'text', value: 'Usage: /performance file <path>' }
      if (!existsSync(file)) return { type: 'text', value: `File not found: ${file}` }
      const m = analyzeFile(file)
      if (!m) return { type: 'text', value: `Cannot analyze: ${file} (unsupported format or binary file)` }
      const lines = [`File: ${file}`, `Lines: ${m.lines}`, `Functions: ${m.functions.length}`, `Avg Complexity: ${m.avgComplexity}`, `Max Complexity: ${m.maxComplexity}`, '', 'Functions:']
      for (const f of m.functions) {
        const warn = f.complexity > 10 ? ' [!]' : f.length > 50 ? ' [LONG]' : ''
        lines.push(`  ${f.name}() - line ${f.line}, ${f.length} lines, complexity ${f.complexity}, depth ${f.depth}${warn}`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'functions') {
      const files = analyzeProject('.')
      const allFuncs = files.flatMap(f => f.functions.map(fn => ({ ...fn, file: f.file })))
      const sorted = allFuncs.sort((a, b) => b.complexity - a.complexity).slice(0, 20)
      if (sorted.length === 0) return { type: 'text', value: 'No functions found' }
      return { type: 'text', value: 'Top 20 Functions by Complexity:\n' + sorted.map((f, i) => `${i + 1}. ${f.name}() in ${f.file}:${f.line} (complexity: ${f.complexity}, ${f.length} lines, depth: ${f.depth})`).join('\n') }
    }

    if (cmd === 'hotspots') {
      const files = analyzeProject('.')
      const hotspots = files.filter(f => f.avgComplexity > 10 || f.maxComplexity > 20).sort((a, b) => b.avgComplexity - a.avgComplexity).slice(0, 15)
      if (hotspots.length === 0) return { type: 'text', value: '[OK] No hotspots!' }
      return { type: 'text', value: 'Performance Hotspots:\n' + hotspots.map(f => `  ${f.file} (avg: ${f.avgComplexity}, max: ${f.maxComplexity}, ${f.functions.length} funcs)`).join('\n') }
    }

    if (cmd === 'size') {
      const files = analyzeProject('.').sort((a, b) => b.lines - a.lines).slice(0, 20)
      if (files.length === 0) return { type: 'text', value: 'No files analyzed' }
      return { type: 'text', value: 'Largest Files:\n' + files.map(f => `  ${f.file}: ${f.lines} lines, ${f.functions.length} functions`).join('\n') }
    }

    if (cmd === 'async') {
      const files = analyzeProject('.')
      const asyncFuncs = files.flatMap(f => f.functions.filter(fn => fn.async).map(fn => ({ ...fn, file: f.file })))
      const noAwait = asyncFuncs.filter(f => !f.hasAwait)
      return { type: 'text', value: [`Async Analysis:`, `Total async: ${asyncFuncs.length}`, `Without await: ${noAwait.length}`, '', ...(noAwait.length > 0 ? ['Async without await:', ...noAwait.slice(0, 10).map(f => `  ${f.name}() in ${f.file}:${f.line}`)] : ['All async functions properly use await']), ...(asyncFuncs.length > 0 ? ['', 'By file:', ...groupBy(asyncFuncs, 'file').map(([file, funcs]) => `  ${file}: ${funcs.length} async functions`)] : [])].join('\n') }
    }

    if (cmd === 'loops') {
      const files = analyzeProject('.')
      const loopFuncs = files.flatMap(f => f.functions.filter(fn => fn.hasLoop).map(fn => ({ ...fn, file: f.file })))
      const nested = loopFuncs.filter(f => f.depth > 3)
      return { type: 'text', value: `Loop Analysis:\nTotal with loops: ${loopFuncs.length}\nDeep nesting (>3): ${nested.length}\n\n${nested.slice(0, 10).map(f => `${f.name}() in ${f.file}:${f.line} (depth: ${f.depth})`).join('\n') || 'No deeply nested loops'}` }
    }

    if (cmd === 'baseline') {
      const files = analyzeProject('.')
      if (!safeWriteFile(BASELINE_FILE, JSON.stringify(files, null, 2))) return { type: 'text', value: '[ERROR] Cannot write baseline' }
      return { type: 'text', value: `[OK] Baseline saved (${files.length} files)` }
    }

    if (cmd === 'compare') {
      if (!existsSync(BASELINE_FILE)) return { type: 'text', value: 'No baseline. Run /performance baseline first.' }
      try {
        const files = analyzeProject('.')
        const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
        const newFiles = files.filter(f => !baseline.some((b: FileMetrics) => b.file === f.file))
        const removed = baseline.filter((b: FileMetrics) => !files.some(f => f.file === b.file))
        return { type: 'text', value: `New files: ${newFiles.length}\nRemoved: ${removed.length}\nCurrent: ${files.length}` }
      } catch { return { type: 'text', value: '[ERROR] Corrupted baseline' } }
    }

    if (cmd === 'history') {
      try {
        if (!existsSync(HISTORY_FILE)) return { type: 'text', value: 'No history' }
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
      if (!safeWriteFile(file, content)) return { type: 'text', value: `[ERROR] Cannot write ${file}` }
      return { type: 'text', value: `[OK] Exported: ${file}` }
    }

    const files = analyzeProject('.')
    const issues = generateIssues(files)
    const { score, grade } = calculateScore(files, issues)
    const totalFuncs = files.reduce((s, f) => s + f.functions.length, 0)
    const avgComp = files.length > 0 ? Math.round(files.reduce((s, f) => s + f.avgComplexity, 0) / files.length) : 0
    const maxComp = files.length > 0 ? Math.max(...files.map(f => f.maxComplexity)) : 0

    const report = [
      'Performance Report', '═════════════════', '',
      `Score: ${score}/100 (${grade})`, '',
      'Summary:', `  Files: ${files.length}`, `  Lines: ${files.reduce((s, f) => s + f.lines, 0)}`, `  Functions: ${totalFuncs}`,
      `  Avg Complexity: ${avgComp}`, `  Max Complexity: ${maxComp}`, `  Issues: ${issues.length}`, '',
      'Issues:',
    ]
    for (const issue of issues.filter(i => ['high', 'critical'].includes(i.severity)).slice(0, 15)) {
      const icon = issue.severity === 'critical' ? '🔴' : '🟠'
      report.push(`${icon} [${issue.file}:${issue.line}] ${issue.title}`)
      report.push(`   → ${issue.suggestion}`)
    }
    return { type: 'text', value: report.join('\n') }

  } catch (err) {
    return { type: 'text', value: `[ERROR] Unexpected error: ${formatError(err)}` }
  }
}

function groupBy<T>(items: T[], key: keyof T): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = String(item[key])
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries())
}

const performance: Command = {
  type: 'local', name: 'performance',
  description: 'Performance profiler - file/functions/hotspots/complexity/size/async/baseline',
  aliases: ['/performance', '/perf'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default performance