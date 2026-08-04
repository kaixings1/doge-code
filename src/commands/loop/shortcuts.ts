/**
 * Loop Strategy Shortcuts
 *
 * 快捷方式命令 — 无参数时显示超级说明书级别的手册
 */

import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { executeLoop } from './engine.js'
import type { LoopStrategyName } from './types.js'
import { strategyManuals } from './strategy-manuals.js'
import { createAITaskExecutor } from './ai-task-executor.js'
import type { ExecutorOptions } from './ai-task-executor.js'
import { formatStatusLine, formatFinalReport, formatSubTaskSummary, type ProgressState } from './progress-ui.js'

/**
 * 解析 loop 命令的 CLI 选项
 */
function parseLoopArgs(args: string[]): {
  goal: string
  strategy: LoopStrategyName
  maxIterations: number
  criteria: string[]
  outputPath: string | undefined
  timeout: number
  retries: number
  cleanup: boolean
  json: boolean
  help: boolean
  examples: boolean
} {
  const result = {
    goal: '',
    strategy: 'openhands' as LoopStrategyName,
    maxIterations: 20,
    criteria: [] as string[],
    outputPath: undefined as string | undefined,
    timeout: 120000,
    retries: 3,
    cleanup: false,
    json: false,
    help: false,
    examples: false,
  }

  const parts = args.trim().split(/\s+/).filter(Boolean)
  const goalParts: string[] = []
  let i = 0

  while (i < parts.length) {
    const part = parts[i]
    if (part === '--help' || part === 'help') {
      result.help = true
    } else if (part === '--examples' || part === 'examples') {
      result.examples = true
    } else if (part === '--json') {
      result.json = true
    } else if (part === '--cleanup') {
      result.cleanup = true
    } else if (part === '--strategy' && i + 1 < parts.length) {
      result.strategy = parts[++i] as LoopStrategyName
    } else if (part === '--max-iterations' && i + 1 < parts.length) {
      result.maxIterations = parseInt(parts[++i], 10) || 20
    } else if (part === '--criteria' && i + 1 < parts.length) {
      result.criteria.push(parts[++i])
    } else if (part === '--output' && i + 1 < parts.length) {
      result.outputPath = parts[++i]
    } else if (part === '--timeout' && i + 1 < parts.length) {
      result.timeout = parseInt(parts[++i], 10) || 120000
    } else if (part === '--retries' && i + 1 < parts.length) {
      result.retries = parseInt(parts[++i], 10) || 3
    } else {
      goalParts.push(part)
    }
    i++
  }

  result.goal = goalParts.join(' ')
  return result
}


const complexityIcon = (c: string) => {
  if (c === '入门') return '🟢'
  if (c === '进阶') return '🟡'
  if (c === '高级') return '🟠'
  return '🔴'
}

/** 生成超级说明书级别的帮助文本 */
function generateManualText(strategyName: LoopStrategyName): string {
  const m = strategyManuals[strategyName]
  if (!m) {
    return `🔄 /loop-${strategyName} — 请描述你的目标`
  }

  const L = '━'
  const lines: string[] = []

  // 标题
  lines.push(`╔${L.repeat(58)}╗`)
  lines.push(`║  🔄 ${m.displayName.padEnd(52)}║`)
  lines.push(`║     ${m.tagline.padEnd(52)}║`)
  lines.push(`╚${L.repeat(58)}╝`)
  lines.push('')

  // 概述
  lines.push('📖 概述')
  lines.push('─'.repeat(60))
  for (const para of m.overview.split('\n').filter(p => p.trim())) {
    lines.push(para.trim())
  }
  lines.push('')

  // 适用场景
  lines.push('🎯 适用场景')
  lines.push('─'.repeat(60))
  for (const uc of m.useCases) lines.push(`  ✓ ${uc}`)
  lines.push('')

  lines.push('🚫 不适用场景')
  lines.push('─'.repeat(60))
  for (const nc of m.notSuitableFor) lines.push(`  ✗ ${nc}`)
  lines.push('')

  // 核心概念
  lines.push('⚙️ 核心概念')
  lines.push('─'.repeat(60))
  for (const c of m.coreConcepts) {
    lines.push(`  • ${c.term}: ${c.definition}`)
  }
  lines.push('')

  // 架构图
  lines.push('🏗️ 架构图')
  lines.push('─'.repeat(60))
  lines.push(m.architecture)
  lines.push('')

  // 执行流程
  lines.push('🔄 执行流程')
  lines.push('─'.repeat(60))
  for (const step of m.executionFlow) {
    lines.push(`  ${step}`)
  }
  lines.push('')

  // 参数说明
  lines.push('📋 参数说明')
  lines.push('─'.repeat(60))
  lines.push(`  /loop-${m.name} "目标" [选项]`)
  lines.push('')
  for (const p of m.parameters) {
    lines.push(`  --${p.name.padEnd(20)} ${p.type.padEnd(10)} 默认: ${p.default.padEnd(8)} ${p.description}`)
  }
  lines.push('')

  // 使用示例
  lines.push('💡 使用示例')
  lines.push('═'.repeat(60))
  for (const ex of m.examples) {
    const icon = complexityIcon(ex.complexity)
    lines.push('')
    lines.push(`${icon} ${ex.title} [${ex.complexity}]`)
    lines.push('─'.repeat(60))
    lines.push(`  📝 场景: ${ex.scenario}`)
    lines.push(`  ⌨️  命令: ${ex.command}`)
    lines.push(`  🔧 流程:`)
    for (const step of ex.flow) {
      lines.push(`     ${step}`)
    }
    lines.push(`  📊 输出: ${ex.output}`)
    lines.push(`  💡 提示:`)
    for (const tip of ex.tips) {
      lines.push(`     • ${tip}`)
    }
  }
  lines.push('')

  // 最佳实践
  lines.push('🎓 最佳实践')
  lines.push('─'.repeat(60))
  for (const bp of m.bestPractices) {
    lines.push(`  ✓ ${bp}`)
  }
  lines.push('')

  // 常见陷阱
  lines.push('⚠️ 常见陷阱')
  lines.push('─'.repeat(60))
  for (const cp of m.commonPitfalls) {
    lines.push(`  ${cp}`)
  }
  lines.push('')

  // 策略对比
  lines.push('🔗 与其他策略的对比')
  lines.push('─'.repeat(60))
  for (const c of m.comparison) {
    lines.push(`  ${c.strategy.padEnd(12)} 用: ${c.whenToUse}`)
    lines.push(`  ${' '.repeat(12)} 不用: ${c.whenNotToUse}`)
  }
  lines.push('')

  // 性能考量
  lines.push('📈 性能考量')
  lines.push('─'.repeat(60))
  for (const p of m.performance) {
    lines.push(`  • ${p}`)
  }
  lines.push('')

  // 扩展和定制
  lines.push('🔧 扩展和定制')
  lines.push('─'.repeat(60))
  for (const c of m.customization) {
    lines.push(`  • ${c}`)
  }
  lines.push('')

  // 底部提示
  lines.push('═'.repeat(60))
  lines.push('💬 快速使用:')
  lines.push(`  /loop-${m.name} "上面任意一个目标或你自己的目标"`)
  lines.push(`  /loop-${m.name} "目标" --criteria "成功标准"`)
  lines.push('')
  lines.push(`🔄 也可以使用主命令: /loop "目标" --strategy ${m.name}`)
  lines.push('═'.repeat(60))

  return lines.join('\n')
}

