import { describe, it, expect } from 'vitest'
import { isLoopIntentText, extractLoopIntent } from '../../commands/loop/intent'

describe('loop intent - injected instruction guard', () => {
  it('should reject [循环引擎指令] marker', () => {
    const text = '[循环引擎指令] 用户要求以循环方式执行任务，请持续迭代直到满足所有成功标准：'
    expect(isLoopIntentText(text)).toBe(false)
    expect(extractLoopIntent(text)).toBeNull()
  })

  it('should reject [循环引擎指令] marker with criteria', () => {
    const text = '[循环引擎指令] 用户要求以循环方式执行任务，请持续迭代直到满足所有成功标准：\n  目标: 修复bug\n  成功标准:\n    - 测试通过\n  建议使用的工具: bash\n  终止条件: 所有成功标准均满足后停止循环并汇报结果。'
    expect(isLoopIntentText(text)).toBe(false)
    expect(extractLoopIntent(text)).toBeNull()
  })

  it('should still detect real loop intent', () => {
    const text = '编写代码，直到所有测试通过'
    expect(isLoopIntentText(text)).toBe(true)
    expect(extractLoopIntent(text)).not.toBeNull()
  })

  it('should still detect loop intent with multiple criteria', () => {
    const text = '创建服务器，直到能返回 200，直到日志无错误'
    expect(isLoopIntentText(text)).toBe(true)
    const result = extractLoopIntent(text)
    expect(result).not.toBeNull()
    expect(result!.criteria.length).toBeGreaterThanOrEqual(1)
  })
})
