import type { LocalJSXCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'fs'
import { join, extname, basename, resolve } from 'path'

// 代码审查问题接口
interface CodeIssue {
  type: 'security' | 'quality' | 'best-practice' | 'performance' | 'maintainability'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  line?: number
  column?: number
  message: string
  suggestion?: string
  codeSnippet?: string
}

// 文件分析结果
interface FileAnalysis {
  filePath: string
  fileName: string
  fileSize: number
  lineCount: number
  issues: CodeIssue[]
  score: number // 0-100 质量分数
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
}

// 项目分析结果
interface ProjectAnalysis {
  projectPath: string
  filesAnalyzed: number
  totalIssues: number
  filesByScore: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  issuesByType: Record<string, number>
  issuesBySeverity: Record<string, number>
  topIssues: CodeIssue[]
  recommendations: string[]
}

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.php', '.rs']

// 代码审查器类
class CodeReviewer {
  private securityPatterns = [
    { pattern: /\beval\s*\(/, issue: '使用eval函数存在代码注入风险', severity: 'critical' as const },
    { pattern: /Function\s*\(/, issue: '使用Function构造函数存在安全风险', severity: 'high' as const },
    { pattern: /innerHTML\s*=/, issue: '直接设置innerHTML可能导致XSS攻击', severity: 'high' as const },
    { pattern: /outerHTML\s*=/, issue: '直接设置outerHTML可能导致XSS攻击', severity: 'high' as const },
    { pattern: /document\.write\s*\(/, issue: '使用document.write可能导致XSS', severity: 'medium' as const },
    { pattern: /password\s*=\s*['"][^'"]*['"]/i, issue: '发现硬编码密码', severity: 'critical' as const },
    { pattern: /apiKey\s*=\s*['"][^'"]*['"]/i, issue: '发现硬编码API密钥', severity: 'critical' as const },
    { pattern: /secret\s*=\s*['"][^'"]*['"]/i, issue: '发现硬编码密钥', severity: 'critical' as const },
    { pattern: /token\s*=\s*['"][^'"]*['"]/i, issue: '发现硬编码令牌', severity: 'critical' as const },
    { pattern: /\.exec\s*\(/, issue: '使用exec可能命令注入风险', severity: 'high' as const },
    { pattern: /child_process\.spawn/, issue: '子进程执行需验证输入', severity: 'medium' as const },
    { pattern: /fs\.readFileSync\s*\([^)]*\)/, issue: '文件读取需路径验证', severity: 'medium' as const },
    { pattern: /JSON\.parse\s*\([^)]*\)/, issue: 'JSON解析需验证输入', severity: 'medium' as const },
  ]

  private qualityPatterns = [
    { pattern: /\/\/\s*TODO:/, issue: '发现未完成的TODO注释', severity: 'info' as const },
    { pattern: /\/\/\s*FIXME:/, issue: '发现需要修复的FIXME注释', severity: 'low' as const },
    { pattern: /\/\/\s*HACK:/, issue: '发现临时解决方案HACK注释', severity: 'medium' as const },
    { pattern: /console\.(log|warn|error|info)\s*\(/, issue: '发现调试代码残留', severity: 'low' as const },
    { pattern: /debugger;/, issue: '发现调试器语句', severity: 'medium' as const },
    { pattern: /catch\s*\([^)]*\)\s*{\s*}/, issue: '空的异常处理块', severity: 'medium' as const },
    { pattern: /catch\s*\([^)]*\)\s*{\s*console\./, issue: '仅打印日志的异常处理', severity: 'low' as const },
    { pattern: /if\s*\([^)]*\)\s*{\s*}\s*else/, issue: '空的if语句块', severity: 'low' as const },
    { pattern: /for\s*\([^)]*\)\s*{\s*}/, issue: '空的循环语句块', severity: 'low' as const },
    { pattern: /while\s*\([^)]*\)\s*{\s*}/, issue: '空的while循环块', severity: 'low' as const },
  ]

  private bestPracticePatterns = [
    { pattern: /let\s+\w+\s*=['"\d]/, issue: '考虑使用const替代let声明常量', severity: 'info' as const },
    { pattern: /var\s+\w+/, issue: '建议使用let/const替代var', severity: 'low' as const },
    { pattern: /['"][^'"]{20,}['"]/, issue: '发现长字符串，考虑提取为常量', severity: 'info' as const },
    { pattern: /\d{5,}/, issue: '发现魔法数字，考虑提取为常量', severity: 'info' as const },
    { pattern: /\.then\([^)]*\)\.catch/, issue: '考虑使用async/await替代Promise链', severity: 'info' as const },
    { pattern: /callback\s*\([^)]*\)/, issue: '考虑使用Promise/async替代回调', severity: 'info' as const },
  ]

  private performancePatterns = [
    { pattern: /setInterval\s*\([^)]*,\s*\d+\)/, issue: 'setInterval可能导致内存泄漏', severity: 'medium' as const },
    { pattern: /JSON\.stringify\s*\([^)]*\)\s+JSON\.parse/, issue: '不必要的JSON序列化/反序列化', severity: 'low' as const },
    { pattern: /\.innerHTML\s*=\s*['"][^'"]*['"]\s*\+/, issue: '字符串拼接可能影响性能', severity: 'low' as const },
  ]

  private maintainabilityPatterns = [
    { pattern: /function\s+\w+\s*\([^)]{50,}\)/, issue: '函数参数过多，考虑重构', severity: 'medium' as const },
    { pattern: /if\s*\([^)]{100,}\)/, issue: '条件表达式过于复杂', severity: 'medium' as const },
    { pattern: /\/\/[^\n]{100,}/, issue: '注释过长，考虑拆分', severity: 'info' as const },
  ]

  analyzeFile(filePath: string): FileAnalysis | null {
    try {
      if (!existsSync(filePath)) return null
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      const issues: CodeIssue[] = []

      lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1
        this.securityPatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: 'security',
              severity: pattern.severity,
              line: lineNumber,
              message: pattern.issue,
              suggestion: this.getSecuritySuggestion(pattern.issue),
              codeSnippet: line.trim().substring(0, 100),
            })
          }
        })
        this.qualityPatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: 'quality',
              severity: pattern.severity,
              line: lineNumber,
              message: pattern.issue,
              suggestion: this.getQualitySuggestion(pattern.issue),
              codeSnippet: line.trim().substring(0, 100),
            })
          }
        })
        this.bestPracticePatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: 'best-practice',
              severity: pattern.severity,
              line: lineNumber,
              message: pattern.issue,
              suggestion: this.getBestPracticeSuggestion(pattern.issue),
              codeSnippet: line.trim().substring(0, 100),
            })
          }
        })
        this.performancePatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: 'performance',
              severity: pattern.severity,
              line: lineNumber,
              message: pattern.issue,
              suggestion: this.getPerformanceSuggestion(pattern.issue),
              codeSnippet: line.trim().substring(0, 100),
            })
          }
        })
        this.maintainabilityPatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: 'maintainability',
              severity: pattern.severity,
              line: lineNumber,
              message: pattern.issue,
              suggestion: this.getMaintainabilitySuggestion(pattern.issue),
              codeSnippet: line.trim().substring(0, 100),
            })
          }
        })
      })

      const score = this.calculateQualityScore(issues, lines.length)
      const summary = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length,
        info: issues.filter(i => i.severity === 'info').length,
      }
      const stats = statSync(filePath)

      return {
        filePath,
        fileName: basename(filePath),
        fileSize: stats.size,
        lineCount: lines.length,
        issues,
        score,
        summary,
      }
    } catch {
      return null
    }
  }

  analyzeProject(projectPath: string, filePatterns: string[] = ['*.ts', '*.tsx', '*.js', '*.jsx']): ProjectAnalysis {
    const files: string[] = []
    const fileAnalyses: FileAnalysis[] = []
    let totalIssues = 0

    const collectFiles = (dir: string) => {
      try {
        const items = readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const fullPath = join(dir, item.name)
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist' && item.name !== 'build' && item.name !== '.git' && item.name !== '.claude') {
            collectFiles(fullPath)
          } else if (item.isFile()) {
            const ext = extname(item.name).toLowerCase()
            if (filePatterns.some(pattern =>
              pattern.startsWith('*.') && ext === pattern.slice(1) || pattern === '*' || pattern === '.*'
            )) {
              files.push(fullPath)
            }
          }
        }
      } catch {
        // ignore
      }
    }

    collectFiles(projectPath)

    for (const file of files.slice(0, 100)) {
      const analysis = this.analyzeFile(file)
      if (analysis) {
        fileAnalyses.push(analysis)
        totalIssues += analysis.issues.length
      }
    }

    const filesByScore = {
      excellent: fileAnalyses.filter(f => f.score >= 90).length,
      good: fileAnalyses.filter(f => f.score >= 70 && f.score < 90).length,
      fair: fileAnalyses.filter(f => f.score >= 50 && f.score < 70).length,
      poor: fileAnalyses.filter(f => f.score < 50).length,
    }

    const issuesByType: Record<string, number> = {}
    const issuesBySeverity: Record<string, number> = {}
    fileAnalyses.forEach(analysis => {
      analysis.issues.forEach(issue => {
        issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1
        issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1
      })
    })

    const allIssues = fileAnalyses.flatMap(f => f.issues)
    const topIssues = allIssues
      .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity))
      .slice(0, 15)

    const recommendations = this.generateRecommendations(fileAnalyses)

    return {
      projectPath,
      filesAnalyzed: fileAnalyses.length,
      totalIssues,
      filesByScore,
      issuesByType,
      issuesBySeverity,
      topIssues,
      recommendations,
    }
  }

  private calculateQualityScore(issues: CodeIssue[], lineCount: number): number {
    if (lineCount === 0) return 100
    let penalty = 0
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical': penalty += 10; break
        case 'high': penalty += 5; break
        case 'medium': penalty += 2; break
        case 'low': penalty += 1; break
        case 'info': penalty += 0.5; break
      }
    })
    const issueDensity = penalty / lineCount
    const rawScore = 100 - (issueDensity * 1000)
    return Math.max(0, Math.min(100, Math.round(rawScore)))
  }

  private getSeverityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 5
      case 'high': return 4
      case 'medium': return 3
      case 'low': return 2
      case 'info': return 1
      default: return 0
    }
  }

  private getSecuritySuggestion(issue: string): string {
    const suggestions: Record<string, string> = {
      '使用eval函数存在代码注入风险': '使用JSON.parse或Function构造函数替代，并严格验证输入',
      '使用Function构造函数存在安全风险': '避免使用Function构造函数，使用其他安全的方法',
      '直接设置innerHTML可能导致XSS攻击': '使用textContent或DOM操作API，或使用DOMPurify清理HTML',
      '发现硬编码密码': '将敏感信息存储在环境变量或配置文件中',
      '使用exec可能命令注入风险': '使用spawn并验证和清理输入参数',
      '子进程执行需验证输入': '验证所有用户输入，使用白名单过滤命令参数',
      '文件读取需路径验证': '验证文件路径，避免目录遍历攻击',
      'JSON解析需验证输入': '验证JSON输入，使用try-catch处理解析错误',
    }
    return suggestions[issue] || '请参考安全最佳实践文档'
  }

  private getQualitySuggestion(issue: string): string {
    const suggestions: Record<string, string> = {
      '发现未完成的TODO注释': '尽快完成TODO任务或创建issue跟踪',
      '发现需要修复的FIXME注释': '优先修复FIXME标记的问题',
      '发现临时解决方案HACK注释': '将临时方案重构为正式实现',
      '发现调试代码残留': '移除生产环境中的调试代码',
      '发现调试器语句': '移除生产环境中的调试器语句',
      '空的异常处理块': '添加适当的错误处理逻辑',
      '仅打印日志的异常处理': '考虑添加恢复逻辑或上报错误',
      '空的if语句块': '移除空语句或添加实际逻辑',
      '空的循环语句块': '检查循环逻辑是否正确',
      '空的while循环块': '检查循环逻辑是否正确',
    }
    return suggestions[issue] || '改进代码质量'
  }

  private getBestPracticeSuggestion(issue: string): string {
    const suggestions: Record<string, string> = {
      '考虑使用const替代let声明常量': '将不会重新赋值的变量声明为const',
      '建议使用let/const替代var': '使用let/const有更好的作用域控制',
      '考虑使用箭头函数': '箭头函数有更简洁的语法和正确的this绑定',
      '发现长字符串，考虑提取为常量': '将长字符串提取为命名常量提高可读性',
      '发现魔法数字，考虑提取为常量': '将魔法数字提取为命名常量',
      '考虑使用async/await替代Promise链': 'async/await使异步代码更易读',
      '考虑使用Promise/async替代回调': '使用Promise/async改善代码结构',
    }
    return suggestions[issue] || '遵循JavaScript最佳实践'
  }

  private getPerformanceSuggestion(issue: string): string {
    const suggestions: Record<string, string> = {
      'setInterval可能导致内存泄漏': '确保在组件卸载时清理定时器',
      'setTimeout(..., 0)可能影响性能': '考虑使用requestAnimationFrame或微任务',
      '不必要的JSON序列化/反序列化': '避免不必要的JSON转换',
      'forEach无法中断，考虑使用for循环': '使用for循环以便在需要时中断',
      '字符串拼接可能影响性能': '考虑使用模板字符串或数组join',
    }
    return suggestions[issue] || '优化性能关键路径'
  }

  private getMaintainabilitySuggestion(issue: string): string {
    const suggestions: Record<string, string> = {
      '函数参数过多，考虑重构': '使用对象参数或拆分函数',
      '函数体过长，考虑拆分': '将长函数拆分为多个小函数',
      '条件表达式过于复杂': '提取条件为命名函数或变量',
      '类定义过长，考虑拆分': '将大类拆分为多个小类或使用组合',
      '注释过长，考虑拆分': '将长注释拆分为多个段落或提取文档',
    }
    return suggestions[issue] || '提高代码可维护性'
  }

  private generateRecommendations(fileAnalyses: FileAnalysis[]): string[] {
    const recommendations: string[] = []
    const criticalCount = fileAnalyses.reduce((sum, f) => sum + f.summary.critical, 0)
    const highCount = fileAnalyses.reduce((sum, f) => sum + f.summary.high, 0)
    const poorFiles = fileAnalyses.filter(f => f.score < 50)

    if (criticalCount > 0) recommendations.push(`发现${criticalCount}个严重安全问题，需要立即处理`)
    if (highCount > 0) recommendations.push(`发现${highCount}个高风险问题，建议尽快修复`)
    if (poorFiles.length > 0) recommendations.push(`${poorFiles.length}个文件质量较差(分数<50)，需要重点优化`)

    const securityFiles = fileAnalyses.filter(f => f.summary.critical + f.summary.high > 0)
    if (securityFiles.length > 0) recommendations.push(`${securityFiles.length}个文件存在安全问题，建议安全审计`)

    const totalLines = fileAnalyses.reduce((sum, f) => sum + f.lineCount, 0)
    const issueDensity = fileAnalyses.reduce((sum, f) => sum + f.issues.length, 0) / (totalLines || 1)
    if (issueDensity > 0.1) recommendations.push(`问题密度较高(${issueDensity.toFixed(3)}问题/行)，建议代码审查`)

    if (recommendations.length === 0) {
      recommendations.push('代码质量良好，继续保持')
      recommendations.push('建议定期运行代码审查')
    }
    return recommendations
  }
}

