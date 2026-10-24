/**
 * OpenAI 兼容矩阵守卫（吸收自 CCB providerCompatMatrix）。
 *
 * 覆盖：
 * 1. inferCompatRule：按 baseURL 识别 cerebras / groq / deepseek / openai / 本地
 * 2. 严格端点剥离 stream_options.include_usage，但保留 stream_options 的其它键
 * 3. 严格端点剥离消息里的 thinking 字段
 * 4. DeepSeek 保留 reasoning_content（always-preserve）
 * 5. permissive + 非思考模型 → 剥离 reasoning_content；思考模型 → 保留
 * 6. applyCompatRule 不修改入参（纯函数）
 * 7. getDeepSeekReasoningMode 三态判定
 *
 * 变异验证：把 applyCompatRule 改成直接 return body → 用例 2/3 失败；
 *          把 always-preserve 改成 strip → 用例 4 失败。
 */
import { describe, it, expect } from 'vitest'
import {
  applyCompatRule,
  getDeepSeekReasoningMode,
  inferCompatRule,
} from '../../src/services/api/providerCompat.js'

describe('inferCompatRule', () => {
  it.each([
    ['https://api.cerebras.ai/v1', 'llama3', 'cerebras'],
    ['https://api.groq.com/openai/v1', 'llama3', 'groq'],
    ['https://api.deepseek.com/v1', 'deepseek-chat', 'deepseek'],
    ['https://api.openai.com/v1', 'gpt-4o', 'strict-openai'],
    ['http://127.0.0.1:11434/v1/chat/completions', 'qwen3.5', 'permissive'],
  ])('%s + %s → %s', (url, model, expected) => {
    expect(inferCompatRule(url, model)).toBe(expected)
  })
})

describe('applyCompatRule', () => {
  const baseBody = {
    model: 'gpt-4o',
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: 'user', content: 'hi', thinking: 'internal note' },
      { role: 'assistant', content: 'yo', reasoning_content: 'chain of thought' },
    ],
  }

  it('严格端点剥离 include_usage，保留其它 stream_options 键', () => {
    const body = { ...baseBody, stream_options: { include_usage: true, other: 1 } }
    const out = applyCompatRule(body, 'strict-openai') as any
    expect(out.stream_options).toEqual({ other: 1 })
  })

  it('严格端点剥离空的 stream_options 整个键', () => {
    const out = applyCompatRule(baseBody, 'strict-openai') as any
    expect(out.stream_options).toBeUndefined()
  })

  it('严格端点剥离消息里的 thinking 字段', () => {
    const out = applyCompatRule(baseBody, 'cerebras') as any
    expect('thinking' in out.messages[0]).toBe(false)
    expect(out.messages[0].content).toBe('hi')
  })

  it('DeepSeek 保留 reasoning_content', () => {
    const out = applyCompatRule(baseBody, 'deepseek', 'deepseek-reasoner') as any
    expect(out.messages[1].reasoning_content).toBe('chain of thought')
    expect(out.stream_options).toEqual({ include_usage: true })
  })

  it('permissive + 非思考模型 → 剥离 reasoning_content', () => {
    const out = applyCompatRule(baseBody, 'permissive', 'qwen3.5:0.8b') as any
    expect('reasoning_content' in out.messages[1]).toBe(false)
  })

  it('permissive + 思考模型 → 保留 reasoning_content', () => {
    const out = applyCompatRule(baseBody, 'permissive', 'deepseek-r1') as any
    expect(out.messages[1].reasoning_content).toBe('chain of thought')
  })

  it('不修改入参', () => {
    const snapshot = JSON.stringify(baseBody)
    applyCompatRule(baseBody, 'strict-openai')
    expect(JSON.stringify(baseBody)).toBe(snapshot)
  })
})

describe('getDeepSeekReasoningMode', () => {
  it.each([
    [{ reasoning_content: 'x', tool_calls: [{ id: '1' }] }, 'thinking+tools'],
    [{ reasoning_content: 'x' }, 'thinking-only'],
    [{ content: 'x' }, 'normal'],
    [{ tool_calls: [] }, 'normal'],
  ] as const)('%j → %s', (msg, expected) => {
    expect(getDeepSeekReasoningMode(msg as any)).toBe(expected)
  })
})
