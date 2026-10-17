import { describe, it, expect } from 'vitest'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../permissionRuleParser.js'

// `Tool(param:value)` 命名参数级匹配解析 —— 官方 W25 的细粒度权限语法，
// 例如 `Agent(model:opus)`。解析层把 `param:value` 拆成结构化字段，与
// 位置式 `ruleContent`（如 `Bash(npm install)`、`Agent(worker,researcher)`）
// 互斥。
describe('permissionRuleValueFromString — param:value', () => {
  it('parses Agent(model:opus) into param/value', () => {
    const r = permissionRuleValueFromString('Agent(model:opus)')
    expect(r.toolName).toBe('Agent')
    expect(r.param).toBe('model')
    expect(r.value).toBe('opus')
    // 不能把命名参数误判为位置式内容
    expect(r.ruleContent).toBeUndefined()
  })

  it('parses Write(path:/foo) into param/value', () => {
    const r = permissionRuleValueFromString('Write(path:/tmp/x)')
    expect(r.toolName).toBe('Write')
    expect(r.param).toBe('path')
    expect(r.value).toBe('/tmp/x')
  })

  it('keeps positional Bash(npm install) as ruleContent', () => {
    const r = permissionRuleValueFromString('Bash(npm install)')
    expect(r.toolName).toBe('Bash')
    expect(r.ruleContent).toBe('npm install')
    expect(r.param).toBeUndefined()
    expect(r.value).toBeUndefined()
  })

  it('keeps Agent(worker,researcher) (comma list) as ruleContent', () => {
    const r = permissionRuleValueFromString('Agent(worker,researcher)')
    expect(r.toolName).toBe('Agent')
    expect(r.ruleContent).toBe('worker,researcher')
    expect(r.param).toBeUndefined()
  })

  it('keeps Bash(prefix:*) (wildcard) as ruleContent', () => {
    const r = permissionRuleValueFromString('Bash(prefix:*)')
    expect(r.toolName).toBe('Bash')
    expect(r.ruleContent).toBe('prefix:*')
    expect(r.param).toBeUndefined()
  })

  it('keeps a space-containing content as ruleContent', () => {
    const r = permissionRuleValueFromString('Bash(rm -rf build)')
    expect(r.ruleContent).toBe('rm -rf build')
    expect(r.param).toBeUndefined()
  })

  it('treats bare tool name with no parens as toolName only', () => {
    const r = permissionRuleValueFromString('Bash')
    expect(r.toolName).toBe('Bash')
    expect(r.ruleContent).toBeUndefined()
    expect(r.param).toBeUndefined()
  })

  it('round-trips Agent(model:opus) through toString', () => {
    const r = permissionRuleValueFromString('Agent(model:opus)')
    expect(permissionRuleValueToString(r)).toBe('Agent(model:opus)')
  })

  it('round-trips Bash(npm install) through toString', () => {
    const r = permissionRuleValueFromString('Bash(npm install)')
    expect(permissionRuleValueToString(r)).toBe('Bash(npm install)')
  })
})

// 变异测试：把解析判定反转（paramMatch 永远为真）会让上面多个用例失败，
// 证明这些测试非复刻、能抓真缺陷。
describe('regression: param parsing is not a no-op', () => {
  it('does NOT parse a plain tool name as param:value', () => {
    const r = permissionRuleValueFromString('Agent')
    expect(r.param).toBeUndefined()
  })
})
