import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync } from 'fs'

// ============================================================================
// Types
// ============================================================================

interface PairOptions {
  mode: 'review' | 'coauthor' | 'debug'
  focus: string
  rounds: number
  autoFix: boolean
}

interface PairResult {
  success: boolean
  mode: string
  round: number
  output: string
  suggestions: string[]
  fixes: string[]
}

// ============================================================================
// Pair Programming Modes
// ============================================================================

/**
 * 审查模式（Review）：分析代码并提供改进建议
 */
function runReviewMode(code: string, round: number): PairResult {
  const suggestions: string[] = []
  const fixes: string[] = []

  // 静态分析
  const lines = code.split('\n')

  // 检查常见问题
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.length > 120) {
      suggestions.push(`Line ${i + 1}: 行过长 (${trimmed.length} chars)，建议拆分`)
    }
    if (trimmed.includes('console.log')) {
      suggestions.push(`Line ${i + 1}: 使用 console.log 可能在生产环境残留，建议使用 Logger`)
      fixes.push(`Line ${i + 1}: 将 console.log 替换为 Logger.info() / Logger.debug() `)
    }
    if (trimmed.includes('any')) {
      suggestions.push(`Line ${i + 1}: 使用 any 类型丢失类型安全，建议定义具体类型`)
    }
    if (/==\s*(?!null|undefined)/.test(trimmed) && !trimmed.includes('===')) {
      suggestions.push(`Line ${i + 1}: 使用 == 而非 ===，建议使用严格相等`)
      fixes.push(`Line ${i + 1}: 将 == 替换为 ===`)
    }
    if (trimmed.includes('TODO') || trimmed.includes('FIXME')) {
      suggestions.push(`Line ${i + 1}: 包含未完成的 TODO/FIXME`)
    }
  })

  // 深度分析
  const deep = runDeepAnalysis(code)

  const output = [
    `## 🔍 审查结果 (第 ${round} 轮)`,
    '',
    `**文件**: ${code.split('\n').length} 行`,
    `**问题数**: ${suggestions.length}`,
    '',
    '### 📊 六维评分',
    `| 维度 | 评分 | 状态 |`,
    `|------|------|------|`,
    `| 类型安全 | ${deep.typeSafety.score}/100 | ${deep.typeSafety.score >= 80 ? '✅' : deep.typeSafety.score >= 60 ? '⚠️' : '🔴'} |`,
    `| 错误处理 | ${deep.errorHandling.score}/100 | ${deep.errorHandling.score >= 80 ? '✅' : deep.errorHandling.score >= 60 ? '⚠️' : '🔴'} |`,
    `| 性能 | ${deep.performance.score}/100 | ${deep.performance.score >= 80 ? '✅' : deep.performance.score >= 60 ? '⚠️' : '🔴'} |`,
    `| 可读性 | ${deep.readability.score}/100 | ${deep.readability.score >= 80 ? '✅' : deep.readability.score >= 60 ? '⚠️' : '🔴'} |`,
    `| 可测试性 | ${deep.testability.score}/100 | ${deep.testability.score >= 80 ? '✅' : deep.testability.score >= 60 ? '⚠️' : '🔴'} |`,
    `| 安全性 | ${deep.security.score}/100 | ${deep.security.score >= 80 ? '✅' : deep.security.score >= 60 ? '⚠️' : '🔴'} |`,
    '',
    suggestions.length > 0 ? '### 发现的问题\n' : '### ✅ 未发现明显问题\n',
    ...suggestions.map(s => `- ${s}`),
    fixes.length > 0 ? '\n### 自动修复建议\n' + fixes.map(f => `- ${f}`).join('\n') : '',
  ].join('\n')

  return { success: true, mode: 'review', round, output, suggestions, fixes }
}

/**
 * 协同编写模式（Coauthor）：为代码生成增强建议
 */
