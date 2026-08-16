/**
 * Background Task Engine
 *
 * 持久化任务执行系统：自然语言描述 → 多步执行 → checkpoint → 断点续跑 → 完成报告
 *
 * 核心机制：
 * 1. 用户提交自然语言任务描述
 * 2. 引擎进入 agentic loop：每步调用 LLM 获取下一步操作
 * 3. 每步完成后写 checkpoint（JSON 文件）
 * 4. 崩溃/关闭后重新启动，读取 checkpoint 恢复
 * 5. 完成后输出结构化报告
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export interface TaskCheckpoint {
  step: number
  timestamp: string
  action: string
  result: string
  filesModified: string[]
}

export interface Task {
  id: string
  status: TaskStatus
  description: string
  createdAt: string
  updatedAt: string
  currentStep: number
  totalSteps: number
  checkpoints: TaskCheckpoint[]
  result?: string
  error?: string
  workingDir?: string
}

export interface TaskEngineOptions {
  /** 任务存储目录，默认 .doge/tasks */
  tasksDir?: string
  /** 最大执行步数，默认 50 */
  maxSteps?: number
  /** 每步超时（ms），默认 300000 (5min) */
  stepTimeoutMs?: number
}

// ---------------------------------------------------------------------------
// TaskEngine
// ---------------------------------------------------------------------------

export class TaskEngine {
  private readonly tasksDir: string
  private readonly maxSteps: number
  private readonly stepTimeoutMs: number
  private activeTasks: Map<string, Task> = new Map()

  constructor(options: TaskEngineOptions = {}) {
    this.tasksDir = options.tasksDir || join(process.cwd(), '.doge', 'tasks')
    this.maxSteps = options.maxSteps ?? 50
    this.stepTimeoutMs = options.stepTimeoutMs ?? 300_000
    mkdirSync(this.tasksDir, { recursive: true })
  }

  // -----------------------------------------------------------------------
  // 任务生命周期
  // -----------------------------------------------------------------------

  /**
   * 提交新任务
   */
  submit(description: string, workingDir?: string): Task {
    const id = this.generateId()
    const now = new Date().toISOString()
    const task: Task = {
      id,
      status: 'pending',
      description,
      createdAt: now,
      updatedAt: now,
      currentStep: 0,
      totalSteps: 0,
      checkpoints: [],
      workingDir: workingDir || process.cwd(),
    }
    this.persist(task)
    this.activeTasks.set(id, task)
    return task
  }

  /**
   * 执行任务（前台阻塞，直到完成/失败/暂停）
   *
   * 注意：当前为同步骨架实现，LLM 调用部分预留接口。
   * 实际 LLM 集成由上层 loop 系统通过 executeStep 注入。
   */
  async execute(taskId: string, stepExecutor: StepExecutor): Promise<Task> {
    const task = this.load(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.status === 'completed') return task
    if (task.status === 'failed') throw new Error(`Task already failed: ${task.error}`)

    task.status = 'running'
    task.updatedAt = new Date().toISOString()
    this.persist(task)

    try {
      while (task.currentStep < this.maxSteps) {
        const stepResult = await stepExecutor(task, task.currentStep)

        // 记录 checkpoint
        const checkpoint: TaskCheckpoint = {
          step: task.currentStep,
          timestamp: new Date().toISOString(),
          action: stepResult.action,
          result: stepResult.result,
          filesModified: stepResult.filesModified || [],
        }
        task.checkpoints.push(checkpoint)
        task.currentStep++
        task.totalSteps = Math.max(task.totalSteps, task.currentStep)
        task.updatedAt = new Date().toISOString()

        // 检查终止信号
        if (stepResult.signal === 'complete') {
          task.status = 'completed'
          task.result = stepResult.result
          this.persist(task)
          return task
        }
        if (stepResult.signal === 'failed') {
          task.status = 'failed'
          task.error = stepResult.result
          this.persist(task)
          return task
        }
        if (stepResult.signal === 'paused') {
          task.status = 'paused'
          this.persist(task)
          return task
        }

        this.persist(task)
      }

      // 超过最大步数
      task.status = 'failed'
      task.error = `Exceeded max steps (${this.maxSteps})`
      this.persist(task)
      return task
    } catch (err: any) {
      task.status = 'failed'
      task.error = err.message
      task.updatedAt = new Date().toISOString()
      this.persist(task)
      return task
    }
  }

  /**
   * 恢复并继续执行（断点续跑）
   */
  async resume(taskId: string, stepExecutor: StepExecutor): Promise<Task> {
    const task = this.load(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.status === 'completed' || task.status === 'failed') {
      return task
    }
    return this.execute(taskId, stepExecutor)
  }

  /**
   * 列出所有任务
   */
  list(): Task[] {
    if (!existsSync(this.tasksDir)) return []
    const files = readdirSync(this.tasksDir).filter(f => f.endsWith('.json'))
    return files.map(f => this.load(f.replace('.json', ''))).filter(Boolean) as Task[]
  }

  /**
   * 获取单个任务
   */
  get(taskId: string): Task | null {
    return this.load(taskId)
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): Task | null {
    const task = this.load(taskId)
    if (!task) return null
    task.status = 'failed'
    task.error = 'cancelled by user'
    task.updatedAt = new Date().toISOString()
    this.persist(task)
    return task
  }

  // -----------------------------------------------------------------------
  // 内部方法
  // -----------------------------------------------------------------------

  private generateId(): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    return `task-${ts}-${rand}`
  }

  private persist(task: Task): void {
    const filePath = join(this.tasksDir, `${task.id}.json`)
    writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf-8')
    this.activeTasks.set(task.id, task)
  }

  private load(taskId: string): Task | null {
    const filePath = join(this.tasksDir, `${taskId}.json`)
    if (!existsSync(filePath)) return null
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Step executor contract
// ---------------------------------------------------------------------------

/**
 * 每步执行器：接收当前任务状态和步数，返回执行结果
 *
 * 这是上层（AI loop 系统）注入的执行逻辑。
 * TaskEngine 只管持久化和流程控制，不关心具体执行什么。
 */
export interface StepResult {
  /** 终止信号 */
  signal: 'continue' | 'complete' | 'failed' | 'paused'
  /** 本步执行的操作描述 */
  action: string
  /** 操作结果/输出 */
  result: string
  /** 本步修改的文件路径 */
  filesModified?: string[]
}

export interface StepExecutor {
  (task: Task, step: number): Promise<StepResult>
}
