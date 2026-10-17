import { describe, it, expect } from 'vitest'
import { getParamRuleForTool } from '../permissions.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import type { PermissionRuleSource } from '../../../types/permissions.js'

const SRC: PermissionRuleSource = 'userSettings'

function ctxWith(
  rules: Partial<Record<'allow' | 'deny' | 'ask', string[]>>,
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { [SRC]: rules.allow ?? [] },
    alwaysDenyRules: { [SRC]: rules.deny ?? [] },
    alwaysAskRules: { [SRC]: rules.ask ?? [] },
    isBypassPermissionsModeAvailable: false,
  } as ToolPermissionContext
}

// 验证 `Tool(param:value)` 匹配层：仅当工具输入中对应参数值等于规则 value
// 时才命中；其他参数值（或缺失参数）不命中。
describe('getParamRuleForTool — Agent(model:opus)', () => {
  it('deny rule hits only when model === opus', () => {
    const ctx = ctxWith({ deny: ['Agent(model:opus)'] })
    const hit = getParamRuleForTool(ctx, 'Agent', 'deny', { model: 'opus' })
    expect(hit).not.toBeNull()
    expect(hit!.ruleValue.value).toBe('opus')
    // 其他模型不命中
    expect(getParamRuleForTool(ctx, 'Agent', 'deny', { model: 'sonnet' })).toBeNull()
    // 缺失 model 不命中
    expect(getParamRuleForTool(ctx, 'Agent', 'deny', {})).toBeNull()
  })

  it('ask rule hits only when model === opus', () => {
    const ctx = ctxWith({ ask: ['Agent(model:opus)'] })
    expect(getParamRuleForTool(ctx, 'Agent', 'ask', { model: 'opus' })).not.toBeNull()
    expect(getParamRuleForTool(ctx, 'Agent', 'ask', { model: 'haiku' })).toBeNull()
  })

  it('does not match a different tool', () => {
    const ctx = ctxWith({ deny: ['Agent(model:opus)'] })
    expect(getParamRuleForTool(ctx, 'Bash', 'deny', { model: 'opus' })).toBeNull()
  })

  it('positional content rules are unaffected (Agent(worker) still ruleContent)', () => {
    // 位置式 Agent(worker) 不应被 param 匹配误识别；它走 ruleContent 路径，
    // 这里验证 param 匹配层对它的 value 字段为 undefined 而跳过。
    const ctx = ctxWith({ deny: ['Agent(worker)'] })
    // param 匹配不命中（worker 无冒号 → 解析为 ruleContent，param 为 undefined）
    expect(getParamRuleForTool(ctx, 'Agent', 'deny', { model: 'opus' })).toBeNull()
  })

  it('matches a non-Agent tool with a param rule (Write(path:/tmp/x))', () => {
    const ctx = ctxWith({ deny: ['Write(path:/tmp/x)'] })
    expect(
      getParamRuleForTool(ctx, 'Write', 'deny', { path: '/tmp/x' }),
    ).not.toBeNull()
    expect(
      getParamRuleForTool(ctx, 'Write', 'deny', { path: '/tmp/y' }),
    ).toBeNull()
  })
})
