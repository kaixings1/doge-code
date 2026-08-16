import { describe, it, expect } from 'vitest'
import { AgentDevelopmentTool } from '../../tools/AgentDevelopmentTool/AgentDevelopmentTool.js'

describe('AgentDevelopmentTool', () => {
  it('create 创建Agent', async () => {
    const result = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
      instructions: '你是一个测试助手',
      model_id: 'claude-3-5-sonnet',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.agent_id).toBeDefined()
    expect(result.data.model).toBe('claude-3-5-sonnet')
  })

  it('configure 更新Agent配置', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'configure',
      agent_id: agentId,
      instructions: '更新后的指令',
      memory_type: 'summary',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.message).toContain('配置已更新')
  })

  it('add_memory 添加记忆', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'add_memory',
      agent_id: agentId,
      memory_type: 'summary',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.memory).toContain('summary')
  })

  it('add_knowledge 添加知识库', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'add_knowledge',
      agent_id: agentId,
      knowledge_source: 'https://example.com/docs',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.knowledge).toContain('https://example.com/docs')
  })

  it('add_toolkit 添加工具包', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'add_toolkit',
      agent_id: agentId,
      toolkit_name: 'web_search',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.tools).toContain('web_search')
  })

  it('run 运行Agent并返回响应', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'run',
      agent_id: agentId,
      message: '你好',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.response).toContain('你好')
    expect(result.data.session_id).toBeDefined()
  })

  it('set_model 切换模型', async () => {
    const createResult = await AgentDevelopmentTool.call({
      action: 'create',
      name: '测试助手',
      model_id: 'claude-3-5-sonnet',
    } as any)
    const agentId = createResult.data.agent_id as string

    const result = await AgentDevelopmentTool.call({
      action: 'set_model',
      agent_id: agentId,
      model_id: 'gpt-4',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.model).toBe('gpt-4')
  })
})
