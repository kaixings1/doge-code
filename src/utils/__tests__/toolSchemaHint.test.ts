import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildInlineSchemaFragment } from '../toolSchemaHint.js'

describe('buildInlineSchemaFragment', () => {
  it('渲染 required 与 properties', () => {
    const fragment = buildInlineSchemaFragment(
      z.strictObject({
        taskId: z.string().describe('要更新的任务 ID'),
        status: z.string().optional(),
      }),
    )
    expect(fragment).not.toBeNull()

    const parsed = JSON.parse(fragment!)
    expect(parsed.required).toEqual(['taskId'])
    expect(Object.keys(parsed.properties)).toEqual(['taskId', 'status'])
    expect(parsed.properties.taskId.type).toBe('string')
  })

  it('对 TaskUpdate 真实 schema 标注 taskId 为必填（本次报错的根因）', () => {
    const fragment = buildInlineSchemaFragment(
      z.strictObject({
        taskId: z.string().describe('要更新的任务 ID'),
        subject: z.string().optional().describe('任务的新标题'),
        status: z
          .enum(['pending', 'in_progress', 'completed'])
          .or(z.literal('deleted'))
          .optional(),
        addBlocks: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )!
    const parsed = JSON.parse(fragment)
    expect(parsed.required).toContain('taskId')
    expect(parsed.properties.addBlocks.type).toBe('array')
    // 体积必须在上限内，否则错误信息会过长
    expect(fragment.length).toBeLessThan(2000)
  })

  it('超过体积上限时返回 null，让调用方回退到 ToolSearch 提示', () => {
    expect(
      buildInlineSchemaFragment(
        z.object({ big: z.string().describe('x'.repeat(3000)) }),
      ),
    ).toBeNull()
  })

  it('schema 无法转换为 JSON Schema 时返回 null 而非抛错', () => {
    expect(() => buildInlineSchemaFragment(z.custom(() => true))).not.toThrow()
    expect(buildInlineSchemaFragment(z.custom(() => true))).toBeNull()
  })
})
