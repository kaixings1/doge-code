/**
 * engine/hooks/hooks.test.ts — Hook 管理器 + builtInHooks 测试
 */
import { describe, it, expect } from 'vitest'
import { HookManager, type HookEvent, type HookResult } from '../../engine/hooks/hookManager.js'
import {
  createSecretDetectionHook,
  createFileTypeWarningHook,
  createToolAuditLogHook,
  createSessionStartHook,
  createFailureTrackerHook,
} from '../../engine/hooks/builtInHooks.js'

// ============ HookManager 基础 ============

describe('HookManager', () => {
  it('应注册并触发同步 hook', async () => {
    const mgr = new HookManager()
    let called = false
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => ({ allow: true }),
    })
    const result = await mgr.trigger({ type: 'PreToolUse', toolName: 'Bash' })
    expect(result.allow).toBe(true)
  })

  it('应支持取消注册', async () => {
    const mgr = new HookManager()
    let count = 0
    const unregister = mgr.register({
      eventType: 'PostToolUse',
      handler: () => { count = count + 1; return { allow: true } },
    })
    await mgr.trigger({ type: 'PostToolUse' })
    expect(count).toBe(1)
    unregister()
    await mgr.trigger({ type: 'PostToolUse' })
    expect(count).toBe(1)
  })

  it('应阻止执行（allow=false）', async () => {
    const mgr = new HookManager()
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => ({ allow: false, reason: 'secret detected' }),
    })
    const result = await mgr.trigger({ type: 'PreToolUse', toolName: 'Write' })
    expect(result.allow).toBe(false)
    expect(result.reason).toBe('secret detected')
  })

  it('应支持 toolNameMatcher 过滤', async () => {
    const mgr = new HookManager()
    let bashCalled = false
    let readCalled = false
    mgr.register({
      eventType: 'PreToolUse',
      toolNameMatcher: 'Bash',
      handler: () => { bashCalled = true; return { allow: true } },
    })
    mgr.register({
      eventType: 'PreToolUse',
      toolNameMatcher: 'Read',
      handler: () => { readCalled = true; return { allow: true } },
    })
    await mgr.trigger({ type: 'PreToolUse', toolName: 'Bash' })
    expect(bashCalled).toBe(true)
    expect(readCalled).toBe(false)
  })

  it('应支持异步 hook', async () => {
    const mgr = new HookManager()
    mgr.register({
      eventType: 'PreToolUse',
      async: true,
      handler: async () => ({ allow: true }),
    })
    const result = await mgr.trigger({ type: 'PreToolUse' })
    expect(result.allow).toBe(true)
  })

  it('应处理 hook 超时', async () => {
    const mgr = new HookManager()
    mgr.register({
      eventType: 'PreToolUse',
      timeoutMs: 100,
      handler: async () => {
        await new Promise(r => setTimeout(r, 500))
        return { allow: true }
      },
    })
    const result = await mgr.trigger({ type: 'PreToolUse' })
    expect(result.allow).toBe(true) // 超时后默认继续
  })

  it('hook 错误不应影响主流程', async () => {
    const mgr = new HookManager()
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => { throw new Error('hook failed') },
    })
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => ({ allow: true }),
    })
    const result = await mgr.trigger({ type: 'PreToolUse' })
    expect(result.allow).toBe(true)
  })

  it('应返回最后一个 hook 的结果（未阻止时）', async () => {
    const mgr = new HookManager()
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => ({ allow: true, updatedInput: { a: 1 } }),
    })
    mgr.register({
      eventType: 'PreToolUse',
      handler: () => ({ allow: true, updatedInput: { b: 2 } }),
    })
    const result = await mgr.trigger({ type: 'PreToolUse' })
    expect(result.updatedInput).toEqual({ b: 2 })
  })
})

// ============ builtInHooks ============

