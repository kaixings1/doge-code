import { describe, it, expect } from 'vitest'
import { scheduler } from '../cron.ts'

// 直接测试 CronScheduler 的解析与注册（纯逻辑，无 SSR、无进程副作用）。
// 每个用例末尾手动 clear() 清掉定时器，避免 vitest 挂起。
describe('cron scheduler — Routines 本地桩（对齐官方 W16）', () => {
  it('add 合法 5 段 cron 表达式成功并注册', () => {
    const before = scheduler.list().length
    expect(scheduler.add('cron_a', '*/5 * * * *', 'echo hi')).toBe(true)
    expect(scheduler.list().length).toBe(before + 1)
    const job = scheduler.list().find((j) => j.id === 'cron_a')
    expect(job).toBeDefined()
    expect(job!.expression).toBe('*/5 * * * *')
    scheduler.clear()
  })

  it('add 非法表达式返回 false', () => {
    const before = scheduler.list().length
    expect(scheduler.add('cron_b', 'bad-expr', 'echo hi')).toBe(false)
    expect(scheduler.list().length).toBe(before)
    scheduler.clear()
  })

  it('remove 删除已注册任务', () => {
    scheduler.add('cron_c', '0 2 * * *', 'backup')
    expect(scheduler.list().length).toBeGreaterThan(0)
    expect(scheduler.remove('cron_c')).toBe(true)
    expect(scheduler.list().find((j) => j.id === 'cron_c')).toBeUndefined()
    scheduler.clear()
  })

  it('clear 清空所有任务', () => {
    scheduler.add('cron_d', '* * * * *', 'x')
    scheduler.add('cron_e', '0 0 * * *', 'y')
    expect(scheduler.clear()).toBeGreaterThan(0)
    expect(scheduler.list().length).toBe(0)
  })

  // 变异测试：若把非法分支的返回 false 改为 true（解析错误也放行），
  // 第 2 用例会失败，证明测试非复刻、能抓真实回归。
})
