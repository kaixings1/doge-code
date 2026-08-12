import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'fs'
import { join, extname, basename, dirname, resolve } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'code-review')
const HISTORY_FILE = join(CONFIG_DIR, 'review-history.json')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')

interface ReviewIssue {
  file: string
  line: number
  column?: number
  type: 'style' | 'bug' | 'security' | 'performance' | 'maintainability' | 'accessibility' | 'testing'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  message: string
  suggestion: string
  rule: string
  effort: 'trivial' | 'easy' | 'medium' | 'hard'
  category: string
}

interface ReviewStats {
  total: number
  bySeverity: Record<string, number>
  byType: Record<string, number>
  byFile: Record<string, number>
  score: number
  grade: string
  techDebt: string
}

interface ReviewConfig {
  rules: Record<string, boolean>
  severityThreshold: 'info' | 'low' | 'medium' | 'high'
  includePatterns: string[]
  excludePatterns: string[]
  maxIssuesPerFile: number
  languages: string[]
  customRules: Array<{ pattern: string; message: string; severity: string; type: string }>
  integrations: { eslint: boolean; prettier: boolean; tsc: boolean; sonar: boolean }
  outputFormats: string[]
  autoFix: boolean
  failOnSeverity: string
}

interface ReviewHistory {
  id: string
  date: string
  filesReviewed: number
  issuesFound: number
  score: number
  grade: string
  duration: number
}

