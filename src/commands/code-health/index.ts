import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve, normalize } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.doge', 'code-health')
const HISTORY_FILE = join(CONFIG_DIR, 'health-history.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const MAX_FILE_SIZE = 10 * 1024 * 1024   // 10MB - skip binary files
const MAX_SCAN_FILES = 5000               // safety limit
const MAX_ISSUES_PER_FILE = 100
const EXEC_TIMEOUT = 30000
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov', '.pdf', '.zip', '.gz', '.tar', '.exe', '.dll', '.so', '.dylib'])

interface HealthMetrics {
  file: string; lines: number; codeLines: number; blankLines: number; commentLines: number
  commentRatio: number; functions: number; classes: number; complexity: number
  avgComplexity: number; maxComplexity: number; longFunctions: number
  deeplyNested: number; largeObjects: number; duplicateBlocks: number
  unusedImports: number; missingTests: boolean; documentationScore: number
}

interface HealthIssue {
  file: string; line: number
  category: 'complexity' | 'size' | 'documentation' | 'testing' | 'duplication' | 'dead-code' | 'style' | 'security'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  message: string; suggestion: string; rule: string; effort: 'trivial' | 'easy' | 'medium' | 'hard'
}

interface HealthConfig {
  thresholds: { maxLinesPerFile: number; maxLinesPerFunction: number; maxComplexity: number; maxNestingDepth: number; maxParameters: number; minCommentRatio: number; maxFileSize: number }
  weights: { complexity: number; size: number; documentation: number; testing: number; duplication: number; deadCode: number; style: number; security: number }
  rules: Record<string, boolean>; excludePatterns: string[]; languages: string[]; customRules: Array<{ name: string; pattern: string; category: string; severity: string }>
}

interface HealthHistory { date: string; score: number; grade: string; filesScanned: number; issuesFound: number; topIssues: string[] }

const DEFAULT_CONFIG: HealthConfig = {
  thresholds: { maxLinesPerFile: 500, maxLinesPerFunction: 50, maxComplexity: 10, maxNestingDepth: 4, maxParameters: 5, minCommentRatio: 10, maxFileSize: 1000 },
  weights: { complexity: 25, size: 15, documentation: 15, testing: 15, duplication: 10, deadCode: 10, style: 5, security: 5 },
  rules: { 'max-file-length': true, 'max-function-length': true, 'max-complexity': true, 'max-nesting-depth': true, 'max-parameters': true, 'min-comment-ratio': true, 'no-duplicate-code': true, 'no-dead-code': true, 'require-tests': true, 'no-unused-imports': true, 'no-console-log': true, 'no-any-type': true, 'no-magic-numbers': true, 'no-todo-fixme': false, 'require-jsdoc': false, 'no-eval': true, 'no-innerHTML': true, 'no-hardcoded-secrets': true, 'no-empty-catch': true, 'no-floating-promises': true, 'prefer-const': true, 'no-var': true },
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', '.nuxt/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/*.min.js', '**/vendor/**'],
  languages: ['typescript', 'javascript', 'python', 'go', 'java', 'rust'], customRules: [],
}

// ====== UTILITY HELPERS ======

function safePath(p: string): string { try { return normalize(p) } catch { return p } }

function safeReadFile(file: string): string | null {
  try {
    if (!existsSync(file)) return null
    const stat = statSync(file)
    if (!stat.isFile()) return null
    if (stat.size > MAX_FILE_SIZE) return null
    if (stat.size === 0) return null
    const ext = extname(file).toLowerCase()
    if (BINARY_EXTS.has(ext)) return null
    const content = readFileSync(file, 'utf-8')
    // Check for binary content
    if (content.includes('\u0000')) return null
    return content
  } catch (err: any) {
    if (err?.code === 'EACCES') return null
    if (err?.code === 'EMFILE') return null
    return null
  }
}

function safeWriteFile(file: string, content: string): boolean {
  try {
    const dir = dirname(file)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, content, 'utf-8')
    return true
  } catch { return false }
}

function safeExec(cmd: string, timeout = EXEC_TIMEOUT): { ok: boolean; output: string; code: number | null } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 })
    return { ok: true, output: output.trim(), code: 0 }
  } catch (err: any) {
    const code = err?.status ?? null
    const stderr = err?.stderr ? String(err.stderr).trim() : ''
    const stdout = err?.stdout ? String(err.stdout).trim() : ''
    const message = err?.message || '未知错误'
    // Truncate long output
    const output = (stderr || stdout || message).slice(0, 500)
    return { ok: false, output, code }
  }
}

function safeStat(file: string): { size: number; mtime: number; isDir: boolean; isFile: boolean } | null {
  try {
    if (!existsSync(file)) return null
    const s = statSync(file)
    return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory(), isFile: s.isFile() }
  } catch { return null }
}

function safeReaddir(dir: string): { name: string; isDir: boolean; isFile: boolean }[] {
  try {
    if (!existsSync(dir)) return []
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries.map(e => ({ name: e.name, isDir: e.isDirectory(), isFile: e.isFile() }))
  } catch { return [] }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200)
  return String(err).slice(0, 200)
}

function validateArgs(args: string[], min: number, usage: string): string | null {
  if (args.length < min) return `❌ 参数不足\n\n🔧 正确用法: ${usage}`
  return null
}

function loadConfig(): HealthConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...raw, thresholds: { ...DEFAULT_CONFIG.thresholds, ...raw.thresholds }, weights: { ...DEFAULT_CONFIG.weights, ...raw.weights }, rules: { ...DEFAULT_CONFIG.rules, ...raw.rules } }
    }
  } catch (err) {
    // Corrupted config - reset
    console.error('Config corrupted, resetting:', formatError(err))
  }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: HealthConfig) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save config:', formatError(err))
  }
}

function loadHistory(): HealthHistory[] {
  try {
    if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  } catch {
    // Corrupted history - reset
    try { writeFileSync(HISTORY_FILE, '[]', 'utf-8') } catch { /* ignore */ }
  }
  return []
}

