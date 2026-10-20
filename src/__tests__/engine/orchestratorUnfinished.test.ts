/**
 * 回归保护：orchestrator 不得把「还有节点没跑」报告成成功。
 *
 * 历史缺陷：收尾只用 `success: !hasFailed`。当图谱因循环依赖／依赖缺失
 * 无法推进时，没有任何节点标记为 failed，于是返回 success=true ——
 * 未执行节点被当成「无失败」。
 *
 * 说明：这条判定在「节点全部成功」或「节点失败并被跳过」的正常路径上不会触发；
 * 它守护的是图卡住的情形。因此这里直接调用生产方法 runParallelMode 并注入
 * 一张含循环依赖的图，通过覆盖 buildParallelGraph 让被测路径使用它，
 * 而不是手工改 node.status 绕过生产逻辑。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const cyclicNodes = [
  {
    id: 'A',
    description: 'A',
    stage: 'research' as const,
    role: 'researcher' as const,
    dependencies: ['B'],
    status: 'pending' as const,
  },
  {
    id: 'B',
    description: 'B',
    stage: 'analyze' as const,
    role: 'pm' as const,
    dependencies: ['A'],
    status: 'pending' as const,
  },
]

vi.mock('../../engine/orchestrator/taskGraph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../engine/orchestrator/taskGraph.js')
  >('../../engine/orchestrator/taskGraph.js')
  return {
    ...actual,
    // 让 parallel 模式拿到一张循环依赖图（正常 buildParallelGraph 不会产生）
    buildParallelGraph: () => cyclicNodes.map(n => ({ ...n })),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('orchestrator 未跑完不得判成功', () => {
  it('循环依赖导致图无法推进时返回失败，而不是成功', async () => {
    const { Orchestrator } = await import('../../engine/orchestrator/orchestrator.js')

    const o = new Orchestrator(
      { mode: 'parallel', roles: ['pm', 'engineer'], maxDiscussionRounds: 1 },
      { executeLLM: async () => 'unused' },
    )

    const result = await o.run('cycle task')

    // 两个节点互相依赖 → 永远没有就绪节点，也没有任何节点失败
    expect(result.success).toBe(false)
    expect(result.finalStage).toBe('failed')
    // 且不应有任何 LLM 调用（图根本没跑起来）
    expect(result.roleResults).toHaveLength(0)
  })
})