function createShortcutCommand(strategyName: LoopStrategyName, aliases: string[]): Command {
  const call: LocalJSXCommandCall = async (onDone, context, args) => {
    // Parse CLI options from args
    const parsed = parseLoopArgs(args)
    if (parsed.help) {
      onDone(generateManualText(strategyName))
      return null
    }

    try {
      const loopOptions: Parameters<typeof executeLoop>[0] = {
        strategy: strategyName,
        goal: { description: parsed.goal, maxIterations: parsed.maxIterations },
      }
      if (context) {
        loopOptions.taskExecutor = createAITaskExecutor(context, {
          maxRetries: parsed.retries,
          taskTimeout: parsed.timeout,
          apiTimeout: 30000,
          autoCleanup: parsed.cleanup,
          outputPath: parsed.outputPath,
        })
      }

      const startTime = Date.now()
      let fileCount = 0
      const createdFiles: string[] = []
      const progressState: ProgressState = {
        strategy: strategyName,
        currentIteration: 0,
        maxIterations: 20,
        currentTask: '',
        fileCount: 0,
        startTime,
        phase: 'idle',
      }

      // 实时状态更新（单行覆盖模式）
      loopOptions.onProgress = (event: { type: string; [k: string]: unknown }) => {
        switch (event.type) {
          case 'loop_start':
            progressState.phase = 'planning'
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'iteration_start':
            progressState.phase = 'executing'
            progressState.currentIteration = event.iteration as number
            progressState.maxIterations = event.maxIterations as number
            progressState.fileCount = fileCount
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_start':
            progressState.currentTask = (event.description as string) ?? ''
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_end': {
            const fileMatches = (event.output as string ?? '').match(/📄\s*(.+?)(?:\s|$)/g)
            if (fileMatches) {
              fileCount += fileMatches.length
              for (const m of fileMatches) {
                createdFiles.push(m.replace('📄 ', '').trim())
              }
              progressState.fileCount = fileCount
            }
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          }
          case 'task_failed':
            progressState.phase = 'error'
            progressState.currentTask = `失败: ${event.error?.toString().slice(0, 30)}`
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'evaluation':
            if (event.achieved) {
              progressState.phase = 'verifying'
              onDone(formatStatusLine(progressState), { display: 'system' })
            }
            break
          case 'loop_end': {
            progressState.phase = 'done'
            progressState.fileCount = fileCount
            onDone(formatStatusLine(progressState), { display: 'user' })
            break
          }
          case 'error':
            progressState.phase = 'error'
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
        }
      }

      const result = await executeLoop(loopOptions)

      const lines: string[] = [
        formatFinalReport(
          { ...progressState, phase: result.success ? 'done' : 'error', fileCount },
          result.success,
          result.reason,
          createdFiles,
        ),
        formatSubTaskSummary(result.subTasks),
      ]

      onDone(lines.join('\n'))
      return null

      lines.push('')
      lines.push('子任务:')
      result.subTasks.forEach((t, i) => {
        const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
        const resultLen = t.result?.length ?? 0
        lines.push(`  ${i + 1}. ${icon} ${t.description}${resultLen > 0 ? ` (${resultLen}字符)` : ''}`)
      })

      onDone(lines.join('\n'))
      return null
    } catch (error) {
      onDone(`❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  return {
    type: 'local-jsx',
    name: `loop-${strategyName}`,
    description: `循环引擎 (${strategyName} 策略)`,
    aliases,
    supportsNonInteractive: false,
    load: async () => ({ call }),
  } satisfies Command
}

export const loopShortcuts: Command[] = [
  createShortcutCommand('langgraph', ['/loop-langgraph', '/lg']),
  createShortcutCommand('crew', ['/loop-crew', '/crew']),
  createShortcutCommand('autogpt', ['/loop-autogpt', '/agpt']),
  createShortcutCommand('openhands', ['/loop-openhands', '/oh']),
  createShortcutCommand('swe-agent', ['/loop-swe', '/swe']),
]
