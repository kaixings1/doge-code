/**
 * `claude_code.safety_event` 的语义映射（官方 2.1.307）。
 *
 * 官方描述：for each tool call a permission rule, auto mode, a safety check,
 * a hook or the sandbox stopped, prompted or sent back.
 *
 * 这里只测映射纯函数（不拉起 OTel 栈）。三条原则：
 * 1. 只输出官方枚举值，未命中给 unknown/other —— 绝不臆造
 * 2. 本地只有 accept/reject → 只产出 allowed/denied，不产出 sent_back
 * 3. 工具分类保守，未命中给 other
 *
 * 变异验证（必须做）：
 *   - mapDecisionToSafetyOutcome 去掉 !== accept 判断恒返回 allowed
 *     → 「reject → denied」用例失败
 *   - mapSourceToSafetyGate 去掉 hook 分支 → hook 用例失败
 *   - toolClassForAnalytics 去掉 execute 分支 → bash 用例失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import {
  mapDecisionToSafetyOutcome,
  mapSourceToSafetyGate,
  toolClassForAnalytics,
} from '../../src/utils/telemetry/safetyEventMapping.js'

describe('mapDecisionToSafetyOutcome', () => {
  it('accept → allowed', () => {
    expect(mapDecisionToSafetyOutcome('accept')).toBe('allowed')
  })

  it('reject → denied', () => {
    expect(mapDecisionToSafetyOutcome('reject')).toBe('denied')
  })

  it('不产出本地不存在的 send_back 结局', () => {
    // 本地没有「退回重写」路径，任何输入都不该映射成 sent_back
    for (const d of ['accept', 'reject', 'unknown']) {
      expect(mapDecisionToSafetyOutcome(d)).not.toBe('sent_back')
    }
  })
})

describe('mapSourceToSafetyGate', () => {
  it('识别五类官方来源', () => {
    expect(mapSourceToSafetyGate('auto_mode')).toBe('auto_mode')
    expect(mapSourceToSafetyGate('hook')).toBe('hook')
    expect(mapSourceToSafetyGate('sandbox')).toBe('sandbox')
    expect(mapSourceToSafetyGate('classifier')).toBe('classifier')
    expect(mapSourceToSafetyGate('config')).toBe('permission_rule')
  })

  it('用户对话框提示', () => {
    expect(mapSourceToSafetyGate('user_prompt')).toBe('user_prompt')
    expect(mapSourceToSafetyGate('prompt')).toBe('user_prompt')
  })

  it('安全检查', () => {
    expect(mapSourceToSafetyGate('safety_check')).toBe('safety_check')
  })

  it('无法归类给 unknown（不臆造）', () => {
    expect(mapSourceToSafetyGate('some-weird-source')).toBe('unknown')
  })
})

describe('toolClassForAnalytics', () => {
  it('按类别归类', () => {
    expect(toolClassForAnalytics('Read')).toBe('read')
    expect(toolClassForAnalytics('Grep')).toBe('read')
    expect(toolClassForAnalytics('Write')).toBe('write')
    expect(toolClassForAnalytics('Edit')).toBe('write')
    expect(toolClassForAnalytics('Bash')).toBe('execute')
    expect(toolClassForAnalytics('PowerShell')).toBe('execute')
    expect(toolClassForAnalytics('mcp__foo__bar')).toBe('mcp')
  })

  it('未命中给 other', () => {
    expect(toolClassForAnalytics('SomeUnknownTool')).toBe('other')
  })
})
