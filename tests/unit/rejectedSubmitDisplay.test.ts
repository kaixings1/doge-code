import { describe, expect, it } from 'vitest'
import { planRejectedSubmit } from '../../src/utils/rejectedSubmitDisplay.js'
import type { Message } from '../../src/types/message.js'

/**
 * 回归测试：提交被并发守卫拒绝时，用户消息必须仍然可见。
 *
 * 缺陷现象（用户报告）：doge.exe 终端下，首次输入正常，第二次及之后
 * 每次回车后界面不回显用户输入（往上滚也看不到），但 AI 回复正常出现。
 * 根因：onQuery 的 tryStart()===null 分支只 enqueue、从不 setMessages。
 *
 * 本测试锁定 planRejectedSubmit 的两条契约：
 *  A. 只要本次提交有消息，就必须显示（shouldDisplay=true）—— 这是缺陷的核心。
 *  B. 只有非 meta 的 user 文本消息才重新入队。
 */

// 与 REPL 传入的 getContentText 行为一致的桩：字符串直返，否则取首个 text 块。
const textOf = (content: unknown): string | null => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = content.find((b: any) => b?.type === 'text')?.text
    return typeof t === 'string' ? t : null
  }
  return null
}

const userMsg = (content: unknown, isMeta?: true) =>
  ({ type: 'user', message: { role: 'user', content }, isMeta }) as unknown as Message

describe('planRejectedSubmit — 被拒提交的回显与排队', () => {
  it('核心契约：被拒时也必须显示用户消息（缺陷回归点）', () => {
    const plan = planRejectedSubmit([userMsg('第二次输入')], textOf)
    expect(plan.shouldDisplay).toBe(true) // 旧实现下这里根本没有 setMessages，等于永不显示
    expect(plan.enqueueTexts).toEqual(['第二次输入'])
  })

  it('空消息集合不显示（避免无谓渲染）', () => {
    const plan = planRejectedSubmit([], textOf)
    expect(plan.shouldDisplay).toBe(false)
    expect(plan.enqueueTexts).toEqual([])
  })

  it('meta 消息不重新入队，但不影响显示', () => {
    const plan = planRejectedSubmit([userMsg('技能展开内容', true), userMsg('真实输入')], textOf)
    expect(plan.enqueueTexts).toEqual(['真实输入']) // meta 不重放
    expect(plan.shouldDisplay).toBe(true)
  })

  it('内容块数组取首个 text 块入队', () => {
    const plan = planRejectedSubmit(
      [userMsg([{ type: 'text', text: '块内文本' }, { type: 'image', source: {} }])],
      textOf,
    )
    expect(plan.enqueueTexts).toEqual(['块内文本'])
  })

  it('非 user 类型（assistant/system）不入队，但仍触发显示', () => {
    const plan = planRejectedSubmit(
      [{ type: 'system', content: 'x' } as unknown as Message],
      textOf,
    )
    expect(plan.enqueueTexts).toEqual([])
    expect(plan.shouldDisplay).toBe(true)
  })

  it('无文本的 user 消息不入队（textOf 返回 null）', () => {
    const plan = planRejectedSubmit([userMsg([{ type: 'image', source: {} }])], textOf)
    expect(plan.enqueueTexts).toEqual([])
    expect(plan.shouldDisplay).toBe(true)
  })
})