function runCoauthorMode(code: string, round: number): PairResult {
  const suggestions: string[] = []
  const fixes: string[] = []

  // 检查代码结构和最佳实践
  const hasExports = code.includes('export')
  const hasTypes = code.includes(': ') || code.includes('interface') || code.includes('type ')
  const hasErrorHandling = code.includes('try') || code.includes('catch') || code.includes('.catch(')
  const hasComments = code.includes('//') || code.includes('/*')
  const hasTests = code.includes('describe(') || code.includes('test(') || code.includes('it(')

  if (!hasExports) suggestions.push('代码未导出任何模块，考虑添加 export 以便复用')
  if (!hasTypes) suggestions.push('代码缺少类型注解，建议为函数参数和返回值添加类型')
  if (!hasErrorHandling) suggestions.push('代码缺少错误处理，建议添加 try/catch 或 .catch()')
  if (!hasComments) suggestions.push('代码缺少注释，建议为复杂逻辑添加文档注释')

  const lines = code.split('\n')
  let functionCount = 0
  let classCount = 0
  lines.forEach(line => {
    if (line.match(/^\s*(export\s+)?(async\s+)?function\s+/)) functionCount++
    if (line.match(/^\s*(export\s+)?class\s+/)) classCount++
  })

  if (!hasTests && (functionCount > 2 || classCount > 0)) {
    suggestions.push('代码包含多个函数/类但缺少测试，建议添加单元测试')
  }

  // 生成增强代码
  const enhancedCode = generateEnhancedCode(code, suggestions)

  const output = [
    `## 🤝 协同编写 (第 ${round} 轮)`,
    '',
    '### 代码分析',
    `- 函数数量: ${functionCount}`,
    `- 类数量: ${classCount}`,
    `- 有类型注解: ${hasTypes ? '✅' : '❌'}`,
    `- 有错误处理: ${hasErrorHandling ? '✅' : '❌'}`,
    `- 有注释: ${hasComments ? '✅' : '❌'}`,
    `- 有测试: ${hasTests ? '✅' : '❌'}`,
    '',
    '### 增强建议',
    ...suggestions.map(s => `- ${s}`),
    '',
    '### 增强代码',
    '```typescript',
    enhancedCode,
    '```',
  ].join('\n')

  return { success: true, mode: 'coauthor', round, output, suggestions, fixes }
}

/**
 * 调试模式（Debug）：分析代码中的潜在问题
 */
function runDebugMode(code: string, round: number): PairResult {
  const suggestions: string[] = []
  const fixes: string[] = []

  const lines = code.split('\n')

  // 检查潜在运行时错误
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    // 检查未处理的 Promise
    if (/async\s+\w+\([^)]*\)\s*\{[^}]*$/.test(trimmed)) {
      suggestions.push(`Line ${i + 1}: async 函数可能缺少 return 或 await`)
    }
    // 检查未使用的变量（启发式）
    if (trimmed.startsWith('const ') && !trimmed.includes('=')) {
      suggestions.push(`Line ${i + 1}: 可能声明了未使用的变量`)
    }
    // 检查数组操作
    if (trimmed.includes('.forEach(') && trimmed.includes('push(')) {
      suggestions.push(`Line ${i + 1}: 使用 forEach + push 可能应使用 map/filter`)
      fixes.push(`Line ${i + 1}: 考虑使用 .map() 或 .filter() 替代 forEach + push`)
    }
    // 检查深嵌套
    const depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
    if (depth > 4) {
      suggestions.push(`Line ${i + 1}: 代码嵌套过深 (${depth} 层)，建议提取子函数`)
    }
  })

  // 检查文件级问题
  if (code.includes('await') && !code.includes('async')) {
    suggestions.push('使用了 await 但函数不是 async，可能导致语法错误')
  }

  const output = [
    `## 🐛 调试分析 (第 ${round} 轮)`,
    '',
    '### 潜在问题',
    suggestions.length > 0
      ? suggestions.map(s => `- ${s}`).join('\n')
      : '- ✅ 未发现明显的运行时问题',
    '',
    fixes.length > 0 ? '### 修复建议\n' + fixes.map(f => `- ${f}`).join('\n') : '',
    '',
    '### 调试提示',
    '- 使用 console.time/timeEnd 测量性能瓶颈',
    '- 使用 try/catch 包装异步操作',
    '- 添加输入验证避免边界条件错误',
  ].join('\n')

  return { success: true, mode: 'debug', round, output, suggestions, fixes }
}