const DEFAULT_CONFIG: ReviewConfig = {
  rules: {
    'no-console-log': true,
    'no-any-type': true,
    'no-eval': true,
    'no-innerHTML': true,
    'no-hardcoded-secrets': true,
    'no-empty-catch': true,
    'no-floating-promises': true,
    'no-magic-numbers': true,
    'max-function-length': true,
    'max-file-length': true,
    'max-cyclomatic-complexity': true,
    'max-parameters': true,
    'no-duplicate-code': true,
    'no-dead-code': true,
    'require-error-handling': true,
    'require-types': true,
    'no-var-usage': true,
    'prefer-const': true,
    'no-unused-imports': true,
    'require-jsdoc': false,
    'max-nesting-depth': true,
    'no-unsafe-optional-chaining': false,
    'require-tests': false,
    'no-todo-fixme': true,
    'max-line-length': true,
  },
  severityThreshold: 'low',
  includePatterns: ['**/*.{ts,tsx,js,jsx,py,go,java,rs}'],
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts', 'coverage/**', '.next/**'],
  maxIssuesPerFile: 50,
  languages: ['typescript', 'javascript', 'python', 'go', 'java', 'rust'],
  customRules: [],
  integrations: { eslint: true, prettier: true, tsc: true, sonar: false },
  outputFormats: ['text', 'json', 'markdown', 'html'],
  autoFix: false,
  failOnSeverity: 'critical',
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; severity: ReviewIssue['severity'] }> = [
  { pattern: /(api[_-]?key|apikey|secret|password|token|auth)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded API key', severity: 'critical' },
  { pattern: /AWS_ACCESS_KEY_ID\s*[:=]\s*['"]?[A-Z0-9]{20}/, name: 'AWS Access Key', severity: 'critical' },
  { pattern: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/, name: 'AWS Secret Key', severity: 'critical' },
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/, name: 'GitHub Personal Token', severity: 'critical' },
  { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API Key', severity: 'critical' },
  { pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/, name: 'Private Key', severity: 'critical' },
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/, name: 'MongoDB Credentials in URL', severity: 'high' },
  { pattern: /postgres:\/\/[^:]+:[^@]+@/, name: 'PostgreSQL Credentials in URL', severity: 'high' },
  { pattern: /mysql:\/\/[^:]+:[^@]+@/, name: 'MySQL Credentials in URL', severity: 'high' },
  { pattern: /(twitter|facebook|google)_(api_)?(secret|key)\s*[:=]\s*['"][^'"]{10,}['"]/i, name: 'Social Media API Secret', severity: 'high' },
]

function loadConfig(): ReviewConfig {
  try {
    if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: ReviewConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): ReviewHistory[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(entry: ReviewHistory) {
  const history = loadHistory()
  history.push(entry)
  if (history.length > 100) history.splice(0, history.length - 100)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function scanFile(file: string, config: ReviewConfig): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  if (!existsSync(file)) return issues
  const ext = extname(file).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext)) return issues

  try {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    let funcStart = -1
    let funcName = ''
    let braceDepth = 0
    let maxNesting = 0

    lines.forEach((line, i) => {
      const t = line.trim()
      const lineNum = i + 1

      if (config.rules['max-line-length'] && t.length > 120) {
        issues.push({ file, line: lineNum, type: 'style', severity: 'low', message: `行过长 (${t.length} 字符)`, suggestion: '拆分为多行或提取为变量', rule: 'max-line-length', effort: 'trivial', category: '可读性' })
      }

      if (config.rules['no-console-log'] && /\bconsole\.(log|debug|warn|info|trace)\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, type: 'bug', severity: 'medium', message: '生产代码中包含 console 语句', suggestion: '使用结构化日志工具（pino、winston）或移除', rule: 'no-console-log', effort: 'trivial', category: '最佳实践' })
      }

      if (config.rules['no-any-type'] && /:\s*\bany\b(?!\s*[=,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, type: 'maintainability', severity: 'medium', message: '使用了 any 类型', suggestion: '定义具体接口/类型或使用 unknown', rule: 'no-any-type', effort: 'medium', category: '类型安全' })
      }

      if (config.rules['no-eval'] && /\beval\s*\(/.test(t)) {
        issues.push({ file, line: lineNum, type: 'security', severity: 'critical', message: 'eval() 可执行任意代码', suggestion: '使用 JSON.parse() 或带验证的 Function 构造函数', rule: 'no-eval', effort: 'hard', category: '安全' })
      }

      if (config.rules['no-innerHTML'] && /\.innerHTML\s*=/.test(t)) {
        issues.push({ file, line: lineNum, type: 'security', severity: 'high', message: 'innerHTML 赋值可能导致 XSS', suggestion: '使用 textContent 或框架安全渲染', rule: 'no-innerHTML', effort: 'easy', category: '安全' })
      }

      if (config.rules['no-empty-catch'] && /catch\s*\([^)]*\)\s*\{\s*\}/.test(t)) {
        issues.push({ file, line: lineNum, type: 'bug', severity: 'high', message: '空的 catch 块（静默失败）', suggestion: '记录错误、重新抛出或优雅处理', rule: 'no-empty-catch', effort: 'easy', category: '可靠性' })
      }

      if (config.rules['no-var-usage'] && /\bvar\s+\w+/.test(t)) {
        issues.push({ file, line: lineNum, type: 'style', severity: 'low', message: '使用 var 而非 let/const', suggestion: '常量用 const，变量用 let', rule: 'no-var-usage', effort: 'trivial', category: '最佳实践' })
      }

      if (config.rules['no-magic-numbers'] && /\b(?!0\b)(?!1\b)(?!2\b)(?!10\b)(?!100\b)(?!1000\b)(?!256\b)(?!1024\b)\d{2,}\b(?!\s*[;,)\]])/.test(t)) {
        issues.push({ file, line: lineNum, type: 'maintainability', severity: 'low', message: '发现魔术数字', suggestion: '提取为具名常量', rule: 'no-magic-numbers', effort: 'easy', category: '可读性' })
      }

      if (config.rules['no-todo-fixme'] && /\/\/\s*(TODO|FIXME|HACK|XXX|WORKAROUND)\b/i.test(t)) {
        issues.push({ file, line: lineNum, type: 'maintainability', severity: 'low', message: '未完成的代码标记', suggestion: '完成任务或创建跟踪 issue', rule: 'no-todo-fixme', effort: 'medium', category: '可维护性' })
      }

      if (config.rules['no-floating-promises'] && /\b(?:await\s+)?\w+\.(then|catch|finally)\s*\(/.test(t) && !t.includes('await') && !t.includes('return')) {
        issues.push({ file, line: lineNum, type: 'bug', severity: 'high', message: '悬空 Promise（未 await 或 return）', suggestion: '添加 await 或 return，或用 void 运算符处理', rule: 'no-floating-promises', effort: 'easy', category: '可靠性' })
      }

      for (const secret of SECRET_PATTERNS) {
        if (secret.pattern.test(t)) {
          issues.push({ file, line: lineNum, type: 'security', severity: secret.severity, message: secret.name + ' 在源代码中', suggestion: '移至环境变量或安全保管库', rule: 'no-hardcoded-secrets', effort: 'easy', category: '安全' })
          break
        }
      }

      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)/)
      if (funcMatch) {
        if (funcStart >= 0 && (lineNum - funcStart) > 50) {
          issues.push({ file, line: funcStart, type: 'maintainability', severity: (lineNum - funcStart) > 100 ? 'high' : 'medium', message: `函数 "${funcName}" 过长 (${lineNum - funcStart} 行)`, suggestion: '拆分为职责单一的小函数', rule: 'max-function-length', effort: 'hard', category: '可维护性' })
        }
        funcStart = lineNum
        funcName = funcMatch[1]
        braceDepth = 0
        maxNesting = 0
      }

      if (config.rules['max-nesting-depth']) {
        braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
        if (braceDepth > maxNesting) maxNesting = braceDepth
        if (braceDepth > 5) {
          issues.push({ file, line: lineNum, type: 'maintainability', severity: 'medium', message: `深度嵌套 (深度: ${braceDepth})`, suggestion: '将嵌套逻辑提取为独立函数', rule: 'max-nesting-depth', effort: 'medium', category: '可读性' })
        }
      }

      if (issues.length >= config.maxIssuesPerFile) return
    })

    if (lines.length > 500) {
      issues.push({ file, line: 1, type: 'maintainability', severity: lines.length > 1000 ? 'high' : 'medium', message: `文件过长 (${lines.length} 行)`, suggestion: '拆分为更小的模块', rule: 'max-file-length', effort: 'hard', category: '可维护性' })
    }
  } catch { /* ignore */ }
  return issues.slice(0, config.maxIssuesPerFile)
}

