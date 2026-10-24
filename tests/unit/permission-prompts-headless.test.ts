import { describe, it, expect, afterEach } from 'vitest'
import {
  applyNoneModeToDecision,
  NONE_MODE_DENY_MESSAGE,
  permissionPromptsMode,
} from '../../src/utils/permissions/permissionPromptsMode.js'

/**
 * --permission-prompts none 的模式转换语义（对齐官方 v2.1.259）
 *
 * 无头路径 src/cli/print.ts 的三条分支（stdio / 无提示工具 / MCP 提示工具）
 * 都统一调用 applyNoneModeToDecision，因此这里测它对三种权限结果的处理即可。
 *
 * 不直接 import print.ts 的原因：它的顶层依赖（tools.js / remoteManagedSettings 等）
 * 在 vitest 下首次加载要 10s+，与本逻辑无关。
 */

type Decision = { behavior: string; message?: string }

describe('applyNoneModeToDecision', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_PERMISSION_PROMPTS
  })

  it('none 模式下 ask 被转成 deny', () => {
    const ask = { behavior: 'ask', message: '需要确认' }
    const r = applyNoneModeToDecision(ask, 'none') as Decision & { decisionReason?: unknown }

    expect(r.behavior).toBe('deny')
    expect(r.message).toBe(NONE_MODE_DENY_MESSAGE)
    expect(r.decisionReason).toEqual({ type: 'other', reason: 'permission-prompts: none' })
  })

  it('host 模式下 ask 原样透传', () => {
    const ask = { behavior: 'ask', message: '需要确认' }
    expect(applyNoneModeToDecision(ask, 'host')).toBe(ask)
  })

  it('none 模式下 allow 不被拦截（显式规则优先）', () => {
    const allow = { behavior: 'allow', updatedInput: {} }
    expect(applyNoneModeToDecision(allow, 'none')).toBe(allow)
  })

  it('none 模式下 deny 保持原样（保留原规则理由）', () => {
    const deny = { behavior: 'deny', message: '规则拒绝' }
    const r = applyNoneModeToDecision(deny, 'none') as Decision
    expect(r.behavior).toBe('deny')
    expect(r.message).toBe('规则拒绝')
  })

  it('默认读取环境变量（mode 省略时）', () => {
    process.env.CLAUDE_CODE_PERMISSION_PROMPTS = 'none'
    expect(permissionPromptsMode()).toBe('none')
    const r = applyNoneModeToDecision({ behavior: 'ask' }) as Decision
    expect(r.behavior).toBe('deny')

    delete process.env.CLAUDE_CODE_PERMISSION_PROMPTS
    const r2 = applyNoneModeToDecision({ behavior: 'ask' }) as Decision
    expect(r2.behavior).toBe('ask')
  })

  it('非法环境变量回落到 host，不误拦', () => {
    process.env.CLAUDE_CODE_PERMISSION_PROMPTS = 'nope'
    expect(permissionPromptsMode()).toBe('host')
    const r = applyNoneModeToDecision({ behavior: 'ask' }) as Decision
    expect(r.behavior).toBe('ask')
  })
})

describe('无头路径接入完整性（源码契约）', () => {
  /**
   * print.ts 的 getCanUseToolFn 有三条分支（stdio / 无提示工具 / MCP 提示工具）。
   * 任何一条漏套 wrapNoneMode，该路径下 none 就会失效——而单测按分支写会漏掉
   * 新增的第四条。这里直接断言三条 return 都经过包装。
   */
  it('三条分支都套了 wrapNoneMode', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync('D:/doge-code/src/cli/print.ts', 'utf8')

    // 定义存在
    expect(src).toContain('const wrapNoneMode = (fn: CanUseToolFn): CanUseToolFn =>')
    // 包装内部确实调用了模式转换
    expect(src).toContain('applyNoneModeToDecision(result)')

    const wrapped = src.match(/return wrapNoneMode\(/g) ?? []
    // stdio + 无提示工具 + MCP 提示工具
    expect(wrapped.length).toBe(3)
  })
})
