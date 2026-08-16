import { describe, it, expect } from 'vitest'
import { FlowTool } from '../../tools/FlowTool/FlowTool.js'

describe('FlowTool', () => {
  it('create 创建流程', async () => {
    const result = await FlowTool.call({
      action: 'create',
      name: '测试流程',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.flow_id).toBeDefined()
    expect(result.data.message).toContain('创建成功')
  })

  it('start 启动流程节点', async () => {
    const createResult = await FlowTool.call({
      action: 'create',
      name: '测试流程',
    } as any)
    const flowId = createResult.data.flow_id as string

    const result = await FlowTool.call({
      action: 'start',
      flow_id: flowId,
      method: 'begin',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.node_id).toBeDefined()
  })

  it('listen 注册监听器', async () => {
    const createResult = await FlowTool.call({
      action: 'create',
      name: '测试流程',
    } as any)
    const flowId = createResult.data.flow_id as string

    const result = await FlowTool.call({
      action: 'listen',
      flow_id: flowId,
      method: 'handle_data',
      triggers: ['process_data'],
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.message).toContain('监听器')
  })

  it('condition 评估组合条件 or', async () => {
    const result = await FlowTool.call({
      action: 'condition',
      triggers: ['step1', 'step2'],
      condition_type: 'or',
      input_data: { step1: true, step2: false },
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.result).toBe(true)
  })

  it('condition 评估组合条件 and', async () => {
    const result = await FlowTool.call({
      action: 'condition',
      triggers: ['step1', 'step2'],
      condition_type: 'and',
      input_data: { step1: true, step2: true },
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.result).toBe(true)
  })

  it('execute 执行流程', async () => {
    const createResult = await FlowTool.call({
      action: 'create',
      name: '测试流程',
    } as any)
    const flowId = createResult.data.flow_id as string

    await FlowTool.call({
      action: 'start',
      flow_id: flowId,
      method: 'begin',
    } as any)

    const result = await FlowTool.call({
      action: 'execute',
      flow_id: flowId,
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.message).toContain('执行完成')
  })
})
