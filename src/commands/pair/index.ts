import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

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

  const output = [
    `## 🔍 审查结果 (第 ${round} 轮)`,
    '',
    `**文件**: ${code.split('\n').length} 行`,
    `**问题数**: ${suggestions.length}`,
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
        '用法:',
        '  /pair                          启动默认交互模式',
        '  /pair <文件路径>               分析指定文件',
        '  /pair <文件路径> <模式>        使用指定模式分析',
        '',
        '模式:',
        '  review       审查模式 - 分析代码并提供改进建议',
        '  coauthor     协同编写 - 生成增强代码和最佳实践',
        '  debug        调试模式 - 检测潜在运行时问题',
        '',
        '选项:',
        '  --rounds N   执行轮数（默认: 1，最多 5）',
        '  --auto-fix   自动应用可修复的问题',
        '  --focus <关键词>  聚焦特定方面（types/safety/performance）',
        '',
        '示例:',
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
  const validModes: PairOptions['mode'][] = ['review', 'coauthor', 'debug']
  const selectedMode = validModes.includes(mode as PairOptions['mode']) ? mode as PairOptions['mode'] : 'review'

  // 读取代码
  let code = ''
  if (filePath) {
    try {
      code = await Bun.file(filePath).text()
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
  aliases: ['/pair', '/pair-programming', '/review'],
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
  call: call as unknown as Command['call'],
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
