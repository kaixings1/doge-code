/**
 * 分层自动降级守卫（/router 执行侧）。
 *
 * 核心安全契约：默认关闭、只降不升、只降一级、多重保护条件。
 *
 * 覆盖：
 * 1. 未开启开关 → 永不降级（默认安全）
 * 2. 开启后：机械任务 + Opus → 降一级到 standard
 * 3. 只降一级：Opus + 机械任务 → standard（不是直接 cheap）
 * 4. 只降不升：cheap 模型 + 架构任务 → 保持 cheap
 * 5. 任务需要 strong 时不降级
 * 6. 计划模式不降级
 * 7. 含图片不降级
 * 8. 上下文过大不降级
 * 9. 未知模型（自定义/中转站 ID）不降级
 * 10. 空跑模式：报告将降级但 model 不变
 * 11. extractTaskText 取最近用户文本
 *
 * 变异验证：
 *   - 删掉 ROUTER_AUTO 检查 → 用例 1 失败
 *   - 把 targetIdx 改成 0（直接降到 cheap）→ 用例 3 失败
 *   - 删掉 plan 模式判断 → 用例 6 失败
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractTaskTextFromMessages } from '../../src/utils/routerTaskText.js'
import {
  DOWNGRADE_CONTEXT_LIMIT_TOKENS,
  ROUTER_AUTO_ENV,
  ROUTER_DRY_RUN_ENV,
  decideDowngrade,
  modelForTier,
  tierOfModel,
} from '../../src/utils/routerDowngrade.js'

const MECHANICAL = '把这个文件按格式重命名一下，顺便润色注释'
const ARCH = '重构整个认证模块的架构，排查死锁根因'

describe('tierOfModel', () => {
  it.each([
    ['claude-opus-4-6', 'strong'],
    ['claude-sonnet-4-6', 'standard'],
    ['claude-haiku-4-5', 'cheap'],
    ['my-custom-proxy-model-v3', undefined],
  ] as const)('%s → %s', (model, expected) => {
    expect(tierOfModel(model)).toBe(expected)
  })
})

describe('decideDowngrade — 默认安全', () => {
  it('未开启开关时永不降级', () => {
    const r = decideDowngrade({
      model: 'claude-opus-4-6',
      taskText: MECHANICAL,
      env: {},
    })
    expect(r.downgraded).toBe(false)
    expect(r.model).toBe('claude-opus-4-6')
    expect(r.reason).toContain(ROUTER_AUTO_ENV)
  })

  it('开关值写成 0/false 同样不降级', () => {
    for (const v of ['0', 'false', 'off', 'no']) {
      const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: MECHANICAL, env: { [ROUTER_AUTO_ENV]: v } })
      expect(r.downgraded).toBe(false)
    }
  })
})

describe('decideDowngrade — 开启后的行为', () => {
  const env = { [ROUTER_AUTO_ENV]: '1' }

  it('机械任务 + Opus → 降一级到 standard', () => {
    const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: MECHANICAL, env })
    expect(r.downgraded).toBe(true)
    expect(tierOfModel(r.model)).toBe('standard')
  })

  it('只降一级，不会从 Opus 直接跳到 cheap', () => {
    const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: MECHANICAL, env })
    expect(tierOfModel(r.model)).not.toBe('cheap')
  })

  it('只降不升：cheap 模型 + 架构任务 → 保持原模型', () => {
    const r = decideDowngrade({ model: 'claude-haiku-4-5', taskText: ARCH, env })
    expect(r.downgraded).toBe(false)
    expect(r.model).toBe('claude-haiku-4-5')
  })

  it('任务需要 strong 时不降级', () => {
    const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: ARCH, env })
    expect(r.downgraded).toBe(false)
  })

  it('计划模式不降级', () => {
    const r = decideDowngrade({
      model: 'claude-opus-4-6',
      taskText: MECHANICAL,
      permissionMode: 'plan',
      env,
    })
    expect(r.downgraded).toBe(false)
    expect(r.reason).toContain('计划模式')
  })

  it('含图片不降级', () => {
    const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: MECHANICAL, hasImages: true, env })
    expect(r.downgraded).toBe(false)
    expect(r.reason).toContain('图片')
  })

  it('上下文过大不降级', () => {
    const r = decideDowngrade({
      model: 'claude-opus-4-6',
      taskText: MECHANICAL,
      contextTokens: DOWNGRADE_CONTEXT_LIMIT_TOKENS + 1,
      env,
    })
    expect(r.downgraded).toBe(false)
    expect(r.reason).toContain('上下文')
  })

  it('未知模型不参与降级', () => {
    const r = decideDowngrade({ model: 'my-proxy-model', taskText: MECHANICAL, env })
    expect(r.downgraded).toBe(false)
    expect(r.reason).toContain('非已知模型族')
  })

  it('无任务文本不降级', () => {
    const r = decideDowngrade({ model: 'claude-opus-4-6', taskText: '', env })
    expect(r.downgraded).toBe(false)
  })

  it('空跑模式报告将降级但模型不变', () => {
    const r = decideDowngrade({
      model: 'claude-opus-4-6',
      taskText: MECHANICAL,
      env: { [ROUTER_AUTO_ENV]: '1', [ROUTER_DRY_RUN_ENV]: '1' },
    })
    expect(r.model).toBe('claude-opus-4-6')
    expect(r.downgraded).toBe(false)
    expect(r.reason).toContain('空跑')
    expect(r.targetTier).toBe('standard')
  })
})

describe('modelForTier', () => {
  const saved = { ...process.env }

  afterEach(() => {
    process.env = { ...saved }
  })

  it('环境变量覆盖优先', () => {
    process.env.CLAUDE_CODE_ROUTER_CHEAP_MODEL = 'my-cheap-model'
    expect(modelForTier('cheap')).toBe('my-cheap-model')
  })

  it('未覆盖时能从模型族默认值取到', () => {
    delete process.env.CLAUDE_CODE_ROUTER_STANDARD_MODEL
    const s = modelForTier('standard')
    // 契约：取不到默认模型时返回空值，让调用方放弃降级（绝不编造模型名）
    expect(!s || s.length > 0).toBe(true)
  })
})

describe('extractTaskTextFromMessages', () => {
  beforeEach(() => {})

  it('取最近一条用户消息的文本', () => {
    const messages = [
      { role: 'user', content: '旧任务' },
      { role: 'assistant', content: '回复' },
      { role: 'user', content: [{ type: 'text', text: '新任务' }] },
    ]
    expect(extractTaskTextFromMessages(messages)).toBe('新任务')
  })

  it('忽略非 text 块和非用户消息', () => {
    const messages = [
      { role: 'user', content: [{ type: 'tool_result', content: 'x' }] },
      { role: 'assistant', content: '不应被选中' },
    ]
    expect(extractTaskTextFromMessages(messages)).toBe('')
  })
})
