/**
 * __tests__/engine/background/task-engine.test.ts
 *
 * 验证 Background Task Engine 的持久化、checkpoint、恢复机制
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { TaskEngine, StepResult, StepExecutor } from '@/engine/background/task-engine.ts'
import { parseCheckpointLine } from '@/commands/task/task.ts'

import * as os from 'os'
const TEST_TASKS_DIR = path.join(os.tmpdir(), 'doge-task-engine-test')

describe('TaskEngine', () => {
  let engine: TaskEngine

  beforeEach(() => {
    // 清理并创建测试目录
    try { fs.rmSync(TEST_TASKS_DIR, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(TEST_TASKS_DIR, { recursive: true })
    engine = new TaskEngine({ tasksDir: TEST_TASKS_DIR })
  })

  afterEach(() => {
    try { fs.rmSync(TEST_TASKS_DIR, { recursive: true, force: true }) } catch {}
  })

  // -----------------------------------------------------------------------
  // 提交任务
  // -----------------------------------------------------------------------

  it('submit 应创建新任务', () => {
    const task = engine.submit('test task')
    expect(task.id).toBeTruthy()
    expect(task.status).toBe('pending')
    expect(task.description).toBe('test task')
    expect(task.currentStep).toBe(0)
    expect(task.checkpoints).toHaveLength(0)
  })

  it('submit 应持久化到磁盘', () => {
    const task = engine.submit('persist test')
    const filePath = path.join(TEST_TASKS_DIR, `${task.id}.json`)
    expect(fs.existsSync(filePath)).toBe(true)
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(saved.description).toBe('persist test')
  })

  it('submit 不同任务应有不同 ID', () => {
    const t1 = engine.submit('task 1')
    const t2 = engine.submit('task 2')
    expect(t1.id).not.toBe(t2.id)
  })

  // -----------------------------------------------------------------------
  // 执行任务
  // -----------------------------------------------------------------------

  it('execute 应逐步执行并写 checkpoint', async () => {
    const task = engine.submit('step test')

    const executor: StepExecutor = async (t, step) => {
      return {
        signal: step < 2 ? 'continue' : 'complete',
        action: `step-${step}`,
        result: `result of step ${step}`,
        filesModified: step === 1 ? ['src/foo.ts'] : [],
      }
    }

    const result = await engine.execute(task.id, executor)
    expect(result.status).toBe('completed')
    expect(result.currentStep).toBe(3)
    expect(result.checkpoints).toHaveLength(3)
    expect(result.checkpoints[0].action).toBe('step-0')
    expect(result.checkpoints[1].filesModified).toContain('src/foo.ts')
  })

  it('execute 遇到 failed 信号应标记任务失败', async () => {
    const task = engine.submit('will fail')

    const executor: StepExecutor = async () => ({
      signal: 'failed',
      action: 'error step',
      result: 'something went wrong',
    })

    const result = await engine.execute(task.id, executor)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('something went wrong')
  })

  it('execute 超过 maxSteps 应失败', async () => {
    const tinyEngine = new TaskEngine({ tasksDir: TEST_TASKS_DIR, maxSteps: 3 })
    const task = tinyEngine.submit('too many steps')

    const executor: StepExecutor = async () => ({
      signal: 'continue',
      action: 'keep going',
      result: 'still running',
    })

    const result = await tinyEngine.execute(task.id, executor)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Exceeded max steps')
  })

  // -----------------------------------------------------------------------
  // 断点续跑
  // -----------------------------------------------------------------------

  it('resume 应从上次的 checkpoint 继续', async () => {
    const task = engine.submit('resume test')

    // 第一步执行器
    const step1: StepExecutor = async (t, step) => ({
      signal: step < 1 ? 'continue' : 'paused',
      action: `step-${step}`,
      result: `paused at step ${step}`,
    })

    await engine.execute(task.id, step1)
    expect(engine.get(task.id)?.currentStep).toBe(2)
    expect(engine.get(task.id)?.status).toBe('paused')

    // 第二步执行器（续跑）
    const step2: StepExecutor = async (t, step) => ({
      signal: 'complete',
      action: `step-${step}`,
      result: `completed at step ${step}`,
    })

    const result = await engine.resume(task.id, step2)
    expect(result.status).toBe('completed')
    expect(result.currentStep).toBe(3)
    expect(result.checkpoints).toHaveLength(3)
    expect(result.checkpoints[0].action).toBe('step-0')
    expect(result.checkpoints[2].action).toBe('step-2')
  })

  it('resume 已完成的任务应直接返回', async () => {
    const task = engine.submit('already done')

    const executor: StepExecutor = async () => ({
      signal: 'complete',
      action: 'final',
      result: 'done',
    })

    await engine.execute(task.id, executor)
    const result = await engine.resume(task.id, executor)
    expect(result.status).toBe('completed')
    expect(result.currentStep).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 列表和查询
  // -----------------------------------------------------------------------

  it('list 应返回所有任务', () => {
    engine.submit('task A')
    engine.submit('task B')
    const tasks = engine.list()
    expect(tasks).toHaveLength(2)
    expect(tasks.map(t => t.description)).toContain('task A')
    expect(tasks.map(t => t.description)).toContain('task B')
  })

  it('get 应返回单个任务', () => {
    const task = engine.submit('find me')
    const found = engine.get(task.id)
    expect(found).not.toBeNull()
    expect(found?.description).toBe('find me')
  })

  it('get 不存在的 ID 应返回 null', () => {
    expect(engine.get('nonexistent')).toBeNull()
  })

  // -----------------------------------------------------------------------
  // 取消任务
  // -----------------------------------------------------------------------

  it('cancel 应标记任务为失败', () => {
    const task = engine.submit('to cancel')
    const result = engine.cancel(task.id)
    expect(result?.status).toBe('failed')
    expect(result?.error).toBe('cancelled by user')
  })

  it('cancel 不存在的任务应返回 null', () => {
    expect(engine.cancel('nope')).toBeNull()
  })
})

// -----------------------------------------------------------------------
// 跨实例恢复（模拟重启）
// -----------------------------------------------------------------------

describe('TaskEngine — cross-instance recovery', () => {
  const TEST_DIR = path.join(os.tmpdir(), 'doge-recovery-test')

  beforeEach(() => {
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  it('第一个引擎写入 checkpoint 后，第二个引擎能恢复', async () => {
    // 引擎 1：创建并执行一步后暂停
    const engine1 = new TaskEngine({ tasksDir: TEST_DIR })
    const task = engine1.submit('cross-instance test')

    const step1: StepExecutor = async (t, step) => ({
      signal: 'paused',
      action: 'initial analysis',
      result: 'analyzed 15 files',
      filesModified: [],
    })

    await engine1.execute(task.id, step1)

    // 引擎 2：新实例，从磁盘加载
    const engine2 = new TaskEngine({ tasksDir: TEST_DIR })
    const loaded = engine2.get(task.id)
    expect(loaded).not.toBeNull()
    expect(loaded?.status).toBe('paused')
    expect(loaded?.currentStep).toBe(1)
    expect(loaded?.checkpoints).toHaveLength(1)

    // 恢复执行
    const step2: StepExecutor = async (t, step) => ({
      signal: 'complete',
      action: 'apply changes',
      result: 'changes applied',
      filesModified: ['src/a.ts'],
    })

    const result = await engine2.resume(task.id, step2)
    expect(result.status).toBe('completed')
    expect(result.checkpoints).toHaveLength(2)
    expect(result.checkpoints[1].action).toBe('apply changes')
  })
})

// -----------------------------------------------------------------------
// parseCheckpointLine — 解析 AI 输出的 checkpoint 标记
// -----------------------------------------------------------------------

describe('parseCheckpointLine', () => {
  it('应解析 CHECKPOINT 标记', () => {
    const result = parseCheckpointLine('[CHECKPOINT] analyze files | src/a.ts,src/b.ts')
    expect(result?.type).toBe('checkpoint')
    expect(result?.action).toBe('analyze files')
    expect(result?.files).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('应解析 COMPLETE 标记', () => {
    const result = parseCheckpointLine('[COMPLETE] finished with 3 changes')
    expect(result?.type).toBe('complete')
    expect(result?.action).toBe('finished with 3 changes')
  })

  it('应解析 FAILED 标记', () => {
    const result = parseCheckpointLine('[FAILED] syntax error in main.ts')
    expect(result?.type).toBe('failed')
    expect(result?.action).toBe('syntax error in main.ts')
  })

  it('无标记的行应返回 null', () => {
    expect(parseCheckpointLine('just a normal line')).toBeNull()
    expect(parseCheckpointLine('')).toBeNull()
  })

  it('CHECKPOINT 无文件时应返回空数组', () => {
    const result = parseCheckpointLine('[CHECKPOINT] plan created')
    expect(result?.files).toEqual([])
  })
})
