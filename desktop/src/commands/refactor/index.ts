import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { runRefactor, type RefactorResult } from '../../tools/RefactorTool/RefactorTool.js'

// ============================================================================
// Help Text
// ============================================================================

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

// ============================================================================
// Argument Parser
// ============================================================================

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

// ============================================================================
// Formatters
// ============================================================================

function formatRefactorResult(result: RefactorResult, detailed: boolean): string {
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

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const parsed = parseArgs(args ?? '')

  if (parsed.help || !parsed.type || !parsed.target) {
    return renderHelp()
  }

  // Execute refactor
  const options = {
    type: parsed.type as 'rename' | 'extract' | 'type-fix',
    target: parsed.target,
    replacement: parsed.replacement,
    filePath: parsed.filePath,
    dryRun: parsed.dryRun,
  }

  const result = runRefactor(options)

  if (parsed.json) {
    return JSON.stringify(
      {
        success: result.success,
        summary: result.summary,
        changes: result.changes,
        errors: result.errors,
      },
      null,
      2,
    )
  }

  return formatRefactorResult(result, !parsed.dryRun)
}

// ============================================================================
// Command Registration
// ============================================================================

const refactor = {
  type: 'local' as const,
  name: 'refactor',
  description: '智能代码重构 - AI 驱动的安全重构（变量重命名/提取函数/类型修复）',
  aliases: ['/refactor', '/rename', '/extract'],
  arguments: [
    {
      name: 'type',
      description: '重构类型: rename / extract / type-fix',
      required: true,
    },
    {
      name: 'target',
      description: '目标标识符',
      required: true,
    },
    {
      name: 'replacement',
      description: '替换内容（rename 必需）',
      required: false,
    },
    {
      name: '--file',
      description: '指定文件',
      required: false,
    },
    {
      name: '--dry-run',
      description: '预览变更',
      required: false,
    },
    {
      name: '--json',
      description: 'JSON 格式输出',
      required: false,
    },
    {
      name: 'help',
      description: '显示帮助',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
} satisfies Command

export default refactor