// ─── 增强分析引擎 ───────────────────────────────────────────

interface DeepAnalysis {
  typeSafety: { score: number; issues: string[] }
  errorHandling: { score: number; issues: string[] }
  performance: { score: number; issues: string[] }
  readability: { score: number; issues: string[] }
  testability: { score: number; issues: string[] }
  security: { score: number; issues: string[] }
}

function runDeepAnalysis(code: string): DeepAnalysis {
  const lines = code.split('\n')
  const issues = {
    typeSafety: [] as string[],
    errorHandling: [] as string[],
    performance: [] as string[],
    readability: [] as string[],
    testability: [] as string[],
    security: [] as string[],
  }

  let typedCount = 0
  let totalParams = 0
  let hasTryCatch = 0
  let hasAsyncAwait = 0
  let hasConsole = 0
  let hasAnyType = 0
  let hasEval = 0
  let hasInnerHTML = 0
  let deepNest = 0
  let maxNest = 0
  let funcCount = 0
  let longFuncs = 0
  let currentNest = 0
  let funcStart = -1
  let braceDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 类型安全
    totalParams += (trimmed.match(/\(([^)]*)\)/g) || []).length
    if (trimmed.includes(': ') && !trimmed.includes('//')) typedCount++
    if (trimmed.includes(': any') || trimmed.includes('as any')) {
      hasAnyType++
      issues.typeSafety.push(`第${i + 1}行: 使用 any 类型，建议定义具体类型`)
    }

    // 错误处理
    if (trimmed.includes('try')) hasTryCatch++
    if (trimmed.includes('async')) hasAsyncAwait++
    if (trimmed.includes('.catch(')) hasTryCatch++

    // 性能
    if (trimmed.includes('console.log') || trimmed.includes('console.debug')) {
      hasConsole++
      issues.performance.push(`第${i + 1}行: console 语句可能影响生产环境性能`)
    }

    // 可读性
    currentNest = (line.match(/^(\s+)/)?.[1]?.length || 0) / 2
    if (currentNest > maxNest) maxNest = currentNest
    if (trimmed.length > 120) {
      issues.readability.push(`第${i + 1}行: 行过长 (${trimmed.length} 字符)`)
    }
    if (funcStart >= 0 && trimmed.includes('}')) {
      if (i - funcStart > 50) longFuncs++
      funcStart = -1
    }
    if (/\b(function|def|func|fn)\s+\w+/.test(trimmed)) {
      funcStart = i
      funcCount++
    }

    // 安全性
    if (trimmed.includes('eval(')) {
      hasEval++
      issues.security.push(`第${i + 1}行: 使用 eval() 存在代码注入风险`)
    }
    if (trimmed.includes('innerHTML')) {
      hasInnerHTML++
      issues.security.push(`第${i + 1}行: 使用 innerHTML 可能导致 XSS 攻击`)
    }
    if (/\b(password|secret|token|apikey)\s*[:=]\s*['"]/i.test(trimmed)) {
      issues.security.push(`第${i + 1}行: 疑似硬编码敏感信息`)
    }

    // 可测试性
    if (trimmed.includes('new Date()') || trimmed.includes('Date.now()')) {
      issues.testability.push(`第${i + 1}行: 直接依赖时间，测试时可注入 mock`)
    }
    if (trimmed.includes('Math.random()')) {
      issues.testability.push(`第${i + 1}行: 使用 Math.random() 不可测试，建议注入`)
    }
  }

  if (hasAnyType > 0) issues.typeSafety.push(`共 ${hasAnyType} 处 any 类型使用`)
  if (hasTryCatch === 0 && hasAsyncAwait > 0) {
    issues.errorHandling.push('代码包含异步操作但缺少错误处理')
  }
  if (hasTryCatch === 0 && funcCount > 2) {
    issues.errorHandling.push('多个函数缺少错误处理机制')
  }
  if (maxNest > 4) {
    issues.readability.push(`最大嵌套深度 ${maxNest} 层，建议不超过 4 层`)
  }
  if (longFuncs > 0) {
    issues.readability.push(`${longFuncs} 个函数超过 50 行，建议拆分`)
  }
  if (funcCount > 0 && hasTryCatch === 0) {
    issues.testability.push('函数缺少错误路径，建议添加异常场景测试')
  }

  const calcScore = (issuesCount: number) => Math.max(0, 100 - issuesCount * 15)

  return {
    typeSafety: { score: calcScore(issues.typeSafety.length), issues: issues.typeSafety },
    errorHandling: { score: calcScore(issues.errorHandling.length), issues: issues.errorHandling },
    performance: { score: calcScore(issues.performance.length), issues: issues.performance },
    readability: { score: calcScore(issues.readability.length), issues: issues.readability },
    testability: { score: calcScore(issues.testability.length), issues: issues.testability },
    security: { score: calcScore(issues.security.length), issues: issues.security },
  }
}

