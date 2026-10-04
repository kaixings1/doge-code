import { describe, expect, it } from 'vitest'
import { getAssistantMessageFromError } from '../../services/api/errors.js'
import { CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE } from '../../services/api/errors.js'
import { finalizeAgentTool } from '../../tools/AgentTool/agentToolUtils.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
  extractTag,
} from '../../utils/messages.js'

/**
 * 端到端链路（离线）：402 余额不足 → finalizeAgentTool 抛错 →
 * failed 通知 summary → UI 提取 summary。断言用户最终看到的文本。
 *
 * summary 的构造方式复刻 LocalAgentTask.tsx:247（Agent "X" failed: <msg>），
 * 这是必须保持同步的下游契约。
 */
describe('端到端：余额不足错误必须对用户可见', () => {
  it('402 余额不足不再静默为 completed', () => {
    const meta = {
      prompt: '验证消息链路',
      resolvedAgentModel: 'test-model',
      isBuiltInAgent: false,
      startTime: Date.now(),
      agentType: 'general-purpose',
      isAsync: true,
    }
    // 复刻 claude.ts 对 402 普通 Error 的处理结果
    const errMsg = getAssistantMessageFromError(
      new Error(
        'OpenAI 兼容请求失败，状态码 402: {"code":"INSUFFICIENT_BALANCE","message":"余额不足"}',
      ),
      'test-model',
    )
    // 复刻子代理末条消息 = 这条 API 错误
    let failure = ''
    try {
      finalizeAgentTool([errMsg], 'agent-e2e', meta)
    } catch (e) {
      failure = (e as Error).message
    }
    // 不再走 completed：finalizeAgentTool 抛错，上层转 failed。
    // 上游已将 402 规范化为 CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE（账户余额过低）
    expect(failure).toContain(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE)
    // 复刻 LocalAgentTask.tsx:247 + 257 的 summary/XML 构造
    const summary = `Agent "验证消息链路" failed: ${failure}`
    const xml = `<task-notification>\n<status>failed</status>\n<summary>${summary}</summary>\n</task-notification>`
    // UI（UserAgentNotificationMessage）只渲染 summary —— 用户最终看到的内容
    const visible = extractTag(xml, 'summary')
    expect(visible).toContain(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE)
    expect(extractTag(xml, 'status')).toBe('failed')
  })
})

describe('finalizeAgentTool — API 错误不得伪装成 completed', () => {
  const meta = {
    prompt: '测试',
    resolvedAgentModel: 'test-model',
    isBuiltInAgent: false,
    startTime: Date.now(),
    agentType: 'general-purpose',
    isAsync: true,
  }

  it('末条助手消息是 API 错误时抛出，携带错误文本', () => {
    const errMsg = createAssistantAPIErrorMessage({
      content: 'API 错误:OpenAI 兼容请求失败，状态码 402 余额不足',
      error: 'billing_error',
    })
    // 变异测试：删除 agentToolUtils.ts 中的 isApiErrorMessage 守卫，此断言失败
    expect(() => finalizeAgentTool([errMsg], 'agent-1', meta)).toThrow(
      /余额不足/,
    )
  })

  it('超长错误文本被压成单行并截断，避免撑爆 summary', () => {
    const long = 'API 错误:' + '余额不足 '.repeat(200) + '\n第二行'
    const errMsg = createAssistantAPIErrorMessage({ content: long })
    let thrown: Error | null = null
    try {
      finalizeAgentTool([errMsg], 'agent-3', meta)
    } catch (e) {
      thrown = e as Error
    }
    expect(thrown !== null).toBe(true)
    expect(thrown!.message).not.toContain('\n')
    expect(thrown!.message.length).toBeLessThanOrEqual(301)
    expect(thrown!.message.endsWith('…')).toBe(true)
  })

  it('正常模型回复（createAssistantMessage）不抛错', () => {
    const ok = createAssistantMessage({
      content: [{ type: 'text', text: '任务已顺利完成' }],
    })
    const res = finalizeAgentTool([ok], 'agent-2', meta)
    expect(res.content.some(b => b.type === 'text')).toBe(true)
  })
})

/**
 * 回归测试：DOGE / OpenAI 兼容网关的余额不足错误必须被识别，
 * 否则 402 INSUFFICIENT_BALANCE 会退化成通用 "API 错误:..."，
 * 静默穿过子代理的 completed 路径，用户界面上什么都不显示。
 *
 * 变异测试：把 errors.ts 中新增的 'INSUFFICIENT_BALANCE' / '余额不足'
 * 任一分支去掉，下面的用例即失败。
 */
describe('getAssistantMessageFromError — 网关余额不足', () => {
  it('识别 INSUFFICIENT_BALANCE 错误码', () => {
    // 仅含错误码，不含「余额不足」字样，确保该分支可被独立验证
    const msg = getAssistantMessageFromError(
      new Error('status 402: {"code":"INSUFFICIENT_BALANCE"}'),
      'test-model',
    )
    expect(msg.isApiErrorMessage).toBe(true)
    expect(msg.message.content).toEqual([
      { type: 'text', text: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE },
    ])
  })

  it('识别中文「余额不足」提示', () => {
    const msg = getAssistantMessageFromError(
      new Error('请求失败：余额不足，请充值'),
      'test-model',
    )
    expect(msg.message.content).toEqual([
      { type: 'text', text: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE },
    ])
  })

  it('保留原有英文 credit balance 分支', () => {
    const msg = getAssistantMessageFromError(
      new Error('Your credit balance is too low to make this request'),
      'test-model',
    )
    expect(msg.message.content).toEqual([
      { type: 'text', text: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE },
    ])
  })

  it('无关错误不会被误判为余额不足', () => {
    const msg = getAssistantMessageFromError(
      new Error('something completely unrelated'),
      'test-model',
    )
    expect(msg.message.content).not.toEqual([
      { type: 'text', text: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE },
    ])
  })
})
