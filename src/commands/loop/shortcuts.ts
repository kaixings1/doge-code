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
import { extractLoopIntent } from './intent.js'

/**
 * 解析 loop 命令的 CLI 选项（极限版）
 */
export function parseLoopArgs(args: string): {
  goal: string
  strategy: LoopStrategyName
  maxIterations: number
  criteria: string[]
  outputPath: string | null
  timeout: number
  retries: number
  cleanup: boolean
  json: boolean
  help: boolean
  examples: boolean
  parallel: number
  auto: boolean
  budget: number
  verify: string
  report: string | null
  checkpoint: string | null
  tools: string
  snapshot: boolean
  autoRepair: boolean
  progressInterval: number
  ask: boolean
} {
  const result = {
    goal: '',
    strategy: 'openhands' as LoopStrategyName,
    maxIterations: 20,
    criteria: [] as string[],
    outputPath: null as string | null,
    timeout: 120000,
    retries: 3,
    cleanup: false,
    json: false,
    help: false,
    examples: false,
    parallel: 1,
    auto: false,
    budget: 0,
    verify: 'none',
    report: null as string | null,
    checkpoint: null as string | null,
    tools: '',
    snapshot: false,
    autoRepair: true,
    progressInterval: 0,
    ask: false,
  }

  // 引号感知分词：保留 "..." 内的空格（如 --criteria "文章 CRUD"）
  const parts = (args.trim().match(/"([^"]*)"|\S+/g) || []).map(tok => {
    // 剥离包裹的引号
    if (tok.startsWith('"') && tok.endsWith('"') && tok.length >= 2) {
      return tok.slice(1, -1)
    }
    return tok
  }).filter(Boolean)
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
    } else if (part === '--auto') {
      result.auto = true
    } else if (part === '--tools' && i + 1 < parts.length) {
      result.tools = parts[++i]
    } else if (part === '--parallel' && i + 1 < parts.length) {
      result.parallel = parseInt(parts[++i], 10) || 1
    } else if (part === '--budget' && i + 1 < parts.length) {
      // 支持 30s / 5m / 2h / 60000 (ms)
      const raw = parts[++i]
      const m = raw.match(/^(\d+)(s|m|h|ms)?$/i)
      if (m) {
        const n = parseInt(m[1], 10)
        const unit = (m[2] || 'ms').toLowerCase()
        result.budget = unit === 's' ? n * 1000 : unit === 'm' ? n * 60000 : unit === 'h' ? n * 3600000 : n
      }
    } else if (part === '--verify' && i + 1 < parts.length) {
      const v = parts[++i].toLowerCase()
      if (['none', 'test', 'build', 'lint', 'files'].includes(v)) {
        result.verify = v
      }
    } else if (part === '--report' && i + 1 < parts.length) {
      result.report = parts[++i]
    } else if (part === '--checkpoint' && i + 1 < parts.length) {
      result.checkpoint = parts[++i]
    } else if (part === '--strategy' && i + 1 < parts.length) {
      result.strategy = parts[++i] as LoopStrategyName
    } else if (part === '--max-iterations' && i + 1 < parts.length) {
      result.maxIterations = parseInt(parts[++i], 10) || 20
    } else if (part === '--criteria' && i + 1 < parts.length) {
      result.criteria.push(parts[++i])
    } else if (part === '--snapshot') {
      // B3 安全快照：执行前自动快照，失败可回滚
      result.snapshot = true
    } else if (part === '--no-repair') {
      // B2 禁用验证失败自动修复
      result.autoRepair = false
    } else if (part === '--progress' && i + 1 < parts.length) {
      // B4 定期进度汇报间隔（秒）
      const n = parseInt(parts[++i], 10)
      if (!isNaN(n) && n > 0) result.progressInterval = n
    } else if (part === '--ask') {
      // B4 关键节点询问用户方向
      result.ask = true
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

  // ─── 从自然语言 goal 中提取"直到/直至"成功标准 ───
  // 例如: /loop 创建服务器，直到能返回 200 → goal="创建服务器" criteria=["能返回 200"]
  if (result.goal && !result.help && !result.examples) {
    const loopIntent = extractLoopIntent(result.goal)
    if (loopIntent) {
      result.goal = loopIntent.goal
      if (loopIntent.criteria.length > 0) {
        for (const c of loopIntent.criteria) {
          if (!result.criteria.includes(c)) {
            result.criteria.push(c)
          }
        }
      }
      if (!result.tools && loopIntent.toolHints.length > 0) {
        result.tools = loopIntent.toolHints.slice(0, 3).join(', ')
      }
      // 自动策略推断：仅当用户未显式指定策略时
      if (!result.auto && loopIntent.strategyHint) {
        result.strategy = loopIntent.strategyHint
      }
    }
  }

  return result
}