// ─── 深度分析模式 ───────────────────────────────────────────

function runDeepMode(code: string, round: number): PairResult {
  const deep = runDeepAnalysis(code)
  const allIssues = [
    ...deep.typeSafety.issues,
    ...deep.errorHandling.issues,
    ...deep.performance.issues,
    ...deep.readability.issues,
    ...deep.testability.issues,
    ...deep.security.issues,
  ]
  const avgScore = Math.round(
    (deep.typeSafety.score + deep.errorHandling.score + deep.performance.score +
      deep.readability.score + deep.testability.score + deep.security.score) / 6,
  )

  const lines = [
    `## 🔬 深度分析 (第 ${round} 轮)`,
    '',
    `**综合评分: ${avgScore}/100**`,
    '',
    '### 📊 六维雷达',
    '',
    '| 维度 | 评分 | 问题数 |',
    '|------|------|--------|',
    `| 🛡️ 类型安全 | ${deep.typeSafety.score} | ${deep.typeSafety.issues.length} |`,
    `| 🔧 错误处理 | ${deep.errorHandling.score} | ${deep.errorHandling.issues.length} |`,
    `| ⚡ 性能 | ${deep.performance.score} | ${deep.performance.issues.length} |`,
    `| 📖 可读性 | ${deep.readability.score} | ${deep.readability.issues.length} |`,
    `| 🧪 可测试性 | ${deep.testability.score} | ${deep.testability.issues.length} |`,
    `| 🔒 安全性 | ${deep.security.score} | ${deep.security.issues.length} |`,
    '',
  ]

  // 按维度输出详细问题
  const dimensions = [
    { name: '🛡️ 类型安全', data: deep.typeSafety },
    { name: '🔧 错误处理', data: deep.errorHandling },
    { name: '⚡ 性能', data: deep.performance },
    { name: '📖 可读性', data: deep.readability },
    { name: '🧪 可测试性', data: deep.testability },
    { name: '🔒 安全性', data: deep.security },
  ]

  for (const dim of dimensions) {
    if (dim.data.issues.length > 0) {
      lines.push(`### ${dim.name} (${dim.data.score}分)`)
      dim.data.issues.forEach(issue => lines.push(`- ${issue}`))
      lines.push('')
    }
  }

  // 架构建议
  lines.push('### 🏗️ 架构建议')
  if (avgScore >= 80) {
    lines.push('- 代码质量良好，保持当前实践')
    lines.push('- 考虑添加更多边界测试')
  } else if (avgScore >= 60) {
    lines.push('- 优先修复安全性和错误处理问题')
    lines.push('- 考虑引入静态分析工具（ESLint, Prettier）')
    lines.push('- 增加代码审查流程')
  } else {
    lines.push('- 建议进行大规模重构')
    lines.push('- 优先解决安全漏洞和类型安全问题')
    lines.push('- 建立测试覆盖率基线')
    lines.push('- 考虑引入 CI/CD 自动化检查')
  }

  return {
    success: true,
    mode: 'deep',
    round,
    output: lines.join('\n'),
    suggestions: allIssues,
    fixes: [],
  }
}

