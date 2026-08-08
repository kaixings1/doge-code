/**
 * __tests__/commands/refactor.test.ts — refactor 命令纯逻辑测试
 *
 * 覆盖：parseArgs / formatRefactorResult / renderHelp
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 纯逻辑重放
// ---------------------------------------------------------------------------

interface ParsedRefactorArgs {
  help: boolean
  type: string
  target: string
  replacement?: string
  filePath?: string
  dryRun: boolean
  json: boolean
}

function parseArgs(raw: string): ParsedRefactorArgs {
  const result: ParsedRefactorArgs = {
    help: false,
    type: '',
    target: '',
    dryRun: false,
    json: false,
  }

  const parts = raw.trim().split(/\s+/).filter(Boolean)
  let i = 0

  while (i < parts.length) {
    const part = parts[i]
    if (part === '--help' || part === 'help') {
      result.help = true
    } else if (part === '--dry-run') {
      result.dryRun = true
    } else if (part === '--json') {
      result.json = true
    } else if (part === '--file' && i + 1 < parts.length) {
      result.filePath = parts[i + 1]
      i++
    } else if (!result.type) {
      result.type = part
    } else if (!result.target) {
      result.target = part
    } else if (!result.replacement) {
      result.replacement = part
    }
    i++
  }

  return result
}

function renderHelp(): string {
  return [
    '🔧 智能代码重构',
    '',
    'AI 驱动的安全代码重构工具，支持变量重命名、提取函数等操作。',
    '',
    '用法:',
    '  /refactor <类型> <目标> [选项]',
    '',
    '类型:',
    '  rename <旧名> <新名>    重命名变量/函数（跨文件安全替换）',
    '  extract <函数名>        提取函数（需要 AST 支持）',
    '  type-fix <类型> <修复>  类型修复（需要 TypeScript compiler API）',
    '',
    '选项:',
    '  --file <路径>       指定文件（rename/type-fix 必需）',
    '  --dry-run           预览变更，不实际修改',
    '  --json              JSON 格式输出',
    '  --help              显示帮助',
    '',
    '示例:',
    '  /refactor rename oldName newName --file src/app.ts',
    '  /refactor rename oldName newName --dry-run',
    '  /refactor rename oldName newName --json',
    '',
    '安全特性:',
    '  • 仅替换完整标识符，避免子串误匹配',
    '  • 保留原始格式和注释',
    '  • dry-run 模式预览变更',
  ].join('\n')
}

function formatRefactorResult(
  result: { summary: string; errors: string[]; changes: Array<{ file: string; line: number; original: string; modified: string }> },
  detailed: boolean,
): string {
  const lines: string[] = []

  lines.push('🔧 重构结果')
  lines.push('─'.repeat(50))
  lines.push(result.summary)
  lines.push('')

  if (result.errors.length > 0) {
    lines.push('❌ 错误:')
    result.errors.forEach(err => {
      lines.push(`  ${err}`)
    })
    lines.push('')
  }

  if (result.changes.length > 0 && detailed) {
    lines.push(`📋 变更详情 (${result.changes.length} 处):`)
    result.changes.slice(0, 20).forEach((change, i) => {
      lines.push(`  [${i + 1}] ${change.file}:${change.line}`)
      lines.push(`       - ${change.original}`)
      lines.push(`       + ${change.modified}`)
    })
    if (result.changes.length > 20) {
      lines.push(`  ... 还有 ${result.changes.length - 20} 处变更`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Tests: parseArgs
// ---------------------------------------------------------------------------

describe('refactor parseArgs', () => {
  it('空字符串应返回默认值', () => {
    expect(parseArgs('')).toEqual({
      help: false,
      type: '',
      target: '',
      dryRun: false,
      json: false,
    })
  })

  it('应解析 type 和 target', () => {
    const r = parseArgs('rename oldName newName')
    expect(r.type).toBe('rename')
    expect(r.target).toBe('oldName')
    expect(r.replacement).toBe('newName')
  })

  it('应解析 --file 选项', () => {
    const r = parseArgs('rename oldName newName --file src/app.ts')
    expect(r.filePath).toBe('src/app.ts')
  })

  it('应解析 --dry-run 选项', () => {
    const r = parseArgs('rename oldName newName --dry-run')
    expect(r.dryRun).toBe(true)
  })

  it('应解析 --json 选项', () => {
    const r = parseArgs('rename oldName newName --json')
    expect(r.json).toBe(true)
  })

  it('应解析 --help 选项', () => {
    const r = parseArgs('--help')
    expect(r.help).toBe(true)
  })

  it('help 子命令应触发 help', () => {
    const r = parseArgs('help')
    expect(r.help).toBe(true)
  })

  it('extract 类型应解析', () => {
    const r = parseArgs('extract myFunc')
    expect(r.type).toBe('extract')
    expect(r.target).toBe('myFunc')
  })

  it('type-fix 类型应解析', () => {
    const r = parseArgs('type-fix string number')
    expect(r.type).toBe('type-fix')
    expect(r.target).toBe('string')
    expect(r.replacement).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Tests: renderHelp
// ---------------------------------------------------------------------------

describe('refactor renderHelp', () => {
  it('应包含帮助标题', () => {
    const help = renderHelp()
    expect(help).toContain('智能代码重构')
    expect(help).toContain('🔧')
  })

  it('应包含用法说明', () => {
    const help = renderHelp()
    expect(help).toContain('/refactor <类型> <目标> [选项]')
  })

  it('应包含类型列表', () => {
    const help = renderHelp()
    expect(help).toContain('rename')
    expect(help).toContain('extract')
    expect(help).toContain('type-fix')
  })

  it('应包含选项说明', () => {
    const help = renderHelp()
    expect(help).toContain('--file')
    expect(help).toContain('--dry-run')
    expect(help).toContain('--json')
    expect(help).toContain('--help')
  })

  it('应包含示例', () => {
    const help = renderHelp()
    expect(help).toContain('src/app.ts')
    expect(help).toContain('--dry-run')
  })
})

// ---------------------------------------------------------------------------
// Tests: formatRefactorResult
// ---------------------------------------------------------------------------

describe('refactor formatRefactorResult', () => {
  it('应显示摘要', () => {
    const result = formatRefactorResult({
      summary: '完成 3 处重构',
      errors: [],
      changes: [],
    }, true)
    expect(result).toContain('🔧 重构结果')
    expect(result).toContain('完成 3 处重构')
  })

  it('应显示错误信息', () => {
    const result = formatRefactorResult({
      summary: '重构失败',
      errors: ['文件未找到', '权限不足'],
      changes: [],
    }, true)
    expect(result).toContain('❌ 错误:')
    expect(result).toContain('文件未找到')
    expect(result).toContain('权限不足')
  })

  it('应显示变更详情（detailed=true）', () => {
    const result = formatRefactorResult({
      summary: '完成重构',
      errors: [],
      changes: [
        { file: 'src/app.ts', line: 10, original: 'foo', modified: 'bar' },
        { file: 'src/utils.ts', line: 20, original: 'baz', modified: 'qux' },
      ],
    }, true)
    expect(result).toContain('📋 变更详情 (2 处)')
    expect(result).toContain('src/app.ts:10')
    expect(result).toContain('src/utils.ts:20')
  })

  it('应在 changes 超过 20 时截断', () => {
    const changes = Array.from({ length: 25 }, (_, i) => ({
      file: `file${i}.ts`,
      line: i,
      original: 'old',
      modified: 'new',
    }))
    const result = formatRefactorResult({
      summary: '完成重构',
      errors: [],
      changes,
    }, true)
    expect(result).toContain('还有 5 处变更')
  })

  it('detailed=false 时应隐藏变更详情', () => {
    const result = formatRefactorResult({
      summary: '完成重构',
      errors: [],
      changes: [{ file: 'src/app.ts', line: 10, original: 'foo', modified: 'bar' }],
    }, false)
    expect(result).not.toContain('📋 变更详情')
  })
})