function saveHistory(entry: HealthHistory) {
  try {
    const history = loadHistory()
    history.push(entry)
    if (history.length > 100) history.splice(0, history.length - 100)
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function analyzeFile(file: string, config: HealthConfig): { metrics: HealthMetrics; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []
  const metrics: HealthMetrics = {
    file, lines: 0, codeLines: 0, blankLines: 0, commentLines: 0, commentRatio: 0,
    functions: 0, classes: 0, complexity: 0, avgComplexity: 0, maxComplexity: 0,
    longFunctions: 0, deeplyNested: 0, largeObjects: 0, duplicateBlocks: 0,
    unusedImports: 0, missingTests: true, documentationScore: 0,
  }

  const content = safeReadFile(file)
  if (content === null) return { metrics, issues }

  const lines = content.split(/\r?\n/) // cross-platform line ending
  metrics.lines = lines.length

  let funcStart = -1, funcName = '', funcComplexity = 0, funcDepth = 0, funcMaxDepth = 0, braceCount = 0
  let totalComplexity = 0, maxComplexity = 0, longFunctions = 0, deeplyNested = 0
  const seenBlocks: Record<string, number> = {}
  let issueCount = 0

  try {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      const lineNum = i + 1

      if (issueCount >= MAX_ISSUES_PER_FILE) break

      if (!t) { metrics.blankLines++; continue }
      if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*')) { metrics.commentLines++; continue }
      metrics.codeLines++

      // Function detection
      const funcMatch = lines[i].match(/(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)\s*(?:\w+)/)
      if (funcMatch && funcStart === -1) {
        const nameMatch = lines[i].match(/(?:function|def|func|fn)\s+(\w+)|const\s+(\w+)\s*=/)
        funcName = nameMatch?.[1] || nameMatch?.[2] || 'anonymous'
        funcStart = lineNum; funcComplexity = 1; funcDepth = 0; funcMaxDepth = 0; braceCount = 0
      }

      if (funcStart >= 0) {
        braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length
        if (braceCount > funcMaxDepth) funcMaxDepth = braceCount
        if (/\b(if|else|for|while|switch|catch|&&|\?|match)\b/.test(t)) funcComplexity++
        if (braceCount > config.thresholds.maxNestingDepth && config.rules['max-nesting-depth']) {
          deeplyNested++
          issues.push({ file, line: lineNum, category: 'complexity', severity: 'medium', message: `深度嵌套（深度：${braceCount}）`, suggestion: '将嵌套逻辑提取为独立函数', rule: 'max-nesting-depth', effort: 'medium' })
          issueCount++
        }
        if (braceCount === 0 && lines[i].includes('}') && funcStart !== lineNum) {
          metrics.functions++
          totalComplexity += funcComplexity
          if (funcComplexity > maxComplexity) maxComplexity = funcComplexity
          if (funcComplexity > config.thresholds.maxComplexity && config.rules['max-complexity']) {
            issues.push({ file, line: funcStart, category: 'complexity', severity: funcComplexity > 20 ? 'critical' : 'high', message: `复杂度较高：${funcName}（${funcComplexity}）`, suggestion: '简化逻辑，提取辅助函数', rule: 'max-complexity', effort: 'hard' })
            issueCount++
          }
          if (lineNum - funcStart > config.thresholds.maxLinesPerFunction && config.rules['max-function-length']) {
            longFunctions++
            issues.push({ file, line: funcStart, category: 'size', severity: lineNum - funcStart > 100 ? 'high' : 'medium', message: `函数过长：${funcName}（${lineNum - funcStart} 行）`, suggestion: '拆分为职责单一的小函数', rule: 'max-function-length', effort: 'hard' })
            issueCount++
          }
          funcStart = -1
        }
      }

      // File length check (once)
      if (lineNum === 1 && lines.length > config.thresholds.maxLinesPerFile && config.rules['max-file-length']) {
        issues.push({ file, line: 1, category: 'size', severity: lines.length > 1000 ? 'high' : 'medium', message: `文件过长（${lines.length} 行）`, suggestion: '拆分为更小的模块', rule: 'max-file-length', effort: 'hard' })
        issueCount++
      }

      // Style checks with rule guards
      if (config.rules['no-console-log'] && /\bconsole\.(log|debug)\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: '生产代码中包含 console 语句', suggestion: '使用结构化日志工具或移除', rule: 'no-console-log', effort: 'trivial' })
        issueCount++
      }
      if (config.rules['no-any-type'] && /:\s*\bany\b(?!\s*[=,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'medium', message: '使用了 any 类型', suggestion: '定义具体接口或使用 unknown', rule: 'no-any-type', effort: 'medium' })
        issueCount++
      }
      if (config.rules['no-var'] && /\bvar\s+\w+/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: '使用了 var', suggestion: '使用 const 或 let', rule: 'no-var', effort: 'trivial' })
        issueCount++
      }
      if (config.rules['no-eval'] && /\beval\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, category: 'security', severity: 'critical', message: 'eval() 可执行任意代码', suggestion: '使用 JSON.parse() 或带验证的 Function', rule: 'no-eval', effort: 'hard' })
        issueCount++
      }
      if (config.rules['no-innerHTML'] && /\.innerHTML\s*=/.test(t)) {
        issues.push({ file, line: lineNum, category: 'security', severity: 'high', message: 'innerHTML 赋值（XSS 风险）', suggestion: '使用 textContent 或框架安全渲染', rule: 'no-innerHTML', effort: 'easy' })
        issueCount++
      }
      if (config.rules['no-empty-catch'] && /catch\s*\([^)]*\)\s*\{\s*\}/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'high', message: '空的 catch 块（静默失败）', suggestion: '记录错误或重新抛出', rule: 'no-empty-catch', effort: 'easy' })
        issueCount++
      }
      if (config.rules['no-magic-numbers'] && /\b(?!0\b)(?!1\b)(?!2\b)(?!10\b)(?!100\b)\d{2,}\b(?!\s*[;,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'low', message: 'Magic number', suggestion: 'Extract to named constant', rule: 'no-magic-numbers', effort: 'easy' })
        issueCount++
      }
      if (config.rules['no-hardcoded-secrets'] && /(?:password|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(t) && !t.includes('process.env') && !t.includes('example') && !t.includes('sample')) {
        issues.push({ file, line: lineNum, category: 'security', severity: 'critical', message: 'Hardcoded secret detected', suggestion: 'Move to environment variables (process.env)', rule: 'no-hardcoded-secrets', effort: 'easy' })
        issueCount++
      }
      if (t.length > 120) {
        issues.push({ file, line: lineNum, category: 'style', severity: 'info', message: `Line too long (${t.length} chars)`, suggestion: 'Break line or extract to variable', rule: 'max-line-length', effort: 'trivial' })
        issueCount++
      }

      // Duplicate block detection (simplified)
      const block = t.slice(0, 80)
      if (block.length > 20 && !block.includes('import') && !block.includes('//') && !block.includes('/*')) {
        seenBlocks[block] = (seenBlocks[block] || 0) + 1
      }
    }

    // Duplicate blocks
    for (const [block, count] of Object.entries(seenBlocks)) {
      if (count >= 3) {
        metrics.duplicateBlocks++
        if (config.rules['no-duplicate-code'] && issueCount < MAX_ISSUES_PER_FILE) {
          issues.push({ file, line: 1, category: 'duplication', severity: 'medium', message: `Duplicate code (${count}x): "${block.slice(0, 40)}..."`, suggestion: 'Extract to shared function/constant', rule: 'no-duplicate-code', effort: 'medium' })
          issueCount++
        }
      }
    }

    metrics.avgComplexity = metrics.functions > 0 ? Math.round(totalComplexity / metrics.functions) : 0
    metrics.maxComplexity = maxComplexity
    metrics.longFunctions = longFunctions
    metrics.deeplyNested = deeplyNested
    metrics.commentRatio = metrics.lines > 0 ? Math.round((metrics.commentLines / metrics.lines) * 100) : 0
    metrics.classes = (content.match(/\bclass\s+\w+/g) || []).length
    metrics.missingTests = !basename(file).includes('.test.') && !basename(file).includes('.spec.')

  } catch (err) {
    // Partial analysis better than none
    console.error('Error analyzing', file, ':', formatError(err))
  }

  return { metrics, issues }
}