describe('createSecretDetectionHook', () => {
  const hook = createSecretDetectionHook()

  it('应检测 Google API key', async () => {
    const result = await hook({ type: 'PreToolUse', input: { key: 'AIzaSyD-1234567890abcdefghijklmnopqrstuv' } })
    expect(result.allow).toBe(false)
  })

  it('应检测 OpenAI-style key', async () => {
    const result = await hook({ type: 'PreToolUse', input: { key: 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF123456' } })
    expect(result.allow).toBe(false)
  })

  it('应检测 PEM 私钥', async () => {
    const result = await hook({ type: 'PreToolUse', input: { key: '-----BEGIN RSA PRIVATE KEY-----' } })
    expect(result.allow).toBe(false)
  })

  it('应检测 password= 模式', async () => {
    const result = await hook({ type: 'PreToolUse', input: { command: 'export password=secret123' } })
    expect(result.allow).toBe(false)
  })

  it('安全输入应放行', async () => {
    const result = await hook({ type: 'PreToolUse', input: { name: 'test' } })
    expect(result.allow).toBe(true)
  })

  it('非 PreToolUse 事件应放行', async () => {
    const result = await hook({ type: 'PostToolUse' })
    expect(result.allow).toBe(true)
  })
})

describe('createFileTypeWarningHook', () => {
  const hook = createFileTypeWarningHook()

  it('应给文档文件添加警告', async () => {
    const result = await hook({
      type: 'PreToolUse',
      toolName: 'Write',
      input: { file_path: '/project/README.md' },
    })
    expect(result.allow).toBe(true)
    expect((result.updatedInput as Record<string, unknown>)?._warning).toContain('README.md')
  })

  it('非编辑工具应放行', async () => {
    const result = await hook({ type: 'PreToolUse', toolName: 'Bash', input: {} })
    expect(result.allow).toBe(true)
  })

  it('代码文件不应有警告', async () => {
    const result = await hook({
      type: 'PreToolUse',
      toolName: 'Write',
      input: { file_path: '/project/src/index.ts' },
    })
    expect(result.allow).toBe(true)
    expect(result.updatedInput).toBeUndefined()
  })
})

describe('createToolAuditLogHook', () => {
  it('应记录成功执行', async () => {
    const hook = createToolAuditLogHook()
    const result = await hook({ type: 'PostToolUse', toolName: 'Read', success: true })
    expect(result.allow).toBe(true)
  })

  it('应记录失败执行', async () => {
    const hook = createToolAuditLogHook()
    const result = await hook({ type: 'PostToolUse', toolName: 'Write', success: false, error: 'perm denied' })
    expect(result.allow).toBe(true)
  })

  it('非 PostToolUse 应放行', async () => {
    const hook = createToolAuditLogHook()
    const result = await hook({ type: 'PreToolUse' })
    expect(result.allow).toBe(true)
  })
})

describe('createSessionStartHook', () => {
  it('应调用初始化函数', async () => {
    let initCalled = false
    const hook = createSessionStartHook(() => { initCalled = true })
    const result = await hook({ type: 'SessionStart' })
    expect(initCalled).toBe(true)
    expect(result.allow).toBe(true)
  })

  it('初始化失败不应阻止', async () => {
    const hook = createSessionStartHook(() => { throw new Error('init fail') })
    const result = await hook({ type: 'SessionStart' })
    expect(result.allow).toBe(true)
  })
})

describe('createFailureTrackerHook', () => {
  it('应累计失败次数', async () => {
    let thresholdReached = false
    const hook = createFailureTrackerHook((count) => { thresholdReached = true }, 3)

    await hook({ type: 'PostToolUseFailure', toolName: 'Bash' })
    await hook({ type: 'PostToolUseFailure', toolName: 'Bash' })
    expect(thresholdReached).toBe(false)

    await hook({ type: 'PostToolUseFailure', toolName: 'Bash' })
    expect(thresholdReached).toBe(true)
  })

  it('成功后应重置计数', async () => {
    let thresholdReached = false
    const hook = createFailureTrackerHook((count) => { thresholdReached = true }, 3)

    await hook({ type: 'PostToolUseFailure', toolName: 'Bash' })
    await hook({ type: 'PostToolUse', toolName: 'Bash', success: true })
    await hook({ type: 'PostToolUseFailure', toolName: 'Bash' })
    expect(thresholdReached).toBe(false)
  })
})
