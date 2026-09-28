import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { _sdkInputSchema } from '../../tools/AskUserQuestionTool/AskUserQuestionTool.tsx'

/**
 * 回归防护：AskUserQuestion 的参数形状必须是
 *   { questions: [{ question, header, options }] }
 * 而不是扁平的
 *   { question, header, options }
 *
 * 后者曾被 src/skills/bundled/scheduleRemoteAgents.ts 的提示词引导产生，
 * 报错为「缺少必需参数 `questions`」。该测试锁住两条：
 *   1. 正确形状可通过校验
 *   2. 错误形状无法通过校验（防止提示词再次被写错而无人发现）
 */
const inputSchema = _sdkInputSchema()

/** 复刻 toolExecution.ts 中「校验前过滤未知字段」的行为 */
function stripUnknown(schema: z.ZodTypeAny, input: unknown): unknown {
  let raw: z.ZodObject | null = null
  let current: z.ZodTypeAny = schema
  // zod v3 的 ZodEffects（zod v4 中不存在，用 any 兜底）
  const ZodEffects = (z as unknown as Record<string, unknown>).ZodEffects as
    | (new () => z.ZodType)
    | null
  for (let i = 0; i < 10; i++) {
    if (current instanceof z.ZodObject) {
      raw = current
      break
    }
    // zod v3: ZodEffects
    if (ZodEffects && current instanceof ZodEffects) {
      const inner = (current as unknown as { _def?: { in?: z.ZodTypeAny } })._def?.in
      if (inner) {
        current = inner
        continue
      }
    }
    // zod v4: ZodPipe → _def.in
    if ((current as unknown as { _def?: { in?: z.ZodTypeAny } })?._def?.in) {
      current = (current as unknown as { _def: { in: z.ZodTypeAny } })._def.in
      continue
    }
    // ZodOptional/ZodNullable → _def.innerType
    if ((current as unknown as { _def?: { innerType?: z.ZodTypeAny } })?._def?.innerType) {
      current = (current as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType
      continue
    }
    break
  }
  const knownKeys = raw ? Object.keys(raw.shape) : []
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input
  if (knownKeys.length === 0) return input
  return Object.fromEntries(Object.entries(input).filter(([k]) => knownKeys.includes(k)))
}

const validOption = { label: '创建', description: '创建一个新的定时远程代理' }
const validQuestion = {
  question: '您想通过定时远程代理执行什么操作？',
  header: '操作',
  options: [validOption, { label: '列表', description: '列出所有触发器' }],
}

describe('AskUserQuestion 输入 schema', () => {
  it('接受正确形状 { questions: [{ question, header, options }] }', () => {
    const result = inputSchema.safeParse({ questions: [validQuestion] })
    expect(result.success).toBe(true)
  })

  it('multiSelect 可省略（有默认值 false）', () => {
    const result = inputSchema.safeParse({ questions: [validQuestion] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.questions[0]!.multiSelect).toBe(false)
    }
  })

  /**
   * 这是本文件的核心用例：复现「缺少必需参数 questions」的报错路径。
   * 扁平形状的键全部不属于 schema，过滤后只剩 {}，故报错只提 questions。
   */
  it('拒绝扁平形状 { question, header, options }（曾被提示词错误引导）', () => {
    const flat = { question: validQuestion.question, header: '操作', options: validQuestion.options }
    const filtered = stripUnknown(inputSchema, flat)

    // 关键：未知字段过滤后，扁平形状被剥成空对象
    expect(filtered).toEqual({})

    const result = inputSchema.safeParse(filtered)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('questions')
    }
  })

  it('直接校验扁平形状也会失败（strictObject 拒绝顶层未知键）', () => {
    const flat = { question: validQuestion.question, header: '操作', options: validQuestion.options }
    const result = inputSchema.safeParse(flat)
    expect(result.success).toBe(false)
  })

  it('接受扁平形状被包裹进数组后的形态（提示词修复后引导的形状）', () => {
    const wrapped = { questions: [validQuestion] }
    expect(inputSchema.safeParse(wrapped).success).toBe(true)
  })

  it('questions 为空数组时失败（min(1)）', () => {
    expect(inputSchema.safeParse({ questions: [] }).success).toBe(false)
  })

  it('questions 超过 4 个时失败（max(4)）', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...validQuestion,
      question: `问题 ${i}？`,
    }))
    expect(inputSchema.safeParse({ questions: many }).success).toBe(false)
  })

  it('options 少于 2 个时失败（min(2)）', () => {
    const oneOption = { ...validQuestion, options: [validOption] }
    expect(inputSchema.safeParse({ questions: [oneOption] }).success).toBe(false)
  })

  it('问题是重复文本时失败（UNIQUENESS_REFINE）', () => {
    const dup = [validQuestion, validQuestion]
    expect(inputSchema.safeParse({ questions: dup }).success).toBe(false)
  })

  it('同一问题内选项标签重复时失败（UNIQUENESS_REFINE）', () => {
    const dupLabels = {
      ...validQuestion,
      options: [validOption, validOption],
    }
    expect(inputSchema.safeParse({ questions: [dupLabels] }).success).toBe(false)
  })

  it('顶层附加未知字段时被 strictObject 拒绝（但过滤后可容忍）', () => {
    const withExtra = { questions: [validQuestion], sessionId: 'abc' }
    expect(inputSchema.safeParse(withExtra).success).toBe(false)
    // 经 toolExecution 的过滤逻辑后应可通过
    expect(inputSchema.safeParse(stripUnknown(inputSchema, withExtra)).success).toBe(true)
  })

  it('header 超长不报错（schema 未加长度约束，仅提示词建议）', () => {
    const longHeader = { ...validQuestion, header: '这是一个非常长的标签超过十二个字符' }
    expect(inputSchema.safeParse({ questions: [longHeader] }).success).toBe(true)
  })
})