function analyzeProject(dir: string, config: HealthConfig): { metrics: HealthMetrics[]; issues: HealthIssue[] } {
  const allMetrics: HealthMetrics[] = []
  const allIssues: HealthIssue[] = []
  let fileCount = 0

  const scan = (d: string) => {
    if (fileCount >= MAX_SCAN_FILES) return
    const entries = safeReaddir(d)
    for (const entry of entries) {
      if (fileCount >= MAX_SCAN_FILES) break
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
      const fp = join(d, entry.name)
      const relative = fp.replace(/\\/g, '/')
      if (config.excludePatterns.some(p => relative.includes(p.replace('**/', '')))) continue
      if (entry.isDir) scan(fp)
      else if (entry.isFile && /\.(ts|tsx|js|jsx|py|go|java|rs)$/.test(extname(entry.name))) {
        const result = analyzeFile(fp, config)
        allMetrics.push(result.metrics)
        allIssues.push(...result.issues)
        fileCount++
      }
    }
  }

  try { scan(dir) } catch (err) {
    console.error('Scan error:', formatError(err))
  }

  return { metrics: allMetrics, issues: allIssues }
}

function calculateHealthScore(metrics: HealthMetrics[], issues: HealthIssue[], config: HealthConfig): { score: number; grade: string; categoryScores: Record<string, number> } {
  const categoryScores: Record<string, number> = { complexity: 100, size: 100, documentation: 100, testing: 100, duplication: 100, deadCode: 100, style: 100, security: 100 }
  const severityPenalties: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 }
  for (const issue of issues) {
    const penalty = severityPenalties[issue.severity] || 1
    categoryScores[issue.category] = Math.max(0, (categoryScores[issue.category] || 100) - penalty)
  }
  let totalScore = 0, totalWeight = 0
  for (const [cat, weight] of Object.entries(config.weights)) {
    totalScore += (categoryScores[cat] || 0) * weight
    totalWeight += weight
  }
  const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 100
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  return { score, grade, categoryScores }
}

