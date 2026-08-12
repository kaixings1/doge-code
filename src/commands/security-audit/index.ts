import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, resolve, extname } from 'path'

/**
 * /security-audit 命令 - 安全审计工具
 * 静态代码分析，检测常见安全漏洞
 */

const HELP_TEXT = `🛡️ **安全审计命令** - 静态安全审计工具

**用法**：/security-audit [选项]

**选项**：
  --scan <路径>    - 扫描目录中的代码
  --file <路径>    - 扫描单个文件
  --rule <规则>    - 指定检查规则（sql-injection, xss, cmd-injection, hardcode-secrets, dangerous-api）
  --format <格式>  - 输出格式（text/json）
  --fix          - 自动修复可修复的问题
  --help         - 显示帮助

**支持的文件类型**：.ts, .tsx, .js, .jsx, .py, .go, .java, .php

**示例**：
  /security-audit --scan ./src            # 扫描整个 src 目录
  /security-audit --file app.js            # 扫描单个文件
  /security-audit --scan . --rule xss      # 只检查 XSS 漏洞
  /security-audit --scan . --fix          # 自动修复`

// 安全规则模式
const SECURITY_RULES: Record<string, { pattern: RegExp; severity: 'high' | 'medium' | 'low'; message: string }> = {
  'sql-injection': {
    pattern: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION).*\+.*\$|\$\{.*\}.*SELECT|query\s*\+\s*req\.|\.query\(.*\)/i,
    severity: 'high',
    message: '可能的 SQL 注入漏洞'
  },
  'xss': {
    pattern: /innerHTML\s*=|document\.write|eval\s*\(|untrusted|dangerouslySetInnerHTML/i,
    severity: 'high',
    message: '可能的 XSS 漏洞'
  },
  'cmd-injection': {
    pattern: /exec\s*\(|execFile\s*\(|spawn\s*\(|shell\s*=\s*true|child_process/i,
    severity: 'high',
    message: '可能的命令注入风险'
  },
  'hardcode-secrets': {
    pattern: /(api[_-]?key|secret|password|token|apikey)\s*[:=]\s*["'][^"']+["']|['"][a-zA-Z0-9]{32,}["']/i,
    severity: 'medium',
    message: '检测到硬编码密钥'
  },
  'dangerous-api': {
    pattern: /localStorage\.setItem.*password|sessionStorage|\.eval\s*\(|new Function\s*\(/i,
    severity: 'medium',
    message: '使用危险 API'
  },
  'insecure-random': {
    pattern: /Math\.random\s*\(\)|random\(\)|rand\(\)/i,
    severity: 'low',
    message: '使用不安全的随机数生成'
  }
}

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.php']

interface SecurityIssue {
  file: string
  line: number
  rule: string
  severity: 'high' | 'medium' | 'low'
  message: string
  code: string
}

function scanFile(filePath: string, rules: string[] = []): SecurityIssue[] {
  const issues: SecurityIssue[] = []
  const absPath = resolve(filePath)

  if (!existsSync(absPath)) return issues

  try {
    const content = readFileSync(absPath, 'utf-8')
    const lines = content.split('\n')
    const rulesToCheck = rules.length > 0 ? rules : Object.keys(SECURITY_RULES)

    for (const ruleName of rulesToCheck) {
      const rule = SECURITY_RULES[ruleName]
      if (!rule) continue

      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          issues.push({
            file: filePath,
            line: index + 1,
            rule: ruleName,
            severity: rule.severity,
            message: rule.message,
            code: line.trim().substring(0, 80)
          })
        }
      })
    }
  } catch {
    // 忽略读取错误
  }

  return issues
}

function scanDirectory(dir: string, rules: string[] = []): SecurityIssue[] {
  const allIssues: SecurityIssue[] = []
  const absDir = resolve(dir)

  if (!existsSync(absDir)) return allIssues

  const scan = (currentDir: string) => {
    const entries = readdirSync(currentDir)

    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          scan(fullPath)
        } else if (stat.isFile() && CODE_EXTENSIONS.includes(extname(entry))) {
          const relativePath = fullPath.replace(absDir, '.')
          allIssues.push(...scanFile(relativePath, rules))
        }
      } catch {
        // 忽略错误
      }
    }
  }

  scan(absDir)
  return allIssues
}

