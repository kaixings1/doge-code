/**
 * 回归保护：pipeline 中途失败时不得丢弃此前已完成阶段的产出。
 *
 * 历史缺陷：失败分支直接 `buildResult(false, 'failed', roleResults, '', ...)`，
 * mergedOutput 恒为空串——research/analyze/design 等阶段的成果全部丢失，
 * 调用方拿到失败结果时连部分成果都看不到。
 */
import { describe, expect, it } from 'vitest'
import { PipelineExecutor } from '../../engine/orchestrator/pipeline.js'
import type { OrchestratorConfig } from '../../engine/orchestrator/messages.js'

const config = {
  mode: 'pipeline',
  autoFix: false,
  qualityGate: false,
} as unknown as OrchestratorConfig

describe('PipelineExecutor 失败时保留已产出内容', () => {
  it('第二个阶段失败时，仍返回第一个阶段的产出', async () => {
    let call = 0
    const executor = new PipelineExecutor(
      {
        executeRole: async () => {
          call++
          if (call === 2) throw new Error('second stage exploded')
          return `output-${call}`
        },
      },
      config,
    )

    const result = await executor.run('test task')

    expect(result.success).toBe(false)
    // 关键：首个阶段的结果必须保留，而不是空串
    expect(result.mergedOutput).toBe('output-1')
    // 失败阶段应被如实报告，而不是笼统的 'failed'
    expect(result.finalStage).not.toBe('done')
  })

  it('全部成功时返回最后一个阶段的产出', async () => {
    let call = 0
    const executor = new PipelineExecutor(
      {
        executeRole: async () => {
          call++
          return `output-${call}`
        },
      },
      { ...config, mode: 'pipeline' } as unknown as OrchestratorConfig,
    )

    const result = await executor.run('test task')
    expect(result.success).toBe(true)
    expect(result.mergedOutput).toBe(`output-${call}`)
  })
})
