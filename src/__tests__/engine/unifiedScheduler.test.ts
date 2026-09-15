/**
 * __tests__/engine/unifiedScheduler.test.ts
 *
 * 验证 UnifiedScheduler 的路由、执行和状态回写。
 * 使用 mock LLM 避免真实 API 调用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UnifiedScheduler, createUnifiedScheduler, type SchedulerEvent } from '@/engine/unifiedScheduler.js'
import * as tasks from '@/utils/tasks.js'
import * as os from 'os'
import * as fs from 'fs'
import { join } from 'path'

const TEST_DIR = join(os.tmpdir(), 'doge-scheduler-test')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<tasks.Task> = {}): tasks.Task {
  return {
    id: '1',
    subject: 'Test task',
    description: 'A simple test task description',
    status: 'pending',
    blocks: [],
    blockedBy: [],
    metadata: {},
    ...overrides,
  }
}

async function setupTasks(taskListId: string, taskList: tasks.Task[]): Promise<void> {
  const dir = join(TEST_DIR, taskListId)
  fs.mkdirSync(dir, { recursive: true })
  for (const task of taskList) {
    const path = join(dir, `${task.id}.json`)
    fs.writeFileSync(path, JSON.stringify(task, null, 2))
  }
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let capturedTaskListId: string | undefined

vi.mock('@/utils/tasks.js', async () => {
  const actual = await vi.importActual<typeof tasks>('@/utils/tasks.js')
  return {
    ...actual,
    getTaskListId: vi.fn(() => capturedTaskListId ?? 'test-list'),
    listTasks: vi.fn(async (id: string) => {
      const dir = join(TEST_DIR, id)
      if (!fs.existsSync(dir)) return []
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
      return files.map(f => {
        const raw = fs.readFileSync(join(dir, f), 'utf-8')
        return JSON.parse(raw)
      })
    }),
    claimTask: vi.fn(async (id: string, taskId: string) => {
      const path = join(TEST_DIR, id, `${taskId}.json`)
      if (!fs.existsSync(path)) return { success: false, reason: 'task_not_found' }
      const task = JSON.parse(fs.readFileSync(path, 'utf-8'))
      if (task.owner) return { success: false, reason: 'already_claimed' }
      task.owner = 'scheduler'
      task.status = 'in_progress'
      fs.writeFileSync(path, JSON.stringify(task, null, 2))
      return { success: true, task }
    }),
    updateTask: vi.fn(async (id: string, taskId: string, updates: Partial<tasks.Task>) => {
      const path = join(TEST_DIR, id, `${taskId}.json`)
      if (!fs.existsSync(path)) return null
      const task = JSON.parse(fs.readFileSync(path, 'utf-8'))
      const updated = { ...task, ...updates }
      fs.writeFileSync(path, JSON.stringify(updated, null, 2))
      return updated
    }),
    onTasksUpdated: vi.fn(() => () => {}),
    notifyTasksUpdated: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnifiedScheduler', () => {
  beforeEach(() => {
    capturedTaskListId = 'test-list'
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(TEST_DIR, { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  // -----------------------------------------------------------------------
  // 生命周期
  // -----------------------------------------------------------------------

  describe('start/stop', () => {
    it('start 应发射 scheduler_started 事件', () => {
      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      const startEvents = events.filter(e => e.type === 'scheduler_started')
      expect(startEvents).toHaveLength(1)
      expect((startEvents[0] as any).taskListId).toBe('test-list')
      expect((startEvents[0] as any).mode).toBe('single')

      scheduler.stop()
    })

    it('stop 应发射 scheduler_stopped 事件', () => {
      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      scheduler.stop()
      expect(events.some(e => e.type === 'scheduler_stopped')).toBe(true)
    })

    it('重复 start 不应重复启动', () => {
      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      scheduler.start()
      const startCount = events.filter(e => e.type === 'scheduler_started').length
      expect(startCount).toBe(1)

      scheduler.stop()
    })
  })

  // -----------------------------------------------------------------------
  // 任务发现与路由
  // -----------------------------------------------------------------------

  describe('poll & dispatch', () => {
    it('应发现 pending 任务并认领', async () => {
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      // 等待 debounce + poll
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const claimed = events.filter(e => e.type === 'task_claimed')
      expect(claimed.length).toBeGreaterThanOrEqual(1)
      const completed = events.filter(e => e.type === 'task_completed')
      expect(completed.length).toBeGreaterThanOrEqual(1)
    })

    it('应跳过有 blockedBy 依赖的 pending 任务', async () => {
      await setupTasks('test-list', [
        makeTask({ id: '1', subject: 'Dep', status: 'pending' }),
        makeTask({ id: '2', subject: 'Blocked', status: 'pending', blockedBy: ['1'] }),
      ])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      // 只有 task-1 被认领，task-2 被跳过
      const claimedIds = events
        .filter(e => e.type === 'task_claimed')
        .map(e => (e as any).taskId)
      expect(claimedIds).toContain('1')
      expect(claimedIds).not.toContain('2')
    })

    it('应跳过已认领的任务', async () => {
      await setupTasks('test-list', [
        makeTask({ id: '1', subject: 'Owned', owner: 'other-agent' }),
        makeTask({ id: '2', subject: 'Free', status: 'pending' }),
      ])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const claimedIds = events
        .filter(e => e.type === 'task_claimed')
        .map(e => (e as any).taskId)
      expect(claimedIds).not.toContain('1')
      expect(claimedIds).toContain('2')
    })

    it('应跳过已完成的任务', async () => {
      await setupTasks('test-list', [
        makeTask({ id: '1', subject: 'Done', status: 'completed' }),
        makeTask({ id: '2', subject: 'Free', status: 'pending' }),
      ])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const claimedIds = events
        .filter(e => e.type === 'task_claimed')
        .map(e => (e as any).taskId)
      expect(claimedIds).not.toContain('1')
      expect(claimedIds).toContain('2')
    })
  })

  // -----------------------------------------------------------------------
  // 路由模式
  // -----------------------------------------------------------------------

  describe('route mode', () => {
    it('single 模式强制走单 agent', async () => {
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const routing = events.filter(e => e.type === 'task_routing') as any[]
      expect(routing.length).toBeGreaterThanOrEqual(1)
      expect(routing[0].mode).toBe('single')
    })

    it('orchestrated 模式强制走编排', async () => {
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'orchestrated',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const routing = events.filter(e => e.type === 'task_routing') as any[]
      expect(routing.length).toBeGreaterThanOrEqual(1)
      expect(routing[0].mode).toBe('orchestrated')
    })

    it('auto 模式对复杂任务走编排', async () => {
      await setupTasks('test-list', [
        makeTask({
          id: '1',
          subject: '重构整个用户认证模块',
          description: '需要重新设计架构并实现，包含 OAuth2 集成和权限系统的完整重构方案。同时需要更新所有相关的单元测试和集成测试，确保向后兼容性，并更新使用说明文档以反映新的 API 接口变化。',
        }),
      ])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'auto',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        needsOrchestration: () => true,
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const routing = events.filter(e => e.type === 'task_routing') as any[]
      expect(routing.length).toBeGreaterThanOrEqual(1)
      expect(routing[0].mode).toBe('orchestrated')
    })

    it('auto 模式对简单任务走单 agent', async () => {
      await setupTasks('test-list', [
        makeTask({ id: '1', subject: 'Fix typo', description: 'Fix typo in README' }),
      ])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'auto',
        llmCall: async () => 'done',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const routing = events.filter(e => e.type === 'task_routing') as any[]
      expect(routing.length).toBeGreaterThanOrEqual(1)
      expect(routing[0].mode).toBe('single')
    })
  })

  // -----------------------------------------------------------------------
  // 状态回写
  // -----------------------------------------------------------------------

  describe('status writeback', () => {
    it('完成时应将任务标记为 completed', async () => {
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => 'result output',
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      // 从磁盘读取最终状态
      const taskPath = join(TEST_DIR, 'test-list', '1.json')
      const saved = JSON.parse(fs.readFileSync(taskPath, 'utf-8'))
      expect(saved.status).toBe('completed')
    })

    it('失败时应将任务标记为 completed 并包含失败标记', async () => {
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const events: SchedulerEvent[] = []
      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => {
          throw new Error('LLM exploded')
        },
        onProgress: (e) => events.push(e),
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      const taskPath = join(TEST_DIR, 'test-list', '1.json')
      const saved = JSON.parse(fs.readFileSync(taskPath, 'utf-8'))
      expect(saved.status).toBe('completed')
      expect(saved.description).toContain('[FAILED]')
      expect(saved.description).toContain('LLM exploded')
    })
  })

  // -----------------------------------------------------------------------
  // 并发安全
  // -----------------------------------------------------------------------

  describe('concurrency', () => {
    it('同一任务不应同时执行两次', async () => {
      let llmCallCount = 0
      await setupTasks('test-list', [makeTask({ id: '1', subject: 'Do X' })])

      const scheduler = createUnifiedScheduler({
        mode: 'single',
        llmCall: async () => {
          llmCallCount++
          await new Promise(r => setTimeout(r, 200))
          return 'done'
        },
        onProgress: () => {},
        pollIntervalMs: 999_999,
      })

      scheduler.start()
      await new Promise(r => setTimeout(r, 500))
      scheduler.stop()

      // 单任务，LLM 只应被调用一次
      expect(llmCallCount).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // createUnifiedScheduler 工厂函数
  // -----------------------------------------------------------------------

  describe('createUnifiedScheduler', () => {
    it('应返回 UnifiedScheduler 实例', () => {
      const scheduler = createUnifiedScheduler({
        mode: 'auto',
        llmCall: async () => 'done',
        pollIntervalMs: 999_999,
      })
      expect(scheduler).toBeInstanceOf(UnifiedScheduler)
      expect(scheduler.isRunning).toBe(false)
    })
  })
})
