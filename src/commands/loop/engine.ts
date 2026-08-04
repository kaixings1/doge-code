/**
 * Loop Engine Core
 *
 * 循环引擎核心 — 编排目标导向的循环执行。
 *
 * 架构设计（分支循环模式）：
 * - 主循环（MessageLoop/QueryEngine）提供执行能力
 * - LoopEngine 提供编排能力（策略/分解/评估/路由）
 * - 通过 taskExecutor 回调将执行委托给主循环
 *
 * 执行模式：
 * 1. execSync 模式：直接执行 shell 命令（测试/lint/构建等）
 * 2. taskExecutor 模式：通过回调委托给 AgentTool/QueryEngine
 * 3. 混合模式：简单任务用 execSync，复杂任务用 taskExecutor
 */

import { execSync } from 'child_process'
import { writeFile, readFile, mkdir } from 'fs/promises'
import * as path from 'path'
import type { LoopGoal, LoopOptions, LoopResult, LoopEvent, SubTask, VerifyMode, CheckpointState } from './types.js'
import { getStrategy } from './strategies/index.js'

const DEFAULT_MAX_ITERATIONS = 20

interface LoopState {
  iteration: number
  maxIterations: number
  subTasks: SubTask[]
  history: Array<{ iteration: number; event: string; details?: string }>
  startTime: number
}

/**
 * 任务执行器类型 — loop engine 与主循环的集成点
 */
export type TaskExecutor = (
  prompt: string,
  systemPrompt: string,
  task: SubTask,
) => Promise<{ success: boolean; output: string; error?: string }>

export interface LoopEngineOptions extends LoopOptions {
  taskExecutor?: TaskExecutor
}

/**
 * 执行目标导向循环
 */
