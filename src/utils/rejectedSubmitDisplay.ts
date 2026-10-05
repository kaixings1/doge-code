import type { Message } from '../types/message.js'

/**
 * 提交被并发守卫拒绝时（queryGuard 仍被上一次 query 占用）的显示与排队决策。
 *
 * 背景（真实缺陷）：旧实现在 tryStart() 返回 null 的分支里只把用户文本
 * enqueue 回队列就 return，从不调用 setMessages。后果是用户敲的那条消息
 * 既不进 messages 数组、也不在界面留痕（往上滚同样看不到），只有 AI 回复
 * 突兀出现。若上一次 query 因故永不收尾，则从第二次提交起永久如此。
 *
 * 抽成纯函数的原因：原判定内联在 REPL 的 onQuery 闭包里无法导入测试，
 * 只能靠复刻逻辑，生产代码改了测试也不会失败。此处导出后由单测直接覆盖。
 */

export type RejectedSubmitPlan = {
  /** 是否应把消息落进可见对话记录（补回丢失的回显）。 */
  shouldDisplay: boolean
  /** 需要 enqueue 回队列的纯文本（跳过 meta 与无文本的消息）。 */
  enqueueTexts: string[]
}

/**
 * 从被拒提交的消息集合中计算「显示 + 排队」计划。
 *
 * 契约：
 * 1. 有消息就必须显示 —— 显示与 guard 状态无关，任何情况下都不能吞掉
 *    用户输入（这是本次缺陷的根因）。
 * 2. 只有非 meta 的 user 消息、且能提取出非空文本时，才重新入队（沿用
 *    旧语义：meta 消息如技能展开、tick 提示不应作为用户可见文本重放）。
 *
 * @param messages 本次提交产生的消息
 * @param contentTextOf 提取消息文本的函数（避免本模块依赖 messages.js 的重型级联）
 */
export function planRejectedSubmit(
  messages: readonly Message[],
  contentTextOf: (content: unknown) => string | null,
): RejectedSubmitPlan {
  const enqueueTexts: string[] = []
  for (const m of messages) {
    if (m.type !== 'user' || m.isMeta) continue
    const text = contentTextOf(m.message.content)
    if (text !== null) enqueueTexts.push(text)
  }
  return {
    shouldDisplay: messages.length > 0,
    enqueueTexts,
  }
}
