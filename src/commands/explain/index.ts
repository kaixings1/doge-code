/**
 * commands/explain/index.ts — 智能代码解释命令
 *
 * 通过 AST 分析 + 知识图谱 + LLM 深度理解代码逻辑。
 * 复用已有基础设施：semanticSearch / knowledgeGraph / codeExplainer
 *
 * 用法:
 *   /explain <文件路径>                 解释整个文件
 *   /explain <文件路径>:<行号>          解释特定行
 *   /explain <文件路径>:<开始>-<结束>    解释行范围
 *   /explain <符号名>                    在项目中搜索并解释符号
 *   /explain <文件路径> --quick          快速静态分析（无 LLM）
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import {
  assembleExplainContext,
  parseLineRange,
  buildExplainPrompt,
  formatExplainResult,
  quickExplain,
} from '../../engine/codeExplainer.js'

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '# 📖 智能代码解释',
    '',
    '基于 AST 分析和知识图谱的代码解释工具。',
    '',
    '## 用法',
    '',
    '```',
    '/explain <文件路径或符号名> [选项]',
    '```',
    '',
    '## 选项',
    '',
    '| 选项 | 说明 |',
    '|------|------|',
    '| `--quick` | 快速静态分析（无 LLM） |',
    '| `--prompt` | 生成解释 prompt（供外部 LLM 使用） |',
    '| `--mode <模式>` | overview / detailed / architecture / security |',
    '| `--depth <1-3>` | 解释深度 |',
    '| `--line <行号>` | 聚焦特定行 |',
    '| `--help` | 显示帮助 |',
    '',
    '## 示例',
    '',
    '```',
    '/explain src/engine/semanticSearch.ts',
    '/explain src/engine/semanticSearch.ts:42',
    '/explain src/engine/semanticSearch.ts:10-50',
    '/explain PlanningFlow --quick',
    '/explain src/app.ts --mode security',
    '```',
    '',
    '## 特性',
    '',
    '- 自动提取符号定义（函数/类/接口/类型）',
    '- 知识图谱关系分析（导入/继承/调用）',
    '- 上下文代码片段（目标行前后各 5 行）',
    '- `--quick` 模式：纯静态分析，无需 LLM',
    '- `--prompt` 模式：生成结构化 prompt 供外部 LLM 使用',
  ].join('\n')
}

// ============================================================================
// 符号搜索
// ============================================================================

async function searchSymbolInProject(symbolName: string): Promise<{ file: string; line: number } | null> {
  const rootDir = process.cwd()
  const codeExts = ['.ts', '.tsx', '.js', '.jsx']

  try {
    const output = execSync(
      `rg -n --type ts --type tsx --type js --type jsx "\\b${symbolName}\\b" "${rootDir}" --no-heading -g "!node_modules" -g "!dist" -g "!build" -g "!.git"`,
      { encoding: 'utf-8', timeout: 5000, maxBuffer: 1024 * 1024 },
    ).trim()

    if (output) {
      const firstMatch = output.split('\n')[0]
      const match = firstMatch.match(/^(.+?):(\d+):/)
      if (match) {
        return { file: match[1], line: parseInt(match[2]) }
      }
    }
  } catch { /* rg 不可用或没找到 */ }

  // Fallback：递归扫描
  const { readdirSync, statSync } = await import('fs')
  const { join } = await import('path')

  async function scanDir(dir: string): Promise<{ file: string; line: number } | null> {
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
        const fullPath = join(dir, entry)
        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            const result = await scanDir(fullPath)
            if (result) return result
          } else if (stat.isFile() && codeExts.some(ext => entry.endsWith(ext))) {
            try {
              const content = await readFile(fullPath, 'utf-8')
              const lines = content.split('\n')
              for (let i = 0; i < lines.length; i++) {
                if (new RegExp(`\\b${symbolName}\\b`).test(lines[i])) {
                  return { file: fullPath, line: i + 1 }
                }
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return null
  }

  return scanDir(rootDir)
}

// ============================================================================
// Argument Parser
// ============================================================================

interface ParsedArgs {
  target: string
  mode: 'overview' | 'detailed' | 'architecture' | 'security'
  depth: number
  focusLine?: number
  isQuick: boolean
  isPrompt: boolean
  isSemantic: boolean
}

function parseArgs(raw: string): ParsedArgs {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  const result: ParsedArgs = {
    target: '',
    mode: 'overview',
    depth: 2,
    isQuick: false,
    isPrompt: false,
    isSemantic: false,
  }

  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (part === '--quick') {
      result.isQuick = true
    } else if (part === '--prompt') {
      result.isPrompt = true
    } else if (part === '--semantic') {
      result.isSemantic = true
    } else if (part === '--mode' && i + 1 < parts.length) {
      const mode = parts[i + 1]
      if (['overview', 'detailed', 'architecture', 'security'].includes(mode)) {
        result.mode = mode as ParsedArgs['mode']
      }
      i++
    } else if (part === '--depth' && i + 1 < parts.length) {
      result.depth = Math.max(1, Math.min(3, parseInt(parts[i + 1], 10) || 2))
      i++
    } else if (part === '--line' && i + 1 < parts.length) {
      result.focusLine = parseInt(parts[i + 1], 10)
      i++
    } else if (!part.startsWith('--')) {
      result.target = result.target ? result.target + ' ' + part : part
    }
    i++
  }

  return result
}

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args, context) => {
  const trimmed = (args ?? '').trim()

  // Help
  if (trimmed === '--help' || trimmed === 'help' || trimmed === '') {
    return { type: 'text', value: renderHelp() }
  }

  const options = parseArgs(trimmed)

  // 符号搜索模式
  let filePath: string
  let lineRange: { start: number; end: number } | undefined
  let symbolName: string | undefined

  if (!options.target.includes('/') && !options.target.includes('\\') && !options.target.includes('.ts') && !options.target.includes('.js')) {
    symbolName = options.target
    const found = await searchSymbolInProject(symbolName)
    if (!found) {
      return { type: 'text', value: `❌ 未找到符号: ${symbolName}\n\n提示: 使用完整文件路径或带行号的格式\n  /explain src/app.ts:42` }
    }
    filePath = found.file
    lineRange = { start: found.line, end: found.line }
  } else {
    // 解析文件路径和行范围
    const lastColonIdx = options.target.lastIndexOf(':')
    if (lastColonIdx > 0 && !options.target.slice(lastColonIdx + 1).includes('/') && !options.target.slice(lastColonIdx + 1).includes('\\')) {
      filePath = resolve(options.target.slice(0, lastColonIdx))
      const rangeStr = options.target.slice(lastColonIdx + 1)
      lineRange = parseLineRange(rangeStr)
    } else {
      filePath = resolve(options.target)
    }

    if (!existsSync(filePath)) {
      return { type: 'text', value: `❌ 文件不存在: ${filePath}\n\n使用 /explain --help 查看用法` }
    }
  }

  // 读取文件内容
  const content = await readFile(filePath, 'utf-8')
  if (!content.trim()) {
    return { type: 'text', value: `⚠️ 文件为空: ${filePath}` }
  }

  // 组装解释上下文
  const ctx = assembleExplainContext(
    filePath,
    content,
    lineRange,
    options.isSemantic ? options.target : undefined,
    symbolName,
  )

  // 生成 prompt
  const modePrompt = buildExplainPrompt(ctx)

  if (options.isQuick) {
    const explanation = quickExplain(ctx)
    return { type: 'text', value: formatExplainResult(ctx, explanation) }
  }

  // 默认：快速解释 + prompt
  const quick = quickExplain(ctx)
  const result = [
    formatExplainResult(ctx, quick),
    '',
    '💡 需要更详细的解释？将以下 prompt 发送给 LLM：',
    '',
    '```',
    modePrompt,
    '```',
  ].join('\n')

  return { type: 'text', value: result }
}

// ============================================================================
// Command Registration
// ============================================================================

const explain = {
  type: 'local' as const,
  name: 'explain',
  description: '智能代码解释 - 基于 AST 和知识图谱的代码分析',
  aliases: ['/explain', '/code-explain', '/解释'],
  arguments: [
    {
      name: 'target',
      description: '文件路径（支持行号范围 file.ts:10-20）或符号名',
      required: true,
    },
    {
      name: '--quick',
      description: '快速静态分析（无 LLM）',
      required: false,
    },
    {
      name: '--prompt',
      description: '生成解释 prompt（供外部 LLM 使用）',
      required: false,
    },
    {
      name: '--mode',
      description: '解释模式: overview / detailed / architecture / security',
      required: false,
    },
    {
      name: '--depth',
      description: '解释深度: 1-3',
      required: false,
    },
    {
      name: '--line',
      description: '聚焦特定行',
      required: false,
    },
    {
      name: 'help',
      description: '显示帮助',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default explain