function scanDirectory(dir: string, config: ReviewConfig): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(d, entry.name)
        const relativePath = fp.replace(resolve('') + '/', '')
        if (config.excludePatterns.some(p => relativePath.includes(p.replace('**/', '').replace('/*', '')))) continue
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile()) {
          const ext = extname(entry.name)
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext)) {
            issues.push(...scanFile(fp, config))
          }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return issues
}

function calculateScore(issues: ReviewIssue[]): ReviewStats {
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const byType: Record<string, number> = {}
  const byFile: Record<string, number> = {}
  issues.forEach(i => {
    bySeverity[i.severity]++
    byType[i.type] = (byType[i.type] || 0) + 1
    byFile[i.file] = (byFile[i.file] || 0) + 1
  })
  let score = 100
  score -= bySeverity.critical * 20
  score -= bySeverity.high * 10
  score -= bySeverity.medium * 5
  score -= bySeverity.low * 2
  score = Math.max(0, Math.min(100, score))
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  const debtMinutes = bySeverity.critical * 120 + bySeverity.high * 60 + bySeverity.medium * 30 + bySeverity.low * 10
  const debtStr = debtMinutes > 120 ? `${Math.round(debtMinutes / 60)} 小时` : `${debtMinutes} 分钟`
  return { total: issues.length, bySeverity, byType, byFile, score, grade, techDebt: debtStr }
}

function formatTextReport(issues: ReviewIssue[], stats: ReviewStats): string {
  const lines = ['📊 代码审查报告', '═══════════════════', '', `评分：${stats.score}/100（${stats.grade}）`, `技术债：${stats.techDebt}`, `问题总数：${stats.total}`, '', '按严重程度：', `  🔴 严重：${stats.bySeverity.critical}`, `  🟠 高：${stats.bySeverity.high}`, `  🟡 中：${stats.bySeverity.medium}`, `  🔵 低：${stats.bySeverity.low}`, `  ℹ️  信息：${stats.bySeverity.info}`, '', '按类型：']
  Object.entries(stats.byType).sort((a: any, b: any) => b[1] - a[1]).forEach(([t, c]) => lines.push(`  ${t}: ${c}`))
  lines.push('', '主要问题：', '────────────')
  issues.filter(i => i.severity === 'critical' || i.severity === 'high').slice(0, 20).forEach((issue, idx) => {
    const icon = issue.severity === 'critical' ? '🔴' : '🟠'
    lines.push(`${icon} ${idx + 1}. [${issue.file}:${issue.line}] ${issue.message}`)
    lines.push(`   → ${issue.suggestion} (${issue.effort})`)
  })
  if (issues.length > 20) lines.push(`\n... 还有 ${issues.length - 20} 个问题`)
  return lines.join('\n')
}

