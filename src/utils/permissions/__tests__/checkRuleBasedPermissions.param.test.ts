import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { checkRuleBasedPermissions } from '../permissions.js'
import type { Tool, ToolUseContext } from '../../../types/tool.js'
import type {
  ToolPermissionContext,
  PermissionRuleSource,
} from '../../../types/permissions.js'

const SRC: PermissionRuleSource = 'userSettings'

function ctxWith(deny: string[]): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { [SRC]: [] },
    alwaysDenyRules: { [SRC]: deny },
    alwaysAskRules: { [SRC]: [] },
    isBypassPermissionsModeAvailable: false,
  } as ToolPermissionContext
}

// 最小 Tool stub：checkRuleBasedPermissions 仅读取 name / mcpInfo /
// inputSchema.parse / requiresUserInteraction?()。
const agentTool = {
  name: 'Agent',
  mcpInfo: undefined,
  inputSchema: z.object({ model: z.string().optional() }),
} as unknown as Tool

function makeContext(denyRules: string[]): ToolUseContext {
  return {
    options: {} as ToolUseContext['options'],
    abortController: new AbortController(),
    getAppState: () => ({ toolPermissionContext: ctxWith(denyRules) }),
    setAppState: () => {},
  } as unknown as ToolUseContext
}

// 真实决策路径集成测试：走生产函数 checkRuleBasedPermissions（含 1b.5
// 参数级 deny 检查），而不仅是单元级的 getParamRuleForTool。
describe('checkRuleBasedPermissions — Agent(model:opus) 实际拦截', () => {
  it('returns deny when model === opus (param rule fires on real path)', async () => {
    const result = await checkRuleBasedPermissions(
      agentTool,
      { model: 'opus' },
      makeContext(['Agent(model:opus)']),
    )
    expect(result).not.toBeNull()
    expect(result!.behavior).toBe('deny')
    expect(result!.decisionReason?.type).toBe('rule')
  })

  it('returns null when model !== opus (param rule does NOT fire)', async () => {
    const result = await checkRuleBasedPermissions(
      agentTool,
      { model: 'sonnet' },
      makeContext(['Agent(model:opus)']),
    )
    expect(result).toBeNull()
  })

  it('returns null when model is absent', async () => {
    const result = await checkRuleBasedPermissions(
      agentTool,
      {},
      makeContext(['Agent(model:opus)']),
    )
    expect(result).toBeNull()
  })

  it('does not fire for a different tool', async () => {
    const bashTool = {
      name: 'Bash',
      mcpInfo: undefined,
      inputSchema: z.object({ command: z.string() }),
    } as unknown as Tool
    const result = await checkRuleBasedPermissions(
      bashTool,
      { command: 'echo hi', model: 'opus' },
      makeContext(['Agent(model:opus)']),
    )
    expect(result).toBeNull()
  })
})
