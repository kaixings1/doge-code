import { describe, it, expect } from 'vitest'
import { StateMachineTool } from '../../tools/StateMachineTool/StateMachineTool.js'

describe('StateMachineTool', () => {
  it('create 创建状态图', async () => {
    const result = await StateMachineTool.call({
      action: 'create',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.graph_id).toBeDefined()
    expect(result.data.nodes).toContain('START')
    expect(result.data.nodes).toContain('END')
  })

  it('add_node 添加功能节点', async () => {
    const createResult = await StateMachineTool.call({
      action: 'create',
    } as any)
    const graphId = createResult.data.graph_id as string

    const result = await StateMachineTool.call({
      action: 'add_node',
      graph_id: graphId,
      node_id: 'process',
      node_type: 'function',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.nodes).toContain('process')
  })

  it('add_edge 添加条件边', async () => {
    const createResult = await StateMachineTool.call({
      action: 'create',
    } as any)
    const graphId = createResult.data.graph_id as string

    const result = await StateMachineTool.call({
      action: 'add_edge',
      graph_id: graphId,
      source: 'START',
      target: 'process',
      condition: 'state.ready == true',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.edges).toBeDefined()
    expect(result.data.edges![0].source).toBe('START')
  })

  it('compile 编译状态图', async () => {
    const createResult = await StateMachineTool.call({
      action: 'create',
    } as any)
    const graphId = createResult.data.graph_id as string

    await StateMachineTool.call({
      action: 'add_node',
      graph_id: graphId,
      node_id: 'process',
      node_type: 'function',
    } as any)

    await StateMachineTool.call({
      action: 'add_edge',
      graph_id: graphId,
      source: 'START',
      target: 'process',
    } as any)

    const result = await StateMachineTool.call({
      action: 'compile',
      graph_id: graphId,
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.compiled).toBe(true)
  })

  it('invoke 执行状态机', async () => {
    const createResult = await StateMachineTool.call({
      action: 'create',
    } as any)
    const graphId = createResult.data.graph_id as string

    await StateMachineTool.call({
      action: 'add_node',
      graph_id: graphId,
      node_id: 'process',
      node_type: 'function',
    } as any)

    await StateMachineTool.call({
      action: 'add_edge',
      graph_id: graphId,
      source: 'START',
      target: 'process',
    } as any)

    await StateMachineTool.call({
      action: 'add_edge',
      graph_id: graphId,
      source: 'process',
      target: 'END',
    } as any)

    await StateMachineTool.call({
      action: 'compile',
      graph_id: graphId,
    } as any)

    const result = await StateMachineTool.call({
      action: 'invoke',
      graph_id: graphId,
      state: { ready: true },
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.result).toBeDefined()
  })
})
