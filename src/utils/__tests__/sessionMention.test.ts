import { describe, it, expect } from 'vitest'
import {
  extractSessionMentions,
  processSessionMentions,
} from '../attachments.js'

// W32 跨会话 @ 提及解析层（微提交1）：纯函数行为验证 + 变异测试。
describe('extractSessionMentions', () => {
  it('从 @session-foo 提取名字 foo', () => {
    expect(extractSessionMentions('hi @session-foo 你好')).toEqual(['foo'])
  })

  it('提取多个', () => {
    expect(extractSessionMentions('@session-a 和 @session-b')).toEqual([
      'a',
      'b',
    ])
  })

  it('没有 @session- 时返回空', () => {
    expect(extractSessionMentions('普通文本 @agent-foo')).toEqual([])
  })

  it('不被 @agent- 前缀混淆', () => {
    expect(extractSessionMentions('@agent-foo @session-bar')).toEqual(['bar'])
  })

  // 变异测试：若正则去掉 [a-zA-Z0-9_-] 或把 - 误写成别的，名字提取会失真。
  it('下划线/连字符/数字名字完整提取', () => {
    expect(extractSessionMentions('@session-dev_01-x')).toEqual(['dev_01-x'])
  })
})

describe('processSessionMentions', () => {
  const sessions = [
    { name: 'foo', sessionId: 'sid-1' },
    { name: 'bar', sessionId: 'sid-2' },
  ]

  it('解析为 session_mention 且填充 targetSessionId', () => {
    const out = processSessionMentions('@session-foo 你好', sessions)
    expect(out).toEqual([
      { type: 'session_mention', sessionName: 'foo', targetSessionId: 'sid-1' },
    ])
  })

  it('未匹配的 session 留空 targetSessionId', () => {
    const out = processSessionMentions('@session-unknown', sessions)
    expect(out).toEqual([
      { type: 'session_mention', sessionName: 'unknown', targetSessionId: undefined },
    ])
  })

  it('无提及时返回空数组（不污染主流程）', () => {
    expect(processSessionMentions('普通文本', sessions)).toEqual([])
  })

  // 变异测试：若把 sessionMap.get(name) 误写成 name（未查表），
  // 第一个用例的 targetSessionId 会变成 'foo' 而非 'sid-1' → 失败。
})
