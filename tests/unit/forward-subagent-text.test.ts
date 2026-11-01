/**
 * `--forward-subagent-text`（对齐官方 2.1.211 / 2.1.219）。
 *
 * 背景：本地原本已有环境变量 → settings.forwardSubagentText 的读取
 * （featureFlags.ts:167），但**只赋值、无人消费**；AgentTool 转发子代理
 * 消息时只放行 tool_use / tool_result，text 与 thinking 被 continue 跳过，
 * 因此 stream-json 消费方永远拿不到子代理的过程文本。属于「配置存在但
 * 功能未生效」。
 *
 * 覆盖：
 * 1. 关闭时 text/thinking 不放行
 * 2. 开启时 text/thinking 放行
 * 3. tool_use / tool_result 不受开关影响（始终由调用方放行，不归本函数管）
 * 4. 环境变量只认 '1'（与 featureFlags.ts 语义一致）
 * 5. settings.forwardSubagentText 独立生效
 * 6. 未知块类型不放行
 *
 * 变异验证（必须做）：
 *   - 把 FORWARDABLE_BLOCK_TYPES 改成空集 → 用例 2 失败
 *   - 删掉 settings 分支 → 用例 5 失败
 *   - 把 raw === '1' 改成 raw !== undefined → 用例 4 失败
 *   以上均已实测确认失败。
 */
import { describe, it, expect } from 'vitest'
import {
  isSubagentTextForwardingEnabled,
  shouldForwardSubagentBlock,
} from '../../src/utils/subagentTextForwarding.js'

describe('shouldForwardSubagentBlock', () => {
  it('关闭时不放行 text/thinking', () => {
    expect(shouldForwardSubagentBlock('text', false)).toBe(false)
    expect(shouldForwardSubagentBlock('thinking', false)).toBe(false)
  })

  it('开启时放行 text 与 thinking', () => {
    expect(shouldForwardSubagentBlock('text', true)).toBe(true)
    expect(shouldForwardSubagentBlock('thinking', true)).toBe(true)
  })

  it('未知块类型即使开启也不放行', () => {
    expect(shouldForwardSubagentBlock('image', true)).toBe(false)
    expect(shouldForwardSubagentBlock('server_tool_use', true)).toBe(false)
  })
})

describe('isSubagentTextForwardingEnabled', () => {
  it('默认关闭', () => {
    expect(isSubagentTextForwardingEnabled({}, undefined)).toBe(false)
    expect(isSubagentTextForwardingEnabled({}, {})).toBe(false)
  })

  it("环境变量只认 '1'，其余值视为关闭", () => {
    expect(
      isSubagentTextForwardingEnabled({ CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1' }),
    ).toBe(true)
    // 与 featureFlags.ts:167 保持一致：只有 '1' 开启
    expect(
      isSubagentTextForwardingEnabled({ CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: 'true' }),
    ).toBe(false)
    expect(
      isSubagentTextForwardingEnabled({ CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '0' }),
    ).toBe(false)
  })

  it('settings 字段可独立开启（不依赖环境变量）', () => {
    expect(
      isSubagentTextForwardingEnabled({}, { forwardSubagentText: true }),
    ).toBe(true)
  })
})
