/**
 * /loop — 目标导向循环引擎
 *
 * 给 AI 一个目标，在达成目标前一直循环处理。
 * 支持 5 种循环策略，灵感来自顶级开源项目。
 *
 * 策略：
 *   langgraph  — LangGraph 风格状态机循环图（节点/边/条件跳转）
 *   crew       — CrewAI 风格多 Agent 协作循环（角色分配 + 任务编排）
 *   autogpt    — AutoGPT 风格目标驱动循环（任务分解 + 自我评估）
 *   openhands  — OpenHands 风格工程代理循环（计划-执行-验证）
 *   swe-agent  — SWE-agent 风格 Bug 修复循环（补丁生成 + 验证）
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { executeLoop, isValidStrategy } from './engine.js'
import { getStrategyInfo, getAvailableStrategies } from './strategies/index.js'
import type { LoopStrategyName } from './types.js'

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  const strategies = getStrategyInfo()

  const lines: string[] = [
    '🔄 目标导向循环引擎',
    '',
    '给 AI 一个目标，在达成目标前一直循环处理。',
    '',
    '═══════════════════════════════════════════════════════',
    '用法:',
    '  /loop <目标描述> [策略] [选项]',
    '',
    '═══════════════════════════════════════════════════════',
    '策略（--strategy <name>）：',
    '',
  ]

  for (const s of strategies) {
    const displayName = s.displayName.padEnd(20)
    lines.push(`  ${s.name.padEnd(12)} ${displayName} ${s.description}`)
  }

  lines.push('')
  lines.push('═══════════════════════════════════════════════════════')
  lines.push('选项:')
  lines.push('  --strategy <name>     循环策略（默认: openhands）')
  lines.push('  --max-iterations <n>  最大迭代次数（默认: 20）')
  lines.push('  --max-concurrent <n>  最大并发 Agent 数（仅 crew 策略，默认: 3）')
  lines.push('  --criteria <标准>     成功标准（可多次指定）')
  lines.push('  --json                JSON 格式输出结果')
  lines.push('  --examples            显示详细示例')
  lines.push('  --help                显示此帮助')
  lines.push('')
  lines.push('═══════════════════════════════════════════════════════')
  lines.push('示例:')
  lines.push('  /loop "重构用户模块"')
  lines.push('  /loop "修复所有 TypeScript 错误" --strategy swe-agent')
  lines.push('  /loop "实现用户注册功能" --strategy autogpt --max-iterations 30')
  lines.push('  /loop "优化数据库查询性能" --strategy langgraph --criteria "查询时间 < 100ms"')
  lines.push('  /loop "代码审查并修复问题" --strategy crew --max-concurrent 5')
  lines.push('  /loop "制定项目计划并实现" --strategy openhands --criteria "所有测试通过" --criteria "无 lint 错误"')
  lines.push('')
  lines.push('═══════════════════════════════════════════════════════')
  lines.push('快捷方式:')
  for (const s of strategies) {
    lines.push(`  /loop-${s.name} <目标>  等同于 /loop <目标> --strategy ${s.name}`)
  }
  lines.push('')
  lines.push('═══════════════════════════════════════════════════════')
  lines.push('提示:')
  lines.push('  • 不输入目标时，显示交互式提示')
  lines.push('  • 使用 --examples 查看详细使用示例')
  lines.push('  • 使用 --criteria 指定成功标准，让循环更智能地判断是否完成')
  lines.push('  • 不同策略适合不同场景：')
  lines.push('    - langgraph: 需要条件分支的复杂流程')
  lines.push('    - crew: 需要多角色协作的大任务')
  lines.push('    - autogpt: 开放式的探索性任务')
  lines.push('    - openhands: 需要严格验证的工程任务')
  lines.push('    - swe-agent: Bug 修复和补丁生成')

  return lines.join('\n')
}

// ============================================================================
// Examples
// ============================================================================

function renderExamples(): string {
  const lines: string[] = [
    '🔄 循环引擎 — 详细示例',
    '',
    '═══════════════════════════════════════════════════════',
    '示例 1: LangGraph 状态机循环（条件分支）',
    '───────────────────────────────────────────────────────',
    '  /loop "分析代码库，如果发现安全问题则修复，否则优化性能" --strategy langgraph',
    '',
    '  工作流程:',
    '    analyze → 发现安全问题? → yes → fix_security → verify → done',
    '                                → no  → optimize    → verify → done',
    '',
    '═══════════════════════════════════════════════════════',
    '示例 2: CrewAI 多 Agent 协作',
    '───────────────────────────────────────────────────────',
    '  /loop "开发一个 REST API：设计接口、编写代码、测试、代码审查" --strategy crew',
    '',
    '  工作流程:',
    '    manager(分配) → developer(编码) → tester(测试) → reviewer(审查)',
    '    审查不通过 → 回到 developer 返工',
    '',
    '═══════════════════════════════════════════════════════',
    '示例 3: AutoGPT 目标驱动',
    '───────────────────────────────────────────────────────',
    '  /loop "调研市面上的 CLI 工具，写一份对比报告" --strategy autogpt',
    '',
    '  工作流程:',
    '    think(分析) → act(调研) → observe(记录) → critique(评估)',
    '    未完成 → 重新规划 → 继续',
    '',
    '═══════════════════════════════════════════════════════',
    '示例 4: OpenHands 工程代理',
    '───────────────────────────────────────────────────────',
    '  /loop "实现用户认证模块，所有测试必须通过" --strategy openhands --criteria "测试通过" --criteria "无 lint 错误"',
    '',
    '  工作流程:',
    '    plan(计划) → execute(执行) → verify(验证)',
    '    验证失败 → 修改计划 → 重新执行',
    '',
    '═══════════════════════════════════════════════════════',
    '示例 5: SWE-agent Bug 修复',
    '───────────────────────────────────────────────────────',
    '  /loop "修复登录页面的 TypeError 错误" --strategy swe-agent --criteria "登录功能正常"',
    '',
    '  工作流程:',
    '    localize(定位) → analyze(分析) → generate(补丁) → verify(验证)',
    '    验证失败 → 重新分析 → 新补丁',
    '',
    '═══════════════════════════════════════════════════════',
    '提示:',
    '  • 首次使用建议先用 --max-iterations 5 限制迭代次数',
    '  • 用 --criteria 指定明确的成功标准，避免无限循环',
    '  • 不同策略可以尝试同一任务，选择最适合的',
  ]

  return lines.join('\n')
}

// ============================================================================
// Interactive Prompt (when no goal given)
// ============================================================================

function renderInteractivePrompt(): string {
  const lines: string[] = [
    '🔄 目标导向循环引擎 — 交互式启动',
    '',
    '请描述你的目标（或选择下面的示例）：',
    '',
    '  1. 重构代码模块，提高可维护性',
    '  2. 修复所有 TypeScript 类型错误',
    '  3. 实现一个新功能模块',
    '  4. 优化性能并验证改进',
    '  5. 代码审查并修复发现的问题',
    '  6. 编写测试并确保全部通过',
    '',
    '用法: /loop "你的目标" --strategy <策略名>',
    '帮助: /loop --help',
    '示例: /loop --examples',
    '',
    '可用策略:',
  ]

  for (const s of getStrategyInfo()) {
    lines.push(`  ${s.name.padEnd(12)} — ${s.description}`)
  }

  return lines.join('\n')
}

// ============================================================================
// Argument Parser
// ============================================================================

interface ParsedLoopArgs {
  goal: string
  strategy: LoopStrategyName
  maxIterations: number
  maxConcurrent: number
  criteria: string[]
  json: boolean
  help: boolean
  examples: boolean
}

function parseArgs(args: string): ParsedLoopArgs {
  const result: ParsedLoopArgs = {
    goal: '',
    strategy: 'openhands',
    maxIterations: 20,
    maxConcurrent: 3,
    criteria: [],
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
    } else if (part === '--strategy' && i + 1 < parts.length) {
      const s = parts[++i] as LoopStrategyName
      if (isValidStrategy(s)) {
        result.strategy = s
      } else {
        throw new Error(`未知策略: ${s}。可用策略: ${getAvailableStrategies().join(', ')}`)
      }
    } else if (part === '--max-iterations' && i + 1 < parts.length) {
      const n = parseInt(parts[++i], 10)
      if (!isNaN(n) && n > 0) result.maxIterations = n
    } else if (part === '--max-concurrent' && i + 1 < parts.length) {
      const n = parseInt(parts[++i], 10)
      if (!isNaN(n) && n > 0) result.maxConcurrent = n
    } else if (part === '--criteria' && i + 1 < parts.length) {
      result.criteria.push(parts[++i])
    } else {
      goalParts.push(part)
    }
    i++
  }

  result.goal = goalParts.join(' ')
  return result
}

// ============================================================================
// Command Implementation
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  // No args - show interactive prompt
  if (!s) {
    return { type: 'text', value: renderInteractivePrompt() }
  }

  // Parse arguments
  let parsed: ParsedLoopArgs
  try {
    parsed = parseArgs(s)
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 参数错误: ${err instanceof Error ? err.message : String(err)}\n\n用 /loop --help 查看帮助`,
    }
  }

  // Help mode
  if (parsed.help) {
    return { type: 'text', value: renderHelp() }
  }

  // Examples mode
  if (parsed.examples) {
    return { type: 'text', value: renderExamples() }
  }

  // No goal given
  if (!parsed.goal) {
    return { type: 'text', value: renderInteractivePrompt() }
  }

  // Execute loop
  try {
    const result = await executeLoop({
      strategy: parsed.strategy,
      goal: {
        description: parsed.goal,
        successCriteria: parsed.criteria.length > 0 ? parsed.criteria : undefined,
        maxIterations: parsed.maxIterations,
        maxConcurrent: parsed.maxConcurrent,
      },
      onProgress: (event) => {
        // In a real implementation, this would update the UI
        console.log(`[LOOP] ${event.type}: ${JSON.stringify(event)}`)
      },
    })

    if (parsed.json) {
      return { type: 'json', value: JSON.stringify(result, null, 2) }
    }

    const statusIcon = result.success ? '✅' : '⏸️'
    const lines: string[] = [
      `${statusIcon} 循环执行完成`,
      '',
      `策略: ${parsed.strategy}`,
      `迭代: ${result.iterations} 轮`,
      `耗时: ${(result.duration / 1000).toFixed(1)}s`,
      `结果: ${result.reason}`,
      '',
      '子任务:',
    ]

    result.subTasks.forEach((t, i) => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
      lines.push(`  ${i + 1}. ${icon} ${t.description}`)
    })

    lines.push('')
    lines.push(result.finalOutput)

    return { type: 'text', value: lines.join('\n') }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { type: 'text', value: `❌ 循环执行失败: ${message}` }
  }
}

// ============================================================================
// Command Registration
// ============================================================================

const loopCommand: Command = {
  type: 'local',
  name: 'loop',
  description: '目标导向循环引擎 — 给 AI 个目标，循环直到达成',
  aliases: ['/loop', '/循环'],
  arguments: [
    { name: 'goal', description: '目标描述', required: false },
    { name: '--strategy', description: '循环策略: langgraph / crew / autogpt / openhands / swe-agent', required: false },
    { name: '--max-iterations', description: '最大迭代次数（默认 20）', required: false },
    { name: '--max-concurrent', description: '最大并发 Agent 数（crew 策略，默认 3）', required: false },
    { name: '--criteria', description: '成功标准（可多次指定）', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--examples', description: '显示详细示例', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
} satisfies Command

export default loopCommand
