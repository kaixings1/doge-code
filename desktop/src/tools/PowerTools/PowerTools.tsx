// ============================================================================
// PowerTools — 吸收20大代理优秀功能的核心工具集
// 将 CLI 专业代理的核心能力集成到桌面应用
// ============================================================================

import type { Tool, ToolUseContext } from '../../Tool.js'
import { z } from 'zod/v4'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'node:child_process'

// ============================================================================
// 1. CodeQualityTool — 代码质量分析（吸收 code-reviewer 能力）
// ============================================================================

const CodeQualityInputSchema = z.object({
  action: z.enum(['analyze', 'review', 'complexity', 'duplication', 'smells']).describe('分析类型'),
  path: z.string().describe('要分析的文件或目录路径'),
  depth: z.number().optional().describe('分析深度（默认3）'),
})

export const CodeQualityTool: Tool = {
  name: 'CodeQuality',
  description: `代码质量分析工具 — 分析代码质量、复杂度、重复代码和代码异味。
- analyze: 综合分析代码质量
- review: 代码审查，提供改进建议
- complexity: 分析代码复杂度
- duplication: 检测重复代码
- smells: 检测代码异味和反模式`,

  inputSchema: CodeQualityInputSchema,

  async call(input: z.infer<typeof CodeQualityInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath, depth = 3 } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: `❌ 路径不存在: ${resolvedPath}` }
    }

    const lines: string[] = ['# 🔍 代码质量分析报告\n']

    try {
      const isDir = fs.statSync(resolvedPath).isDirectory()
      const target = isDir ? `${resolvedPath}/**/*.{ts,tsx,js,jsx}` : resolvedPath

      switch (action) {
        case 'analyze':
          return analyzeCodeQuality(resolvedPath, isDir)
        case 'review':
          return reviewCode(resolvedPath, isDir)
        case 'complexity':
          return analyzeComplexity(resolvedPath, isDir)
        case 'duplication':
          return detectDuplication(resolvedPath, isDir)
        case 'smells':
          return detectCodeSmells(resolvedPath, isDir)
        default:
          return { type: 'text', value: `❌ 未知操作: ${action}` }
      }
    } catch (err) {
      return { type: 'text', value: `❌ 分析失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

function analyzeCodeQuality(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 📊 代码质量综合分析\n']

  // 文件统计
  let fileCount = 0
  let totalLines = 0
  let codeLines = 0
  let commentLines = 0
  let emptyLines = 0

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
          scanDir(fullPath)
        }
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        fileCount++
        const content = fs.readFileSync(fullPath, 'utf-8')
        const fileLines = content.split('\n')
        totalLines += fileLines.length
        for (const line of fileLines) {
          const trimmed = line.trim()
          if (trimmed === '') emptyLines++
          else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) commentLines++
          else codeLines++
        }
      }
    }
  }

  if (isDir) {
    scanDir(targetPath)
  } else {
    fileCount = 1
    const content = fs.readFileSync(targetPath, 'utf-8')
    const fileLines = content.split('\n')
    totalLines = fileLines.length
    for (const line of fileLines) {
      const trimmed = line.trim()
      if (trimmed === '') emptyLines++
      else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) commentLines++
      else codeLines++
    }
  }

  const commentRatio = totalLines > 0 ? ((commentLines / totalLines) * 100).toFixed(1) : '0'
  const avgLinesPerFile = fileCount > 0 ? Math.round(totalLines / fileCount) : 0

  lines.push(`## 📈 统计概览`)
  lines.push(`- 文件数: ${fileCount}`)
  lines.push(`- 总行数: ${totalLines.toLocaleString()}`)
  lines.push(`- 代码行: ${codeLines.toLocaleString()}`)
  lines.push(`- 注释行: ${commentLines.toLocaleString()} (${commentRatio}%)`)
  lines.push(`- 空行: ${emptyLines.toLocaleString()}`)
  lines.push(`- 平均文件行数: ${avgLinesPerFile}`)
  lines.push('')

  // 质量评估
  lines.push(`## 🎯 质量评估`)
  const commentNum = parseFloat(commentRatio)
  if (commentNum < 5) lines.push(`- ⚠️ 注释率偏低（${commentRatio}%），建议增加注释`)
  else if (commentNum > 30) lines.push(`- ⚠️ 注释率偏高（${commentRatio}%），可能有过时注释`)
  else lines.push(`- ✅ 注释率适中（${commentRatio}%）`)

  if (avgLinesPerFile > 300) lines.push(`- ⚠️ 平均文件行数过多（${avgLinesPerFile}），建议拆分大文件`)
  else lines.push(`- ✅ 平均文件行数合理（${avgLinesPerFile}）`)

  return { type: 'text', value: lines.join('\n') }
}

function reviewCode(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 👁️ 代码审查报告\n']

  const issues: string[] = []
  let filesChecked = 0

  function checkFile(filePath: string) {
    filesChecked++
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    // 检查各种问题
    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()
      if (line.length > 120) issues.push(`${filePath}:${idx + 1} — 行过长（${line.length}字符）`)
      if (trimmed.includes('TODO') || trimmed.includes('FIXME')) issues.push(`${filePath}:${idx + 1} — 待办事项: ${trimmed.slice(0, 60)}`)
      if (trimmed.includes('console.log')) issues.push(`${filePath}:${idx + 1} — 包含 console.log`)
      if (trimmed.includes('any') && trimmed.includes(':')) issues.push(`${filePath}:${idx + 1} — 使用 any 类型`)
      if (trimmed.startsWith('import') && trimmed.includes(' from') && trimmed.includes("'../")) issues.push(`${filePath}:${idx + 1} — 使用相对路径导入`)
    })

    // 检查函数长度
    let funcStart = -1
    let funcLines = 0
    let braceCount = 0
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i]
      if (line.match(/^(function|const\s+\w+\s*=|\w+\s*\()/)) {
        funcStart = i
        funcLines = 0
        braceCount = 0
      }
      if (funcStart >= 0) {
        funcLines++
        for (const ch of line) {
          if (ch === '{') braceCount++
          if (ch === '}') braceCount--
        }
        if (braceCount === 0 && funcLines > 50) {
          issues.push(`${filePath}:${funcStart + 1} — 函数过长（${funcLines}行）`)
          funcStart = -1
        }
      }
    }
  }

  if (isDir) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            scanDir(fullPath)
          }
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  lines.push(`## 📋 审查结果`)
  lines.push(`- 检查文件数: ${filesChecked}`)
  lines.push(`- 发现问题数: ${issues.length}`)
  lines.push('')

  if (issues.length === 0) {
    lines.push('## ✅ 未发现明显问题')
  } else {
    lines.push(`## ⚠️ 发现的问题（前20条）`)
    issues.slice(0, 20).forEach(issue => lines.push(`- ${issue}`))
    if (issues.length > 20) {
      lines.push(`\n... 还有 ${issues.length - 20} 个问题未显示`)
    }
  }

  return { type: 'text', value: lines.join('\n') }
}

