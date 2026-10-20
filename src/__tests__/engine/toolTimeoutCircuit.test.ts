/**
 * 回归保护：工具超时不应计入熔断器失败。
 *
 * 理由：
 * 1) 超时通常意味着下游卡住（MCP 无响应、Bash 等待交互），不代表工具在持续
 *    返回错误；计入会让熔断器按超时次数打开，误伤后续正常调用。
 * 2) 超时后下游 Promise 仍在运行（接口未暴露 signal，无法强杀），若触发重试
 *    会与残留写操作竞态，造成副作用重复。
 */
import { describe, expect, it } from 'vitest'
import { createToolTimeoutError, isTimeoutError } from '../../engine/toolScheduler.js'

describe('工具超时错误识别', () => {
  it('createToolTimeoutError 产生的错误被识别为超时', () => {
    const err = createToolTimeoutError('Bash', 300)
    expect(isTimeoutError(err)).toBe(true)
    expect(err.message).toContain('执行超时')
  })

  it('普通错误不被误判为超时', () => {
    expect(isTimeoutError(new Error('ENOENT: file not found'))).toBe(false)
    expect(isTimeoutError(new Error('permission denied'))).toBe(false)
    expect(isTimeoutError('string error')).toBe(false)
    expect(isTimeoutError(null)).toBe(false)
  })

  it('结构化标记优先于文案（包装后的错误仍可识别）', () => {
    const err = createToolTimeoutError('Mcp', 1000)
    // 模拟下游包一层并改写 message，标记仍在
    const wrapped = Object.assign(new Error('wrapped'), err)
    expect(isTimeoutError(wrapped)).toBe(true)
  })

  it('仅含"超时"字样但非工具超时的错误不被误判', () => {
    // 网络层超时不属于工具执行超时，不应豁免熔断计数
    expect(isTimeoutError(new Error('ETIMEDOUT: connect timeout'))).toBe(false)
  })
})
