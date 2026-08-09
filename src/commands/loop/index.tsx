/**
 * /loop — 目标导向循环引擎（JSX 版本）
 *
 * 接入真实 AI 执行基础设施：
 * 1. 通过 toolContext 获取 QueryEngine 和 AgentTool
 * 2. 每个子任务通过 QueryEngine.query() 执行
 * 3. 策略提供分解/评估/路由，QueryEngine 提供执行能力
 */

import * as React from 'react'
import { Box, Text, useInput } from '../../ink.js'
import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import type { LoopGoal, LoopStrategyName, SubTask } from './types.js'
import { getStrategy, getStrategyInfo, getAvailableStrategies } from './strategies/index.js'
import { isValidStrategy } from './engine.js'
import { createAITaskExecutor } from './ai-task-executor.js'
import { formatStatusLine, formatFinalReport, formatSubTaskSummary, type ProgressState } from './progress-ui.js'
import { parseLoopArgs, autoSelectStrategy } from './shortcuts.js'
import { formatPlan } from './planner.js'

type ParsedLoopArgs = ReturnType<typeof parseLoopArgs>

// ============================================================================
// 帮助 / 示例 / 交互提示 渲染
// ============================================================================

function renderHelp(): string {
  return `# /loop — 目标导向循环引擎

给 AI 一个目标，循环执行直到达成。

## 用法
  /loop "目标描述" [选项]

## 选项
  --strategy <策略>        循环策略: langgraph / crew / autogpt / openhands / swe-agent（默认 openhands）
  --auto                   自动选择策略（根据目标关键词）
  --parallel <N>           并行执行度（多个子任务同时执行）
  --budget <时间>          时间预算（如 30s / 5m / 2h），超时自动停止
  --verify <模式>          验证模式: test / build / lint / files
  --report <路径>          生成 Markdown 报告到指定路径
  --checkpoint <路径>      保存/恢复执行进度（中断后可恢复）
  --max-iterations <N>     最大迭代次数（默认 20）
  --criteria <标准>        成功标准（可多次指定）
  --snapshot               执行前自动快照，失败可回滚（安全回滚 B3）
  --no-repair              禁用验证失败自动修复（执行验证 B2）
  --progress <秒>          定期汇报进度间隔（进度汇报 B4）
  --ask                    关键节点询问用户方向（进度汇报 B4）
  --json                   JSON 格式输出
  --help                   显示本帮助
  --examples               显示详细示例

## 自主闭环模式示例
  /loop "重构 utils 并跑通测试" --snapshot --verify test --progress 30 --ask
  /loop "实现功能并验证" --auto --snapshot --verify build --parallel 2 --progress 60

## 示例
  /loop "创建一个 Node.js Hello World 服务器"
  /loop "重构 utils 目录" --strategy langgraph --max-iterations 30
  /loop "写完 README 并运行测试" --criteria "测试全部通过"

## 快捷命令
  /loop-langgraph, /loop-crew, /loop-autogpt, /loop-openhands, /loop-swe
  分别使用对应策略执行，支持 --help 查看该策略的详细手册`
}

function renderExamples(): string {
  return `# /loop — 使用示例

## 示例 1: 简单目标
  /loop "创建一个 Node.js Hello World HTTP 服务器，监听 3000 端口"
  → 使用默认 openhands 策略，最多 20 轮迭代

## 示例 2: 指定策略和迭代上限
  /loop "重构 utils 目录中的重复代码" --strategy langgraph --max-iterations 30
  → 使用 langgraph（状态机图）策略，最多 30 轮

## 示例 3: 设置成功标准
  /loop "为项目添加单元测试" --criteria "覆盖率超过 80%" --criteria "测试全部通过"
  → 多个 --criteria 都会作为成功判断标准

## 示例 4: JSON 输出
  /loop "扫描代码中的安全问题" --json
  → 以 JSON 格式输出完整结果

## 示例 5: 快捷策略命令
  /loop-autogpt "实现一个 CLI 待办应用" --help
  → /loop-autogpt 使用 autogpt 策略；--help 显示该策略的完整手册

## 可用策略
  - langgraph  : 状态机图引擎，适合有明确状态流转的任务
  - crew       : 多角色协作，适合需要分工的任务
  - autogpt    : 自主规划，适合探索性任务
  - openhands  : 默认策略，通用目标执行
  - swe-agent  : 软件工程代理，适合代码库级任务`
}

