import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'info'
  file: string
  line: number
  message: string
  suggestion: string
  rule: string
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    path: z.string().describe('要审查的文件或目录路径'),
    depth: z
      .enum(['quick', 'standard', 'deep'])
      .optional()
      .describe('审查深度：quick（前5个文件）/standard（前20个）/deep（前100个）'),
    focus: z
      .enum(['security', 'performance', 'style', 'all'])
      .optional()
      .describe('审查重点：security/performance/style/all（默认 all）'),
    output: z.string().optional().describe('将报告保存到该文件路径'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    score: z.number().describe('评分（0-100）'),
    grade: z.string().describe('等级（A-F）'),
    filesReviewed: z.number().describe('实际审查的文件数'),
    filesTotal: z.number().describe('发现的总文件数'),
    depth: z.string().describe('审查深度'),
    focus: z.string().describe('审查重点'),
    issueCounts: z.object({
      critical: z.number(),
      major: z.number(),
      minor: z.number(),
      info: z.number(),
    }),
    issues: z
      .array(
        z.object({
          severity: z.enum(['critical', 'major', 'minor', 'info']),
          file: z.string(),
          line: z.number(),
          message: z.string(),
          suggestion: z.string(),
          rule: z.string(),
        }),
      )
      .describe('发现的问题列表'),
    report: z.string().describe('完整审查报告（Markdown）'),
    savedTo: z.string().optional().describe('报告保存路径'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const ReviewArtifactTool = buildTool({
  name: 'review_artifact',
  aliases: ['review-artifact', 'artifact-review'],
  searchHint: '审查代码工件，检查安全和性能问题并生成评分报告',
  maxResultSizeChars: 100_000,
  async description() {
    return '审查代码工件：分析安全、性能、风格问题并生成带评分的报告'
  },
  async prompt() {
    return '审查代码工件：分析安全、性能、风格问题并生成带评分的报告。参数：path（必填，文件或目录）、depth（quick/standard/deep）、focus（security/performance/style/all）、output（报告保存路径）。'
  },
  renderToolUseMessage(input) {
    return `正在审查 ${input.path}`
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  info() {
    return {
      name: 'review_artifact',
      description: '审查代码工件：分析安全、性能、风格问题并生成带评分的报告',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要审查的文件或目录路径' },
          depth: { type: 'string', description: '审查深度：quick/standard/deep' },
          focus: { type: 'string', description: '审查重点：security/performance/style/all' },
          output: { type: 'string', description: '将报告保存到该文件路径' },
        },
      },
      required: ['path'],
    }
  },
  async call(input) {
    const path = input.path
    const depth = input.depth ?? 'standard'
    const focus = input.focus ?? 'all'
    const outputFile = input.output ?? ''

    const issues: ReviewIssue[] = []

    if (!path || !existsSync(path)) {
      const noPathReport = [
        '## Review Results',
        '',
        `**错误：** 路径不存在：${path}`,
        '',
        '用法：`review_artifact` 需要 `path` 参数指向文件或目录。',
      ].join('\n')
      return {
        data: {
          score: 0,
          grade: 'F',
          filesReviewed: 0,
          filesTotal: 0,
          depth,
          focus,
          issueCounts: { critical: 0, major: 0, minor: 0, info: 0 },
          issues: [],
          report: noPathReport,
        },
      }
    }

    // 收集待审查文件
    const files: string[] = []
    if (statSync(path).isDirectory()) {
      const scanDir = (d: string) => {
        for (const item of readdirSync(d, { withFileTypes: true })) {
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
            scanDir(join(d, item.name))
          } else if (item.isFile() && /\.(ts|tsx|js|jsx|py|rs|go|java)$/i.test(item.name)) {
            files.push(join(d, item.name))
          }
        }
      }
      scanDir(path)
    } else {
      files.push(path)
    }

    const maxFiles = depth === 'quick' ? 5 : depth === 'standard' ? 20 : 100
    const checkedFiles = files.slice(0, maxFiles)
    const checkAll = focus === 'all'

    for (const file of checkedFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relFile = file.startsWith(process.cwd()) ? file.slice(process.cwd().length + 1) : file

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          // ── Security checks ──
          if (checkAll || focus === 'security') {
            if (line.includes('eval(')) {
              issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Use of eval() is dangerous', suggestion: 'Avoid eval() - use JSON.parse or Function constructor alternatives', rule: 'security-no-eval' })
            }
            if (line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
              issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'XSS risk: direct HTML injection', suggestion: 'Use textContent, innerText, or a safe template library', rule: 'security-xss' })
            }
            if (line.match(/password\s*[:=]\s*['"][^'"]+['"]/i)) {
              issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded password', suggestion: 'Move to environment variables or secret manager', rule: 'security-hardcoded-password' })
            }
            if (line.match(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i)) {
              issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded API key', suggestion: 'Move to environment variables', rule: 'security-hardcoded-key' })
            }
            if (line.match(/secret\s*[:=]\s*['"][^'"]+['"]/i)) {
              issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded secret', suggestion: 'Move to environment variables', rule: 'security-hardcoded-secret' })
            }
            if (line.includes('document.cookie')) {
              issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Direct cookie access', suggestion: 'Use HttpOnly cookies and avoid storing sensitive data in cookies', rule: 'security-cookie' })
            }
            if (line.includes('execSync') && line.includes('+')) {
              issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Command injection risk', suggestion: 'Use execFile or validate user input', rule: 'security-command-injection' })
            }
            if (line.includes('exec(') || line.includes('execSync(')) {
              issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Using child_process exec', suggestion: 'Consider execFile for safer execution', rule: 'security-child-process' })
            }
          }

          // ── Performance checks ──
          if (checkAll || focus === 'performance') {
            if (line.length > 200) {
              issues.push({ severity: 'minor', file: relFile, line: i + 1, message: `Line too long (${line.length} chars)`, suggestion: 'Break into multiple lines for readability', rule: 'perf-long-line' })
            }
            if (line.includes('.map(') && line.includes('.find(')) {
              issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Possible N+1 query pattern', suggestion: 'Consider batch operations or single query', rule: 'perf-n-plus-1' })
            }
            if (line.includes('for (') && line.includes('let i = 0') && depth === 'deep') {
              issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Traditional for loop', suggestion: 'Consider for...of or array methods', rule: 'perf-loop' })
            }
            if (line.includes('JSON.parse(JSON.stringify(')) {
              issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Deep clone via JSON is slow', suggestion: 'Use structuredClone or lodash cloneDeep', rule: 'perf-json-clone' })
            }
            if (line.includes('await ') && line.includes('Promise.all') === false && depth === 'deep') {
              // 检测串行 await 模式（粗略）
              const nextLines = lines.slice(i + 1, i + 4)
              if (nextLines.some(l => l.includes('await '))) {
                issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Possible serial awaits', suggestion: 'Consider Promise.all for parallel execution', rule: 'perf-serial-await' })
              }
            }
          }

          // ── Style checks ──
          if (checkAll || focus === 'style') {
            if (line.includes('console.log')) {
              issues.push({ severity: depth === 'deep' ? 'info' : 'minor', file: relFile, line: i + 1, message: 'Console.log left in code', suggestion: 'Remove or replace with logger', rule: 'style-console-log' })
            }
            if (line.includes(': any') || line.includes('as any') || line.includes('as unknown as any')) {
              issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Use of `any` type', suggestion: 'Use proper TypeScript types or unknown with narrowing', rule: 'style-any' })
            }
            if (line.includes('// TODO')) {
              issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'TODO comment found', suggestion: 'Address the TODO or track it in an issue', rule: 'style-todo' })
            }
            if (line.includes('// FIXME') || line.includes('// HACK') || line.includes('// XXX')) {
              issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'FIXME/HACK comment found', suggestion: 'Fix the underlying issue', rule: 'style-fixme' })
            }
            if (line.includes('function ') && !line.includes(':') && !line.includes('{')) {
              issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Function missing return type annotation', suggestion: 'Add TypeScript return type', rule: 'style-return-type' })
            }
            if (/^\s+$/.test(line) && line.length > 4) {
              issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Trailing whitespace', suggestion: 'Remove trailing whitespace', rule: 'style-trailing-space' })
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 计算评分
    const critical = issues.filter(i => i.severity === 'critical').length
    const major = issues.filter(i => i.severity === 'major').length
    const minor = issues.filter(i => i.severity === 'minor').length
    const info = issues.filter(i => i.severity === 'info').length

    // 评分公式：100 - critical*10 - major*5 - minor*2 - info*0.5，下限 0
    let score = Math.max(0, Math.round(100 - critical * 10 - major * 5 - minor * 2 - info * 0.5))
    if (checkedFiles.length === 0) score = 0

    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'

    const report = [
      '## Review Results',
      '',
      `**Path:** ${path}`,
      `**Files Reviewed:** ${checkedFiles.length}/${files.length}`,
      `**Depth:** ${depth}`,
      `**Focus:** ${focus}`,
      '',
      `**Score: ${score}/100 (Grade ${grade})**`,
      '',
      '| Severity | Count |',
      '|----------|-------|',
      `| 🔴 Critical | ${critical} |`,
      `| 🟠 Major | ${major} |`,
      `| 🟡 Minor | ${minor} |`,
      `| 🔵 Info | ${info} |`,
      '',
    ]

    if (issues.length > 0) {
      report.push('### Issues by Severity', '')
      for (const sev of ['critical', 'major', 'minor', 'info'] as const) {
        const sevIssues = issues.filter(i => i.severity === sev)
        if (sevIssues.length > 0) {
          const icon = sev === 'critical' ? '🔴' : sev === 'major' ? '🟠' : sev === 'minor' ? '🟡' : '🔵'
          report.push(`#### ${icon} ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${sevIssues.length})`, '')
          sevIssues.slice(0, 10).forEach((iss, i) => {
            report.push(`${i + 1}. **${iss.file}:${iss.line}** - ${iss.message}`)
            report.push(`   *Suggestion:* ${iss.suggestion}`)
            report.push('')
          })
          if (sevIssues.length > 10) report.push(`*... and ${sevIssues.length - 10} more*`, '')
        }
      }
    } else {
      report.push('🎉 No issues found. Great job!')
    }

    report.push('### Recommendations', '')
    if (critical > 0) report.push(`1. **立即修复** ${critical} 个 Critical 安全问题`)
    if (major > 0) report.push(`2. **本周内修复** ${major} 个 Major 问题`)
    if (minor > 0) report.push(`3. **计划修复** ${minor} 个 Minor 问题`)
    if (score < 60) report.push(`4. **代码健康度低（${grade}级）**，建议安排重构`)
    if (score >= 90) report.push(`1. 代码质量优秀，保持当前实践`)

    const reportText = report.join('\n')

    // 保存报告
    let savedTo = ''
    if (outputFile) {
      try {
        writeFileSync(outputFile, reportText, 'utf-8')
        savedTo = outputFile
      } catch { /* ignore */ }
    }

    const output: Output = {
      score,
      grade,
      filesReviewed: checkedFiles.length,
      filesTotal: files.length,
      depth,
      focus,
      issueCounts: { critical, major, minor, info },
      issues,
      report: reportText + (savedTo ? `\n\n**Report saved to:** ${savedTo}` : ''),
      savedTo: savedTo || undefined,
    }

    return { data: output }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.report,
    }
  },
})