function analyzeComplexity(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 📐 代码复杂度分析\n']

  const fileComplexities: Array<{ file: string; complexity: number; lines: number }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')
    let complexity = 1 // 基础复杂度
    let inFunction = false

    for (const line of fileLines) {
      const trimmed = line.trim()
      // 计算圈复杂度
      if (/\b(if|else\s+if|while|for|switch|catch|\?)\b/.test(trimmed)) complexity++
      if (/\b(&&|\|\|)\b/.test(trimmed)) complexity++
      if (/\bcase\s+/.test(trimmed)) complexity++
    }

    fileComplexities.push({
      file: filePath,
      complexity,
      lines: fileLines.length,
    })
  }

  if (isDir) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            scanDir(fullPath)
          }
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  // 按复杂度排序
  fileComplexities.sort((a, b) => b.complexity - a.complexity)

  lines.push(`## 📊 复杂度排名（前15个文件）`)
  lines.push('')
  lines.push('| 文件 | 复杂度 | 行数 | 风险 |')
  lines.push('|------|--------|------|------|')

  for (const fc of fileComplexities.slice(0, 15)) {
    const risk = fc.complexity > 20 ? '🔴 高' : fc.complexity > 10 ? '🟡 中' : '🟢 低'
    lines.push(`| ${path.basename(fc.file)} | ${fc.complexity} | ${fc.lines} | ${risk} |`)
  }

  const avgComplexity = fileComplexities.length > 0
    ? (fileComplexities.reduce((sum, fc) => sum + fc.complexity, 0) / fileComplexities.length).toFixed(1)
    : '0'
  const highComplexity = fileComplexities.filter(fc => fc.complexity > 20).length

  lines.push('')
  lines.push(`## 📈 汇总`)
  lines.push(`- 平均圈复杂度: ${avgComplexity}`)
  lines.push(`- 高复杂度文件: ${highComplexity} 个`)
  lines.push(`- 总文件数: ${fileComplexities.length}`)

  return { type: 'text', value: lines.join('\n') }
}

