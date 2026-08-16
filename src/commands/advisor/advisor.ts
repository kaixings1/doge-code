import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  canUserConfigureAdvisor,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from '../../utils/advisor.js'
import {
  getDefaultMainLoopModelSetting,
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import { validateModel } from '../../utils/model/validateModel.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { analyzeCodebase, generateAdvice } from '../../tools/AdvisorTool/AdvisorTool.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdvisorOptions {
  subcommand: 'status' | 'analyze' | 'off'
  focus: string
  path: string
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): AdvisorOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: AdvisorOptions = {
    subcommand: parts.length === 0 ? 'status' : 'analyze',
    focus: 'code',
    path: '',
  }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (p === '--focus' && i + 1 < parts.length) {
      const f = parts[++i]!
      if (['code', 'architecture', 'performance', 'security'].includes(f)) {
        opts.focus = f
      }
    } else if (p === '--path' && i + 1 < parts.length) {
      opts.path = parts[++i]!
    } else if (p === 'off' || p === 'unset') {
      opts.subcommand = 'off'
    } else if (p === 'analyze') {
      opts.subcommand = 'analyze'
    } else if (p === 'status') {
      opts.subcommand = 'status'
    } else if (!p.startsWith('--')) {
      // Model name → treat as status/set
      opts.subcommand = 'status'
    }
  }

  return opts
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatAnalysisResult(focus: string, analysis: Awaited<ReturnType<typeof analyzeCodebase>>, result: ReturnType<typeof generateAdvice>): string {
  const lines: string[] = []

  lines.push('🤖 代码顾问分析')
  lines.push('')
  lines.push(`  领域: ${focus}`)
  lines.push(`  分析文件数: ${analysis.filesAnalyzed}`)
  lines.push(`  总行数: ${analysis.totalLines}`)
  lines.push(`  函数数: ${analysis.functions}`)
  lines.push(`  类数: ${analysis.classes}`)
  lines.push(`  平均复杂度: ${analysis.avgComplexity}`)
  lines.push(`  最大复杂度: ${analysis.maxComplexity}`)
  lines.push('')

  if (result.suggestions.length > 0) {
    lines.push(`💡 建议 (${result.suggestions.length} 条, 置信度 ${Math.round(result.confidence * 100)}%):`)
    lines.push('')
    for (let i = 0; i < result.suggestions.length; i++) {
      lines.push(`  ${i + 1}. ${result.suggestions[i]}`)
    }
  } else {
    lines.push('✅ 未发现明显问题。')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const opts = parseArgs(args)

  // Handle model configuration (status/off/set)
  if (opts.subcommand !== 'analyze') {
    const arg = args.trim().toLowerCase()

    if (!arg || opts.subcommand === 'status') {
      const current = context.getAppState().advisorModel
      if (!current) {
        return {
          type: 'text',
          value: 'Advisor: 未设置\n使用 "/advisor <模型>" 启用（例如 "/advisor opus"）。',
        }
      }
      const baseModel = parseUserSpecifiedModel(
        context.getAppState().mainLoopModel ?? getDefaultMainLoopModelSetting(),
      )
      if (!modelSupportsAdvisor(baseModel)) {
        return {
          type: 'text',
          value: `⚠️ Advisor: ${current}（未激活）\n当前模型（${baseModel}）不支持 advisor。`,
        }
      }
      return {
        type: 'text',
        value: `ℹ️ Advisor: ${current}\n使用 "/advisor unset" 禁用或 "/advisor <模型>" 更改。`,
      }
    }

    if (opts.subcommand === 'off') {
      const prev = context.getAppState().advisorModel
      context.setAppState(s => {
        if (s.advisorModel === undefined) return s
        return { ...s, advisorModel: undefined }
      })
      updateSettingsForSource('userSettings', { advisorModel: undefined })
      return {
        type: 'text',
        value: prev
          ? `✅ 已禁用 Advisor（之前是 ${prev}）。`
          : 'ℹ️ Advisor 已经是未设置状态。',
      }
    }

    // Set model
    const normalizedModel = normalizeModelStringForAPI(arg)
    const resolvedModel = parseUserSpecifiedModel(arg)
    const { valid, error } = await validateModel(resolvedModel)
    if (!valid) {
      return {
        type: 'text',
        value: error
          ? `无效的 advisor 模型：${error}`
          : `未知模型：${arg}（${resolvedModel}）`,
      }
    }

    if (!isValidAdvisorModel(resolvedModel)) {
      return {
        type: 'text',
        value: `❌ 模型 ${arg}（${resolvedModel}）不能用作 advisor`,
      }
    }

    context.setAppState(s => {
      if (s.advisorModel === normalizedModel) return s
      return { ...s, advisorModel: normalizedModel }
    })
    updateSettingsForSource('userSettings', { advisorModel: normalizedModel })

    const baseModel = parseUserSpecifiedModel(
      context.getAppState().mainLoopModel ?? getDefaultMainLoopModelSetting(),
    )
    if (!modelSupportsAdvisor(baseModel)) {
      return {
        type: 'text',
        value: `⚠️ Advisor 已设置为 ${normalizedModel}。\n注意：您当前的模型（${baseModel}）不支持 advisor。切换到支持的模型以使用 advisor。`,
      }
    }

    return {
      type: 'text',
      value: `✅ Advisor 已设置为 ${normalizedModel}。`,
    }
  }

  // Analyze mode
  try {
    const analysis = await analyzeCodebase(opts.path || undefined)
    const result = generateAdvice(opts.focus, analysis)
    const output = formatAnalysisResult(opts.focus, analysis, result)
    return { type: 'text', value: output }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 分析失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