function formatTextReport(metrics: HealthMetrics[], issues: HealthIssue[], score: number, grade: string, categoryScores: Record<string, number>): string {
  const totalLines = metrics.reduce((s, m) => s + m.lines, 0)
  const totalFuncs = metrics.reduce((s, m) => s + m.functions, 0)
  const avgComp = metrics.length > 0 ? Math.round(metrics.reduce((s, m) => s + m.avgComplexity, 0) / metrics.length) : 0
  const maxComp = metrics.length > 0 ? Math.max(...metrics.map(m => m.maxComplexity)) : 0

  const bySev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const issue of issues) bySev[issue.severity] = (bySev[issue.severity] || 0) + 1

  const lines = [
    '📊 代码健康仪表板',
    '═════════════════════',
    '',
    `综合评分：${score}/100（${grade}）`,
    '',
    '分类评分：',
    `  🧠 复杂度：${categoryScores.complexity || 0}/100`,
    `  📏 文件大小：${categoryScores.size || 0}/100`,
    `  📖 文档：${categoryScores.documentation || 0}/100`,
    `  🧪 测试：${categoryScores.testing || 0}/100`,
    `  🔄 重复代码：${categoryScores.duplication || 0}/100`,
    `  💀 死代码：${categoryScores.deadCode || 0}/100`,
    `  🎨 风格：${categoryScores.style || 0}/100`,
    `  🔒 安全：${categoryScores.security || 0}/100`,
    '',
    '摘要：',
    `  文件数：${metrics.length}`,
    `  总行数：${totalLines}`,
    `  函数数：${totalFuncs}`,
    `  平均复杂度：${avgComp}`,
    `  最大复杂度：${maxComp}`,
    `  问题数：${issues.length}`,
    '',
    '问题严重程度：',
    `  🔴 严重：${bySev.critical}`,
    `  🟠 高：${bySev.high}`,
    `  🟡 中：${bySev.medium}`,
    `  🔵 低：${bySev.low}`,
    `  ℹ️  信息：${bySev.info}`,
    '',
    '主要问题：',
  ]
  const sorted = [...issues].sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    return (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5)
  })
  for (const issue of sorted.slice(0, 15)) {
    const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : issue.severity === 'medium' ? '🟡' : '🔵'
    lines.push(`  ${icon} [${issue.file}:${issue.line}] ${issue.message}`)
    lines.push(`     → ${issue.suggestion}`)
  }
  return lines.join('\n')
}

