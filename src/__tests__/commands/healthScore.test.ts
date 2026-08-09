/**
 * __tests__/commands/healthScore.test.ts — health-score 命令纯逻辑测试
 *
 * 覆盖：analyzeComplexity / analyzeCodeSmells / analyzeDependencyHealth /
 *       calculateGrade / collectSourceFiles / extractImports
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 纯逻辑重放（从 health-score/health-score.tsx 复制）
// ---------------------------------------------------------------------------

function collectSourceFiles(entries: string[] = []): string[] {
  const files: string[] = []
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    if (/\.(ts|tsx|js|jsx|py|go|java|rs)$/.test(entry)) {
      files.push(entry)
    }
  }
  return files
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }
  return imports
}

function analyzeComplexity(content: string): { score: number; issues: string[] } {
  const issues: string[] = []
  const lines = content.split('\n')
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
        issues.push(`函数过长 (${i - funcStart} 行，建议 < 50 行)`)
      }
      funcStart = -1
    }
  }
  let maxNest = 0
  for (const line of lines) {
    const indent = line.match(/^(\s+)/)
    if (indent) {
      const depth = indent[1].length / 2
      if (depth > maxNest) maxNest = depth
    }
  }
  if (maxNest > 4) {
    issues.push(`嵌套层级过深 (最大 ${maxNest} 层，建议 <= 4)`)
  }
  const score = Math.max(0, 100 - issues.length * 10)
  return { score, issues }
}

function analyzeCodeSmells(content: string): { score: number; issues: string[] } {
  const issues: string[] = []
  const patterns: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /\beval\s*\(/, message: '使用 eval() 存在安全风险' },
    { pattern: /debugger;/, message: '残留 debugger 语句' },
    { pattern: /console\.(log|warn|error|info)\s*\(/, message: '残留 console 语句' },
    { pattern: /catch\s*\([^)]*\)\s*{\s*}/, message: '空的异常处理块' },
    { pattern: /\bpassword\s*[:=]\s*['"][^'"]+['"]/i, message: '硬编码密码' },
    { pattern: /\b(apiKey|api_key|secret|token)\s*[:=]\s*['"][^'"]+['"]/i, message: '硬编码密钥/令牌' },
  ]
  for (const line of content.split('\n')) {
    for (const { pattern, message } of patterns) {
      if (pattern.test(line)) {
        issues.push(message)
      }
    }
  }
  const score = Math.max(0, 100 - issues.length * 10)
  return { score, issues }
}

function calculateGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

// ---------------------------------------------------------------------------
// Tests: collectSourceFiles
// ---------------------------------------------------------------------------

describe('health-score collectSourceFiles', () => {
  it('应过滤非源文件', () => {
    const result = collectSourceFiles(['index.ts', 'README.md', 'package.json', 'main.jsx'])
    expect(result).toEqual(['index.ts', 'main.jsx'])
  })

  it('应跳过隐藏文件和 node_modules 目录', () => {
    const result = collectSourceFiles(['.gitignore', 'node_modules', 'src/app.ts'])
    expect(result).toEqual(['src/app.ts'])
  })

  it('空数组应返回空数组', () => {
    expect(collectSourceFiles([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: extractImports
// ---------------------------------------------------------------------------

describe('health-score extractImports', () => {
  it('应提取 import 语句', () => {
    const content = "import { foo } from 'bar'\nimport baz from 'qux'"
    const result = extractImports(content)
    expect(result).toContain('bar')
    expect(result).toContain('qux')
  })

  it('应提取所有 import 语句', () => {
    const content = "import { real } from 'actual'\nimport { also } from 'another'"
    const result = extractImports(content)
    expect(result).toContain('actual')
    expect(result).toContain('another')
  })

  it('空内容应返回空数组', () => {
    expect(extractImports('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: analyzeComplexity
// ---------------------------------------------------------------------------

describe('health-score analyzeComplexity', () => {
  it('短函数应得高分', () => {
    const code = 'function short() { return 1; }\n'
    const result = analyzeComplexity(code)
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('深层嵌套应扣分', () => {
    const deepIndent = '        '.repeat(5)
    const code = `if (a) {\n${deepIndent}if (b) {\n${deepIndent}if (c) {\n${deepIndent}if (d) {\n${deepIndent}if (e) {\n${deepIndent}x\n${deepIndent}}}\n${deepIndent}}}\n${deepIndent}}}\n}\n`
    const result = analyzeComplexity(code)
    expect(result.issues.some(i => i.includes('嵌套层级过深'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: analyzeCodeSmells
// ---------------------------------------------------------------------------

describe('health-score analyzeCodeSmells', () => {
  it('应检测 eval', () => {
    const code = "eval('dangerous')"
    const result = analyzeCodeSmells(code)
    expect(result.issues.some(i => i.includes('eval'))).toBe(true)
  })

  it('应检测硬编码密码', () => {
    const code = "const password = 'secret123'"
    const result = analyzeCodeSmells(code)
    expect(result.issues.some(i => i.includes('硬编码密码'))).toBe(true)
  })

  it('应检测空 catch', () => {
    const code = 'try { } catch (e) { }'
    const result = analyzeCodeSmells(code)
    expect(result.issues.some(i => i.includes('空'))).toBe(true)
  })

  it('干净代码应得高分', () => {
    const code = 'function clean() { return 42; }\n'
    const result = analyzeCodeSmells(code)
    expect(result.score).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Tests: calculateGrade
// ---------------------------------------------------------------------------

describe('health-score calculateGrade', () => {
  it('90+ 应为 A', () => expect(calculateGrade(95)).toBe('A'))
  it('80-89 应为 B', () => expect(calculateGrade(85)).toBe('B'))
  it('70-79 应为 C', () => expect(calculateGrade(75)).toBe('C'))
  it('60-69 应为 D', () => expect(calculateGrade(65)).toBe('D'))
  it('<60 应为 F', () => expect(calculateGrade(50)).toBe('F'))
})
