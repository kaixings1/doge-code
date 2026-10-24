import { describe, it, expect } from 'vitest'
import { getParamRuleForTool } from '../../src/utils/permissions/permissions.js'
import { permissionRuleValueFromString } from '../../src/utils/permissions/permissionRuleParser.js'
import type { ToolPermissionContext } from '../../src/types/permissions.js'

/**
 * Tool(param:value) 的 `*` 通配符（对齐官方 v2.1.170）
 *
 * 难点：`Agent(model:*)`（参数通配）与 `Bash(prefix:*)`（位置式前缀规则）
 * 在字符串层面无法区分，解析层也没有工具 schema。本实现让含 `*` 的内容
 * 保留为 ruleContent，匹配层用「本次 input 里是否真有该参数名」判定。
 */
function ctx(rules: { deny?: string[]; allow?: string[]; ask?: string[] }): ToolPermissionContext {
  return {
    alwaysDenyRules: { localSettings: rules.deny ?? [] },
    alwaysAllowRules: { localSettings: rules.allow ?? [] },
    alwaysAskRules: { localSettings: rules.ask ?? [] },
    additionalDirectories: [],
    mode: 'default',
  } as unknown as ToolPermissionContext
}

describe('参数规则通配符', () => {
  it('含 * 的写法保留为 ruleContent（解析层不误判为精确参数）', () => {
    const v = permissionRuleValueFromString('Agent(model:*)')
    expect(v.param).toBe(undefined)
    expect(v.ruleContent).toBe('model:*')
  })

  it('Agent(model:*) 匹配任意 model 值', () => {
    const c = ctx({ deny: ['Agent(model:*)'] })
    for (const m of ['opus', 'haiku', 'sonnet']) {
      expect(getParamRuleForTool(c, 'Agent', 'deny', { model: m }), 'model=' + m).toBeTruthy()
    }
  })

  it('Agent(model:opus*) 前缀通配', () => {
    const c = ctx({ deny: ['Agent(model:opus*)'] })
    expect(getParamRuleForTool(c, 'Agent', 'deny', { model: 'opus-4-6' })).toBeTruthy()
    expect(getParamRuleForTool(c, 'Agent', 'deny', { model: 'sonnet' })).toBeFalsy()
  })

  it('input 中无该参数时不命中', () => {
    const c = ctx({ deny: ['Agent(model:*)'] })
    expect(getParamRuleForTool(c, 'Agent', 'deny', {})).toBeFalsy()
    expect(getParamRuleForTool(c, 'Agent', 'deny', { other: 'x' })).toBeFalsy()
  })

  it('Bash(prefix:*) 不会被误判为参数规则', () => {
    const c = ctx({ deny: ['Bash(prefix:*)'] })
    // Bash 的 input 里没有 prefix 参数 → 参数级匹配不命中，位置式路径照旧
    expect(getParamRuleForTool(c, 'Bash', 'deny', { command: 'npm install' })).toBeFalsy()
  })

  it('精确值规则仍生效（回归）', () => {
    const c = ctx({ deny: ['Agent(model:opus)'] })
    expect(getParamRuleForTool(c, 'Agent', 'deny', { model: 'opus' })).toBeTruthy()
    expect(getParamRuleForTool(c, 'Agent', 'deny', { model: 'sonnet' })).toBeFalsy()
  })

  it('不同工具互不影响', () => {
    const c = ctx({ deny: ['Agent(model:*)'] })
    expect(getParamRuleForTool(c, 'Write', 'deny', { model: 'opus' })).toBeFalsy()
  })

  it('ask / allow 行为同样支持通配', () => {
    expect(
      getParamRuleForTool(ctx({ ask: ['Agent(model:*)'] }), 'Agent', 'ask', { model: 'opus' }),
    ).toBeTruthy()
    expect(
      getParamRuleForTool(ctx({ allow: ['Agent(model:*)'] }), 'Agent', 'allow', { model: 'haiku' }),
    ).toBeTruthy()
  })
})