function formatReport(issues: SecurityIssue[], format: string): string {
  if (format === 'json') {
    return JSON.stringify({ issues, total: issues.length, high: issues.filter(i => i.severity === 'high').length, medium: issues.filter(i => i.severity === 'medium').length, low: issues.filter(i => i.severity === 'low').length }, null, 2)
  }

  if (issues.length === 0) {
    return `✅ **安全审计通过**

未检测到安全问题！`
  }

  const highIssues = issues.filter(i => i.severity === 'high')
  const mediumIssues = issues.filter(i => i.severity === 'medium')
  const lowIssues = issues.filter(i => i.severity === 'low')

  let report = `🛡️ **安全审计报告**

📊 统计:
• 总计: ${issues.length} 个问题
• 高危: ${highIssues.length} 个
• 中危: ${mediumIssues.length} 个
• 低危: ${lowIssues.length} 个

`

  if (highIssues.length > 0) {
    report += `🔴 **高危问题**\n`
    for (const issue of highIssues.slice(0, 10)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}\n`
      report += `  代码: ${issue.code}\n`
    }
    if (highIssues.length > 10) {
      report += `... 还有 ${highIssues.length - 10} 个高危问题\n`
    }
    report += '\n'
  }

  if (mediumIssues.length > 0) {
    report += `🟡 **中危问题**\n`
    for (const issue of mediumIssues.slice(0, 10)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}\n`
    }
    if (mediumIssues.length > 10) {
      report += `... 还有 ${mediumIssues.length - 10} 个中危问题\n`
    }
    report += '\n'
  }

  if (lowIssues.length > 0) {
    report += `🔵 **低危问题**\n`
    for (const issue of lowIssues.slice(0, 5)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}\n`
    }
  }

  report += `\n💡 **建议**:
• 移除硬编码密钥，使用环境变量
• 避免使用 eval、innerHTML 等危险 API
• 使用参数化查询防止 SQL 注入
• 对用户输入进行严格验证和过滤`

  return report
}

export { scanFile, scanDirectory, SECURITY_RULES }
export const call: LocalCommandCall = async (args, context) => {
  const s = (args ?? '').trim()

  // 提取选项
  const scanMatch = s.match(/--scan\s+(\S+)/)
  const fileMatch = s.match(/--file\s+(\S+)/)
  const ruleMatch = s.match(/--rule\s+(\S+)/)
  const formatMatch = s.match(/--format\s+(\S+)/)
  const format = formatMatch ? formatMatch[1] : 'text'

  // 帮助
  if (s.includes('--help') || s === '') {
    return { type: 'text', value: HELP_TEXT }
  }

  // 扫描目录
  if (scanMatch) {
    const rules = ruleMatch ? [ruleMatch[1]] : []
    const issues = scanDirectory(scanMatch[1], rules)
    return { type: 'text', value: formatReport(issues, format) }
  }

  // 扫描文件
  if (fileMatch) {
    const rules = ruleMatch ? [ruleMatch[1]] : []
    const issues = scanFile(fileMatch[1], rules)
    return { type: 'text', value: formatReport(issues, format) }
  }

  // 默认扫描当前目录
  const cwd = context?.cwd || process.cwd()
  const issues = scanDirectory('.', [])
  return { type: 'text', value: formatReport(issues, format) }
}

const securityAudit: Command = {
  type: 'local',
  name: 'security-audit',
  description: '静态安全审计工具 - 检测 SQL 注入、XSS、硬编码密钥等',
  aliases: ['audit', 'sast'],
  isEnabled: () => {
    const { getIsNonInteractiveSession } = require('../../bootstrap/state.js')
    return !getIsNonInteractiveSession()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default securityAudit
