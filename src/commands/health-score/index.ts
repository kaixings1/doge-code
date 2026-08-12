import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFile, readdir, stat, access } from 'fs/promises'
import { join, resolve, extname, sep } from 'path'

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

// ============================================================================
// Types
// ============================================================================

interface HealthIssue {
  file: string
  line: number
  category: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  code: string
  suggestion?: string
}

interface HealthScore {
  overall: number
  grade: string
  security: { score: number; issues: number }
  complexity: { score: number; issues: number }
  maintainability: { score: number; issues: number }
  errorHandling: { score: number; issues: number }
  dependencies: { score: number; issues: number }
}

interface ScanOptions {
  scanPath?: string
  filePath?: string
  rule?: string
  format: 'text' | 'json'
  detailed?: boolean
}

// ============================================================================
// Scoring Constants
// ============================================================================

const MAX_SCORE = 100
const PENALTY_CRITICAL = 12
const PENALTY_MAJOR = 6
const PENALTY_MINOR = 2
const PENALTY_INFO = 0.5
const ISSUE_LIMIT_PER_FILE = 20

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function computeCategoryScore(
  base: number,
  issues: { severity: string }[],
): number {
  let penalty = 0
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        penalty += PENALTY_CRITICAL
        break
      case 'major':
        penalty += PENALTY_MAJOR
        break
      case 'minor':
        penalty += PENALTY_MINOR
        break
      case 'info':
        penalty += PENALTY_INFO
        break
    }
  }
  return Math.max(0, Math.min(MAX_SCORE, base - penalty))
}

// ============================================================================
// Security Rules (from original security-audit)
// ============================================================================

interface SecurityRule {
  pattern: RegExp
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  suggestion: string
  category: 'security'
}

