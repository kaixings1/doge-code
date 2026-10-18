/**
 * /loop 官方语义对齐测试。
 *
 * 背景：官方 /loop 与 /proactive 是**同一语义**（周期性重复运行 prompt，
 * 别名 /proactive）。doge 早期遗留的 `commands/proactive.ts` 是一段空泛的
 * 「自动重复执行任务」prompt，与官方语义脱钩；且 `loop` skill 未声明
 * `/proactive` 别名。本次对齐：给 loop skill 加 `aliases: ['proactive']`，
 * 并把 `proactive.ts` 改为复用 loop 的 buildPrompt，使 /proactive 与 /loop
 * 行为完全一致。
 *
 * 锁定不变量：
 *   1. registerLoopSkill 注册的 skill definition 含 aliases: ['proactive']
 *   2. buildPrompt 解析 [interval] <prompt> 正确（默认 10m、空 prompt 给用法）
 *   3. proactive 命令的 getPromptForCommand 复用 buildPrompt（与 /loop 等价）
 *
 * 变异验证：若把 loop.ts 的 aliases 改回未声明，用例 1 失败；若把
 * proactive.ts 改回旧空泛 prompt，用例 3 失败。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const registerBundledSkillMock = vi.fn()

vi.mock('../../src/skills/bundledSkills.js', () => ({
  registerBundledSkill: (def: { name: string; aliases?: string[] }) =>
    registerBundledSkillMock(def),
}))

// loop.ts 在 import 时会拉入 ScheduleCronTool/prompt.js（含 feature/GB 开关），
// 用 mock 隔离，避免测试环境读取真实 feature gate / telemetry。
vi.mock('../../src/tools/ScheduleCronTool/prompt.js', () => ({
  CRON_CREATE_TOOL_NAME: 'cron_create',
  CRON_DELETE_TOOL_NAME: 'cron_delete',
  DEFAULT_MAX_AGE_DAYS: 30,
  isKairosCronEnabled: () => true,
}))

const { registerLoopSkill, buildPrompt } = await import(
  '../../src/skills/bundled/loop.ts'
)

describe('/loop 官方语义对齐（别名 + 解析）', () => {
  beforeEach(() => {
    registerBundledSkillMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loop skill 注册时含 aliases: [proactive]（对齐官方 /proactive 别名）', () => {
    registerLoopSkill()
    expect(registerBundledSkillMock).toHaveBeenCalledTimes(1)
    const def = registerBundledSkillMock.mock.calls[0][0]
    expect(def.name).toBe('loop')
    expect(def.aliases).toContain('proactive')
  })

  it('buildPrompt：带 interval 时 prompt 被正确解析并注入（5m /babysit-prs）', () => {
    const out = buildPrompt('5m /babysit-prs')
    expect(out).toContain('/babysit-prs')
    // 解析出的 prompt 作为 Input 注入末尾
    expect(out.trimEnd().endsWith('/babysit-prs')).toBe(true)
  })

  it('buildPrompt：缺 interval 时默认 10m（文本含默认口径）', () => {
    const out = buildPrompt('check the deploy')
    expect(out).toContain('check the deploy')
    // 默认 10m 在解析规则与示例中出现
    expect(out).toContain('10m')
  })

  it('空 prompt 时 skill 返回用法说明（不调度）', async () => {
    registerLoopSkill()
    const def = registerBundledSkillMock.mock.calls[0][0]
    const blocks = await def.getPromptForCommand('')
    expect(blocks[0].type).toBe('text')
    expect((blocks[0] as { text: string }).text).toContain('Usage: /loop')
  })

  it('/proactive 命令复用 buildPrompt（与 /loop 等价）', async () => {
    const { default: proactive } = await import('../../src/commands/proactive.ts')
    const blocks = await proactive.getPromptForCommand('30m check the deploy')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    const text = (blocks[0] as { text: string }).text
    // 复用 buildPrompt → 同样的通用模板与注入的 prompt
    expect(text).toContain('check the deploy')
    expect(text.trimEnd().endsWith('check the deploy')).toBe(true)
    expect(proactive.name).toBe('proactive')
  })
})