function detectDuplication(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 🔄 重复代码检测\n']

  const blocks = new Map<string, string[]>()

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    // 检测重复的代码块（5行以上）
    for (let i = 0; i < fileLines.length - 5; i++) {
      const block = fileLines.slice(i, i + 5).join('\n').trim()
      if (block.length > 50 && !block.includes('import') && !block.includes('export')) {
        const existing = blocks.get(block) || []
        existing.push(`${filePath}:${i + 1}`)
        blocks.set(block, existing)
      }
    }
  }

  if (isDir) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  const duplicates = Array.from(blocks.entries()).filter(([, locs]) => locs.length > 1)

  lines.push(`## 📋 结果`)
  lines.push(`- 检测到的重复块: ${duplicates.length}`)
  lines.push('')

  if (duplicates.length === 0) {
    lines.push('## ✅ 未发现明显重复代码')
  } else {
    lines.push(`## ⚠️ 重复代码（前5组）`)
    duplicates.slice(0, 5).forEach(([block], idx) => {
      lines.push(`\n### 重复块 ${idx + 1}`)
      lines.push('```')
      lines.push(block.slice(0, 200))
      lines.push('```')
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

function detectCodeSmells(targetPath: string, isDir: boolean) {
  const lines: string[] = ['# 🤢 代码异味检测\n']

  const smells: Array<{ type: string; file: string; line: number; detail: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()
      if (trimmed.includes('any') && (trimmed.includes(':') || trimmed.includes('<'))) {
        smells.push({ type: 'any类型', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('as any')) {
        smells.push({ type: '强制转换', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('eslint-disable')) {
        smells.push({ type: 'ESLint禁用', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('@ts-ignore') || trimmed.includes('@ts-nocheck')) {
        smells.push({ type: 'TS忽略', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('var ')) {
        smells.push({ type: '使用var', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('==') && !trimmed.includes('===') && !trimmed.includes('!==')) {
        smells.push({ type: '宽松比较', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
      if (trimmed.includes('catch') && trimmed.includes('{}') && !trimmed.includes('catch(')) {
        smells.push({ type: '空catch块', file: filePath, line: idx + 1, detail: trimmed.slice(0, 80) })
      }
    })
  }

  if (isDir) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  lines.push(`## 📋 检测结果`)
  lines.push(`- 发现异味: ${smells.length} 个`)
  lines.push('')

  if (smells.length === 0) {
    lines.push('## ✅ 未发现代码异味')
  } else {
    // 按类型分组
    const byType = new Map<string, number>()
    smells.forEach(s => byType.set(s.type, (byType.get(s.type) || 0) + 1))

    lines.push('## 📊 异味分布')
    byType.forEach((count, type) => lines.push(`- ${type}: ${count} 个`))

    lines.push('\n## ⚠️ 详细列表（前15条）')
    smells.slice(0, 15).forEach(s => {
      lines.push(`- [${s.type}] ${path.basename(s.file)}:${s.line} — ${s.detail}`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 2. SecurityScanTool — 安全漏洞扫描（吸收 security-engineer 能力）
// ============================================================================

const SecurityInputSchema = z.object({
  action: z.enum(['scan', 'secrets', 'dependencies', 'headers', 'config']).describe('扫描类型'),
  path: z.string().describe('要扫描的路径'),
})

export const SecurityScanTool: Tool = {
  name: 'SecurityScan',
  description: `安全漏洞扫描工具 — 扫描代码中的安全问题。
- scan: 综合安全扫描
- secrets: 检测硬编码的密钥和敏感信息
- dependencies: 检查依赖项的安全问题
- headers: 检查 HTTP 安全头配置
- config: 检查安全配置问题`,

  inputSchema: SecurityInputSchema,

  async call(input: z.infer<typeof SecurityInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)

    if (!fs.existsSync(resolvedPath)) {
      return { type: 'text', value: `❌ 路径不存在: ${resolvedPath}` }
    }

    switch (action) {
      case 'scan':
        return scanSecurity(resolvedPath)
      case 'secrets':
        return scanSecrets(resolvedPath)
      case 'dependencies':
        return scanDependencies(resolvedPath)
      case 'headers':
        return scanHeaders(resolvedPath)
      case 'config':
        return scanConfig(resolvedPath)
      default:
        return { type: 'text', value: `❌ 未知操作: ${action}` }
    }
  },
}

function scanHeaders(targetPath: string) {
  const lines: string[] = ['# 🛡️ HTTP 安全头检查\n']

  // 需要检查的安全头列表（含说明和推荐值）
  const requiredHeaders = [
    { name: 'Content-Security-Policy', risk: '高', desc: '防止 XSS 和数据注入攻击', example: "default-src 'self'" },
    { name: 'X-Frame-Options', risk: '高', desc: '防止点击劫持（clickjacking）', example: 'DENY 或 SAMEORIGIN' },
    { name: 'X-Content-Type-Options', risk: '高', desc: '防止 MIME 类型嗅探', example: 'nosniff' },
    { name: 'Strict-Transport-Security', risk: '高', desc: '强制 HTTPS 连接', example: 'max-age=31536000' },
    { name: 'Referrer-Policy', risk: '中', desc: '控制 Referrer 泄露', example: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy', risk: '中', desc: '限制浏览器 API 权限', example: 'geolocation=()' },
    { name: 'X-XSS-Protection', risk: '中', desc: '浏览器内置 XSS 过滤器', example: '1; mode=block' },
    { name: 'Cache-Control', risk: '低', desc: '防止敏感信息被缓存', example: 'no-store' },
  ]

  const found = new Map<string, string>()
  const missing: string[] = []

  // 在项目中搜索安全头配置（支持不同框架写法）
  const searchPatterns = [
    /(['"]Content-Security-Policy['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]X-Frame-Options['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]X-Content-Type-Options['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]Strict-Transport-Security['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]Referrer-Policy['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]Permissions-Policy['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]X-XSS-Protection['"])\s*:\s*['"]([^'"]+)['"]/i,
    /(['"]Cache-Control['"])\s*:\s*['"]([^'"]+)['"]/i,
  ]

  const headerNames = requiredHeaders.map(h => h.name)

  function checkFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      // 检查每个安全头是否被配置
      headerNames.forEach((name, idx) => {
        // 使用宽松匹配：查找 "name" 或 name: 或 name =
        const pattern = new RegExp(`['"]?${name}['"]?\\s*[:=]\\s*['"]([^'"]+)['"]`, 'i')
        const match = content.match(pattern)
        if (match && !found.has(name)) {
          found.set(name, match[1])
        } else if (match) {
          found.set(name, `${found.get(name)}、${match[1]}`)
        }
      })
      // 检测 Express/Node 常见写法（setHeader）
      const setHeaderMatches = content.matchAll(/\.setHeader\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/gi)
      for (const m of setHeaderMatches) {
        const name = m[1]
        const value = m[2]
        if (headerNames.includes(name) && !found.has(name)) {
          found.set(name, value)
        }
      }
      // 检测 helmet 库（自动包含多种安全头）
      if (/helmet\s*\(/.test(content) || /from\s+['"]helmet['"]/.test(content) || /require\(['"]helmet['"]\)/.test(content)) {
        if (!found.has('helmet')) found.set('helmet', '已启用')
      }
    } catch { /* 忽略二进制文件 */ }
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  // 计算缺失头
  for (const h of requiredHeaders) {
    if (!found.has(h.name)) {
      missing.push(h.name)
    }
  }

  lines.push('## 📋 检查结果')
  lines.push(`- 已配置安全头: ${found.size - (found.has('helmet') ? 1 : 0)} / ${requiredHeaders.length}`)
  lines.push(`- 缺失安全头: ${missing.length} 个`)
  lines.push('')

  if (found.has('helmet')) {
    lines.push('## ✅ Helmet 中间件')
    lines.push('- 已检测到 helmet 库，它会自动设置多种安全响应头（推荐使用）')
    lines.push('')
  }

  if (found.size > 0) {
    lines.push('## 📊 已找到的配置')
    found.forEach((value, name) => {
      if (name !== 'helmet') lines.push(`- ✅ **${name}**: ${value}`)
    })
    lines.push('')
  }

  if (missing.length > 0) {
    lines.push('## ⚠️ 缺失的安全头')
    requiredHeaders
      .filter(h => missing.includes(h.name))
      .forEach(h => {
        lines.push(`- 🔴 **${h.name}** [${h.risk}风险] — ${h.desc}`)
        lines.push(`  - 建议: ${h.example}`)
      })
  } else {
    lines.push('## ✅ 所有安全头均已配置')
  }

  return { type: 'text', value: lines.join('\n') }
}

function scanSecurity(targetPath: string) {
  const lines: string[] = ['# 🔒 安全扫描报告\n']
  const issues: Array<{ severity: string; type: string; detail: string }> = []

  function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fileLines = content.split('\n')

    fileLines.forEach((line, idx) => {
      const trimmed = line.trim()
      // 检测硬编码密钥
      if (/(password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(trimmed)) {
        issues.push({ severity: '🔴 高', type: '硬编码密钥', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      // 检测 SQL 注入风险
      if (/(query|sql)\s*\+/.test(trimmed) || /`.*\$\{.*\}.*`/.test(trimmed)) {
        if (trimmed.includes('SELECT') || trimmed.includes('INSERT') || trimmed.includes('UPDATE')) {
          issues.push({ severity: '🔴 高', type: 'SQL注入风险', detail: `${path.basename(filePath)}:${idx + 1}` })
        }
      }
      // 检测 XSS 风险
      if (/\.innerHTML\s*=/.test(trimmed) || /document\.write/.test(trimmed)) {
        issues.push({ severity: '🟡 中', type: 'XSS风险', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      // 检测 eval 使用
      if (/\beval\s*\(/.test(trimmed)) {
        issues.push({ severity: '🔴 高', type: 'eval使用', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      // 检测不安全的随机数
      if (/Math\.random\(\)/.test(trimmed)) {
        issues.push({ severity: '🟢 低', type: '不安全随机数', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
      // 检测 HTTP 协议
      if (/http:\/\//.test(trimmed) && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
        issues.push({ severity: '🟡 中', type: 'HTTP协议', detail: `${path.basename(filePath)}:${idx + 1}` })
      }
    })
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) scanDir(fullPath)
        } else if (/\.(ts|tsx|js|jsx|json|env)$/.test(entry.name)) {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  lines.push(`## 📋 扫描结果`)
  lines.push(`- 发现问题: ${issues.length} 个`)
  lines.push('')

  const high = issues.filter(i => i.severity.includes('🔴')).length
  const medium = issues.filter(i => i.severity.includes('🟡')).length
  const low = issues.filter(i => i.severity.includes('🟢')).length

  lines.push(`## 📊 严重程度分布`)
  lines.push(`- 🔴 高危: ${high}`)
  lines.push(`- 🟡 中危: ${medium}`)
  lines.push(`- 🟢 低危: ${low}`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('## ⚠️ 问题列表')
    issues.slice(0, 20).forEach(i => {
      lines.push(`- ${i.severity} [${i.type}] ${i.detail}`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

function scanSecrets(targetPath: string) {
  const lines: string[] = ['# 🔑 密钥泄露检测\n']
  const patterns = [
    { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API Key' },
    { pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/, name: 'GitHub Token' },
    { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
    { pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/, name: '私钥' },
    { pattern: /['"][A-Za-z0-9]{32,}['"]/, name: '可能的密钥' },
  ]

  const findings: string[] = []

  function checkFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      for (const { pattern, name } of patterns) {
        if (pattern.test(content)) {
          findings.push(`${path.basename(filePath)} — 发现 ${name}`)
        }
      }
    } catch { /* ignore binary files */ }
  }

  if (fs.statSync(targetPath).isDirectory()) {
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist'].includes(entry.name)) scanDir(fullPath)
        } else {
          checkFile(fullPath)
        }
      }
    }
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  lines.push(`## 📋 结果`)
  lines.push(`- 发现: ${findings.length} 处`)
  lines.push('')

  if (findings.length === 0) {
    lines.push('## ✅ 未发现硬编码密钥')
  } else {
    lines.push('## ⚠️ 发现的问题')
    findings.forEach(f => lines.push(`- ${f}`))
  }

  return { type: 'text', value: lines.join('\n') }
}

function scanDependencies(targetPath: string) {
  const lines: string[] = ['# 📦 依赖安全扫描\n']

  const packageJsonPath = path.join(targetPath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return { type: 'text', value: '❌ 未找到 package.json' }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    lines.push(`## 📊 依赖概览`)
    lines.push(`- 生产依赖: ${Object.keys(pkg.dependencies || {}).length}`)
    lines.push(`- 开发依赖: ${Object.keys(pkg.devDependencies || {}).length}`)
    lines.push('')

    // 检查已知有问题的依赖
    const problematic: string[] = []
    const allDeps = Object.keys(deps)

    // 检查是否有未锁定的版本
    allDeps.forEach(dep => {
      const version = deps[dep]
      if (version.includes('*') || version.includes('latest')) {
        problematic.push(`${dep}: ${version} — 未锁定版本`)
      }
    })

    if (problematic.length > 0) {
      lines.push('## ⚠️ 版本问题')
      problematic.forEach(p => lines.push(`- ${p}`))
    }

    // 检查 package-lock.json 或 bun.lock
    const hasLock = fs.existsSync(path.join(targetPath, 'package-lock.json')) ||
                    fs.existsSync(path.join(targetPath, 'bun.lock'))
    lines.push('')
    lines.push(hasLock ? '✅ 存在 lock 文件' : '⚠️ 未找到 lock 文件')

  } catch (err) {
    return { type: 'text', value: `❌ 解析失败: ${err instanceof Error ? err.message : String(err)}` }
  }

  return { type: 'text', value: lines.join('\n') }
}

function scanConfig(targetPath: string) {
  const lines: string[] = ['# ⚙️ 安全配置检查\n']

  const issues: string[] = []

  // 检查 .env 文件是否被提交
  const envPath = path.join(targetPath, '.env')
  if (fs.existsSync(envPath)) {
    issues.push('.env 文件存在，确保未被 Git 追踪')
  }

  // 检查 .gitignore
  const gitignorePath = path.join(targetPath, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8')
    if (!gitignore.includes('.env')) issues.push('.gitignore 中未排除 .env')
    if (!gitignore.includes('node_modules')) issues.push('.gitignore 中未排除 node_modules')
  } else {
    issues.push('未找到 .gitignore 文件')
  }

  lines.push(`## 📋 结果`)
  lines.push(`- 发现问题: ${issues.length} 个`)
  lines.push('')

  if (issues.length === 0) {
    lines.push('## ✅ 配置安全')
  } else {
    lines.push('## ⚠️ 问题列表')
    issues.forEach(i => lines.push(`- ${i}`))
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 3. BuildFixTool — 构建错误诊断（吸收 build-error-resolver 能力）
// ============================================================================

const BuildFixInputSchema = z.object({
  action: z.enum(['diagnose', 'fix', 'clean', 'deps']).describe('操作类型'),
  projectPath: z.string().describe('项目路径'),
})

export const BuildFixTool: Tool = {
  name: 'BuildFix',
  description: `构建错误诊断修复工具 — 诊断和修复构建错误。
- diagnose: 分析构建错误日志
- fix: 尝试自动修复常见构建问题
- clean: 清理构建缓存和临时文件
- deps: 检查和修复依赖问题`,

  inputSchema: BuildFixInputSchema,

  async call(input: z.infer<typeof BuildFixInputSchema>, ctx: ToolUseContext) {
    const { action, projectPath } = input
    const resolvedPath = path.resolve(projectPath)

    switch (action) {
      case 'diagnose':
        return diagnoseBuild(resolvedPath)
      case 'fix':
        return autoFixBuild(resolvedPath)
      case 'clean':
        return cleanBuild(resolvedPath)
      case 'deps':
        return fixDeps(resolvedPath)
      default:
        return { type: 'text', value: `❌ 未知操作: ${action}` }
    }
  },
}

function autoFixBuild(targetPath: string) {
  const lines: string[] = ['# 🔧 自动修复构建问题\n']
  const fixed: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  try {
    const packageJsonPath = path.join(targetPath, 'package.json')
    const nodeModulesPath = path.join(targetPath, 'node_modules')
    const tsconfigPath = path.join(targetPath, 'tsconfig.json')
    const hasPackageLock = fs.existsSync(path.join(targetPath, 'package-lock.json'))
    const hasBunLock = fs.existsSync(path.join(targetPath, 'bun.lock'))

    // 1. 检查 node_modules 是否存在，缺失则修复（提示用户运行安装命令）
    if (!fs.existsSync(nodeModulesPath)) {
      failed.push('node_modules 不存在，无法自动安装依赖（请运行 npm install 或 bun install）')
    } else {
      fixed.push('node_modules 存在')
    }

    // 2. 修复缺失的 tsconfig.json（如果 package.json 存在且依赖 TypeScript）
    if (!fs.existsSync(tsconfigPath) && fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (allDeps.typescript) {
          const defaultTsconfig = {
            compilerOptions: {
              target: 'ES2020',
              module: 'ESNext',
              moduleResolution: 'bundler',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              resolveJsonModule: true,
              jsx: 'react-jsx',
              outDir: 'dist',
            },
            include: ['src'],
          }
          fs.writeFileSync(tsconfigPath, JSON.stringify(defaultTsconfig, null, 2), 'utf-8')
          fixed.push('已创建默认 tsconfig.json（项目使用 TypeScript）')
        } else {
          skipped.push('未检测到 TypeScript 依赖，跳过 tsconfig.json 创建')
        }
      } catch (err) {
        failed.push(`❌ 错误: package.json 解析失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (fs.existsSync(tsconfigPath)) {
      fixed.push('tsconfig.json 已存在')
    }

    // 3. 修复缺失的 lock 文件（无法自动生成，给出建议）
    if (!hasPackageLock && !hasBunLock) {
      skipped.push('未找到 lock 文件，建议运行 npm install 或 bun install 生成')
    } else {
      fixed.push('lock 文件存在')
    }

    // 4. 检查 package.json 中 scripts 是否完整，缺失则补充常用脚本
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
        const scripts = pkg.scripts || {}
        let modified = false
        const addedScripts: string[] = []

        if (!scripts.build) {
          // 根据技术栈推断构建脚本
          if (allDeps.vite) {
            scripts.build = 'vite build'
            addedScripts.push('build: vite build')
            modified = true
          } else if (allDeps['next']) {
            scripts.build = 'next build'
            addedScripts.push('build: next build')
            modified = true
          } else if (allDeps.typescript && fs.existsSync(tsconfigPath)) {
            scripts.build = 'tsc'
            addedScripts.push('build: tsc')
            modified = true
          }
        }
        if (!scripts.dev) {
          if (allDeps.vite) {
            scripts.dev = 'vite'
            addedScripts.push('dev: vite')
            modified = true
          } else if (allDeps['next']) {
            scripts.dev = 'next dev'
            addedScripts.push('dev: next dev')
            modified = true
          }
        }
        if (modified) {
          pkg.scripts = scripts
          fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
          fixed.push(`已补充 package.json scripts: ${addedScripts.join(', ')}`)
        } else {
          fixed.push('package.json scripts 完整')
        }
      } catch (err) {
        failed.push(`package.json 处理失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      skipped.push('未找到 package.json，跳过 scripts 检查')
    }

    // 5. 检查是否有构建缓存残留（dist/build 与源码并存通常无害，仅提示）
    const staleDirs = ['dist', 'build', '.next', '.cache'].filter(d => fs.existsSync(path.join(targetPath, d)))
    if (staleDirs.length > 0) {
      skipped.push(`发现构建缓存目录（${staleDirs.join(', ')}），如遇构建异常可执行 clean 操作清理`)
    }

  } catch (err) {
    failed.push(`自动修复异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  lines.push('## 📋 修复结果')
  lines.push(`- ✅ 已处理: ${fixed.length}`)
  lines.push(`- ⚠️ 待处理: ${failed.length}`)
  lines.push(`- 💡 建议: ${skipped.length}`)
  lines.push('')

  if (fixed.length > 0) {
    lines.push('## ✅ 已处理')
    fixed.forEach(f => lines.push(`- ✅ ${f}`))
    lines.push('')
  }

  if (failed.length > 0) {
    lines.push('## ⚠️ 需要手动处理')
    failed.forEach(f => lines.push(`- ⚠️ ${f}`))
    lines.push('')
  }

  if (skipped.length > 0) {
    lines.push('## 💡 建议')
    skipped.forEach(s => lines.push(`- 💡 ${s}`))
  }

  return { type: 'text', value: lines.join('\n') }
}

function diagnoseBuild(targetPath: string) {
  const lines: string[] = ['# 🔨 构建诊断报告\n']

  // 检查常见的构建问题
  const issues: string[] = []
  const suggestions: string[] = []

  // 检查 package.json
  const packageJsonPath = path.join(targetPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // 检查 scripts
      if (!pkg.scripts) {
        issues.push('package.json 中没有 scripts')
        suggestions.push('添加 build/dev/test 等常用脚本')
      } else {
        if (!pkg.scripts.build) suggestions.push('建议添加 build 脚本')
        if (!pkg.scripts.dev) suggestions.push('建议添加 dev 脚本')
        if (!pkg.scripts.test) suggestions.push('建议添加 test 脚本')
      }

      // 检查依赖
      const deps = Object.keys(pkg.dependencies || {})
      if (deps.length > 50) issues.push(`依赖数量过多（${deps.length}个），可能影响构建速度`)
      if (deps.includes('webpack') && deps.includes('vite')) issues.push('同时存在 webpack 和 vite，可能造成冲突')
    } catch {
      issues.push('❌ 错误: package.json 解析失败')
    }
  }

  // 检查 tsconfig.json
  const tsconfigPath = path.join(targetPath, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) {
    suggestions.push('缺少 tsconfig.json，建议添加 TypeScript 配置')
  }

  // 检查 lock 文件
  const hasPackageLock = fs.existsSync(path.join(targetPath, 'package-lock.json'))
  const hasBunLock = fs.existsSync(path.join(targetPath, 'bun.lock'))
  if (!hasPackageLock && !hasBunLock) {
    issues.push('未找到 lock 文件，依赖版本可能不一致')
    suggestions.push('运行 npm install 或 bun install 生成 lock 文件')
  }

  // 检查 node_modules
  const nodeModulesPath = path.join(targetPath, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    issues.push('node_modules 不存在，需要安装依赖')
    suggestions.push('运行 npm install 或 bun install')
  }

  lines.push(`## 📋 诊断结果`)
  lines.push(`- 问题: ${issues.length} 个`)
  lines.push(`- 建议: ${suggestions.length} 个`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('## ⚠️ 发现的问题')
    issues.forEach(i => lines.push(`- ${i}`))
    lines.push('')
  }

  if (suggestions.length > 0) {
    lines.push('## 💡 建议')
    suggestions.forEach(s => lines.push(`- ${s}`))
  }

  return { type: 'text', value: lines.join('\n') }
}

function cleanBuild(targetPath: string) {
  const lines: string[] = ['# 🧹 清理构建缓存\n']

  const dirsToClean = ['dist', 'build', '.next', '.cache', 'node_modules/.cache']
  let cleaned = 0

  for (const dir of dirsToClean) {
    const fullPath = path.join(targetPath, dir)
    if (fs.existsSync(fullPath)) {
      try {
        fs.rmSync(fullPath, { recursive: true, force: true })
        lines.push(`✅ 已清理: ${dir}`)
        cleaned++
      } catch (err) {
        lines.push(`❌ 清理失败: ${dir} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  lines.push('')
  lines.push(`共清理 ${cleaned} 个目录`)

  return { type: 'text', value: lines.join('\n') }
}

function fixDeps(targetPath: string) {
  const lines: string[] = ['# 📦 依赖健康检查\n']

  const packageJsonPath = path.join(targetPath, 'package.json')
  const nodeModulesPath = path.join(targetPath, 'node_modules')

  if (!fs.existsSync(packageJsonPath)) {
    return { type: 'text', value: '❌ 未找到 package.json' }
  }

  const issues: string[] = []

  if (!fs.existsSync(nodeModulesPath)) {
    issues.push('node_modules 不存在')
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const depCount = Object.keys(deps).length

  lines.push(`## 📊 概览`)
  lines.push(`- 依赖总数: ${depCount}`)
  lines.push(`- node_modules: ${fs.existsSync(nodeModulesPath) ? '存在' : '不存在'}`)
  lines.push('')

  if (depCount > 100) {
    issues.push(`依赖数量过多（${depCount}个）`)
  }

  // 检查重复依赖
  if (pkg.dependencies && pkg.devDependencies) {
    const overlap = Object.keys(pkg.dependencies).filter(d => pkg.devDependencies[d])
    if (overlap.length > 0) {
      issues.push(`同时在 dependencies 和 devDependencies 中: ${overlap.join(', ')}`)
    }
  }

  if (issues.length > 0) {
    lines.push('## ⚠️ 问题')
    issues.forEach(i => lines.push(`- ${i}`))
  } else {
    lines.push('## ✅ 依赖状态正常')
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// 4. ArchitectureTool — 架构分析（吸收 c4-architect 能力）
// ============================================================================

const ArchitectureInputSchema = z.object({
  action: z.enum(['analyze', 'dependencies', 'structure', 'techstack']).describe('分析类型'),
  path: z.string().describe('项目路径'),
})

export const ArchitectureTool: Tool = {
  name: 'Architecture',
  description: `项目架构分析工具 — 分析项目结构和技术栈。
- analyze: 综合分析项目架构
- dependencies: 分析模块间依赖关系
- structure: 分析目录结构
- techstack: 识别技术栈`,

  inputSchema: ArchitectureInputSchema,

  async call(input: z.infer<typeof ArchitectureInputSchema>, ctx: ToolUseContext) {
    const { action, path: targetPath } = input
    const resolvedPath = path.resolve(targetPath)

    switch (action) {
      case 'analyze':
        return analyzeArchitecture(resolvedPath)
      case 'dependencies':
        return analyzeModuleDeps(resolvedPath)
      case 'structure':
        return analyzeStructure(resolvedPath)
      case 'techstack':
        return analyzeTechStack(resolvedPath)
      default:
        return { type: 'text', value: `❌ 未知操作: ${action}` }
    }
  },
}

function analyzeModuleDeps(targetPath: string) {
  const lines: string[] = ['# 🔗 模块依赖关系分析\n']

  const moduleDeps = new Map<string, Set<string>>()
  let fileCount = 0

  function checkFile(filePath: string) {
    fileCount++
    const content = fs.readFileSync(filePath, 'utf-8')
    const deps = new Set<string>()
    const relPath = path.relative(targetPath, filePath)

    // 匹配 import 语句：import x from './y' 或 import './y' 或 import {a} from '../z'
    const importRegex = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g
    let match
    while ((match = importRegex.exec(content)) !== null) {
      const dep = match[1] || match[2] || match[3]
      if (!dep) continue
      // 只分析相对路径（内部模块），跳过 node_modules 包
      if (dep.startsWith('.') || dep.startsWith('/')) {
        deps.add(dep)
      }
    }

    moduleDeps.set(relPath, deps)
  }

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) scanDir(fullPath)
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        checkFile(fullPath)
      }
    }
  }

  if (fs.statSync(targetPath).isDirectory()) {
    scanDir(targetPath)
  } else {
    checkFile(targetPath)
  }

  // 解析相对路径依赖到目标文件（简单解析：拼接目录）
  const resolveDep = (fromFile: string, dep: string): string => {
    if (dep.startsWith('/')) return dep.slice(1)
    const fromDir = path.dirname(fromFile)
    let resolved = path.normalize(path.join(fromDir, dep))
    // 去掉扩展名尝试
    if (!fs.existsSync(path.join(targetPath, resolved))) {
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
        if (fs.existsSync(path.join(targetPath, resolved + ext))) {
          resolved = resolved + ext
          break
        }
      }
    }
    return resolved
  }

  // 统计依赖数量（入度和出度）
  const outDegree = new Map<string, number>()
  const inDegree = new Map<string, number>()

  for (const [file, deps] of moduleDeps.entries()) {
    outDegree.set(file, deps.size)
    for (const dep of deps) {
      const resolved = resolveDep(file, dep)
      inDegree.set(resolved, (inDegree.get(resolved) || 0) + 1)
    }
  }

  lines.push(`## 📋 模块概览`)
  lines.push(`- 文件数: ${fileCount}`)
  lines.push(`- 有依赖关系的模块: ${moduleDeps.size}`)
  lines.push('')

  // 高入度模块 = 被很多人依赖（核心模块）
  const topIn = Array.from(inDegree.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (topIn.length > 0) {
    lines.push('## 🎯 核心模块（被依赖最多）')
    topIn.forEach(([file, count]) => {
      lines.push(`- **${file}** — 被 ${count} 个模块引用`)
    })
    lines.push('')
  }

  // 高出度模块 = 依赖很多模块（可能过度耦合）
  const topOut = Array.from(outDegree.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (topOut.length > 0) {
    lines.push('## ⚠️ 高耦合模块（依赖最多）')
    topOut.forEach(([file, count]) => {
      lines.push(`- ${file} — 依赖 ${count} 个模块`)
    })
    lines.push('')
  }

  // 孤立模块（无依赖也无被依赖）
  const allReferenced = new Set(inDegree.keys())
  const isolated = Array.from(moduleDeps.keys()).filter(f => {
    const deps = moduleDeps.get(f) || new Set<string>()
    return deps.size === 0 && !allReferenced.has(f)
  })
  if (isolated.length > 0) {
    lines.push(`## 🔍 孤立模块（${isolated.length} 个，无依赖也无被依赖）`)
    isolated.slice(0, 10).forEach(f => lines.push(`- ${f}`))
    lines.push('')
  }

  // 环形依赖检测（简单 DFS）
  lines.push('## 🔄 循环依赖检测')
  const graph = new Map<string, string[]>()
  for (const [file, deps] of moduleDeps.entries()) {
    graph.set(file, Array.from(deps).map(d => resolveDep(file, d)))
  }

  const visited = new Set<string>()
  const stack = new Set<string>()
  const cycles: string[][] = []
  let pathStack: string[] = []

  const dfs = (node: string) => {
    if (stack.has(node)) {
      const start = pathStack.indexOf(node)
      if (start >= 0) {
        cycles.push([...pathStack.slice(start), node])
      }
      return
    }
    if (visited.has(node)) return
    visited.add(node)
    stack.add(node)
    pathStack.push(node)
    for (const next of graph.get(node) || []) {
      dfs(next)
    }
    pathStack.pop()
    stack.delete(node)
  }

  for (const node of graph.keys()) {
    dfs(node)
  }

  if (cycles.length === 0) {
    lines.push('- ✅ 未发现循环依赖')
  } else {
    lines.push(`- ⚠️ 发现 ${cycles.length} 个循环依赖：`)
    cycles.slice(0, 5).forEach((cycle, idx) => {
      lines.push(`  ${idx + 1}. ${cycle.join(' → ')}`)
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

function analyzeArchitecture(targetPath: string) {
  const lines: string[] = ['# 🏗️ 项目架构分析\n']

  // 分析目录结构
  const dirTree = new Map<string, number>()
  let totalFiles = 0
  let totalDirs = 0

  function scanDir(dir: string, depth: number = 0) {
    if (depth > 4) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        totalDirs++
        const ext = path.extname(entry.name) || '(dir)'
        dirTree.set(ext, (dirTree.get(ext) || 0) + 1)
        if (depth < 3) scanDir(fullPath, depth + 1)
      } else {
        totalFiles++
      }
    }
  }

  scanDir(targetPath)

  lines.push(`## 📊 结构概览`)
  lines.push(`- 总文件数: ${totalFiles}`)
  lines.push(`- 总目录数: ${totalDirs}`)
  lines.push('')

  // 分析技术栈
  const pkgPath = path.join(targetPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    lines.push(`## 📦 技术栈识别`)
    const frameworks: string[] = []
    if (deps.react) frameworks.push('React')
    if (deps.vue) frameworks.push('Vue')
    if (deps.angular || deps['@angular/core']) frameworks.push('Angular')
    if (deps.electron) frameworks.push('Electron')
    if (deps.typescript) frameworks.push('TypeScript')
    if (deps.vite) frameworks.push('Vite')
    if (deps.webpack) frameworks.push('Webpack')
    if (deps.express) frameworks.push('Express')
    if (deps.next) frameworks.push('Next.js')

    if (frameworks.length > 0) {
      lines.push(`- 框架: ${frameworks.join(', ')}`)
    }
    lines.push(`- 依赖总数: ${Object.keys(deps).length}`)
  }

  // 目录结构
  lines.push('')
  lines.push(`## 📁 主要目录`)
  const mainDirs = fs.readdirSync(targetPath, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => e.name)
  mainDirs.forEach(d => lines.push(`- ${d}/`))

  return { type: 'text', value: lines.join('\n') }
}

function analyzeStructure(targetPath: string) {
  const lines: string[] = ['# 📂 目录结构分析\n']

  function printDir(dir: string, prefix: string = '', depth: number = 0) {
    if (depth > 3) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const isLast = i === entries.length - 1
      const connector = isLast ? '└── ' : '├── '
      const childPrefix = isLast ? '    ' : '│   '

      if (entry.isDirectory()) {
        lines.push(`${prefix}${connector}${entry.name}/`)
        printDir(path.join(dir, entry.name), prefix + childPrefix, depth + 1)
      } else if (depth < 2) {
        lines.push(`${prefix}${connector}${entry.name}`)
      }
    }
  }

  lines.push('```')
  lines.push(`${path.basename(targetPath)}/`)
  printDir(targetPath, '')
  lines.push('```')

  return { type: 'text', value: lines.join('\n') }
}

function analyzeTechStack(targetPath: string) {
  const lines: string[] = ['# 🔧 技术栈分析\n']

  const pkgPath = path.join(targetPath, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return { type: 'text', value: '❌ 未找到 package.json' }
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const deps = pkg.dependencies || {}
  const devDeps = pkg.devDependencies || {}

  const categories: Record<string, string[]> = {
    '前端框架': ['react', 'vue', 'angular', '@angular/core', 'svelte', 'solid-js'],
    '后端框架': ['express', 'koa', 'fastify', 'next', 'nuxt', 'nest'],
    '构建工具': ['vite', 'webpack', 'rollup', 'esbuild', 'tsup'],
    '测试框架': ['jest', 'vitest', 'mocha', 'cypress', '@playwright/test'],
    '样式方案': ['tailwindcss', 'sass', 'less', 'styled-components'],
    '状态管理': ['redux', 'zustand', 'jotai', 'recoil', 'pinia'],
    '工具库': ['lodash', 'axios', 'dayjs', 'uuid'],
    'TypeScript': ['typescript', '@types/node'],
    '桌面应用': ['electron', 'electron-builder'],
  }

  lines.push('## 📦 技术栈组成')
  for (const [category, packages] of Object.entries(categories)) {
    const found = packages.filter(p => deps[p] || devDeps[p])
    if (found.length > 0) {
      lines.push(`- **${category}**: ${found.join(', ')}`)
    }
  }

  lines.push('')
  lines.push(`## 📊 版本信息`)
  const keyDeps = ['react', 'vue', 'typescript', 'electron', 'vite', 'node']
  keyDeps.forEach(dep => {
    if (deps[dep]) lines.push(`- ${dep}: ${deps[dep]}`)
    if (devDeps[dep]) lines.push(`- ${dep}: ${devDeps[dev]} (dev)`)
  })

  return { type: 'text', value: lines.join('\n') }
}

// 导出所有工具
export const PowerTools = [
  CodeQualityTool,
  SecurityScanTool,
  BuildFixTool,
  ArchitectureTool,
]
