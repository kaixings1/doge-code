import { Box, Text, useInput } from 'ink'
import * as React from 'react'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, resolve, extname, basename } from 'path'

// ─── 类型定义 ───────────────────────────────────────────────

interface HealthDimension {
  name: string
  score: number // 0-100
  issues: HealthIssue[]
}

interface HealthIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  file?: string
  line?: number
}

interface HealthReport {
  overallScore: number
  grade: string // A/B/C/D/F
  dimensions: HealthDimension[]
  summary: string[]
}

// ─── 评分规则 ───────────────────────────────────────────────

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.php', '.rs']

/**
 * 计算代码复杂度（简化版：基于函数长度和嵌套层级）
 */
function analyzeComplexity(content: string): { score: number; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []
  const lines = content.split('\n')

  // 检测长函数
  let funcStart = -1
  let braceDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/(function|=>|def |func )/.test(line) && funcStart === -1) {
      funcStart = i
      braceDepth = 0
    }
    if (funcStart >= 0) {
      braceDepth += (line.match(/{/g) || []).length
      braceDepth -= (line.match(/}/g) || []).length
      if (braceDepth <= 0 && i - funcStart > 50) {
        issues.push({
          severity: 'medium',
          message: `函数过长 (${i - funcStart} 行，建议 < 50 行)`,
          line: funcStart + 1,
        })
        funcStart = -1
      }
      if (braceDepth <= 0) funcStart = -1
    }
  }

  // 检测深层嵌套
  let maxNest = 0
  for (const line of lines) {
    const indent = line.match(/^(\s+)/)
    if (indent) {
      const depth = indent[1].length / 2
      if (depth > maxNest) maxNest = depth
    }
  }
  if (maxNest > 4) {
    issues.push({
      severity: 'medium',
      message: `嵌套层级过深 (最大 ${maxNest} 层，建议 <= 4)`,
    })
  }

  const score = Math.max(0, 100 - issues.length * 10)
  return { score, issues }
}

/**
 * 检测代码异味
 */