/**
 * 自适应策略选择 — 根据目标关键词自动选择最合适的策略
 */
export function autoSelectStrategy(goal: string): LoopStrategyName {
  const g = goal.toLowerCase()

  // 有明确状态流转/工作流 → langgraph
  if (/工作流|workflow|状态机|流程|pipeline|多步|阶段/.test(g)) return 'langgraph'
  // 多角色协作/团队 → crew
  if (/团队|协作|多角色|crew|分工|assign/.test(g)) return 'crew'
  // 探索性/创新/研究 → autogpt
  if (/研究|探索|调研|创新|发明|brainstorm|探索性/.test(g)) return 'autogpt'
  // 软件工程/代码库级任务 → swe-agent
  if (/重构|代码|代码库|软件|工程|bug|缺陷|修复.*代码|github|仓库/.test(g)) return 'swe-agent'
  // 默认 → openhands
  return 'openhands'
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
        parallel: parsed.parallel,
        budgetMs: parsed.budget > 0 ? parsed.budget : undefined,
        verifyMode: parsed.verify !== 'none' ? parsed.verify as any : undefined,
        checkpoint: parsed.checkpoint ?? undefined,
        report: parsed.report ?? undefined,
      }
      // B3/B2/B4：安全快照 / 自动修复 / 进度汇报与询问
      loopOptions.snapshot = parsed.snapshot
      loopOptions.autoRepair = parsed.autoRepair
      if (parsed.progressInterval > 0) {
        loopOptions.progressIntervalMs = parsed.progressInterval * 1000
      }
      if (parsed.ask) {
        loopOptions.askUser = async (question: string) => {
          onDone(`\n${question}\n（当前模式无法交互，自动选择「继续执行」）`, { display: 'system' })
          return '继续执行'
        }
      }
      if (context) {
        loopOptions.taskExecutor = createAITaskExecutor(context, {
          maxRetries: parsed.retries,
          taskTimeout: parsed.timeout,
          apiTimeout: 30000,
          autoCleanup: parsed.cleanup,
          outputPath: parsed.outputPath ?? undefined,
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
          case 'decomposition':
            // 任务分解完成，进入执行阶段
            progressState.phase = 'executing'
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'iteration_start':
            progressState.phase = 'executing'
            progressState.currentIteration = event.iteration as number
            progressState.maxIterations = (event.maxIterations as number) ?? 20
            progressState.fileCount = fileCount
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_start':
            progressState.currentTask = (event.description as string) ?? ''
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_end': {
            const output = (event.output as string) ?? ''
            const newFiles = new Set<string>()
            // Extract bullet-format files (• file/path)
            const bulletMatches = output.match(/^\s*(?:•|·|-)\s*([\w./-]+(?:\.[\w]+)?)\s*$/gm) || []
            for (const m of bulletMatches) {
              const fp = m.replace(/^\s*(?:•|·|-)\s*/, '').trim()
              if (fp && /[\w./-]+\.[\w]+/.test(fp)) newFiles.add(fp)
            }
            // Extract 📄 format files
            const markdownMatches = output.match(/📄\s*([^\s]+)/g) || []
            for (const m of markdownMatches) {
              const fp = m.replace('📄 ', '').trim()
              if (fp && /[\w./-]+\.[\w]+/.test(fp)) newFiles.add(fp)
            }
            if (newFiles.size > 0) {
              newFiles.forEach(fp => { createdFiles.push(fp); fileCount++ })
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
          case 'progress':
            // B4 定期进度汇报 — 刷新状态行（确保 UI 不死锁）
            progressState.fileCount = fileCount
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
