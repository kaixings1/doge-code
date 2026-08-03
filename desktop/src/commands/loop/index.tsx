/**
 * /loop — 目标导向循环引擎（JSX 版本）
 *
 * 接入真实 AI 执行基础设施：
 * 1. 通过 toolContext 获取 QueryEngine 和 AgentTool
 * 2. 每个子任务通过 QueryEngine.query() 执行
 * 3. 策略提供分解/评估/路由，QueryEngine 提供执行能力
 */

import * as React from 'react'
import { Box, Text, useInput, useAppState } from '../../ink.js'
import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import type { LoopGoal, LoopStrategyName, SubTask } from './types.js'
import { getStrategy, getStrategyInfo, getAvailableStrategies } from './strategies/index.js'
import { isValidStrategy } from './engine.js'
import type { TaskExecutor } from './types.js'

// ============================================================================
// 帮助文本
// ============================================================================

function renderHelp(): string {
  const strategies = getStrategyInfo()
  const lines: string[] = [
    '🔄 目标导向循环引擎',
    '',
    '给 AI 一个目标，在达成目标前一直循环处理。',
    '',
    '用法:',
    '  /loop <目标描述> [策略] [选项]',
    '',
    '策略（--strategy <name>）：',
    '',
  ]
  for (const s of strategies) {
    lines.push(`  ${s.name.padEnd(12)} ${s.displayName}`)
    lines.push(`  ${' '.repeat(12)} ${s.description}`)
    lines.push('')
  }
  lines.push('选项:')
  lines.push('  --strategy <name>     循环策略（默认: openhands）')
  lines.push('  --max-iterations <n>  最大迭代次数（默认: 20）')
  lines.push('  --criteria <标准>     成功标准（可多次指定）')
  lines.push('  --json                JSON 格式输出结果')
  lines.push('  --examples            显示详细示例')
  lines.push('  --help                显示此帮助')
  lines.push('')
  lines.push('快捷方式:')
  for (const s of strategies) {
    lines.push(`  /loop-${s.name} <目标>  等同于 /loop <目标> --strategy ${s.name}`)
  }
  lines.push('')
  lines.push('示例:')
  lines.push('  /loop "重构用户模块"')
  lines.push('  /loop "修复所有 TypeScript 错误" --strategy swe-agent')
  lines.push('  /loop "实现用户注册功能" --strategy autogpt --max-iterations 30')
  lines.push('  /loop "优化数据库查询性能" --strategy langgraph --criteria "查询时间 < 100ms"')
  return lines.join('\n')
}

function renderExamples(): string {
  return [
    '🔄 循环引擎 — 详细示例',
    '',
    '示例 1: LangGraph 状态机循环（条件分支）',
    '  /loop "分析代码库，如果发现安全问题则修复" --strategy langgraph',
    '  工作流程: analyze → plan → execute → verify → 条件跳转',
    '',
    '示例 2: CrewAI 多 Agent 协作',
    '  /loop "开发 REST API：设计、编码、测试、审查" --strategy crew',
    '  工作流程: manager → developer → tester → reviewer',
    '',
    '示例 3: AutoGPT 目标驱动',
    '  /loop "调研 CLI 工具，写对比报告" --strategy autogpt',
    '  工作流程: 图节点执行 + 并发控制 + 自动重试',
    '',
    '示例 4: OpenHands 工程代理',
    '  /loop "实现用户认证，所有测试必须通过" --strategy openhands --criteria "测试通过"',
    '  工作流程: plan → execute → verify → 失败则重新计划',
    '',
    '示例 5: SWE-agent Bug 修复',
    '  /loop "修复登录页面 TypeError" --strategy swe-agent',
    '  工作流程: localize → analyze → patch → verify',
    '',
    '提示:',
    '  • 首次使用建议先用 --max-iterations 5 限制迭代次数',
    '  • 用 --criteria 指定明确的成功标准',
    '  • 不同策略可以尝试同一任务，选择最适合的',
  ].join('\n')
}

