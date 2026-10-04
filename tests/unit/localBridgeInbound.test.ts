import { describe, expect, it } from 'vitest'
import { extractInboundMessageFields } from '../../src/bridge/inboundMessages.js'

/**
 * 回归测试：本地桥接模式下客户端发来的入站消息必须可被解析为投递字段。
 *
 * Bug 现象：本地桥接（CLAUDE_CODE_LOCAL_BRIDGE=1）时，客户端发 "hi" 后界面
 * 什么都不显示。根因是 useReplBridge.tsx 的本地桥分支 onInboundMessage
 * 只 log、不调用消息投递逻辑（enqueue），消息被静默丢弃。
 * 修复后本地桥复用 deliverInboundMessage → extractInboundMessageFields。
 *
 * 本测试锁定链路的第一环：入站消息能解析出 content/uuid。
 * 若 extractInboundMessageFields 对 bridge 消息结构判定失败，投递即失效。
 */
describe('extractInboundMessageFields — 桥接入站消息', () => {
  it('解析本地桥的字符串 content 消息（日志实证结构）', () => {
    // 复刻日志中的实际入站消息
    const msg = {
      type: 'user',
      message: { role: 'user', content: 'hi' },
      uuid: 'aed665c1-d639-4320-afcb-c55c045682e4',
      session_id: 'bridge-inbound',
      parent_tool_use_id: null,
    } as never

    const fields = extractInboundMessageFields(msg)
    expect(fields).toBeTruthy()
    expect(fields!.content).toBe('hi')
    expect(fields!.uuid).toBe('aed665c1-d639-4320-afcb-c55c045682e4')
    expect(fields!.toolUseBlocks).toBeUndefined()
  })

  it('解析内容块数组（含 tool_use）', () => {
    const msg = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '执行任务' },
          { type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
        ],
      },
      uuid: '11111111-1111-1111-1111-111111111111',
    } as never

    const fields = extractInboundMessageFields(msg)
    expect(fields).toBeTruthy()
    expect(fields!.toolUseBlocks?.length).toBe(1)
  })

  it('无 content 的消息被跳过（返回空），不会误投递', () => {
    const msg = { type: 'user', message: { role: 'user' } } as never
    expect(extractInboundMessageFields(msg)).toBeUndefined()
  })

  it('非 user 类型被跳过', () => {
    const msg = { type: 'assistant', message: { content: 'x' } } as never
    expect(extractInboundMessageFields(msg)).toBeUndefined()
  })
})