function renderInteractivePrompt(): string {
  return `# /loop — 目标导向循环引擎

给 AI 一个目标，循环执行直到达成。

请输入你的目标，例如：
  /loop 创建一个 Node.js Hello World 服务器
  /loop 重构 utils 目录 --strategy langgraph
  /loop "写完 README 并运行测试" --criteria "测试全部通过"

查看帮助: /loop --help
查看示例: /loop --examples`
}
// ============================================================================
// 主命令实现
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const s = (args ?? '').trim()

  if (!s) {
    onDone(renderInteractivePrompt())
    return null
  }

  let parsed: ParsedLoopArgs
  try {
    parsed = parseLoopArgs(s)
  } catch (err) {
    onDone(`❌ 参数错误: ${err instanceof Error ? err.message : String(err)}

用 /loop --help 查看帮助`)
    return null
  }

  if (parsed.help) {
    onDone(renderHelp())
    return null
  }

  if (parsed.examples) {
    onDone(renderExamples())
    return null
  }

  if (!parsed.goal) {
    onDone(renderInteractivePrompt())
    return null
  }

  try {
    // 自动选择策略：当 --auto 或用户未显式指定策略（默认 openhands）时
    const strategyName = parsed.auto ? autoSelectStrategy(parsed.goal) : parsed.strategy
    const strategy = getStrategy(strategyName)
    const goal: LoopGoal = {
      description: parsed.tools ? `${parsed.goal}\n\n可用工具提示: ${parsed.tools}` : parsed.goal,
      successCriteria: parsed.criteria.length > 0 ? parsed.criteria : undefined,
      maxIterations: parsed.maxIterations,
    }

    const taskExecutor = createAITaskExecutor(context, {
      maxRetries: parsed.retries,
      taskTimeout: parsed.timeout,
      apiTimeout: 30000,
      autoCleanup: parsed.cleanup,
      outputPath: parsed.outputPath ?? undefined,
    })

    const { executeLoop } = await import('./engine.js')

    const startTime = Date.now()
    let fileCount = 0
    const createdFiles: string[] = []
    const progressState: ProgressState = {
      strategy: strategy.name,
      currentIteration: 0,
      maxIterations: parsed.maxIterations,
      currentTask: '',
      fileCount: 0,
      startTime,
      phase: 'idle',
    }

    // ─── 单行覆盖渲染：只保留一条进度消息 ───
    // system 消息经 normalizeMessages 后 uuid 不变，用固定 uuid 精确替换
    const PROGRESS_UUID = `loop-progress-${Date.now()}`
    const pushProgress = (text: string) => {
      if (!context.setMessages) return
      context.setMessages(prev => {
        // 查找是否已有进度消息
        const existing = prev.find(m => m.type === 'system' && m.uuid === PROGRESS_UUID)
        if (existing) {
          // 替换已有进度消息的内容
          return prev.map(m =>
            m.type === 'system' && m.uuid === PROGRESS_UUID
              ? { ...m, content: text, date: new Date().toISOString() }
              : m
          )
        }
        // 追加新的进度消息
        return [...prev, { type: 'system' as const, content: text, date: new Date().toISOString(), uuid: PROGRESS_UUID }]
      })
    }

    // ─── 自动 checkpoint： SIGINT 时保存进度 ───
    const checkpointPath = parsed.checkpoint ?? void 0
    const saveCheckpointNow = async () => {
      if (!checkpointPath) return
      try {
        const { saveCheckpoint } = await import('./engine.js')
        await saveCheckpoint(checkpointPath, {
          strategy: strategy.name,
          goal: goal.description,
          subTasks: [],
          iteration: progressState.currentIteration,
          maxIterations: parsed.maxIterations,
          savedAt: new Date().toISOString(),
          createdFiles,
        })
        pushProgress(`⏸️ 用户中断 — 进度已保存到 ${checkpointPath}`)
      } catch { /* ignore */ }
    }

    // 监听 SIGINT（Ctrl+C）：指定 --checkpoint 时自动保存进度
    // 注意：不调用 process.exit()，让 REPL 全局 SIGINT 处理接管
    if (checkpointPath) {
      try {
        process.on('SIGINT', async () => {
          await saveCheckpointNow()
        })
      } catch { /* ignore */ }
    }

    const result = await executeLoop({
      strategy: strategy.name,
      goal,
      taskExecutor,
      parallel: parsed.parallel,
      budgetMs: parsed.budget > 0 ? parsed.budget : void 0,
      verifyMode: parsed.verify !== 'none' ? parsed.verify as never : void 0,
      checkpoint: checkpointPath,
      report: parsed.report ?? void 0,
      snapshot: parsed.snapshot,
      autoRepair: parsed.autoRepair,
      progressIntervalMs: parsed.progressInterval > 0 ? parsed.progressInterval * 1000 : void 0,
      askUser: parsed.ask
        ? async (question: string, choices: string[]) => {
            onDone(`\n${question}\n选项: ${choices.join(' / ')}\n（当前模式无法交互，自动选择「继续执行」）`, { display: 'system' })
            return '继续执行'
          }
        : void 0,
      onProgress: (event: { type: string; [k: string]: unknown }) => {
        switch (event.type) {
          case 'loop_start':
            progressState.phase = 'planning'
            pushProgress(formatStatusLine(progressState))
            break
          case 'decomposition':
            progressState.phase = 'executing'
            pushProgress(formatStatusLine(progressState))
            break
          case 'iteration_start':
            progressState.phase = 'executing'
            progressState.currentIteration = event.iteration as number
            progressState.maxIterations = (event.maxIterations as number) ?? parsed.maxIterations
            progressState.fileCount = fileCount
            pushProgress(formatStatusLine(progressState))
            break
          case 'task_start':
            progressState.currentTask = (event.description as string) ?? ''
            pushProgress(formatStatusLine(progressState))
            break
          case 'task_end': {
            const output = (event.output as string) ?? ''
            const newFiles = new Set<string>()
            const bulletMatches = output.match(/^\s*(?:•|·|-)\s*([\w./-]+(?:\.[\w]+)?)\s*$/gm) || []
            for (const m of bulletMatches) {
              const fp = m.replace(/^\s*(?:•|·|-)\s*/, '').trim()
              if (fp && /[\w./-]+\.[\w]+/.test(fp)) newFiles.add(fp)
            }
            const markdownMatches = output.match(/📄\s*([^\s]+)/g) || []
            for (const m of markdownMatches) {
              const fp = m.replace('📄 ', '').trim()
              if (fp && /[\w./-]+\.[\w]+/.test(fp)) newFiles.add(fp)
            }
            if (newFiles.size > 0) {
              newFiles.forEach(fp => { createdFiles.push(fp); fileCount++ })
              progressState.fileCount = fileCount
            }
            pushProgress(formatStatusLine(progressState))
            break
          }
          case 'task_failed':
            progressState.phase = 'error'
            progressState.currentTask = `失败: ${event.error?.toString().slice(0, 30)}`
            pushProgress(formatStatusLine(progressState))
            break
          case 'evaluation':
            if (event.achieved) {
              progressState.phase = 'verifying'
              pushProgress(formatStatusLine(progressState))
            }
            break
          case 'repair':
            progressState.currentTask = `🔧 自动修复 (第 ${event.attempt} 次)`
            pushProgress(formatStatusLine(progressState))
            break
          case 'progress':
            progressState.fileCount = fileCount
            pushProgress(formatStatusLine(progressState))
            break
        }
      },
    })

    if (parsed.json) {
      onDone(JSON.stringify(result, null, 2))
      return null
    }

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
    const message = error instanceof Error ? error.message : String(error)
    onDone(`❌ 循环执行失败: ${message}`)
    return null
  }
}

const loopCommand: Command = {
  type: 'local-jsx',
  name: 'loop',
  description: '目标导向循环引擎 — 给 AI 个目标，循环直到达成',
  aliases: ['/loop', '/循环'],
  load: () => Promise.resolve({ call }),
} satisfies Command

export default loopCommand