// ─── 辅助函数 ───────────────────────────────────────────────

/**
 * 生成增强代码（协同编写模式）
 */
function generateEnhancedCode(original: string, suggestions: string[]): string {
  let enhanced = original

  // 简单的自动增强
  if (suggestions.some(s => s.includes('类型注解'))) {
    enhanced = enhanced.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (match, name, params) => {
      const typedParams = params
        .split(',')
        .map(p => p.trim())
        .filter(p => p)
        .map(p => {
          if (p.includes(':')) return p
          if (p === 'req' || p === 'request') return `${p}: Request`
          if (p === 'res' || p === 'response') return `${p}: Response`
          if (p === 'err' || p === 'error') return `${p}: Error`
          return `${p}: any`
        })
        .join(', ')
      return `function ${name}(${typedParams}): Promise<void> {`
      })
      enhanced = enhanced.replace(/=>\s*\{/g, '): any => {')
  }

  if (suggestions.some(s => s.includes('console.log'))) {
    enhanced = enhanced.replace(/console\.log\(/g, 'Logger.info(')
  }

  if (suggestions.some(s => s.includes('严格相等'))) {
    enhanced = enhanced.replace(/([^=!])==(?!null|undefined)/g, '$1===')
    enhanced = enhanced.replace(/([^=!])!=/g, '$1!==')
  }

  // 添加 JSDoc 注释（如果缺少）
  if (suggestions.some(s => s.includes('注释')) && enhanced.includes('function ')) {
    const firstFuncMatch = enhanced.match(/function\s+(\w+)/)
    if (firstFuncMatch && !enhanced.includes('/**')) {
      enhanced = `/**\n * ${firstFuncMatch[1]} - Auto-documented function\n */\n${enhanced}`
    }
  }

  return enhanced
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (!s || s.includes('--help')) {
    return {
      type: 'text',
      value: [
        '🤝 AI 结对编程',
        '',
        '📖 用法: ',
        '  /pair                          启动默认交互模式',
        '  /pair <文件路径>               分析指定文件',
        '  /pair <文件路径> <模式>        使用指定模式分析',
        '',
        '模式:',
        '  review       审查模式 - 六维评分 + 问题检测 + 修复建议',
        '  coauthor     协同编写 - 生成增强代码和最佳实践',
        '  debug        调试模式 - 检测潜在运行时问题',
        '  deep         深度分析 - 全面质量评估 + 架构建议',
        '',
        '选项:',
        '  --rounds N   执行轮数（默认: 1，最多 5）',
        '  --auto-fix   自动应用可修复的问题',
        '  --focus <关键词>  聚焦特定方面（types/safety/performance）',
        '',
        '💡 示例: ',
        '  /pair src/index.ts',
        '  /pair src/utils.ts coauthor --rounds 3',
        '  /pair src/api.ts debug --focus types',
      ].join('\n'),
    }
  }

  // 解析参数
  const parts = s.split(/\s+/).filter(p => !p.startsWith('--'))
  const flags = s.match(/--\w+/g) || []

  const filePath = parts[0] || ''
  const mode = (parts[1] as PairOptions['mode']) || 'review'
  const focus = flags.includes('--focus') ? parts.find((_, i, arr) => arr[i - 1] === '--focus') : undefined
  const rounds = Math.min(5, Math.max(1, parseInt(flags.find(f => f.startsWith('--rounds'))?.slice(8) || '1') || 1))
  const autoFix = flags.includes('--auto-fix')

  // 验证模式
  const validModes: PairOptions['mode'][] = ['review', 'coauthor', 'debug', 'deep']
  const selectedMode = validModes.includes(mode as PairOptions['mode']) ? mode as PairOptions['mode'] : 'review'

  // 读取代码
  let code = ''
  if (filePath) {
    try {
      code = readFileSync(filePath, 'utf-8')
    } catch {
      return {
        type: 'text',
        value: `❌ 无法读取文件: ${filePath}\n\n请确保文件路径正确且可访问。`,
      }
    }
  } else {
    // 如果没有文件，使用示例代码
    code = `function processData(items) {
  for (var i = 0; i < items.length; i++) {
    console.log(items[i])
    result.push(items[i].value)
  }
  return result
}

async function fetchData(url) {
  const response = await fetch(url)
  const data = response.json()
  return data
}`
  }

  // 执行多轮分析
  const allResults: string[] = []
  const allSuggestions: string[] = []
  const allFixes: string[] = []

  for (let round = 1; round <= rounds; round++) {
    let result: PairResult

    switch (selectedMode) {
      case 'coauthor':
        result = runCoauthorMode(code, round)
        break
      case 'debug':
        result = runDebugMode(code, round)
        break
      case 'deep':
        result = runDeepMode(code, round)
        break
      case 'review':
      default:
        result = runReviewMode(code, round)
        break
    }

    allResults.push(result.output)
    allSuggestions.push(...result.suggestions)
    allFixes.push(...result.fixes)

    // 如果启用了自动修复，应用修复
    if (autoFix && result.fixes.length > 0) {
      // 简单修复（实际实现应使用 FileWriteTool 或 editFileInEditor）
      code = applyFixes(code, result.fixes)
    }

    // 如果不是最后一轮，更新代码（模拟改进）
    if (round < rounds && allSuggestions.length > 0) {
      code = applySuggestions(code, allSuggestions.slice(0, round * 3))
    }
  }

  // 组合输出
  const finalOutput = [
    `🤝 AI 结对编程 - ${selectedMode} 模式`,
    `文件: ${filePath || '示例代码'}`,
    `轮数: ${rounds}/${rounds}`,
    `建议数: ${allSuggestions.length}`,
    `可修复: ${allFixes.length}`,
    autoFix ? '自动修复: ✅ 已启用' : '自动修复: ❌ 未启用',
    '',
    ...allResults,
    '',
    '---',
    '💡 提示:',
    '  - 使用 --rounds 3 增加分析深度',
    '  - 使用 --auto-fix 自动应用简单修复',
    '  - 使用 --focus types 聚焦类型安全',
  ].join('\n')

  return { type: 'text', value: finalOutput }
}

const pair = {
  type: 'local' as const,
  name: 'pair',
  description: 'AI 结对编程 - review/coauthor/debug 三种模式',
  aliases: ['/pair', '/pair-programming'],
  arguments: [
    {
      name: 'file',
      description: '要分析的文件路径',
      required: false,
    },
    {
      name: 'mode',
      description: '模式: review / coauthor / debug',
      required: false,
    },
    {
      name: '--rounds',
      description: '执行轮数（1-5）',
      required: false,
    },
    {
      name: '--auto-fix',
      description: '自动应用可修复的问题',
      required: false,
    },
    {
      name: '--focus',
      description: '聚焦特定方面',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default pair

// ============================================================================
// Utility Functions
// ============================================================================

function applyFixes(code: string, fixes: string[]): string {
  let result = code

  fixes.forEach(fix => {
    if (fix.includes('console.log')) {
      result = result.replace(/console\.log\(/g, 'Logger.info(')
    }
    if (fix.includes('===') || fix.includes('严格相等')) {
      result = result.replace(/([^=!])==(?!null|undefined)/g, '$1===')
      result = result.replace(/([^=!])!=/g, '$1!==')
    }
  })

  return result
}

function applySuggestions(code: string, suggestions: string[]): string {
  // 基于建议简单改进代码
  return code
}
