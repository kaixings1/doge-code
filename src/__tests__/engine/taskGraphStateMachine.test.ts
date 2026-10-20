/**
 * 回归保护：TaskGraph 状态机与依赖语义。
 *
 * 历史缺陷：
 * 1. markCompleted/markFailed/markRunning 直接赋值，终态可被回退改写
 *    （completed → running → failed），统计随执行顺序漂移。
 * 2. getReady 只认 completed 依赖，'skipped' 不算满足 → 下游永久 pending。
 * 3. orchestrator 用 `success: !hasFailed` 收尾，把「仍有节点未执行」
 *    报告成成功（未执行节点被当成「无失败」）。
 */
import { describe, expect, it } from 'vitest'
import { TaskGraph, type TaskNode } from '../../engine/orchestrator/taskGraph.js'

function node(id: string, deps: string[] = []): TaskNode {
  return {
    id,
    description: id,
    stage: 'implement',
    role: 'engineer',
    dependencies: deps,
    status: 'pending',
  }
}

describe('TaskGraph 状态机守卫', () => {
  it('终态不可被回退改写', () => {
    const g = new TaskGraph()
    g.addNode(node('a'))

    expect(g.markCompleted('a', 'ok')).toBe(true)
    // 已完成后不能再变 running / failed
    expect(g.markRunning('a')).toBe(false)
    expect(g.markFailed('a', 'boom')).toBe(false)
    expect(g.get('a')!.status).toBe('completed')
    expect(g.get('a')!.result).toBe('ok')
  })

  it('失败的节点不会被再标记为完成', () => {
    const g = new TaskGraph()
    g.addNode(node('a'))
    expect(g.markFailed('a', 'boom')).toBe(true)
    expect(g.markCompleted('a', 'ok')).toBe(false)
    expect(g.get('a')!.status).toBe('failed')
  })

  it('只有 pending 能进入 running', () => {
    const g = new TaskGraph()
    g.addNode(node('a'))
    expect(g.markRunning('a')).toBe(true)
    expect(g.markRunning('a')).toBe(false) // 重复进入被拒绝
    expect(g.get('a')!.status).toBe('running')
  })

  it('不存在的节点返回 false', () => {
    const g = new TaskGraph()
    expect(g.markCompleted('nope', 'x')).toBe(false)
    expect(g.markRunning('nope')).toBe(false)
  })
})

describe('TaskGraph 依赖语义', () => {
  it('上游 completed 时下游就绪', () => {
    const g = new TaskGraph()
    g.addNodes([node('a'), node('b', ['a'])])
    expect(g.getReady().map(n => n.id)).toEqual(['a'])

    g.markCompleted('a', 'x')
    expect(g.getReady().map(n => n.id)).toEqual(['b'])
  })

  it('上游 skipped 时下游也必须就绪（否则永久卡死）', () => {
    const g = new TaskGraph()
    g.addNodes([node('a'), node('b', ['a'])])
    g.markFailed('a', 'boom')

    // 依赖失败 → a 的下游被跳过
    expect(g.skipIfDependencyFailed('b')).toBe(true)
    expect(g.get('b')!.status).toBe('skipped')
  })

  it('skipped 的上游视为已满足，其下游可继续', () => {
    const g = new TaskGraph()
    g.addNodes([node('a'), node('b', ['a']), node('c', ['b'])])

    // b 被跳过（依赖失败），c 依赖 b
    g.get('b')!.status = 'skipped'

    // 关键：c 必须进入就绪集合，而不是永久 pending
    expect(g.getReady().map(n => n.id)).toContain('c')
  })

  it('依赖缺失时下游不就绪（避免误判为可执行）', () => {
    const g = new TaskGraph()
    g.addNode(node('b', ['missing']))
    expect(g.getReady()).toHaveLength(0)
  })
})