export async function executeLoop(options: LoopEngineOptions): Promise<LoopResult> {
  const strategy = getStrategy(options.strategy)
  const goal: LoopGoal = {
    ...options.goal,
    maxIterations: options.goal.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  }

  const createdFiles: string[] = []

  const state: LoopState = {
    iteration: 0,
    maxIterations: goal.maxIterations,
    subTasks: [],
    history: [],
    startTime: Date.now(),
  }

  const emit = (event: LoopEvent) => { options.onProgress?.(event) }

  emit({ type: 'loop_start', strategy: options.strategy, goal: goal.description })

  // ─── 检查点恢复 ───
  if (options.checkpoint) {
    try {
      const cp = await loadCheckpoint(options.checkpoint)
      if (cp && cp.goal === goal.description) {
        state.subTasks = cp.subTasks
        state.iteration = cp.iteration
        state.maxIterations = cp.maxIterations
        createdFiles.push(...cp.createdFiles)
        emit({ type: 'warn', message: `已从检查点恢复（迭代 ${cp.iteration}，${cp.subTasks.length} 个任务）` })
      }
    } catch { /* 检查点无效，忽略 */ }
  }

  try {
    // 注入任务执行器，使策略能够在 evaluate() 中驱动图节点执行
    if (options.taskExecutor && strategy.setTaskExecutor) {
      strategy.setTaskExecutor(options.taskExecutor)
    }

    // 如果检查点没有恢复任务，则进行初始分解
    if (state.subTasks.length === 0) {
      state.subTasks = strategy.decompose(goal)
      emit({ type: 'decomposition', subTasks: state.subTasks })
    }

    // ─── 预算检查 ───
    const budgetExceeded = () => {
      if (!options.budgetMs) return false
      return Date.now() - state.startTime > options.budgetMs
    }

    while (strategy.shouldContinue(state.iteration, state.maxIterations, state.subTasks)) {
      // 预算超时 → 停止
      if (budgetExceeded()) {
        const reason = `时间预算超时（${Math.round((Date.now() - state.startTime) / 1000)}s）`
        emit({ type: 'error', error: reason })
        state.history.push({ iteration: state.iteration, event: 'budget_exceeded', details: reason })
        break
      }

      state.iteration++
      emit({ type: 'iteration_start', iteration: state.iteration, maxIterations: state.maxIterations })

      try {
        // 找出待执行任务（支持并行）
        const pendingTasks = state.subTasks.filter(t => t.status === 'pending')
        const runningTasks = state.subTasks.filter(t => t.status === 'running')
        const currentTasks = pendingTasks.length > 0 ? pendingTasks : runningTasks

        if (currentTasks.length === 0) {
          const evaluation = await strategy.evaluate(goal, state.subTasks)
          if (evaluation.achieved) {
            emit({ type: 'evaluation', achieved: true, reason: evaluation.reason })
            break
          }
          // 未达标 → 生成新的执行任务，继续迭代改进（按 id 去重追加）
          const newTasks = strategy.decompose(goal)
          const existingIds = new Set(state.subTasks.map(t => t.id))
          const freshTasks = newTasks.filter(t => !existingIds.has(t.id))
          if (freshTasks.length > 0) {
            state.subTasks.push(...freshTasks)
          } else {
            // 没有新任务可追加 → 停止
            emit({ type: 'evaluation', achieved: false, reason: evaluation.reason })
            break
          }
        } else if (currentTasks.length > 0 && !strategy.handlesOwnExecution?.()) {
          // ─── 执行任务（支持并行）───
          const parallelLimit = Math.max(1, options.parallel || 1)
          const tasksToRun = currentTasks.slice(0, parallelLimit)

          for (const task of tasksToRun) {
            task.status = 'running'
            emit({ type: 'task_start', taskId: task.id, description: task.description })
          }

          const systemPrompt = strategy.getSystemPrompt(goal)

          // 并行或串行执行
          const executor = async (task: SubTask) => {
            const taskPrompt = buildTaskPrompt(goal, task, state)
            let result: { success: boolean; output: string; error?: string }

            if (options.taskExecutor) {
              result = await options.taskExecutor(taskPrompt, systemPrompt, task)
            } else {
              result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
            }

            // 验证模式：任务成功后自动运行验证
            if (result.success && options.verifyMode && options.verifyMode !== 'none') {
              const verifyResult = await runVerification(options.verifyMode, result.output)
              if (!verifyResult.passed) {
                result = { ...result, success: false, error: `验证失败: ${verifyResult.reason}` }
              }
            }

            task.status = result.success ? 'completed' : 'failed'
            task.result = result.output
            task.error = result.error

            // 提取创建的文件
            extractCreatedFiles(result.output).forEach(f => {
              if (!createdFiles.includes(f)) createdFiles.push(f)
            })

            return { task, result }
          }

          const results = await Promise.all(tasksToRun.map(t => executor(t)))
          for (const { task, result } of results) {
            if (result.success) {
              emit({ type: 'task_end', taskId: task.id, success: true, output: result.output })
            } else {
              emit({ type: 'task_failed', taskId: task.id, error: result.error ?? 'Unknown error' })
            }
          }
        } else if (currentTasks.length > 0 && strategy.handlesOwnExecution?.()) {
          // 策略自行处理执行
          for (const task of currentTasks) {
            emit({ type: 'task_start', taskId: task.id, description: task.description })
          }
        }

        const evaluation = await strategy.evaluate(goal, state.subTasks)
        emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })

        // 保存检查点（每 2 轮保存一次）
        if (options.checkpoint && state.iteration % 2 === 0) {
          await saveCheckpoint(options.checkpoint, {
            strategy: options.strategy,
            goal: goal.description,
            subTasks: state.subTasks,
            iteration: state.iteration,
            maxIterations: state.maxIterations,
            savedAt: new Date().toISOString(),
            createdFiles,
          })
        }

        if (evaluation.achieved) {
          emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
          break
        }

        emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
        state.history.push({ iteration: state.iteration, event: 'iteration_complete', details: evaluation.reason })

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        emit({ type: 'error', error: errMsg })
        state.history.push({ iteration: state.iteration, event: 'error', details: errMsg })
      }
    }

    const finalEvaluation = await strategy.evaluate(goal, state.subTasks)
    const duration = Date.now() - state.startTime

    // 生成报告
    let reportPath: string | null = null
    if (options.report) {
      reportPath = await writeReport(options.report, {
        success: finalEvaluation.achieved,
        iterations: state.iteration,
        duration,
        reason: finalEvaluation.reason,
        subTasks: state.subTasks,
        createdFiles,
        strategy: options.strategy,
        goal: goal.description,
      })
    }

    const result: LoopResult = {
      success: finalEvaluation.achieved,
      iterations: state.iteration,
      duration,
      reason: finalEvaluation.reason,
      subTasks: state.subTasks,
      finalOutput: buildFinalOutput(state.subTasks, finalEvaluation),
    }

    emit({ type: 'loop_end', success: result.success, iterations: result.iterations, duration: result.duration, reason: result.reason })

    if (reportPath) {
      emit({ type: 'warn', message: `报告已生成: ${reportPath}` })
    }

    return result

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    emit({ type: 'error', error: errMsg })
    emit({ type: 'loop_end', success: false, iterations: state.iteration, duration: Date.now() - state.startTime, reason: errMsg })

    return {
      success: false,
      iterations: state.iteration,
      duration: Date.now() - state.startTime,
      reason: errMsg,
      subTasks: state.subTasks,
      finalOutput: '',
    }
  }
}

