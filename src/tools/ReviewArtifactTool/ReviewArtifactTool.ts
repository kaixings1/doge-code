import { type Tool } from '../../engine/types.js'
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

export class ReviewArtifactTool implements Tool {
  name = 'review_artifact'
  description = 'Review code artifacts: analyze security, performance, style issues and generate a scored report'
  parameters = {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to file or directory to review' },
      depth: { type: 'string', description: 'Review depth: quick, standard, or deep', enum: ['quick', 'standard', 'deep'] },
      focus: { type: 'string', description: 'Review focus: security, performance, style, or all', enum: ['security', 'performance', 'style', 'all'] },
      output: { type: 'string', description: 'Save report to this file path' }
    },
    required: ['path']
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const path = params?.path || ''
    const depth = params?.depth || 'standard'
    const focus = params?.focus || 'all'
    const outputFile = params?.output || ''
    if (!path || !existsSync(path)) return { content: [{ type: 'text', text: `Error: Path not found: ${path}` }] }

    const files: string[] = []
    if (statSync(path).isDirectory()) {
      const scanDir = (d: string) => {
        for (const item of readdirSync(d, { withFileTypes: true })) {
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') scanDir(join(d, item.name))
          else if (item.isFile() && /\.(ts|tsx|js|jsx|py|rs|go|java|ts|tsx)$/i.test(item.name)) files.push(join(d, item.name))
        }
      }
      scanDir(path)
    } else {
      files.push(path)
    }

    const issues: ReviewIssue[] = []
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
            if (line.includes('eval(')) issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Use of eval() is dangerous', suggestion: 'Avoid eval() - use JSON.parse or Function constructor alternatives', rule: 'security-no-eval' })
            if (line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'XSS risk: direct HTML injection', suggestion: 'Use textContent, innerText, or a safe template library', rule: 'security-xss' })
            if (line.match(/password\s*[:=]\s*['"][^'"]+['"]/i)) issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded password', suggestion: 'Move to environment variables or secret manager', rule: 'security-hardcoded-password' })
            if (line.match(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i)) issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded API key', suggestion: 'Move to environment variables', rule: 'security-hardcoded-key' })
            if (line.match(/secret\s*[:=]\s*['"][^'"]+['"]/i)) issues.push({ severity: 'critical', file: relFile, line: i + 1, message: 'Hardcoded secret', suggestion: 'Move to environment variables', rule: 'security-hardcoded-secret' })
            if (line.includes('document.cookie')) issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Direct cookie access', suggestion: 'Use HttpOnly cookies and avoid storing sensitive data in cookies', rule: 'security-cookie' })
            if (line.includes('execSync') && line.includes('+')) issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Command injection risk', suggestion: 'Use execFile or validate user input', rule: 'security-command-injection' })
            if (line.includes('FROM child_process') || line.includes('require("child_process")')) {
              if (line.includes('exec')) issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Using child_process exec', suggestion: 'Consider execFile for safer execution', rule: 'security-child-process' })
            }
          }

          // ── Performance checks ──
          if (checkAll || focus === 'performance') {
            if (line.length > 200) issues.push({ severity: 'minor', file: relFile, line: i + 1, message: `Line too long (${line.length} chars)`, suggestion: 'Break into multiple lines for readability', rule: 'perf-long-line' })
            if (line.includes('.map(') && line.includes('.find(')) issues.push({ severity: 'major', file: relFile, line: i + 1, message: 'Possible N+1 query pattern', suggestion: 'Consider batch operations or single query', rule: 'perf-n-plus-1' })
            if (line.includes('for (') && line.includes('let i = 0') && depth === 'deep') issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Traditional for loop', suggestion: 'Consider for...of or array methods', rule: 'perf-loop' })
            if (line.includes('JSON.parse(JSON.stringify(')) issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Deep clone via JSON is slow', suggestion: 'Use structuredClone or lodash cloneDeep', rule: 'perf-json-clone' })
            if (line.includes('await ') && line.includes('Promise.all') === false && depth === 'deep') {
              // 检测串行 await 模式（粗略）
              const nextLines = lines.slice(i + 1, i + 4)
              if (nextLines.some(l => l.includes('await '))) issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Possible serial awaits', suggestion: 'Consider Promise.all for parallel execution', rule: 'perf-serial-await' })
            }
          }

          // ── Style checks ──
          if (checkAll || focus === 'style') {
            if (line.includes('console.log')) issues.push({ severity: depth === 'deep' ? 'info' : 'minor', file: relFile, line: i + 1, message: 'Console.log left in code', suggestion: 'Remove or replace with logger', rule: 'style-console-log' })
            if (line.includes(': any') || line.includes('as any') || line.includes('as unknown as any')) issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'Use of `any` type', suggestion: 'Use proper TypeScript types or unknown with narrowing', rule: 'style-any' })
            if (line.includes('// TODO')) issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'TODO comment found', suggestion: 'Address the TODO or track it in an issue', rule: 'style-todo' })
            if (line.includes('// FIXME') || line.includes('// HACK') || line.includes('// XXX')) issues.push({ severity: 'minor', file: relFile, line: i + 1, message: 'FIXME/HACK comment found', suggestion: 'Fix the underlying issue', rule: 'style-fixme' })
            if (line.includes('function ') && !line.includes(':') && !line.includes('{')) issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Function missing return type annotation', suggestion: 'Add TypeScript return type', rule: 'style-return-type' })
            if (/^\s+$/.test(line) && line.length > 4) issues.push({ severity: 'info', file: relFile, line: i + 1, message: 'Trailing whitespace', suggestion: 'Remove trailing whitespace', rule: 'style-trailing-space' })
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
      `| Severity | Count |`,
      `|----------|-------|`,
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
    let savedPath = ''
    if (outputFile) {
      try {
        writeFileSync(outputFile, reportText, 'utf-8')
        savedPath = outputFile
      } catch { /* ignore */ }
    }

    return {
      content: [{
        type: 'text',
        text: reportText + (savedPath ? `\n\n**Report saved to:** ${savedPath}` : '')
      }]
    }
  }
}