const SECURITY_RULES: Record<string, SecurityRule> = {
  'sql-injection': {
    pattern: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION).*\+.*\$|\$\{.*\}.*SELECT|query\s*\+\s*req\.|\.query\(.*\)/i,
    severity: 'critical',
    message: '可能的 SQL 注入漏洞',
    suggestion: '使用参数化查询或 ORM',
    category: 'security',
  },
  'xss': {
    pattern: /innerHTML\s*=|document\.write|eval\s*\(|dangerouslySetInnerHTML/i,
    severity: 'critical',
    message: '可能的 XSS 漏洞',
    suggestion: '使用 textContent 或框架的自动转义',
    category: 'security',
  },
  'cmd-injection': {
    pattern: /exec\s*\(|execFile\s*\(|spawn\s*\(|shell\s*=\s*true|child_process/i,
    severity: 'critical',
    message: '可能的命令注入风险',
    suggestion: '避免 shell=true，使用参数数组',
    category: 'security',
  },
  'hardcode-secrets': {
    pattern: /(api[_-]?key|secret|password|token|apikey|private_key)\s*[:=]\s*["'][^"']+["']|['"][a-zA-Z0-9]{32,}["']/i,
    severity: 'critical',
    message: '检测到硬编码密钥',
    suggestion: '使用环境变量或密钥管理服务',
    category: 'security',
  },
  'dangerous-api': {
    pattern: /localStorage\.setItem.*password|sessionStorage|\.eval\s*\(|new Function\s*\(/i,
    severity: 'major',
    message: '使用危险 API',
    suggestion: '评估是否必须使用，考虑替代方案',
    category: 'security',
  },
  'insecure-random': {
    pattern: /Math\.random\s*\(\)|random\(\)|rand\(\)/i,
    severity: 'minor',
    message: '使用不安全的随机数生成',
    suggestion: '使用 crypto.randomBytes 或 crypto.getRandomValues',
    category: 'security',
  },
}

// ============================================================================
// Complexity Rules
// ============================================================================

interface ComplexityRule {
  pattern: RegExp
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  suggestion: string
  category: 'complexity'
}

const COMPLEXITY_RULES: Record<string, ComplexityRule> = {
  'deep-nesting': {
    pattern: /^(?: {4}){6,}/m,
    severity: 'major',
    message: '深度嵌套（>5 层缩进）',
    suggestion: '提取嵌套逻辑为独立函数，使用提前返回',
    category: 'complexity',
  },
  'magic-number': {
    pattern: /\b(?!0\b)(?!1\b)(?!2\b)(?!10\b)(?!100\b)(?!1000\b)\d{2,}\b/,
    severity: 'minor',
    message: '魔法数字',
    suggestion: '提取为具名常量',
    category: 'complexity',
  },
}

// ============================================================================
// Maintainability Rules
// ============================================================================

interface MaintainabilityRule {
  pattern: RegExp
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  suggestion: string
  category: 'maintainability'
}

const MAINTAINABILITY_RULES: Record<string, MaintainabilityRule> = {
  'todo-comment': {
    pattern: /\/\/\s*TODO|\/\*\s*TODO/,
    severity: 'minor',
    message: '未完成的 TODO 注释',
    suggestion: '完成 TODO 或创建对应的 issue 跟踪',
    category: 'maintainability',
  },
  'console-log': {
    pattern: /console\.(log|debug|info|warn|error)\s*\(/,
    severity: 'minor',
    message: '生产代码中的 console 语句',
    suggestion: '使用结构化日志库或移除调试语句',
    category: 'maintainability',
  },
  'debugger': {
    pattern: /debugger\s*;?/,
    severity: 'major',
    message: '遗留的 debugger 语句',
    suggestion: '移除 debugger 语句',
    category: 'maintainability',
  },
  'empty-catch': {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: 'major',
    message: '空的 catch 块（静默失败）',
    suggestion: '至少记录错误或重新抛出',
    category: 'maintainability',
  },
  'duplicate-string': {
    pattern: /(["\'])(?!\1)(.+?)\1[\s\S]{0,200}\1\2\1/,
    severity: 'info',
    message: '可能的重复字符串字面量',
    suggestion: '提取为共享常量',
    category: 'maintainability',
  },
  'long-line': {
    pattern: /^.{120,}$/m,
    severity: 'minor',
    message: '超长行（>120 字符）',
    suggestion: '拆分长行以提高可读性',
    category: 'maintainability',
  },
}

// ============================================================================
// Error Handling Rules
// ============================================================================

interface ErrorHandlingRule {
  pattern: RegExp
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  suggestion: string
  category: 'error-handling'
}

const ERROR_HANDLING_RULES: Record<string, ErrorHandlingRule> = {
  'missing-async-await': {
    pattern: /(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>)[\s\S]{0,50}(?:Promise|\.then\()/m,
    severity: 'major',
    message: '混合使用 async/await 和 Promise',
    suggestion: '统一使用 async/await 或 Promise 链',
    category: 'error-handling',
  },
  'missing-type-check': {
    pattern: /\bany\b/,
    severity: 'minor',
    message: '使用 any 类型（TypeScript）',
    suggestion: '使用具体类型或 unknown',
    category: 'error-handling',
  },
}

// ============================================================================
// Dependency Health Rules
// ============================================================================

interface DependencyRule {
  pattern: RegExp
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  suggestion: string
  category: 'dependencies'
}

const DEPENDENCY_RULES: Record<string, DependencyRule> = {
  'deprecated-api': {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)|require\s*\(\s*['"]events['"]\s*\)|require\s*\(\s*['"]util['"]\s*\)|require\s*\(\s*['"]fs['"]\s*\)/,
    severity: 'info',
    message: '检测到 Node.js 内置模块（检查是否为必要依赖）',
    suggestion: '确认是否为预期依赖，考虑使用现代替代方案',
    category: 'dependencies',
  },
}

// ============================================================================
// Issue Collector
// ============================================================================

interface CategoryIssues {
  security: HealthIssue[]
  complexity: HealthIssue[]
  maintainability: HealthIssue[]
  errorHandling: HealthIssue[]
  dependencies: HealthIssue[]
}

/**
 * Detect long functions by counting lines between function definition and closing brace.
 */
function detectLongFunctions(filePath: string, content: string): HealthIssue[] {
  const issues: HealthIssue[] = []
  const lines = content.split('\n')
  const MAX_FUNCTION_LINES = 50

  // Match function definitions: function name(...), const name = (...) =>, export function, etc.
  const funcStartRegex = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)/

  for (let i = 0; i < lines.length; i++) {
    if (!funcStartRegex.test(lines[i])) continue

    // Found a function start - now find its closing brace
    let braceCount = 0
    let foundOpenBrace = false
    const funcStart = i

    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { braceCount++; foundOpenBrace = true }
        else if (ch === '}') { braceCount-- }
      }
      if (foundOpenBrace && braceCount === 0) {
        const funcLength = j - funcStart + 1
        if (funcLength > MAX_FUNCTION_LINES) {
          issues.push({
            file: filePath,
            line: funcStart + 1,
            category: 'complexity',
            severity: funcLength > 100 ? 'major' : 'minor',
            message: `函数过长 (${funcLength} 行, 建议 <= ${MAX_FUNCTION_LINES} 行)`,
            code: lines[funcStart].trim().substring(0, 100),
            suggestion: '将函数拆分为更小的单一职责函数',
          })
        }
        break
      }
      // Safety: if we go 200 lines without closing, skip
      if (j - funcStart > 200) break
    }
  }

  return issues
}

function collectIssuesFromFile(
  filePath: string,
  content: string,
  categories: string[],
): CategoryIssues {
  const lines = content.split('\n')
  const issues: CategoryIssues = {
    security: [],
    complexity: [],
    maintainability: [],
    errorHandling: [],
    dependencies: [],
  }

  const ruleSets: Record<string, Record<string, { pattern: RegExp; severity: string; message: string; suggestion: string; category: string }>> = {
    security: SECURITY_RULES,
    complexity: COMPLEXITY_RULES,
    maintainability: MAINTAINABILITY_RULES,
    'error-handling': ERROR_HANDLING_RULES,
    dependencies: DEPENDENCY_RULES,
  }

  for (const category of categories) {
    const rules = ruleSets[category]
    if (!rules) continue

    for (const [ruleName, rule] of Object.entries(rules)) {
      let count = 0
      lines.forEach((line, index) => {
        if (count >= ISSUE_LIMIT_PER_FILE) return
        if (rule.pattern.test(line)) {
          issues[category as keyof CategoryIssues].push({
            file: filePath,
            line: index + 1,
            category,
            severity: rule.severity as HealthIssue['severity'],
            message: rule.message,
            code: line.trim().substring(0, 100),
            suggestion: rule.suggestion,
          })
          count++
        }
      })
    }
  }

  // Add function-based long function detection
  if (categories.includes('complexity')) {
    issues.complexity.push(...detectLongFunctions(filePath, content))
  }

  return issues
}

// ============================================================================
// Scanner
// ============================================================================

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.php']
const DEFAULT_CATEGORIES = [
  'security',
  'complexity',
  'maintainability',
  'error-handling',
  'dependencies',
]

async function scanFile(filePath: string, categories: string[] = []): Promise<CategoryIssues> {
  const absPath = resolve(filePath)
  if (!(await exists(absPath))) {
    return {
      security: [],
      complexity: [],
      maintainability: [],
      errorHandling: [],
      dependencies: [],
    }
  }

  try {
    const content = await readFile(absPath, 'utf-8')
    const cats = categories.length > 0 ? categories : DEFAULT_CATEGORIES
    return collectIssuesFromFile(filePath, content, cats)
  } catch {
    return {
      security: [],
      complexity: [],
      maintainability: [],
      errorHandling: [],
      dependencies: [],
    }
  }
}

interface ScanResult {
  issues: CategoryIssues
  filesScanned: number
}

async function scanDirectory(dir: string, categories: string[] = []): Promise<ScanResult> {
  const absDir = resolve(dir)
  const result: CategoryIssues = {
    security: [],
    complexity: [],
    maintainability: [],
    errorHandling: [],
    dependencies: [],
  }

  if (!(await exists(absDir))) {
    return { issues: result, filesScanned: 0 }
  }

  const cats = categories.length > 0 ? categories : DEFAULT_CATEGORIES
  let filesScanned = 0

  const walk = async (currentDir: string) => {
    let entries: string[]
    try {
      entries = await readdir(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') {
        continue
      }

      const fullPath = join(currentDir, entry)
      let fileStat: { isDirectory(): boolean; isFile(): boolean }
      try {
        fileStat = await stat(fullPath)
      } catch {
        continue
      }

      if (fileStat.isDirectory()) {
        await walk(fullPath)
      } else if (fileStat.isFile() && CODE_EXTENSIONS.includes(extname(entry))) {
        filesScanned++
        const relativePath = fullPath.replace(absDir + sep, '')
        const fileIssues = await scanFile(relativePath, cats)
        for (const cat of cats) {
          const key = cat as keyof CategoryIssues
          if (fileIssues[key]) {
            result[key].push(...fileIssues[key])
          }
        }
      }
    }
  }

  await walk(absDir)
  return { issues: result, filesScanned }
}

// ============================================================================
// Scoring
// ============================================================================

function computeHealthScore(issues: CategoryIssues): HealthScore {
  const securityIssues = issues.security
  const complexityIssues = issues.complexity
  const maintainabilityIssues = issues.maintainability
  const errorHandlingIssues = issues.errorHandling
  const dependencyIssues = issues.dependencies

  const securityScore = computeCategoryScore(100, securityIssues)
  const complexityScore = computeCategoryScore(100, complexityIssues)
  const maintainabilityScore = computeCategoryScore(100, maintainabilityIssues)
  const errorHandlingScore = computeCategoryScore(100, errorHandlingIssues)
  const dependencyScore = computeCategoryScore(100, dependencyIssues)

  const overall = Math.round(
    (securityScore + complexityScore + maintainabilityScore + errorHandlingScore + dependencyScore) / 5
  )

  return {
    overall,
    grade: gradeFromScore(overall),
    security: { score: securityScore, issues: securityIssues.length },
    complexity: { score: complexityScore, issues: complexityIssues.length },
    maintainability: { score: maintainabilityScore, issues: maintainabilityIssues.length },
    errorHandling: { score: errorHandlingScore, issues: errorHandlingIssues.length },
    dependencies: { score: dependencyScore, issues: dependencyIssues.length },
  }
}

// ============================================================================
// Formatters
// ============================================================================

function formatIssue(issue: HealthIssue, index: number, showSuggestion: boolean): string {
  const severityIcon = {
    critical: '🔴',
    major: '🟡',
    minor: '🔵',
    info: 'ℹ️',
  }[issue.severity] || '•'

  let text = `  ${severityIcon} [${index + 1}] ${issue.file}:${issue.line} - ${issue.message}`
  if (issue.code) {
    text += `\n      代码: ${issue.code.substring(0, 80)}`
  }
  if (showSuggestion && issue.suggestion) {
    text += `\n      建议: ${issue.suggestion}`
  }
  return text
}

function formatScoreBar(score: number): string {
  const filled = Math.round(score / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

function formatTextReport(
  issues: CategoryIssues,
  score: HealthScore,
  detailed: boolean,
  filesScanned: number,
): string {
  const lines: string[] = []

  // Header
  lines.push('🏥 代码健康度评分报告')
  lines.push('═'.repeat(60))
  lines.push('')

  // Overall Score
  lines.push(`  总分: ${score.overall}/100 (${formatScoreBar(score.overall)}) 等级: ${score.grade}`)
  lines.push('')

  // Category Scores
  lines.push('📊 各维度评分:')
  lines.push(`  安全性:     ${formatScoreBar(score.security.score)} ${score.security.score} (${score.security.issues} 个问题)`)
  lines.push(`  复杂度:     ${formatScoreBar(score.complexity.score)} ${score.complexity.score} (${score.complexity.issues} 个问题)`)
  lines.push(`  可维护性:   ${formatScoreBar(score.maintainability.score)} ${score.maintainability.score} (${score.maintainability.issues} 个问题)`)
  lines.push(`  错误处理:   ${formatScoreBar(score.errorHandling.score)} ${score.errorHandling.score} (${score.errorHandling.issues} 个问题)`)
  lines.push(`  依赖健康:   ${formatScoreBar(score.dependencies.score)} ${score.dependencies.score} (${score.dependencies.issues} 个问题)`)
  lines.push('')

  // Summary
  const totalIssues =
    issues.security.length +
    issues.complexity.length +
    issues.maintainability.length +
    issues.errorHandling.length +
    issues.dependencies.length

  lines.push(`📁 扫描文件数: ${filesScanned}`)
  lines.push(`📋 总问题数: ${totalIssues}`)
  lines.push('')

  if (totalIssues === 0) {
    lines.push('✅ 未发现问题，代码质量良好！')
    return lines.join('\n')
  }

  // Detailed Issues
  if (detailed) {
    const categories = [
      { name: '🔴 安全问题', items: issues.security },
      { name: '🟡 复杂度问题', items: issues.complexity },
      { name: '🔵 可维护性问题', items: issues.maintainability },
      { name: '🟠 错误处理问题', items: issues.errorHandling },
      { name: '🟢 依赖问题', items: issues.dependencies },
    ]

    for (const cat of categories) {
      if (cat.items.length > 0) {
        lines.push(`${cat.name} (${cat.items.length} 个):`)
        cat.items.slice(0, ISSUE_LIMIT_PER_FILE).forEach((issue, i) => {
          lines.push(formatIssue(issue, i, true))
        })
        if (cat.items.length > ISSUE_LIMIT_PER_FILE) {
          lines.push(`  ... 还有 ${cat.items.length - ISSUE_LIMIT_PER_FILE} 个问题`)
        }
        lines.push('')
      }
    }
  }

  // Recommendations
  lines.push('💡 改进建议:')
  if (score.security.score < 80) {
    lines.push('  • 优先修复安全漏洞，特别是 SQL 注入和 XSS')
  }
  if (score.complexity.score < 80) {
    lines.push('  • 降低代码复杂度，拆分超长函数和深度嵌套')
  }
  if (score.maintainability.score < 80) {
    lines.push('  • 移除调试语句和 TODO，改善代码可维护性')
  }
  if (score.errorHandling.score < 80) {
    lines.push('  • 完善错误处理，避免空 catch 块')
  }
  lines.push('')

  return lines.join('\n')
}

function formatJsonReport(
  issues: CategoryIssues,
  score: HealthScore,
  filesScanned: number,
): string {
  const totalIssues =
    issues.security.length +
    issues.complexity.length +
    issues.maintainability.length +
    issues.errorHandling.length +
    issues.dependencies.length

  return JSON.stringify(
    {
      score,
      filesScanned,
      totalIssues,
      issues: {
        security: issues.security,
        complexity: issues.complexity,
        maintainability: issues.maintainability,
        errorHandling: issues.errorHandling,
        dependencies: issues.dependencies,
      },
    },
    null,
    2,
  )
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🏥 代码健康度评分',
    '',
    '对代码库进行全面健康度评估，涵盖安全性、复杂度、可维护性、错误处理和依赖健康 5 个维度。',
    '',
    '📖 用法: ',
    '  /health-score [选项]',
    '',
    '选项:',
    '  --scan <路径>       扫描指定目录（默认: 当前目录）',
    '  --file <路径>       扫描单个文件',
    '  --detailed          显示详细问题列表（默认只显示摘要）',
    '  --format <格式>     输出格式: text (默认) / json',
    '📖 用法:   --help              显示帮助',
    '',
    '💡 示例: ',
    '  /health-score',
    '  /health-score --scan ./src --detailed',
    '  /health-score --file app.ts --format json',
    '',
    '评分维度:',
    '  • 安全性: SQL 注入、XSS、命令注入、硬编码密钥等',
    '  • 复杂度: 深度嵌套、魔法数字、超长函数等',
    '  • 可维护性: TODO 注释、console.log、空 catch 等',
    '❌ 错误:   • 错误处理: 类型安全、异步一致性等',
    '  • 依赖健康: 不安全的 API 使用等',
    '',
    '评分等级: A (90+) | B (80+) | C (70+) | D (60+) | F (<60)',
  ].join('\n')
}

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args, context) => {
  const s = (args ?? '').trim()

  // Help
  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  // Parse options
  const scanMatch = s.match(/--scan\s+(\S+)/)
  const fileMatch = s.match(/--file\s+(\S+)/)
  const formatMatch = s.match(/--format\s+(\S+)/)
  const detailed = s.includes('--detailed')

  const format = formatMatch?.[1] === 'json' ? 'json' : 'text'

  // Scan single file
  if (fileMatch) {
    const issues = await scanFile(fileMatch[1])
    const score = computeHealthScore(issues)
    if (format === 'json') {
      return { type: 'json', value: formatJsonReport(issues, score, 1) }
    }
    return { type: 'text', value: formatTextReport(issues, score, detailed, 1) }
  }

  // Scan directory (single pass, returns issues + file count)
  const scanPath = scanMatch?.[1] ?? '.'
  const { issues, filesScanned } = await scanDirectory(scanPath)

  const score = computeHealthScore(issues)

  if (format === 'json') {
    return { type: 'json', value: formatJsonReport(issues, score, filesScanned) }
  }

  return { type: 'text', value: formatTextReport(issues, score, detailed, filesScanned) }
}

// ============================================================================
// Command Registration
// ============================================================================

const healthScore = {
  type: 'local' as const,
  name: 'health-score',
  description: '代码健康度评分 - 多维度评估代码质量（安全/复杂度/可维护性/错误处理/依赖）',
  aliases: ['/health-score', '/health', '/code-health', '/code-quality'],
  arguments: [
    {
      name: '--scan',
      description: '扫描指定目录（默认: 当前目录）',
      required: false,
    },
    {
      name: '--file',
      description: '扫描单个文件',
      required: false,
    },
    {
      name: '--detailed',
      description: '显示详细问题列表',
      required: false,
    },
    {
      name: '--format',
      description: '输出格式: text / json',
      required: false,
    },
    {
      name: 'help',
      description: '显示帮助',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default healthScore
