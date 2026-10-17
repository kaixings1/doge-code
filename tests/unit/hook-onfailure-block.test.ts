/**
 * onFailure:block 的纯函数单测。
 *
 * 重点测 shouldBlockOnFailure / buildOnFailureBlockReason：
 * - HookCommand + onFailure:"block" → 阻断
 * - HookCommand + onFailure:"allow" → 不阻断
 * - HookCommand 无 onFailure → 不阻断（默认放行）
 * - HookCallback / FunctionHook → 永不阻断（schema 不支持 onFailure）
 *
 * 变异验证：把 shouldBlockOnFailure 的判定反转，对应用例应失败。
 */
import { describe, it, expect } from 'vitest'
import {
  shouldBlockOnFailure,
  buildOnFailureBlockReason,
} from '../../src/utils/hooks.js'
import type { HookCommand, HookCallback, FunctionHook } from '../../src/utils/hooks.js'

describe('shouldBlockOnFailure', () => {
  it('HookCommand + onFailure:block → 阻断', () => {
    const hook: HookCommand = {
      type: 'command',
      command: 'false', // 永远失败的命令
      onFailure: 'block',
    }
    expect(shouldBlockOnFailure(hook)).toBe(true)
  })

  it('HookCommand + onFailure:allow → 不阻断', () => {
    const hook: HookCommand = {
      type: 'command',
      command: 'false',
      onFailure: 'allow',
    }
    expect(shouldBlockOnFailure(hook)).toBe(false)
  })

  it('HookCommand 无 onFailure → 不阻断（默认放行）', () => {
    const hook: HookCommand = {
      type: 'command',
      command: 'false',
    }
    expect(shouldBlockOnFailure(hook)).toBe(false)
  })

  it('HookCommand (prompt 类型) + onFailure:block → 阻断', () => {
    const hook: HookCommand = {
      type: 'prompt',
      prompt: '验证 X',
      onFailure: 'block',
    }
    expect(shouldBlockOnFailure(hook)).toBe(true)
  })

  it('HookCallback 永不阻断（即使误传 onFailure 也忽略）', () => {
    const hook = {
      type: 'callback' as const,
      callback: async () => {},
      internal: false,
      // callback 类型不应有 onFailure；即使误传也应被 shouldBlockOnFailure 拒绝
      onFailure: 'block' as unknown,
    } as unknown as HookCallback
    expect(shouldBlockOnFailure(hook)).toBe(false)
  })

  it('FunctionHook 永不阻断', () => {
    const hook = {
      type: 'function' as const,
      fn: async () => {},
      timeout: 5,
      onFailure: 'block' as unknown,
    } as unknown as FunctionHook
    expect(shouldBlockOnFailure(hook)).toBe(false)
  })

  it('HttpHook + onFailure:block → 阻断', () => {
    const hook: HookCommand = {
      type: 'http',
      url: 'https://example.com/hook',
      onFailure: 'block',
    }
    expect(shouldBlockOnFailure(hook)).toBe(true)
  })

  it('AgentHook + onFailure:block → 阻断', () => {
    const hook: HookCommand = {
      type: 'agent',
      prompt: '验证 X',
      onFailure: 'block',
    }
    expect(shouldBlockOnFailure(hook)).toBe(true)
  })
})

describe('buildOnFailureBlockReason', () => {
  it('有 exitCode 时文案包含 exit', () => {
    const reason = buildOnFailureBlockReason('PreToolUse:Bash', '命令找不到', 127)
    expect(reason).toContain('PreToolUse:Bash')
    expect(reason).toContain('exit 127')
    expect(reason).toContain('命令找不到')
    expect(reason).toContain('onFailure:block')
  })

  it('exitCode 为 null 时不包含 exit', () => {
    const reason = buildOnFailureBlockReason('PreToolUse:Bash', '超时', null)
    expect(reason).not.toContain('exit')
    expect(reason).toContain('超时')
    expect(reason).toContain('onFailure:block')
  })

  it('空 errorMessage 时仍能生成文案', () => {
    const reason = buildOnFailureBlockReason('PreToolUse:Bash', '', 1)
    expect(reason).toContain('exit 1')
    // 即使 errorMessage 空，也能识别「onFailure:block 阻断」语义
    expect(reason).toContain('onFailure:block')
  })
})