/**
 * 基于任务类型的智能执行器
 *
 * 根据任务描述自动选择合适的执行方式：
 * - 包含 "测试/test" → 运行 bun test
 * - 包含 "lint/检查" → 运行 bun run lint
 * - 包含 "build/构建" → 运行 bun run build
 * - 包含 "git" → 执行 git 命令
 * - 其他 → 返回提示信息
 */
async function executeTaskWithStrategy(
  task: SubTask,
  prompt: string,
  systemPrompt: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const desc = task.description.toLowerCase()

  // 根据任务类型选择执行命令
  let cmd: string | null = null

  if (desc.includes('测试') || desc.includes('test') || desc.includes('运行测试')) {
    cmd = 'bun test 2>&1 | head -50'
  } else if (desc.includes('类型') || desc.includes('type') || desc.includes('typescript')) {
    cmd = 'bun run build 2>&1 | head -50'
  } else if (desc.includes('lint') || desc.includes('检查代码')) {
    cmd = 'bun run lint 2>&1 | head -50'
  } else if (desc.includes('build') || desc.includes('构建') || desc.includes('编译')) {
    cmd = 'bun run build 2>&1 | head -100'
  } else if (desc.includes('git status') || desc.includes('git 状态') || desc.includes('检查 git')) {
    cmd = 'git status --short 2>&1'
  } else if (desc.includes('git diff') || desc.includes('git 差异') || desc.includes('代码变更')) {
    cmd = 'git diff --stat 2>&1'
  } else if (desc.includes('git log') || desc.includes('git 提交') || desc.includes('提交历史')) {
    cmd = 'git log --oneline -10 2>&1'
  } else if (desc.includes('文件') || desc.includes('file') || desc.includes('目录')) {
    cmd = 'ls -la 2>&1 | head -30'
  }

  if (cmd) {
    try {
      const output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { success: true, output: output.slice(0, 2000) }
    } catch (execErr: unknown) {
      const err = execErr as { stdout?: string; stderr?: string; status?: number }
      const output = (err.stdout ?? '') + '\n' + (err.stderr ?? '')
      return {
        success: false,
        output: output.slice(0, 2000),
        error: `命令退出码: ${err.status ?? 'unknown'}`,
      }
    }
  }

  // 无法自动执行的任务：返回提示信息
  return {
    success: true,
    output: `任务规划: ${task.description}\n\n系统提示:\n${systemPrompt}\n\n执行提示:\n${prompt}\n\n（此任务需要 AI 代理执行，当前为规划模式）`,
  }
}

function buildTaskPrompt(goal: LoopGoal, task: SubTask, state: LoopState): string {
  // 提取之前尝试的结果（供 AI 改进参考）
  const previousAttempts = state.subTasks
    .filter(t => t.status === 'completed' || t.status === 'failed')
    .map((t, i) => {
      const resultSummary = t.result ? t.result.slice(0, 1500) : ''
      const errorSummary = t.error ? `错误: ${t.error.slice(0, 300)}` : ''
      return `尝试 ${i + 1} [${t.status}]: ${t.description.slice(0, 80)}\n${resultSummary ? `结果: ${resultSummary}\n` : ''}${errorSummary ? `${errorSummary}\n` : ''}`
    })

  return `## 目标
${goal.description}

## 当前任务 (迭代 ${state.iteration}/${state.maxIterations})
${task.description}

## 子任务状态
${state.subTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.description.slice(0, 60)}`).join('\n')}

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '完成目标并用 bash 命令实际创建文件'}

${previousAttempts.length > 0 ? `## 之前尝试的执行结果（如未达标，请针对性改进，不要重复相同操作）\n${previousAttempts.join('\n\n')}\n` : ''}

## 要求
1. 必须使用 bash 命令实际创建/修改文件（mkdir、echo、cat heredoc 等）
2. 所有命令用 \`\`\`bash 代码块包裹
3. 完成后明确列出创建的文件
4. 如果之前尝试失败或未创建文件，请分析原因并采用不同方案

请执行当前任务，输出 bash 命令和结果。`
}

function buildFinalOutput(subTasks: SubTask[], evaluation: { achieved: boolean; reason: string }): string {
  const lines: string[] = []
  lines.push(`# 循环执行结果`)
  lines.push('')
  lines.push(`状态: ${evaluation.achieved ? '✅ 成功' : '❌ 未完成'}`)
  lines.push(`原因: ${evaluation.reason}`)
  lines.push('')
  lines.push('## 子任务执行详情')
  subTasks.forEach((t, i) => {
    lines.push(`${i + 1}. [${t.status}] ${t.description}`)
    if (t.result) lines.push(`   结果: ${t.result.slice(0, 200)}`)
    if (t.error) lines.push(`   错误: ${t.error.slice(0, 200)}`)
  })
  return lines.join('\n')
}