function analyzeCodeSmells(content: string): { score: number; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []
  const lines = content.split('\n')

  const smellPatterns: Array<{ pattern: RegExp; severity: 'high' | 'medium' | 'low'; message: string }> = [
    { pattern: /\beval\s*\(/, severity: 'high', message: '使用 eval() 存在安全风险' },
    { pattern: /debugger;/, severity: 'medium', message: '残留 debugger 语句' },
    { pattern: /console\.(log|warn|error|info)\s*\(/, severity: 'low', message: '残留 console 语句' },
    { pattern: /\/\/\s*(TODO|FIXME|HACK|XXX):/i, severity: 'low', message: '未完成的 TODO/FIXME' },
    { pattern: /catch\s*\([^)]*\)\s*{\s*}/, severity: 'medium', message: '空的异常处理块' },
    { pattern: /any\b/, severity: 'low', message: '使用 any 类型（TypeScript）' },
    { pattern: /as\s+any/, severity: 'medium', message: '使用 as any 强制转换' },
    { pattern: /@ts-ignore/, severity: 'medium', message: '使用 @ts-ignore 忽略类型检查' },
    { pattern: /@ts-nocheck/, severity: 'high', message: '使用 @ts-nocheck 跳过类型检查' },
    { pattern: /var\s+\w+/, severity: 'low', message: '使用 var 声明（建议 let/const）' },
    { pattern: /==(?!=)/, severity: 'low', message: '使用 == 而非 ===' },
    { pattern: /!=(?!=)/, severity: 'low', message: '使用 != 而非 !==' },
    { pattern: /\bpassword\s*[:=]\s*['"][^'"]+['"]/i, severity: 'high', message: '硬编码密码' },
    { pattern: /\b(apiKey|api_key|secret|token)\s*[:=]\s*['"][^'"]+['"]/i, severity: 'high', message: '硬编码密钥/令牌' },
    { pattern: /innerHTML\s*=/, severity: 'high', message: '使用 innerHTML 可能导致 XSS' },
    { pattern: /dangerouslySetInnerHTML/, severity: 'high', message: '使用 dangerouslySetInnerHTML' },
    { pattern: /document\.write\s*\(/, severity: 'medium', message: '使用 document.write' },
    { pattern: /new Function\s*\(/, severity: 'high', message: '使用 new Function 构造函数' },
  ]

  lines.forEach((line, idx) => {
    for (const { pattern, severity, message } of smellPatterns) {
      if (pattern.test(line)) {
        issues.push({ severity, message, line: idx + 1 })
      }
    }
  })

  const score = Math.max(0, 100 - issues.reduce((p, i) => {
    return p + (i.severity === 'high' ? 15 : i.severity === 'medium' ? 8 : 3)
  }, 0))
  return { score, issues }
}

/**
 * 分析依赖健康（基于 package.json）
 */
function analyzeDependencyHealth(cwd: string): { score: number; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    return { score: 50, issues: [{ severity: 'info', message: '未找到 package.json' }] }
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const deps = Object.keys(pkg.dependencies || {}).length
    const devDeps = Object.keys(pkg.devDependencies || {}).length
    const total = deps + devDeps

    if (total > 100) {
      issues.push({ severity: 'medium', message: `依赖过多 (${total} 个)，建议精简` })
    }
    if (deps > 50) {
      issues.push({ severity: 'low', message: `生产依赖较多 (${deps} 个)` })
    }
    if (!pkg.scripts || !pkg.scripts.test) {
      issues.push({ severity: 'medium', message: '缺少测试脚本' })
    }
    if (!pkg.scripts || !pkg.scripts.lint) {
      issues.push({ severity: 'low', message: '缺少 lint 脚本' })
    }
  } catch {
    issues.push({ severity: 'low', message: 'package.json 解析失败' })
  }

  const score = Math.max(0, 100 - issues.reduce((p, i) => {
    return p + (i.severity === 'medium' ? 15 : 5)
  }, 0))
  return { score, issues }
}

/**
 * 分析项目结构
 */
function analyzeStructure(cwd: string): { score: number; issues: HealthIssue[] } {
  const issues: HealthIssue[] = []

  // 检查是否有 README
  const hasReadme = ['README.md', 'readme.md', 'README.MD'].some(f => existsSync(join(cwd, f)))
  if (!hasReadme) {
    issues.push({ severity: 'medium', message: '缺少 README.md' })
  }

  // 检查是否有 .gitignore
  if (!existsSync(join(cwd, '.gitignore'))) {
    issues.push({ severity: 'low', message: '缺少 .gitignore' })
  }

  // 检查是否有测试目录
  const hasTests = ['test', 'tests', '__tests__', 'spec'].some(d => existsSync(join(cwd, d)))
  if (!hasTests) {
    issues.push({ severity: 'medium', message: '缺少测试目录' })
  }

  // 检查是否有 CI 配置
  const hasCI = existsSync(join(cwd, '.github', 'workflows')) ||
    existsSync(join(cwd, '.gitlab-ci.yml')) ||
    existsSync(join(cwd, 'Jenkinsfile'))
  if (!hasCI) {
    issues.push({ severity: 'low', message: '缺少 CI/CD 配置' })
  }

  // 检查 node_modules 大小
  const nmPath = join(cwd, 'node_modules')
  if (existsSync(nmPath)) {
    try {
      const entries = readdirSync(nmPath)
      if (entries.length > 200) {
        issues.push({ severity: 'low', message: `node_modules 包含 ${entries.length} 个包，体积可能较大` })
      }
    } catch {
      // ignore
    }
  }

  const score = Math.max(0, 100 - issues.reduce((p, i) => {
    return p + (i.severity === 'medium' ? 15 : 5)
  }, 0))
  return { score, issues }
}

/**
 * 计算综合评分
 */
function calculateOverallScore(dimensions: HealthDimension[]): number {
  const weights = { '代码复杂度': 0.25, '代码质量': 0.3, '依赖健康': 0.2, '项目结构': 0.25 }
  let totalWeight = 0
  let weightedSum = 0
  for (const dim of dimensions) {
    const w = weights[dim.name as keyof typeof weights] || 0.25
    weightedSum += dim.score * w
    totalWeight += w
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#ff0000'
    case 'high': return '#ff6b35'
    case 'medium': return '#ffd700'
    case 'low': return '#87ceeb'
    default: return '#888888'
  }
}

// ─── React 组件 ─────────────────────────────────────────────

function HealthScoreReport({ cwd }: { cwd: string }) {
  const [report, setReport] = React.useState<HealthReport | null>(null)
  const [scanning, setScanning] = React.useState(true)
  const [selectedDim, setSelectedDim] = React.useState(0)

  React.useEffect(() => {
    // 执行扫描
    const dimensions: HealthDimension[] = []

    // 1. 代码复杂度 - 采样分析
    const complexityIssues: HealthIssue[] = []
    let complexityTotal = 0
    let fileCount = 0

    const scanDir = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (fileCount >= 50) break // 限制扫描文件数
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath)
          } else if (entry.isFile() && CODE_EXTENSIONS.includes(extname(entry.name))) {
            try {
              const content = readFileSync(fullPath, 'utf-8')
              const result = analyzeComplexity(content)
              complexityTotal += result.score
              complexityIssues.push(...result.issues.map(i => ({ ...i, file: entry.name })))
              fileCount++
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }
    scanDir(cwd)
    dimensions.push({
      name: '代码复杂度',
      score: fileCount > 0 ? Math.round(complexityTotal / fileCount) : 50,
      issues: complexityIssues.slice(0, 20),
    })

    // 2. 代码质量
    const smellIssues: HealthIssue[] = []
    let smellTotal = 0
    let smellFileCount = 0
    const scanDir2 = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (smellFileCount >= 50) break
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir2(fullPath)
          } else if (entry.isFile() && CODE_EXTENSIONS.includes(extname(entry.name))) {
            try {
              const content = readFileSync(fullPath, 'utf-8')
              const result = analyzeCodeSmells(content)
              smellTotal += result.score
              smellIssues.push(...result.issues.map(i => ({ ...i, file: entry.name })))
              smellFileCount++
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }
    scanDir2(cwd)
    dimensions.push({
      name: '代码质量',
      score: smellFileCount > 0 ? Math.round(smellTotal / smellFileCount) : 50,
      issues: smellIssues.slice(0, 20),
    })

    // 3. 依赖健康
    const depResult = analyzeDependencyHealth(cwd)
    dimensions.push({ name: '依赖健康', ...depResult })

    // 4. 项目结构
    const structResult = analyzeStructure(cwd)
    dimensions.push({ name: '项目结构', ...structResult })

    const overall = calculateOverallScore(dimensions)
    const grade = scoreToGrade(overall)

    const summary: string[] = []
    const criticalCount = dimensions.reduce((s, d) => s + d.issues.filter(i => i.severity === 'critical').length, 0)
    const highCount = dimensions.reduce((s, d) => s + d.issues.filter(i => i.severity === 'high').length, 0)
    if (criticalCount > 0) summary.push(`发现 ${criticalCount} 个严重问题需立即修复`)
    if (highCount > 0) summary.push(`发现 ${highCount} 个高风险问题`)
    if (overall >= 80) summary.push('项目整体健康状况良好')
    else if (overall >= 60) summary.push('项目健康状况一般，建议优化')
    else summary.push('项目健康状况较差，需要重点关注')

    setReport({ overallScore: overall, grade, dimensions, summary })
    setScanning(false)
  }, [cwd])

  useInput((input, key) => {
    if (key.upArrow && report) {
      setSelectedDim(Math.max(0, selectedDim - 1))
    }
    if (key.downArrow && report) {
      setSelectedDim(Math.min(report.dimensions.length - 1, selectedDim + 1))
    }
  })

  if (scanning) {
    return (
      <Box flexDirection="column">
        <Text color="#ffd700">🔍 正在扫描项目健康状况...</Text>
        <Text dimColor>分析中，请稍候...</Text>
      </Box>
    )
  }

  if (!report) {
    return <Text color="#ff6b35">❌ 扫描失败</Text>
  }

  const scoreColor = report.overallScore >= 80 ? '#00cc66' : report.overallScore >= 60 ? '#ffd700' : '#ff6b35'

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#444" padding={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={scoreColor}>
          📊 项目健康度评分: {report.overallScore}/100 (等级: {report.grade})
        </Text>
      </Box>

      <Box marginBottom={1}>
        {report.summary.map((s, i) => (
          <Text key={i} dimColor>{'\u2022'} {s}</Text>
        ))}
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        {report.dimensions.map((dim, i) => (
          <Box
            key={dim.name}
            borderStyle={i === selectedDim ? 'double' : 'single'}
            borderColor={i === selectedDim ? '#ffd700' : '#333'}
            paddingX={1}
            marginX={1}
          >
            <Box flexDirection="column">
              <Text bold={i === selectedDim}>{dim.name}</Text>
              <Text color={dim.score >= 80 ? '#00cc66' : dim.score >= 60 ? '#ffd700' : '#ff6b35'}>
                {dim.score}分
              </Text>
              <Text dimColor>{dim.issues.length}个问题</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="#333" paddingX={1}>
        <Text bold color="#ffd700">
          {report.dimensions[selectedDim].name} - 问题列表:
        </Text>
        {report.dimensions[selectedDim].issues.slice(0, 8).map((issue, i) => (
          <Text key={i} color={severityColor(issue.severity)}>
            {'  '}{issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : issue.severity === 'medium' ? '🟡' : '🔵'}{' '}
            {issue.file ? `${issue.file}:${issue.line} - ` : ''}{issue.message}
          </Text>
        ))}
        {report.dimensions[selectedDim].issues.length === 0 && (
          <Text color="#00cc66">  ✅ 该维度未发现问题</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ 切换维度 | ESC 退出</Text>
      </Box>
    </Box>
  )
}

export default HealthScoreReport