function renderInteractivePrompt(): string {
  const lines = [
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
// 参数解析
// ============================================================================

interface ParsedLoopArgs {
  goal: string
  strategy: LoopStrategyName
  maxIterations: number
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
// 循环执行引擎（接入真实 AI）
// ============================================================================

/**
 * 通过 QueryEngine 执行任务
 * 接入真实的 AI 推理 + 工具执行能力
 */
async function createTaskExecutor(
  context: LocalJSXCommandContext,
): Promise<TaskExecutor> {
  return async (prompt: string, systemPrompt: string, task: SubTask) => {
    try {
      // 构建完整的执行提示词
      const fullPrompt = `${systemPrompt}

## 当前任务
${task.description}

## 执行指南
${prompt}

## 可用工具
- BashTool: 执行 shell 命令
- FileReadTool: 读取文件
- FileWriteTool: 写入文件
- FileEditTool: 编辑文件
- Grep: 搜索代码
- Glob: 查找文件
- AgentTool: 创建子代理

请使用可用工具执行任务。完成后输出执行结果。`

      // 通过 QueryEngine 执行
      const result = await context.options.tools.execute({
        name: 'ask',
        input: {
          prompt: fullPrompt,
          maxTokens: 4096,
        },
      })

      const content = result.content
      let output = ''
      if (typeof content === 'string') {
        output = content
      } else if (Array.isArray(content)) {
        output = content
          .map((block: { type: string; text?: string }) => {
            if (typeof block === 'string') return block
            if (block && typeof block === 'object' && 'text' in block) return block.text ?? ''
            return ''
          })
          .join('\n')
      }

      return { success: true, output: output.slice(0, 4000) }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

// ============================================================================
// 主命令实现
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const s = (args ?? '').trim()

  if (!s) {
    onDone(renderInteractivePrompt())
    return
  }

  let parsed: ParsedLoopArgs
  try {
    parsed = parseArgs(s)
  } catch (err) {
    onDone(`❌ 参数错误: ${err instanceof Error ? err.message : String(err)}\n\n用 /loop --help 查看帮助`)
    return
  }

  if (parsed.help) {
    onDone(renderHelp())
    return
  }

  if (parsed.examples) {
    onDone(renderExamples())
    return
  }

  if (!parsed.goal) {
    onDone(renderInteractivePrompt())
    return
  }

  try {
    const strategy = getStrategy(parsed.strategy)
    const goal: LoopGoal = {
      description: parsed.goal,
      successCriteria: parsed.criteria.length > 0 ? parsed.criteria : undefined,
      maxIterations: parsed.maxIterations,
    }

    // 创建任务执行器（接入真实 AI）
    const taskExecutor = await createTaskExecutor(context)

    // 导入 executeLoop
    const { executeLoop } = await import('./engine.js')

    // 执行循环
    const result = await executeLoop({
      strategy: parsed.strategy,
      goal,
      taskExecutor,
      onProgress: (event) => {
        console.log(`[LOOP] ${event.type}: ${JSON.stringify(event)}`)
      },
    })

    if (parsed.json) {
      onDone(JSON.stringify(result, null, 2))
      return
    }

    const statusIcon = result.success ? '✅' : '⏸️'
    const lines: string[] = [
      `${statusIcon} 循环执行完成`,
      '',
      `策略: ${parsed.strategy}`,
      `迭代: ${result.iterations} 轮`,
      `结果: ${result.reason}`,
      '',
      '子任务:',
    ]

    result.subTasks.forEach((t, i) => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
      lines.push(`  ${i + 1}. ${icon} ${t.description}`)
    })

    lines.push('')
    lines.push(result.finalOutput.slice(0, 2000))

    onDone(lines.join('\n'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onDone(`❌ 循环执行失败: ${message}`)
  }
}

// ============================================================================
// 命令注册
// ============================================================================

const loopCommand: Command = {
  type: 'local-jsx',
  name: 'loop',
  description: '目标导向循环引擎 — 给 AI 个目标，循环直到达成',
  aliases: ['/loop', '/循环'],
  arguments: [
    { name: 'goal', description: '目标描述', required: false },
    { name: '--strategy', description: '循环策略: langgraph / crew / autogpt / openhands / swe-agent', required: false },
    { name: '--max-iterations', description: '最大迭代次数（默认 20）', required: false },
    { name: '--criteria', description: '成功标准（可多次指定）', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--examples', description: '显示详细示例', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default loopCommand