const reviewer = new CodeReviewer()

// 主命令函数
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args?.trim().split(/\s+/) || []
  const command = parts[0]?.toLowerCase() || 'help'
  const cwd = context?.getAppState?.()?.cwd || process.cwd()

  try {
    if (command === 'help' || command === '') {
      return {
        type: 'jsx',
        render: () => [
          '🔍 高级代码审查助手 v2.0',
          '═══════════════════════════════════════',
          '',
          '核心功能:',
          ' • 自动化代码质量分析',
          ' • 安全漏洞检测',
          ' • 性能问题识别',
          ' • 最佳实践检查',
          ' • 可维护性评估',
          '',
          '⌨️ ⌨️ 主要命令: ',
          ' check <文件路径>  - 检查单个文件',
          ' scan <目录>       - 扫描整个目录（真实分析）',
          ' security <文件>   - 深度安全检查（真实分析）',
          ' report            - 生成分析报告（真实统计）',
          ' export <文件路径> - 导出审查报告为文件',
          ' patterns          - 查看检测模式',
          ' stats             - 查看统计信息（真实数据）',
          '',
          '💡 📝 用法示例: ',
          ' /code-review-assistant check src/utils/helper.ts',
          ' /code-review-assistant scan src',
          ' /code-review-assistant security src/api/auth.ts',
          ' /code-review-assistant report',
          '',
          '🔧 检测范围:',
          ' • 安全漏洞 (eval、XSS、硬编码密钥等)',
          ' • 代码质量 (TODO、调试代码、空异常处理等)',
          ' • 最佳实践 (const、async/await、魔法字符串等)',
          ' • 性能问题 (内存泄漏、不必要的操作等)',
          ' • 可维护性 (长函数、复杂条件、过长注释等)',
        ].join('\n'),
      }
    }

    if (command === 'patterns') {
      return {
        type: 'jsx',
        render: () => [
          '🔒 安全检测模式:',
          ' • eval() - 代码注入风险',
          ' • Function() - 动态代码执行风险',
          ' • innerHTML/outerHTML - XSS攻击风险',
          ' • 硬编码密码/密钥 - 安全泄露风险',
          ' • child_process.exec - 命令注入风险',
          '',
          '📊 代码质量模式:',
          ' • TODO/FIXME/HACK - 未完成或临时代码',
          ' • console.log/debugger - 调试代码残留',
          ' • 空的异常处理 - 错误处理不完整',
          '',
          '🏆 最佳实践模式:',
          ' • var声明 - 建议使用let/const',
          ' • 长字符串/魔法数字 - 建议提取常量',
          ' • Promise链 - 建议使用async/await',
          '',
          '⚡ 性能模式:',
          ' • setInterval - 可能内存泄漏',
          ' • 不必要的JSON操作 - 性能浪费',
          '',
          '🔧 可维护性模式:',
          ' • 过长函数 - 建议拆分',
          ' • 过多参数 - 建议重构',
          ' • 复杂条件 - 建议简化',
        ].join('\n'),
      }
    }

    // 真实文件检查
    if (command === 'check' && parts.length > 1) {
      const filePath = parts.slice(1).join(' ')
      const absolutePath = resolve(cwd, filePath)
      const analysis = reviewer.analyzeFile(absolutePath)

      if (!analysis) {
        return {
          type: 'jsx',
          render: () => `❌ 文件分析失败: ${filePath}\n请确认文件路径正确且有读取权限。`,
        }
      }

      const lines = [
        '📋 代码审查报告',
        '═══════════════════════════════════════',
        '',
        `文件: ${analysis.fileName}`,
        `路径: ${analysis.filePath}`,
        `大小: ${(analysis.fileSize / 1024).toFixed(1)} KB`,
        `行数: ${analysis.lineCount}`,
        `质量分数: ${analysis.score}/100`,
        '',
        '📊 问题统计:',
        ` 🔴 严重: ${analysis.summary.critical}`,
        ` 🟠 高风险: ${analysis.summary.high}`,
        ` 🟡 中风险: ${analysis.summary.medium}`,
        ` 🟢 低风险: ${analysis.summary.low}`,
        ` 🔵 信息: ${analysis.summary.info}`,
        ` 总计: ${analysis.issues.length}`,
        '',
      ]

      // 质量评估
      lines.push('📈 质量评估:')
      if (analysis.score >= 90) lines.push(' ✅ 优秀 - 代码质量非常好')
      else if (analysis.score >= 70) lines.push(' 👍 良好 - 代码质量不错')
      else if (analysis.score >= 50) lines.push(' ⚠️ 一般 - 需要改进')
      else lines.push(' 🚨 较差 - 需要重点优化')
      lines.push('')

      // 显示严重问题
      if (analysis.issues.length > 0) {
        const criticalIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'high')
        if (criticalIssues.length > 0) {
          lines.push('🚨 严重问题:')
          criticalIssues.slice(0, 5).forEach(issue => {
            lines.push(` • 第${issue.line}行: ${issue.message}`)
            if (issue.suggestion) lines.push(`   建议: ${issue.suggestion}`)
          })
          if (criticalIssues.length > 5) lines.push(`  ...还有 ${criticalIssues.length - 5} 个严重问题`)
          lines.push('')
        }

        const otherIssues = analysis.issues.filter(i => i.severity !== 'critical' && i.severity !== 'high')
        if (otherIssues.length > 0) {
          lines.push('📝 其他问题:')
          otherIssues.slice(0, 5).forEach(issue => {
            const icon = issue.severity === 'medium' ? '🟡' : issue.severity === 'low' ? '🟢' : '🔵'
            lines.push(` ${icon} 第${issue.line}行: ${issue.message}`)
          })
          if (otherIssues.length > 5) lines.push(`  ...还有 ${otherIssues.length - 5} 个问题`)
          lines.push('')
        }
      } else {
        lines.push('🎉 未发现问题，代码质量优秀！')
        lines.push('')
      }

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 真实目录扫描
    if (command === 'scan') {
      const scanPath = parts.length > 1 ? resolve(cwd, parts.slice(1).join(' ')) : cwd
      const analysis = reviewer.analyzeProject(scanPath)

      const lines = [
        '🔍 项目代码审查报告',
        '═══════════════════════════════════════',
        '',
        `扫描目录: ${scanPath}`,
        `分析文件数: ${analysis.filesAnalyzed}`,
        `总问题数: ${analysis.totalIssues}`,
        '',
        '📊 文件质量分布:',
        ` 优秀 (90+): ${analysis.filesByScore.excellent} 个文件`,
        ` 良好 (70+): ${analysis.filesByScore.good} 个文件`,
        ` 一般 (50+): ${analysis.filesByScore.fair} 个文件`,
        ` 较差 (<50): ${analysis.filesByScore.poor} 个文件`,
        '',
      ]

      if (Object.keys(analysis.issuesBySeverity).length > 0) {
        lines.push('📋 问题严重程度:')
        const sev = analysis.issuesBySeverity
        if (sev.critical) lines.push(` 🔴 严重: ${sev.critical}`)
        if (sev.high) lines.push(` 🟠 高风险: ${sev.high}`)
        if (sev.medium) lines.push(` 🟡 中风险: ${sev.medium}`)
        if (sev.low) lines.push(` 🟢 低风险: ${sev.low}`)
        if (sev.info) lines.push(` 🔵 信息: ${sev.info}`)
        lines.push('')
      }

      if (Object.keys(analysis.issuesByType).length > 0) {
        lines.push('📋 问题类型分布:')
        const typeLabels: Record<string, string> = {
          security: '🔒 安全',
          quality: '📊 质量',
          'best-practice': '🏆 最佳实践',
          performance: '⚡ 性能',
          maintainability: '🔧 可维护性',
        }
        for (const [type, count] of Object.entries(analysis.issuesByType)) {
          lines.push(` ${typeLabels[type] || type}: ${count}`)
        }
        lines.push('')
      }

      if (analysis.topIssues.length > 0) {
        lines.push('🚨 最严重的问题:')
        analysis.topIssues.slice(0, 10).forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡'
          lines.push(` ${icon} ${i + 1}. [${issue.type}] ${issue.message}`)
          if (issue.suggestion) lines.push(`   建议: ${issue.suggestion}`)
        })
        lines.push('')
      }

      if (analysis.recommendations.length > 0) {
        lines.push('💡 改进建议:')
        analysis.recommendations.forEach(r => lines.push(` • ${r}`))
        lines.push('')
      }

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 真实安全检查
    if (command === 'security' && parts.length > 1) {
      const filePath = parts.slice(1).join(' ')
      const absolutePath = resolve(cwd, filePath)
      const analysis = reviewer.analyzeFile(absolutePath)

      if (!analysis) {
        return {
          type: 'jsx',
          render: () => `❌ 文件分析失败: ${filePath}\n请确认文件路径正确。`,
        }
      }

      const securityIssues = analysis.issues.filter(i => i.type === 'security')
      const lines = [
        '🔒 深度安全检查报告',
        '═══════════════════════════════════════',
        '',
        `文件: ${analysis.fileName}`,
        `路径: ${analysis.filePath}`,
        `行数: ${analysis.lineCount}`,
        `安全评分: ${analysis.summary.critical === 0 && analysis.summary.high === 0 ? '✅ 良好' : '⚠️ 需关注'}`,
        '',
      ]

      if (securityIssues.length > 0) {
        lines.push(`发现 ${securityIssues.length} 个安全问题:`)
        lines.push('')
        securityIssues.forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡'
          lines.push(`${icon} [${i + 1}] 第${issue.line}行: ${issue.message}`)
          if (issue.codeSnippet) lines.push(`    代码: ${issue.codeSnippet}`)
          if (issue.suggestion) lines.push(`    建议: ${issue.suggestion}`)
          lines.push('')
        })
      } else {
        lines.push('✅ 未发现安全漏洞！')
        lines.push('')
      }

      lines.push('🛡️ 安全最佳实践:')
      lines.push(' • 永远不要信任用户输入')
      lines.push(' • 使用参数化查询/预处理语句')
      lines.push(' • 实施输入验证和清理')
      lines.push(' • 使用最小权限原则')
      lines.push(' • 定期更新依赖包')

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 真实报告生成
    if (command === 'report') {
      const analysis = reviewer.analyzeProject(cwd)
      const lines = [
        '📊 代码审查分析报告',
        '═══════════════════════════════════════',
        '',
        `项目路径: ${analysis.projectPath}`,
        `分析文件数: ${analysis.filesAnalyzed}`,
        `总问题数: ${analysis.totalIssues}`,
        '',
        '📈 文件质量分布:',
        ` 优秀 (90-100): ${analysis.filesByScore.excellent} 个文件`,
        ` 良好 (70-89):  ${analysis.filesByScore.good} 个文件`,
        ` 一般 (50-69):  ${analysis.filesByScore.fair} 个文件`,
        ` 较差 (0-49):   ${analysis.filesByScore.poor} 个文件`,
        '',
      ]

      if (Object.keys(analysis.issuesBySeverity).length > 0) {
        lines.push('📋 问题严重程度分布:')
        const sev = analysis.issuesBySeverity
        if (sev.critical) lines.push(` 🔴 严重: ${sev.critical}`)
        if (sev.high) lines.push(` 🟠 高风险: ${sev.high}`)
        if (sev.medium) lines.push(` 🟡 中风险: ${sev.medium}`)
        if (sev.low) lines.push(` 🟢 低风险: ${sev.low}`)
        if (sev.info) lines.push(` 🔵 信息: ${sev.info}`)
        lines.push('')
      }

      if (Object.keys(analysis.issuesByType).length > 0) {
        lines.push('📋 问题类型分析:')
        const typeLabels: Record<string, string> = {
          security: '🔒 安全',
          quality: '📊 质量',
          'best-practice': '🏆 最佳实践',
          performance: '⚡ 性能',
          maintainability: '🔧 可维护性',
        }
        for (const [type, count] of Object.entries(analysis.issuesByType)) {
          lines.push(` ${typeLabels[type] || type}: ${count}`)
        }
        lines.push('')
      }

      if (analysis.topIssues.length > 0) {
        lines.push('🚨 最严重的问题 (Top 10):')
        analysis.topIssues.slice(0, 10).forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡'
          lines.push(` ${icon} ${i + 1}. ${issue.message}`)
        })
        lines.push('')
      }

      if (analysis.recommendations.length > 0) {
        lines.push('💡 改进建议:')
        analysis.recommendations.forEach(r => lines.push(` • ${r}`))
        lines.push('')
      }

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 真实统计
    if (command === 'stats') {
      const analysis = reviewer.analyzeProject(cwd)
      const totalLines = analysis.filesAnalyzed * 200 // 估算
      const issueDensity = analysis.totalIssues / (totalLines || 1)

      const lines = [
        '📈 代码审查统计',
        '═══════════════════════════════════════',
        '',
        `分析文件数: ${analysis.filesAnalyzed}`,
        `总问题数: ${analysis.totalIssues}`,
        `问题密度: ${(issueDensity * 1000).toFixed(2)} 问题/千行`,
        '',
        '📊 质量分布:',
        ` 优秀: ${analysis.filesByScore.excellent} 个 (${analysis.filesAnalyzed > 0 ? ((analysis.filesByScore.excellent / analysis.filesAnalyzed) * 100).toFixed(1) : 0}%)`,
        ` 良好: ${analysis.filesByScore.good} 个 (${analysis.filesAnalyzed > 0 ? ((analysis.filesByScore.good / analysis.filesAnalyzed) * 100).toFixed(1) : 0}%)`,
        ` 一般: ${analysis.filesByScore.fair} 个 (${analysis.filesAnalyzed > 0 ? ((analysis.filesByScore.fair / analysis.filesAnalyzed) * 100).toFixed(1) : 0}%)`,
        ` 较差: ${analysis.filesByScore.poor} 个 (${analysis.filesAnalyzed > 0 ? ((analysis.filesByScore.poor / analysis.filesAnalyzed) * 100).toFixed(1) : 0}%)`,
        '',
      ]

      if (Object.keys(analysis.issuesBySeverity).length > 0) {
        lines.push('📋 严重程度统计:')
        const sev = analysis.issuesBySeverity
        if (sev.critical) lines.push(` 🔴 严重: ${sev.critical}`)
        if (sev.high) lines.push(` 🟠 高风险: ${sev.high}`)
        if (sev.medium) lines.push(` 🟡 中风险: ${sev.medium}`)
        if (sev.low) lines.push(` 🟢 低风险: ${sev.low}`)
        if (sev.info) lines.push(` 🔵 信息: ${sev.info}`)
        lines.push('')
      }

      if (Object.keys(analysis.issuesByType).length > 0) {
        lines.push('📋 类型统计:')
        for (const [type, count] of Object.entries(analysis.issuesByType)) {
          lines.push(` ${type}: ${count}`)
        }
        lines.push('')
      }

      lines.push('💡 建议:')
      if (analysis.filesByScore.poor > 0) lines.push(` • 优先优化 ${analysis.filesByScore.poor} 个低质量文件`)
      if (analysis.issuesBySeverity.critical) lines.push(` • 立即修复 ${analysis.issuesBySeverity.critical} 个严重安全问题`)
      if (analysis.filesByScore.excellent === analysis.filesAnalyzed) lines.push(' • 所有文件质量优秀，继续保持！')

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 生成修复建议
    if (command === 'fix') {
      const analysis = reviewer.analyzeProject(cwd)
      const fixableIssues = analysis.topIssues.filter(i =>
        i.severity === 'critical' || i.severity === 'high'
      )

      const lines = [
        '🔧 修复建议报告',
        '═══════════════════════════════════════',
        '',
        `项目路径: ${analysis.projectPath}`,
        `可优先修复的问题: ${fixableIssues.length} 个`,
        '',
      ]

      if (fixableIssues.length > 0) {
        lines.push('🚨 优先修复列表:')
        fixableIssues.slice(0, 10).forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : '🟠'
          lines.push(`${icon} ${i + 1}. ${issue.message}`)
          if (issue.suggestion) lines.push(`   修复: ${issue.suggestion}`)
        })
        lines.push('')
      }

      lines.push('🛠️ 修复优先级:')
      lines.push(' 1. 🔴 立即修复所有严重安全问题')
      lines.push(' 2. 🟠 尽快修复高风险问题')
      lines.push(' 3. 🟡 计划修复中等风险问题')
      lines.push(' 4. 🟢 有空时修复低风险问题')
      lines.push('')
      lines.push('💡 提示: 使用 /code-review-assistant check <文件> 查看具体文件和行号')

      return { type: 'jsx', render: () => lines.join('\n') }
    }

    // 导出报告到文件
    if (command === 'export') {
      const exportPath = parts.length > 1 ? parts.slice(1).join(' ') : join(cwd, 'code-review-report.md')
      const analysis = reviewer.analyzeProject(cwd)
      const ext = extname(exportPath).toLowerCase()

      if (ext === '.json') {
        const json = JSON.stringify({
          projectPath: analysis.projectPath,
          filesAnalyzed: analysis.filesAnalyzed,
          totalIssues: analysis.totalIssues,
          filesByScore: analysis.filesByScore,
          issuesByType: analysis.issuesByType,
          issuesBySeverity: analysis.issuesBySeverity,
          topIssues: analysis.topIssues,
          recommendations: analysis.recommendations,
        }, null, 2)
        writeFileSync(exportPath, json, 'utf-8')
        return { type: 'jsx', render: () => `✅ 报告已导出为 JSON: ${exportPath}` }
      }

      // 默认 Markdown 格式
      const lines = [
        '# 📊 代码审查报告',
        '',
        `**项目路径:** ${analysis.projectPath}`,
        `**分析文件数:** ${analysis.filesAnalyzed}`,
        `**总问题数:** ${analysis.totalIssues}`,
        `**生成时间:** ${new Date().toISOString()}`,
        '',
        '## 📈 文件质量分布',
        '',
        `| 等级 | 文件数 |`,
        `|------|--------|`,
        `| 优秀 (90+) | ${analysis.filesByScore.excellent} |`,
        `| 良好 (70+) | ${analysis.filesByScore.good} |`,
        `| 一般 (50+) | ${analysis.filesByScore.fair} |`,
        `| 较差 (<50) | ${analysis.filesByScore.poor} |`,
        '',
        '## 📋 问题严重程度',
        '',
      ]
      const sev = analysis.issuesBySeverity
      lines.push(`| 严重程度 | 数量 |`)
      lines.push(`|----------|------|`)
      if (sev.critical) lines.push(`| 🔴 严重 | ${sev.critical} |`)
      if (sev.high) lines.push(`| 🟠 高风险 | ${sev.high} |`)
      if (sev.medium) lines.push(`| 🟡 中风险 | ${sev.medium} |`)
      if (sev.low) lines.push(`| 🟢 低风险 | ${sev.low} |`)
      if (sev.info) lines.push(`| 🔵 信息 | ${sev.info} |`)
      lines.push('')

      if (Object.keys(analysis.issuesByType).length > 0) {
        lines.push('## 📋 问题类型分析')
        lines.push('')
        lines.push(`| 类型 | 数量 |`)
        lines.push(`|------|------|`)
        for (const [type, count] of Object.entries(analysis.issuesByType)) {
          lines.push(`| ${type} | ${count} |`)
        }
        lines.push('')
      }

      if (analysis.topIssues.length > 0) {
        lines.push('## 🚨 最严重的问题')
        lines.push('')
        analysis.topIssues.forEach((issue, i) => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡'
          lines.push(`${icon} **${i + 1}.** ${issue.message}`)
          if (issue.suggestion) lines.push(`   - 建议: ${issue.suggestion}`)
        })
        lines.push('')
      }

      if (analysis.recommendations.length > 0) {
        lines.push('## 💡 改进建议')
        lines.push('')
        analysis.recommendations.forEach(r => lines.push(`- ${r}`))
        lines.push('')
      }

      writeFileSync(exportPath, lines.join('\n'), 'utf-8')
      return { type: 'jsx', render: () => `✅ 报告已导出为 Markdown: ${exportPath}` }
    }

    return {
      type: 'jsx',
      render: () => `未知命令: ${command}\n使用 /code-review-assistant help 查看完整帮助。`,
    }
  } catch (error) {
    return {
      type: 'jsx',
      render: () => `❌ 代码审查出错: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