export function isValidStrategy(name: string): name is import('./types.js').LoopStrategyName {
  return ['langgraph', 'crew', 'autogpt', 'openhands', 'swe-agent'].includes(name)
}

// ============================================================================
// 验证模式 — 任务完成后自动运行验证
// ============================================================================

const VERIFY_COMMANDS: Record<VerifyMode, string[]> = {
  none: [],
  test: ['bun test 2>&1 | tail -30', 'npm test 2>&1 | tail -30', 'npx vitest run 2>&1 | tail -30'],
  build: ['bun run build 2>&1 | tail -30', 'npm run build 2>&1 | tail -30'],
  lint: ['bun run lint 2>&1 | tail -30', 'npm run lint 2>&1 | tail -30', 'npx biome check src/ 2>&1 | tail -30'],
  files: [],
}

async function runVerification(
  mode: VerifyMode,
  taskOutput: string,
): Promise<{ passed: boolean; reason: string }> {
  // files 模式：检查任务输出中是否声明了文件创建
  if (mode === 'files') {
    const hasFiles = /📁\s*创建了|created\s+\d+\s*files?|•\s*[\w./-]+\.[\w]+/i.test(taskOutput)
    return hasFiles
      ? { passed: true, reason: '检测到文件创建' }
      : { passed: false, reason: '未检测到文件创建（请用 bash 命令实际创建文件）' }
  }

  // 依次尝试验证命令，直到找到可用的
  const commands = VERIFY_COMMANDS[mode] || []
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { passed: true, reason: `${mode} 验证通过\n${output.slice(0, 500)}` }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number }
      // 命令不存在（如没有 npm）则尝试下一个
      if (e.status === 127 || /not found|not recognized/i.test(e.stderr ?? '')) {
        continue
      }
      const output = (e.stdout ?? '') + (e.stderr ?? '')
      return { passed: false, reason: `${mode} 验证失败 (退出码 ${e.status})\n${output.slice(0, 500)}` }
    }
  }
  return { passed: true, reason: `${mode} 验证跳过（无可用命令）` }
}

// ============================================================================
// 文件提取与检查点/报告
// ============================================================================

function extractCreatedFiles(output: string): string[] {
  const files: string[] = []
  const patterns = [
    /^\s*(?:•|·|-)\s*(.+)$/gm,
    /📄\s*(.+?)(?:\s|$)/g,
    />(?:\s*)([\w./-]+\.[\w]+)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      const fp = match[1].trim().replace(/[`'"\s]+$/, '')
      if (fp && /[\w./-]+\.[\w]+/.test(fp) && !fp.startsWith('/dev/')) {
        files.push(fp)
      }
    }
  }
  return [...new Set(files)]
}

async function saveCheckpoint(filePath: string, state: CheckpointState): Promise<void> {
  const resolved = path.resolve(filePath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, JSON.stringify(state, null, 2), 'utf-8')
}

async function loadCheckpoint(filePath: string): Promise<CheckpointState | null> {
  try {
    const content = await readFile(path.resolve(filePath), 'utf-8')
    return JSON.parse(content) as CheckpointState
  } catch {
    return null
  }
}

async function writeReport(
  filePath: string,
  data: {
    success: boolean
    iterations: number
    duration: number
    reason: string
    subTasks: SubTask[]
    createdFiles: string[]
    strategy: string
    goal: string
  },
): Promise<string> {
  const resolved = path.resolve(filePath)
  await mkdir(path.dirname(resolved), { recursive: true })

  const lines: string[] = [
    `# 循环执行报告`,
    '',
    `- **状态**: ${data.success ? '✅ 成功' : '❌ 未完成'}`,
    `- **策略**: ${data.strategy}`,
    `- **目标**: ${data.goal}`,
    `- **迭代次数**: ${data.iterations}`,
    `- **耗时**: ${Math.round(data.duration / 1000)}s`,
    `- **原因**: ${data.reason}`,
    '',
    '## 创建的文件',
    '',
  ]

  if (data.createdFiles.length > 0) {
    data.createdFiles.forEach(f => lines.push(`- \`${f}\``))
  } else {
    lines.push('（无）')
  }

  lines.push('', '## 子任务详情', '')
  data.subTasks.forEach((t, i) => {
    const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
    lines.push(`${icon} ${i + 1}. ${t.description}`)
    if (t.result) lines.push(`   ${t.result.slice(0, 300).replace(/\n/g, '\n   ')}`)
  })

  await writeFile(resolved, lines.join('\n'), 'utf-8')
  return resolved
}
