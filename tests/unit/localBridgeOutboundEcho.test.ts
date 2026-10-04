import { describe, expect, it } from 'vitest'
import { isOutboundEcho } from '../../src/bridge/localBridge.js'

/**
 * 回归测试：本地桥接自我回灌死循环。
 *
 * Bug 现象：发一条 "hi" 后界面像进入死循环，反复出现同一句回复与「已中断」，
 * 日志中 queryLoop turnCount 恒为 1（说明是 query 被外部反复调用，而非内部
 * while 自动继续）。
 *
 * 根因：host 连接时把自己也订阅进 session（scripts/bridge.ts wss.on('connection')
 * → store.subscribe），发消息时服务器 broadcast 回发给包括发送者在内的所有
 * 订阅者，客户端 handleMessage 的 case 'message' 不辨来源，把回声当入站消息
 * enqueue，重新触发 query → 助手又回复 → 又被回灌 → 死循环。
 *
 * 修复：按 direction:'outbound' 标记过滤回声（与服务器端排除发送者双保险）。
 *
 * 变异测试：把 isOutboundEcho 的判据用 'inbound' 反转或恒 false，第 1 条用例
 * 即失败 —— 证明本测试真覆盖修复点。
 */
describe('isOutboundEcho — 桥接回声过滤', () => {
  it('日志实证：带 direction:"outbound" 的回灌消息被识别为回声', () => {
    // 复刻 f.txt 中的真实回灌消息结构
    const echo = {
      type: 'user',
      message: { role: 'user', content: 'hi' },
      uuid: 'a1f52022-a6c7-451b-ba1f-a0679ad8ab62',
      permissionMode: 'bypassPermissions',
      direction: 'outbound',
    }
    expect(isOutboundEcho(echo)).toBe(true)
  })

  it('中断消息回声（content 为 [用户中断请求]）同样被识别', () => {
    const echo = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '[用户中断请求]' }] },
      uuid: 'b926d52a-c9c5-4a03-a395-3951f13d3b1d',
      direction: 'outbound',
    }
    expect(isOutboundEcho(echo)).toBe(true)
  })

  it('真正的入站消息（无 direction 或 direction!=outbound）不被误杀', () => {
    // 手机/客户端发来的真实消息：无 direction 字段
    expect(isOutboundEcho({ type: 'user', message: { content: 'hi' } })).toBe(false)
    // 显式 inbound
    expect(isOutboundEcho({ direction: 'inbound' })).toBe(false)
  })

  it('非对象输入安全返回 false（不抛异常）', () => {
    expect(isOutboundEcho(undefined)).toBe(false)
    expect(isOutboundEcho(null)).toBe(false)
    expect(isOutboundEcho('outbound')).toBe(false)
    expect(isOutboundEcho(42)).toBe(false)
  })
})