function formatMarkdownReport(metrics: HealthMetrics[], issues: HealthIssue[], score: number, grade: string, categoryScores: Record<string, number>): string {
  const lines = ['# 代码健康报告', '', `**评分：${score}/100（${grade}）**`, '', '## 分类评分', '', '| 分类 | 评分 |', '|----------|-------|']
  for (const [cat, val] of Object.entries(categoryScores)) lines.push(`| ${cat} | ${val}/100 |`)
  lines.push('', '## 问题列表', '')
  const grouped: Record<string, HealthIssue[]> = {}
  for (const issue of issues) {
    if (!grouped[issue.severity]) grouped[issue.severity] = []
    grouped[issue.severity].push(issue)
  }
  const sevLabels: Record<string, string> = { critical: '严重', high: '高', medium: '中', low: '低' }
  for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
    if (grouped[sev]?.length) {
      lines.push(`### ${sevLabels[sev]}（${grouped[sev].length}）`)
      for (const issue of grouped[sev].slice(0, 10)) {
        lines.push(`- [${issue.file}:${issue.line}] ${issue.message} → ${issue.suggestion}`)
      }
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

  try {
    if (cmd === 'help' || cmd === '') return { type: 'text', value: [
      '📊 代码健康检查（深度）', '', '📖 用法：',
      '  /code-health                    完整健康报告',
      '  /code-health file &lt;路径&gt;       单文件分析',
      '  /code-health complexity         复杂度分析',
      '  /code-health size               文件大小分析',
      '  /code-health documentation      文档分析',
      '  /code-health testing            测试分析',
      '  /code-health duplication        重复代码分析',
      '  /code-health style              代码风格分析',
      '  /code-health security           安全分析',
      '  /code-health trend              健康趋势',
      '  /code-health history            扫描历史',
      '  /code-health baseline           保存为基准',
      '  /code-health compare            与基准对比',
      '  /code-health config             查看/编辑配置',
      '  /code-health rules              列出所有规则',
      '  /code-health enable &lt;规则&gt;   启用规则',
      '  /code-health disable &lt;规则&gt;  禁用规则',
      '  /code-health export [格式]       导出报告（md/json/html）',
    ].join('\n') }

    if (cmd === 'rules') {
      const lines = ['📋 健康规则：', '═════════════', '']
      for (const [rule, enabled] of Object.entries(config.rules)) {
        lines.push(`  ${enabled ? '✅ 开启' : '❌ 关闭'} ${rule}`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'config') {
      const key = parts[1]; const value = parts.slice(2).join(' ')
      if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
      if (key in config.rules) {
        config.rules[key as keyof typeof config.rules] = value === 'true'
        saveConfig(config)
        return { type: 'text', value: `✅ [OK] ${key} = ${value}` }
      }
      return { type: 'text', value: `❌ 未知配置键：${key}。可用：${Object.keys(config.rules).join(', ')}` }
    }

    if (cmd === 'enable' || cmd === 'disable') {
      const rule = parts[1]
      if (!rule) return { type: 'text', value: '📖 用法：/code-health enable|disable &lt;规则&gt;\n可用：' + Object.keys(config.rules).join(', ') }
      if (!(rule in config.rules)) return { type: 'text', value: `❌ 未知规则：${rule}\n可用：${Object.keys(config.rules).join(', ')}` }
      config.rules[rule as keyof typeof config.rules] = cmd === 'enable'
      saveConfig(config)
      return { type: 'text', value: `✅ [OK] ${rule} ${cmd}d` }
    }

    if (cmd === 'history') {
      const history = loadHistory()
      if (history.length === 0) return { type: 'text', value: 'ℹ️ 暂无历史记录。请先运行 /code-health 创建。' }
      const lines = ['📅 健康历史：', '═════════════', '']
      for (const h of history.slice(-14)) {
        const bar = '█'.repeat(Math.round(h.score / 10)) + '░'.repeat(10 - Math.round(h.score / 10))
        lines.push(`  ${h.date.slice(0, 10)} [${bar}] ${h.score}/100（${h.grade}）- ${h.issuesFound} 个问题`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'trend') {
      const history = loadHistory()
      if (history.length < 2) return { type: 'text', value: '⚠️ 趋势分析至少需要 2 次扫描记录。请多次运行 /code-health。' }
      const lines = ['📈 健康趋势：', '═════════════', '']
      for (const h of history.slice(-14)) {
        const bar = '█'.repeat(Math.round(h.score / 10))
        lines.push(`  ${h.date.slice(0, 10)} ${bar} ${h.score}`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'baseline') {
      const { metrics, issues } = analyzeProject('.', config)
      if (!safeWriteFile(BASELINE_FILE, JSON.stringify({ metrics, issues }, null, 2))) {
        return { type: 'text', value: '❌ 无法写入基准文件。检查磁盘空间和权限。' }
      }
      return { type: 'text', value: `✅ 基准已保存（${issues.length} 个问题，${metrics.length} 个文件）` }
    }

    if (cmd === 'compare') {
      if (!existsSync(BASELINE_FILE)) return { type: 'text', value: '❌ 未找到基准。请先运行 /code-health baseline。' }
      const { issues } = analyzeProject('.', config)
      try {
        const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
        if (!baseline.issues) return { type: 'text', value: '❌ 基准文件已损坏。请重新运行 /code-health baseline。' }
        const baselineKeys = new Set(baseline.issues.map((i: HealthIssue) => `${i.file}:${i.line}:${i.message}`))
        const currentKeys = new Set(issues.map(i => `${i.file}:${i.line}:${i.message}`))
        const newIssues = issues.filter(i => !baselineKeys.has(`${i.file}:${i.line}:${i.message}`))
        const fixed = baseline.issues.filter((i: HealthIssue) => !currentKeys.has(`${i.file}:${i.line}:${i.message}`))
        return { type: 'text', value: `📊 基准对比：\n  新增问题：${newIssues.length}\n  已修复：${fixed.length}\n  当前总数：${issues.length}\n\n${newIssues.length > 0 ? '新增问题：\n' + newIssues.slice(0, 10).map(i => `  [${i.file}:${i.line}] ${i.message}`).join('\n') : '✅ 自基准后无新增问题！'}` }
      } catch {
        return { type: 'text', value: '❌ 基准文件已损坏。请重新运行 /code-health baseline。' }
      }
    }

    if (cmd === 'file') {
      const file = parts[1]
      if (!file) return { type: 'text', value: '📖 用法：/code-health file &lt;路径&gt;' }
      const resolvedPath = safePath(file)
      if (!existsSync(resolvedPath)) return { type: 'text', value: `❌ 文件未找到：${resolvedPath}` }
      const stat = safeStat(resolvedPath)
      if (!stat || !stat.isFile) return { type: 'text', value: `⚠️ 不是文件：${resolvedPath}` }
      const { metrics, issues } = analyzeFile(resolvedPath, config)
      return { type: 'text', value: [
        `📁 文件：${resolvedPath}`,
        `📏 行数：${metrics.lines}（代码：${metrics.codeLines}，注释：${metrics.commentLines}，空行：${metrics.blankLines}）`,
        `🔧 函数数：${metrics.functions}`,
        `🧠 复杂度：平均 ${metrics.avgComplexity} / 最大 ${metrics.maxComplexity}`,
        `📖 注释率：${metrics.commentRatio}%`,
        `⚠️ 问题数：${issues.length}`,
        '',
        ...issues.slice(0, 15).map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] 行 ${i.line}: ${i.message}`),
        issues.length > 15 ? `... 还有 ${issues.length - 15} 个` : '',
      ].filter(Boolean).join('\n') }
    }

    if (['complexity', 'size', 'documentation', 'testing', 'duplication', 'style', 'security'].includes(cmd)) {
      const { metrics, issues } = analyzeProject('.', config)
      const filtered = issues.filter(i => i.category === cmd)
      if (filtered.length === 0) return { type: 'text', value: `✅ 未发现${cmd}相关问题` }
      const labels: Record<string, string> = { complexity: '复杂度', size: '文件大小', documentation: '文档', testing: '测试', duplication: '重复代码', style: '代码风格', security: '安全' }
      return { type: 'text', value: [
        `📋 ${labels[cmd] || cmd}问题（${filtered.length}）：`,
        '═══════════════════════════════════',
        '',
        ...filtered.slice(0, 20).map((i, idx) => `${idx + 1}. [${i.file}:${i.line}] ${i.message}`),
        filtered.length > 20 ? `... 还有 ${filtered.length - 20} 个` : '',
      ].filter(Boolean).join('\n') }
    }

    if (cmd === 'export') {
      const fmt = parts[1] || 'md'
      if (!['md', 'json', 'markdown', 'html'].includes(fmt)) return { type: 'text', value: `❌ 不支持的格式：${fmt}。可用：md, json, html` }
      const { metrics, issues } = analyzeProject('.', config)
      const { score, grade, categoryScores } = calculateHealthScore(metrics, issues, config)
      const filename = `health-report.${fmt === 'markdown' || fmt === 'md' ? 'md' : fmt}`
      const content = fmt === 'json' ? JSON.stringify({ score, grade, categoryScores, metrics, issues }, null, 2) : formatMarkdownReport(metrics, issues, score, grade, categoryScores)
      if (!safeWriteFile(filename, content)) return { type: 'text', value: `❌ 无法写入文件：${filename}` }
      return { type: 'text', value: `✅ 已导出：${filename}` }
    }

    // Default: full report
    const startTime = Date.now()
    const { metrics, issues } = analyzeProject('.', config)
    const { score, grade, categoryScores } = calculateHealthScore(metrics, issues, config)
    const duration = Date.now() - startTime
    saveHistory({ date: new Date().toISOString(), score, grade, filesScanned: metrics.length, issuesFound: issues.length, topIssues: issues.slice(0, 5).map(i => i.message) })
    return { type: 'text', value: formatTextReport(metrics, issues, score, grade, categoryScores) + `\n\n⏱️ ${duration}ms` }

  } catch (err) {
    const errorMsg = formatError(err)
    return { type: 'text', value: `❌ [错误] 未预期的错误：${errorMsg}\n\n请报告此问题。` }
  }
}

const codeHealth: Command = {
  type: 'local', name: 'code-health',
  description: '代码健康检查 - 文件/复杂度/大小/文档/测试/重复/风格/安全/历史/基准',
  aliases: ['/code-health', '/ch', '/health'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default codeHealth