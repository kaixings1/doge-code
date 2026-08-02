import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import { parseDiff } from '../../utils/diffParser.js'
import { buildReviewPrompt, type ReviewMode } from '../../utils/promptBuilder.js'
import { mapReviewComments } from '../../utils/lineMapper.js'
import { buildReviewReport, formatReviewReport, summarizeReport } from '../../utils/reviewReport.js'

// ============================================================================
// Types
// ============================================================================

interface ParsedReviewArgs {
  help: boolean
  mode: ReviewMode | undefined
  json: boolean
  showContext: boolean
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🔍 智能代码审查助手',
    '',
    '基于 AI 的代码变更审查，自动检测安全漏洞、代码质量和最佳实践问题。',
    '',
    '用法:',
    '  /code-review-assistant [选项]',
    '',
    '选项:',
    '  --mode <mode>       审查模式: comprehensive (综合) / security (安全) / quality (质量) / performance (性能)',
    '  --json             以 JSON 格式输出',
    '  --context          在评论中显示上下文代码',
    '',
    '示例:',
    '  /code-review-assistant',
    '  /code-review-assistant --mode security',
    '  /code-review-assistant --json',
    '',
    '说明:',
    '  审查基于当前 git diff（未提交的变更）。',
    '  请在修改代码后运行，将 diff 发送给 AI 进行审查。',
  ].join('\n')
}

// ============================================================================
// Git Diff
// ============================================================================

async function getGitDiff(): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const proc = require('child_process').spawnSync(
      'git',
      ['diff', '--no-color', '--unified=5'],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
      },
    )

    if (proc.error) {
      reject(new Error(`git diff 失败: ${proc.error.message}`))
      return
    }

    resolve(proc.stdout ?? '')
  })

  return result
}

// ============================================================================
// AI Review Execution
// ============================================================================

async function runAIReview(
  context: LocalJSXCommandContext,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> {
  // 通过工具调用 AI 进行审查
  const result = await context.options.tools.execute({
    name: 'ask',
    input: {
      prompt: `${systemPrompt}\n\n${userMessage}`,
      maxTokens,
    },
  })

  const content = result.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map(block => {
      if (typeof block === 'string') return block
      if (block && typeof block === 'object' && 'text' in block) {
        return (block as { text: string }).text
      }
      return ''
    }).join('')
  }
  return '[]'
}

// ============================================================================
// AI Result Parser
// ============================================================================

function parseAIResult(raw: string): Array<{
  filePath: string
  lineNumber?: number
  oldLineNumber?: number
  content: string
  severity: 'error' | 'warning' | 'info'
  category: string
}> {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item: unknown): item is {
        filePath: string
        lineNumber?: number
        oldLineNumber?: number
        content: string
        severity: string
        category: string
      } =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.filePath === 'string' &&
        typeof item.content === 'string',
    ).map(item => ({
      filePath: item.filePath,
      lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : undefined,
      oldLineNumber: typeof item.oldLineNumber === 'number' ? item.oldLineNumber : undefined,
      content: item.content,
      severity: ['error', 'warning', 'info'].includes(item.severity)
        ? (item.severity as 'error' | 'warning' | 'info')
        : 'info',
      category: item.category ?? 'general',
    }))
  } catch {
    return []
  }
}

// ============================================================================
// Argument Parser
// ============================================================================

function parseArgs(raw: string): ParsedReviewArgs {
  const result: ParsedReviewArgs = {
    help: false,
    mode: undefined,
    json: false,
    showContext: false,
  }

  const parts = raw.trim().split(/\s+/).filter(Boolean)
  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (part === '--help' || part === 'help') {
      result.help = true
    } else if (part === '--mode' && i + 1 < parts.length) {
      const mode = parts[i + 1] as string
      if (['comprehensive', 'security', 'quality', 'performance'].includes(mode)) {
        result.mode = mode as ReviewMode
      }
      i++
    } else if (part === '--json') {
      result.json = true
    } else if (part === '--context') {
      result.showContext = true
    }
    i++
  }

  return result
}

// ============================================================================
// Main Command Implementation
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parsed = parseArgs(args ?? '')

  // Help
  if (parsed.help || (!args && !parsed.mode)) {
    return renderHelp()
  }

  try {
    // 获取 git diff
    const diffText = await getGitDiff()
    if (!diffText.trim()) {
      return '✅ 没有需要审查的代码变更（工作目录干净）。'
    }

    // 解析 diff
    const parsedDiff = parseDiff(diffText)
    if (parsedDiff.fileCount === 0) {
      return '✅ 未检测到有意义的代码变更。'
    }

    // 构建审查 prompt
    const { systemPrompt, userMessage } = buildReviewPrompt(parsedDiff, {
      mode: parsed.mode ?? 'comprehensive',
      maxChars: 100_000,
    })

    // 调用 AI 引擎进行审查
    const aiResult = await runAIReview(context, systemPrompt, userMessage, 20_000)

    // 解析 AI 返回的评论
    const aiComments = parseAIResult(aiResult)

    // 将评论映射到具体行号
    const mappingResult = mapReviewComments(parsedDiff, aiComments)

    // 构建审查报告
    const report = buildReviewReport(
      Array.from(mappingResult.commentsByFile.values()).flat(),
      mappingResult.unmappedWarnings,
      {
        showContext: parsed.showContext,
        minSeverity: 'info',
      },
    )

    // 输出结果
    if (parsed.json) {
      const json = {
        summary: report.summary,
        filesReviewed: parsedDiff.fileCount,
        hasBinaryChanges: parsedDiff.hasBinaryChanges,
        comments: {
          errors: report.comments.errors,
          warnings: report.comments.warnings,
          info: report.comments.info,
        },
        unmappedWarnings: report.unmappedWarnings,
      }
      return JSON.stringify(json, null, 2)
    }

    const summary = summarizeReport(report)
    const detail = formatReviewReport(report, {
      showContext: parsed.showContext,
      maxFiles: 20,
    })

    return `${summary}\n\n${detail}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `❌ 代码审查失败: ${message}`
  }
}
