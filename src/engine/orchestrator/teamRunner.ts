/**
 * src/engine/orchestrator/teamRunner.ts
 *
 * Team Runner — 连接 Orchestrator 和 TaskEngine 的胶水层
 *
 * 职责：
 * 1. 将 Orchestrator 的 executeLLM 注入为真实的 LLM 调用
 * 2. 将编排结果映射为 TaskEngine 的 StepResult
 * 3. 支持 checkpoint 持久化和断点续跑
 */

import type { Orchestrator, OrchestratorDeps, OrchestrationResult, OrchestratorConfig } from './index.js'
import { TaskEngine, type StepExecutor, type StepResult, type Task } from '../background/task-engine.js'

// ---------------------------------------------------------------------------
// TeamRunner — 编排器 + TaskEngine 集成
// ---------------------------------------------------------------------------

export interface TeamRunnerOptions {
  /** 编排器配置 */
  orchestratorConfig?: Partial<OrchestratorConfig>
  /** TaskEngine 配置 */
  taskEngineOptions?: { tasksDir?: string; maxSteps?: number; stepTimeoutMs?: number }
  /** LLM 调用函数 */
  llmCall: (role: string, systemPrompt: string, userPrompt: string, context: string) => Promise<string>
  /** 进度回调 */
  onProgress?: (event: TeamRunnerEvent) => void
}

export type TeamRunnerEvent =
  | { type: 'task_submitted'; taskId: string; description: string }
  | { type: 'orchestrator_started'; mode: string }
  | { type: 'stage_started'; stage: string; role: string }
  | { type: 'stage_completed'; stage: string; role: string; duration: number }
  | { type: 'stage_failed'; stage: string; role: string; error: string }
  | { type: 'orchestrator_completed'; result: OrchestrationResult }
  | { type: 'task_completed'; task: Task }
  | { type: 'task_failed'; task: Task; error: string }

export class TeamRunner {
  private orchestrator: Orchestrator
  private engine: TaskEngine
  private llmCall: (role: string, systemPrompt: string, userPrompt: string, context: string) => Promise<string>
  private onProgress?: (event: TeamRunnerEvent) => void

  constructor(options: TeamRunnerOptions) {
    this.llmCall = options.llmCall
    this.onProgress = options.onProgress

    // 初始化 TaskEngine
    this.engine = new TaskEngine(options.taskEngineOptions)

    // 初始化 Orchestrator
    const deps: OrchestratorDeps = {
      executeLLM: (role, systemPrompt, userPrompt, context) => this.executeRole(role, systemPrompt, userPrompt, context),
    }

    this.orchestrator = new Orchestrator(options.orchestratorConfig, deps)
  }

  /**
   * 提交并执行任务
   */
  async submitAndRun(description: string, workingDir?: string): Promise<Task> {
    // 提交到 TaskEngine
    const task = this.engine.submit(description, workingDir)

    this.emit({ type: 'task_submitted', taskId: task.id, description })

    // 创建 StepExecutor：将编排器包装为每步执行器
    const stepExecutor: StepExecutor = async (currentTask, step) => {
      // 第 0 步：启动编排器
      if (step === 0) {
        this.emit({ type: 'orchestrator_started', mode: this.orchestrator['config'].mode })

        try {
          const result = await this.orchestrator.run(description)

          if (result.success) {
            this.emit({ type: 'orchestrator_completed', result })
            return {
              signal: 'complete',
              action: 'orchestration',
              result: result.mergedOutput,
              filesModified: result.artifacts,
            }
          } else {
            this.emit({ type: 'orchestrator_completed', result })
            return {
              signal: 'failed',
              action: 'orchestration',
              result: result.mergedOutput || 'Orchestration failed',
              filesModified: result.artifacts,
            }
          }
        } catch (err: any) {
          return {
            signal: 'failed',
            action: 'orchestration',
            result: err.message,
          }
        }
      }

      // 第 1 步及以后：编排器已完成，直接返回完成
      return {
        signal: 'complete',
        action: 'done',
        result: 'Task completed',
      }
    }

    // 执行
    return this.engine.execute(task.id, stepExecutor)
  }

  /**
   * 恢复任务
   */
  async resume(taskId: string): Promise<Task> {
    const task = this.engine.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)

    // 恢复时重新运行编排器（实际场景可从 checkpoint 恢复）
    return this.submitAndRun(task.description, task.workingDir)
  }

  /**
   * 获取 TaskEngine 实例
   */
  getTaskEngine(): TaskEngine {
    return this.engine
  }

  /**
   * 执行角色（注入 LLM 调用）
   */
  private async executeRole(role: string, systemPrompt: string, userPrompt: string, context: string): Promise<string> {
    this.emit({ type: 'stage_started', stage: role, role })

    try {
      const output = await this.llmCall(role, systemPrompt, userPrompt, context)
      this.emit({ type: 'stage_completed', stage: role, role, duration: 0 })
      return output
    } catch (err: any) {
      this.emit({ type: 'stage_failed', stage: role, role, error: err.message })
      throw err
    }
  }

  /**
   * 发送事件
   */
  private emit(event: TeamRunnerEvent): void {
    if (this.onProgress) {
      this.onProgress(event)
    }
  }
}

// ---------------------------------------------------------------------------
// 便捷函数
// ---------------------------------------------------------------------------

export function createTeamRunner(options: TeamRunnerOptions): TeamRunner {
  return new TeamRunner(options)
}