function formatMarkdownReport(issues: ReviewIssue[], stats: ReviewStats): string {
  const lines = [`# 代码审查报告`, '', `**评分：${stats.score}/100（${stats.grade}）**`, '', `| 指标 | 值 |`, `|-------|-------|`, `| 问题总数 | ${stats.total} |`, `| 严重 | ${stats.bySeverity.critical} |`, `| 高 | ${stats.bySeverity.high} |`, `| 中 | ${stats.bySeverity.medium} |`, `| 低 | ${stats.bySeverity.low} |`, `| 技术债 | ${stats.techDebt} |`, '', '## 按严重程度分类', '']
  const grouped: Record<string, ReviewIssue[]> = {}
  issues.forEach(i => { if (!grouped[i.severity]) grouped[i.severity] = []; grouped[i.severity].push(i) })
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    if (grouped[sev]?.length) {
      lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${grouped[sev].length})`)
      grouped[sev].forEach(i => lines.push(`- [${i.file}:${i.line}] ${i.message} → ${i.suggestion}`))
      lines.push('')
    }
  }
  return lines.join('\n')
}

function formatHtmlReport(issues: ReviewIssue[], stats: ReviewStats): string {
  const critical = issues.filter(i => i.severity === 'critical')
  const high = issues.filter(i => i.severity === 'high')
  const rows = issues.slice(0, 100).map(i => `<tr class="${i.severity}"><td>${i.severity}</td><td>${i.file}:${i.line}</td><td>${i.message}</td><td>${i.suggestion}</td></tr>`).join('\n')
  return `<!DOCTYPE html><html><head><title>Code Review</title>
<style>body{font-family:system-ui;max-width:1200px;margin:0 auto;padding:20px;background:#1a1a2e;color:#eee}
.score{font-size:3em;text-align:center;padding:20px;border-radius:12px;margin:20px 0}
.grade-a{background:#0f0}.grade-b{background:#8f0}.grade-c{background:#ff0;color:#000}.grade-d{background:#f80}.grade-f{background:#f00}
table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #333}
.critical{background:#f003}.high{background:#f803}.medium{background:#ff03;color:#000}.low{background:#08f3}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:20px 0}
.stat{padding:16px;border-radius:8px;text-align:center;background:#16213e}.stat-value{font-size:2em;font-weight:bold}
h1,h2{color:#e94560}</style></head><body>
<h1>Code Review Report</h1>
<div class="score grade-${stats.grade.toLowerCase()}">${stats.score}/100 (${stats.grade})</div>
<div class="stats">
  <div class="stat"><div class="stat-value" style="color:#f00">${stats.bySeverity.critical}</div>Critical</div>
  <div class="stat"><div class="stat-value" style="color:#f80">${stats.bySeverity.high}</div>High</div>
  <div class="stat"><div class="stat-value" style="color:#ff0">${stats.bySeverity.medium}</div>Medium</div>
  <div class="stat"><div class="stat-value" style="color:#08f">${stats.bySeverity.low}</div>Low</div>
  <div class="stat"><div class="stat-value" style="color:#aaa">${stats.bySeverity.info}</div>Info</div>
</div>
<p><strong>Tech Debt:</strong> ${stats.techDebt} | <strong>Total:</strong> ${stats.total} issues</p>
<table><tr><th>Severity</th><th>Location</th><th>Issue</th><th>Suggestion</th></tr>${rows}</table>
</body></html>`
}

function runIntegrations(config: ReviewConfig): string[] {
  const results: string[] = []
  if (config.integrations.eslint && existsSync('.eslintrc.json')) {
    try { results.push('ESLint:\n' + execSync('npx eslint . --format compact 2>&1 | head -30', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).slice(0, 1000)) } catch { /* ignore */ }
  }
  if (config.integrations.tsc && existsSync('tsconfig.json')) {
    try { results.push('TypeScript:\n' + execSync('npx tsc --noEmit 2>&1 | head -20', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).slice(0, 500)) } catch { /* ignore */ }
  }
  if (config.integrations.prettier) {
    try { results.push('Prettier:\n' + execSync('npx prettier --check . 2>&1 | head -20', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).slice(0, 500)) } catch { /* ignore */ }
  }
  return results
}

function compareWithBaseline(issues: ReviewIssue[]): { newIssues: ReviewIssue[]; fixed: number; unchanged: number } {
  try {
    if (!existsSync(BASELINE_FILE)) return { newIssues: issues, fixed: 0, unchanged: 0 }
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as ReviewIssue[]
    const issueKey = (i: ReviewIssue) => `${i.file}:${i.line}:${i.rule}`
    const baselineKeys = new Set(baseline.map(issueKey))
    const currentKeys = new Set(issues.map(issueKey))
    const newIssues = issues.filter(i => !baselineKeys.has(issueKey(i)))
    const fixed = baseline.filter(i => !currentKeys.has(issueKey(i))).length
    const unchanged = baseline.filter(i => currentKeys.has(issueKey(i))).length
    return { newIssues, fixed, unchanged }
  } catch { return { newIssues: issues, fixed: 0, unchanged: 0 } }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔍 深度代码审查', '', '📖 用法：', '  /code-review                    完整项目审查', '  /code-review file <路径>       审查单个文件', '  /code-review branch <分支>     审查分支差异', '  /code-review commit <sha>      审查指定提交', '  /code-review range <a>..<b>    审查提交范围', '  /code-review staged            审查已暂存变更', '  /code-review unstaged          审查未暂存变更', '  /code-review fix               自动修复问题', '  /code-review baseline          保存为基准', '  /code-review compare           与基准对比', '  /code-review history           审查历史', '  /code-review trends            问题趋势', '  /code-review config            查看/编辑配置', '  /code-review enable <规则>    启用规则', '  /code-review disable <规则>   禁用规则', '  /code-review add-rule          添加自定义规则', '  /code-review rules             列出所有规则', '  /code-review export [格式]      导出报告（md/html/json）', '  /code-review lint              运行代码检查', '  /code-review stats             统计信息', ''].join('\n') }

  if (cmd === 'rules') {
    const lines = ['📋 审查规则：', '═══════════', '']
    for (const [rule, enabled] of Object.entries(config.rules)) {
      lines.push(`  ${enabled ? '✅ 开启' : '❌ 关闭'} ${rule}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    if (key in config.rules) { config.rules[key as keyof typeof config.rules] = value === 'true'; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置：${key}` }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const rule = parts[1]
    if (!rule || !(rule in config.rules)) return { type: 'text', value: `❌ 未知规则：${rule}` }
    config.rules[rule as keyof typeof config.rules] = cmd === 'enable'
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] ${rule} ${cmd === 'enable' ? '已启用' : '已禁用'}` }
  }

  if (cmd === 'add-rule') {
    return { type: 'text', value: '📝 在 config.json 中添加自定义规则：\n{ "pattern": "正则", "message": "提示信息", "severity": "high", "type": "security" }' }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'ℹ️ 暂无审查历史' }
    const lines = ['📅 审查历史：', '═══════════', '']
    history.slice(-15).forEach(h => lines.push(`${h.date.slice(0, 19)} | 评分: ${h.score}/100 (${h.grade}) | 问题: ${h.issuesFound} | 文件: ${h.filesReviewed} | ${h.duration}ms`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trends') {
    const history = loadHistory()
    if (history.length < 2) return { type: 'text', value: '⚠️ 趋势分析至少需要 2 次审查记录' }
    const lines = ['📈 问题趋势：', '═══════════', '']
    history.slice(-14).forEach(h => {
      const bar = '#'.repeat(Math.min(h.issuesFound, 40))
      lines.push(`${h.date.slice(0, 10)} ${bar} (${h.issuesFound})`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'baseline') {
    const issues = scanDirectory('.', config)
    writeFileSync(BASELINE_FILE, JSON.stringify(issues, null, 2), 'utf-8')
    return { type: 'text', value: `✅ [OK] 基准已保存（${issues.length} 个问题）` }
  }

  if (cmd === 'compare') {
    const issues = scanDirectory('.', config)
    const comparison = compareWithBaseline(issues)
    const lines = ['📊 基准对比：', '═══════════════', '', `新增问题：${comparison.newIssues.length}`, `已修复：${comparison.fixed}`, `未变更：${comparison.unchanged}`]
    if (comparison.newIssues.length > 0) { lines.push('', '新增问题：'); comparison.newIssues.slice(0, 10).forEach(i => lines.push(`  [${i.file}:${i.line}] ${i.message}`)) }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const format = parts[1] || 'markdown'
    const issues = scanDirectory('.', config)
    const stats = calculateScore(issues)
    const filename = `code-review-report.${format === 'markdown' ? 'md' : format}`
    let content = ''
    if (format === 'json') content = JSON.stringify({ stats, issues }, null, 2)
    else if (format === 'html') content = formatHtmlReport(issues, stats)
    else content = formatMarkdownReport(issues, stats)
    writeFileSync(filename, content, 'utf-8')
    return { type: 'text', value: `✅ [OK] 已导出：${filename}` }
  }

  if (cmd === 'lint') {
    const results = runIntegrations(config)
    return { type: 'text', value: results.join('\n\n') || 'ℹ️ 未配置代码检查工具' }
  }

  if (cmd === 'stats') {
    const issues = scanDirectory('.', config)
    const stats = calculateScore(issues)
    return { type: 'text', value: JSON.stringify(stats, null, 2) }
  }

  if (cmd === 'staged' || cmd === 'unstaged') {
    try {
      const flag = cmd === 'staged' ? '--cached' : ''
      const output = execSync(`git diff ${flag} --name-only`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const files = output.split('\n').filter(Boolean)
      if (files.length === 0) return { type: 'text', value: `ℹ️ 无${cmd === 'staged' ? '暂存' : '未暂存'}变更` }
      const issues = files.flatMap(f => scanFile(f, config))
      const stats = calculateScore(issues)
      return { type: 'text', value: `📊 审查 (${cmd === 'staged' ? '已暂存' : '未暂存'}):\n文件数: ${files.length}\n${formatTextReport(issues, stats)}` }
    } catch { return { type: 'text', value: '❌ Git 错误' } }
  }

  if (cmd === 'branch') {
    const branch = parts[1] || 'main'
    try {
      const output = execSync(`git diff ${branch}...HEAD --name-only`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const files = output.split('\n').filter(Boolean)
      if (files.length === 0) return { type: 'text', value: `ℹ️ 与 ${branch} 相比无变更` }
      const issues = files.flatMap(f => scanFile(f, config))
      const stats = calculateScore(issues)
      return { type: 'text', value: `📊 审查 (vs ${branch}):\n文件数: ${files.length}\n${formatTextReport(issues, stats)}` }
    } catch { return { type: 'text', value: `❌ Git 错误: ${branch}` } }
  }

  if (cmd === 'file') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: `❌ 文件未找到：${file || ''}` }
    const issues = scanFile(file, config)
    const stats = calculateScore(issues)
    return { type: 'text', value: formatTextReport(issues, stats) }
  }

  // Default: full review
  const startTime = Date.now()
  const issues = scanDirectory('.', config)
  const stats = calculateScore(issues)
  const duration = Date.now() - startTime
  saveHistory({ id: 'review-' + Date.now(), date: new Date().toISOString(), filesReviewed: Object.keys(stats.byFile).length, issuesFound: issues.length, score: stats.score, grade: stats.grade, duration })
  return { type: 'text', value: formatTextReport(issues, stats) }
}

const codeReview: Command = {
  type: 'local', name: 'code-review',
  description: '🔍 深度代码审查 - 文件/分支/提交/修复/基准/历史/趋势/配置',
  aliases: ['/code-review', '/review', '/cr'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default codeReview
