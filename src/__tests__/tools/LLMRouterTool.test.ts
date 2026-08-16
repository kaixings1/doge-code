import { describe, it, expect } from 'vitest'
import { LLMRouterTool } from '../../tools/LLMRouterTool/LLMRouterTool.js'

describe('LLMRouterTool', () => {
  it('list_models 列出可用模型', async () => {
    const result = await LLMRouterTool.call({
      action: 'list_models',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.models).toBeDefined()
    expect(Object.keys(result.data.models).length).toBeGreaterThan(0)
  })

  it('inference 执行模型推理', async () => {
    const result = await LLMRouterTool.call({
      action: 'inference',
      provider: 'claude',
      model_id: 'claude-3-5-sonnet-20241022',
      prompt: '你好，请介绍一下你自己。',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.response).toContain('claude-3-5-sonnet-20241022')
    expect(result.data.tokens).toBeGreaterThan(0)
  })

  it('inference 缺少参数返回错误', async () => {
    const result = await LLMRouterTool.call({
      action: 'inference',
      prompt: '测试',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('需要')
  })

  it('switch_model 切换模型', async () => {
    const result = await LLMRouterTool.call({
      action: 'switch_model',
      provider: 'openai',
      model_id: 'gpt-4o',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.model).toBe('gpt-4o')
    expect(result.data.provider).toBe('OPENAI')
  })

  it('switch_model 不支持的模型返回错误', async () => {
    const result = await LLMRouterTool.call({
      action: 'switch_model',
      provider: 'unknown',
      model_id: 'test-model',
    } as any)
    expect(result.data.success).toBe(false)
    expect(result.data.message).toContain('不支持')
  })

  it('estimate_tokens 估算token数量', async () => {
    const result = await LLMRouterTool.call({
      action: 'estimate_tokens',
      context: '这是一个测试文本，包含中英文混合内容。',
    } as any)
    expect(result.data.success).toBe(true)
    expect(result.data.tokens).toBeGreaterThan(0)
  })
})
