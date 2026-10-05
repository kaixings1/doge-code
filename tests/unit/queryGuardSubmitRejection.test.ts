import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryGuard } from '../../src/utils/QueryGuard.js'

/**
 * 复现「第二次输入无回显」的最小反馈回路。
 *
 * 现象（用户报告）：doge.exe 终端直连下，首次输入 "hi" 正常回显，
 * 第二次及之后每次输入回车后界面不回显用户输入（往上滚也看不到），
 * 但 AI 回复正常出现。
 *
 * 代码路径（REPL.tsx onQuery）：
 *   const thisGeneration = queryGuard.tryStart()
 *   if (thisGeneration === null) {
 *     // 只 enqueue 用户文本，从不 setMessages —— 消息不进 messages 数组
 *     return
 *   }
 *   ...
 *   setMessages(old => [...old, ...newMessages])   // 只有走到这里才会回显
 *
 * 因此判据：只要 tryStart() 返回 null，那次提交的 user 消息就永远不显示。
 * 本文件锁定「什么状态会让 tryStart() 返回 null」以及该状态如何产生/消解。
 */

describe('QueryGuard — 第二次提交被拒的因果链', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('running 状态下 tryStart 返回 null（第二次提交被拒的直接原因）', () => {
    const g = new QueryGuard()
    expect(g.tryStart()).toBe(1) // 第一次提交：成功
    // 第一次 query 尚未结束（onQueryImpl 未 resolve，end 未调用）
    expect(g.isActive).toBe(true)
    // 第二次提交：被拒 → REPL 走 enqueue-不-setMessages 分支 → 无回显
    expect(g.tryStart()).toBeNull()
  })

  it('end() 后进入 pending-idle：同代 tryStart 恢复而非拒绝', () => {
    const g = new QueryGuard()
    const gen = g.tryStart()!
    g.end(gen)
    // pending-idle 视作 active（图标不闪），但同代的 tryStart 是「续跑」不是「新查询」
    expect(g.isActive).toBe(true)
    expect(g.tryStart()).toBe(gen) // 非 null —— 不会导致无回显
  })

  it('end() 后跨过 500ms 宽限期才真正 idle', () => {
    const g = new QueryGuard()
    const gen = g.tryStart()!
    g.end(gen)
    vi.advanceTimersByTime(499)
    expect(g.isActive).toBe(true) // 仍在宽限期内
    vi.advanceTimersByTime(1)
    expect(g.isActive).toBe(false) // 500ms 后 idle
    expect(g.tryStart()).toBe(gen + 1) // 此时新提交可正常开始
  })

  it('forceEnd 立即 idle（onCancel 路径），使后续提交可被接受', () => {
    const g = new QueryGuard()
    g.tryStart()
    expect(g.tryStart()).toBeNull()
    g.forceEnd()
    expect(g.isActive).toBe(false)
    expect(g.tryStart()).not.toBeNull()
  })

  it('关键判据探针：onQueryImpl 永不 resolve ⇒ guard 永久 running ⇒ 每次提交都被拒', () => {
    // 模拟「for await (const event of query(...)) 永不返回」：
    // 只 tryStart，从不调用 end —— 这正是 onQueryImpl 挂起时的真实状态。
    const g = new QueryGuard()
    g.tryStart()
    // 模拟连续多次用户提交（间隔任意久，含远超 500ms 的情况）
    vi.advanceTimersByTime(60_000)
    expect(g.isActive).toBe(true) // 永不因时间流逝而 idle —— pending-idle 定时器根本没排
    for (let i = 0; i < 5; i++) {
      expect(g.tryStart()).toBeNull() // 第 2..6 次提交全部被拒 → 全部无回显
    }
    // 反向验证：只要补一次 end()，下一次提交立刻恢复
    // （说明「无回显」的修复方向 = 保证 onQueryImpl 一定 resolve/end）
    const gen = g.generation
    g.end(gen)
    vi.advanceTimersByTime(500)
    expect(g.tryStart()).not.toBeNull()
  })
})
