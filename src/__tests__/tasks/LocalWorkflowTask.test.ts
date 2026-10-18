import { describe, it, expect } from 'vitest'
import {
  isLocalWorkflowTask,
  registerWorkflowTask,
  killWorkflowTask,
  completeWorkflowTask,
  failWorkflowTask,
  updateWorkflowProgress,
  LocalWorkflowTask,
} from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { AppState } from '../../state/AppState.js'

function makeAppState(): AppState {
  return {
    tasks: {},
  } as unknown as AppState
}

function makeSetAppState(state: AppState) {
  return (f: (prev: AppState) => AppState) => {
    const next = f(state)
    // 原地合并 tasks，模拟真实 setAppState 的不可变更新回写
    Object.assign(state, next)
  }
}

describe('LocalWorkflowTask', () => {
  it('LocalWorkflowTask 导出存在且 type 为 local_workflow', () => {
    expect(LocalWorkflowTask).toBeDefined()
    expect(LocalWorkflowTask.type).toBe('local_workflow')
    expect(typeof LocalWorkflowTask.kill).toBe('function')
  })

  it('isLocalWorkflowTask 真实判别（修复前的恒 false bug）', () => {
    expect(isLocalWorkflowTask({ type: 'local_workflow' })).toBe(true)
    expect(isLocalWorkflowTask({ type: 'local_agent' })).toBe(false)
    expect(isLocalWorkflowTask(null)).toBe(false)
    expect(isLocalWorkflowTask('x')).toBe(false)
  })

  it('registerWorkflowTask 创建 running 任务并写入 appState', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({
      workflowName: 'demo',
      steps: ['a', 'b', 'c'],
      setAppState,
    })
    expect(task.type).toBe('local_workflow')
    expect(task.status).toBe('running')
    expect(task.steps).toEqual(['a', 'b', 'c'])
    expect(state.tasks[task.id]).toBeDefined()
    expect(state.tasks[task.id].status).toBe('running')
    // id 前缀应为 'w'
    expect(task.id.startsWith('w')).toBe(true)
  })

  it('killWorkflowTask 将 running 置为 killed', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({ workflowName: 'demo', steps: ['a'], setAppState })
    killWorkflowTask(task.id, setAppState)
    expect(state.tasks[task.id].status).toBe('killed')
    expect((state.tasks[task.id] as any).endTime).toBeTypeOf('number')
  })

  it('killWorkflowTask 对非 running 无操作', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({ workflowName: 'demo', steps: ['a'], setAppState })
    completeWorkflowTask(task.id, 'done', setAppState)
    const before = state.tasks[task.id].status
    killWorkflowTask(task.id, setAppState)
    expect(state.tasks[task.id].status).toBe(before) // 仍为 completed，不被改写
  })

  it('completeWorkflowTask 置 completed 并写 summary', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({ workflowName: 'demo', steps: ['a'], setAppState })
    completeWorkflowTask(task.id, 'ok', setAppState)
    expect(state.tasks[task.id].status).toBe('completed')
    expect((state.tasks[task.id] as any).summary).toBe('ok')
  })

  it('failWorkflowTask 置 failed 并标 failed=true', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({ workflowName: 'demo', steps: ['a'], setAppState })
    failWorkflowTask(task.id, 'boom', setAppState)
    expect(state.tasks[task.id].status).toBe('failed')
    expect((state.tasks[task.id] as any).failed).toBe(true)
  })

  it('updateWorkflowProgress 推进 currentStep / stepResults', () => {
    const state = makeAppState()
    const setAppState = makeSetAppState(state)
    const task = registerWorkflowTask({ workflowName: 'demo', steps: ['a', 'b'], setAppState })
    updateWorkflowProgress(task.id, setAppState, { currentStep: 1, stepResults: ['r1'] })
    expect((state.tasks[task.id] as any).currentStep).toBe(1)
    expect((state.tasks[task.id] as any).stepResults).toEqual(['r1'])
  })
})
