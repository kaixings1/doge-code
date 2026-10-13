/**
 * describeToolResultForMobile 与 describeThinkingForMobile 的测试。
 *
 * 为什么这两个函数必须单独测：
 * 1. describeToolResultForMobile 从 **user** 消息里取 tool_result ——
 *    这与直觉相反（工具结果由用户侧回灌），写错 role 判定会静默丢失
 *    全部工具结果，手机上「永远只看到 running，看不到命令输出」，
 *    是最难排查的一类静默失败。
 * 2. describeThinkingForMobile 从 assistant 消息里取 thinking 块 ——
 *    若把截断上限（THINKING_MAX）写错或空文本判断反了，长任务期间
 *    手机端要么空白、要么被超大帧拖垮。
 *
 * 变异验证要点：
 * - 把 tool_result 的 role 判定 `m.type !== 'user'` 改成 `'assistant'`
 *   → 「user 消息里的 tool_result 被提取」用例失败。
 * - 把 is_error 判定 `=== true` 改成 `=== false`（或反之）
 *   → 「is_error 为 true 时 state 为 error」用例失败。
 * - 把 thinking 的空文本判断 `!text.trim()` 去掉
 *   → 「thinking 块内容为纯空白不推送」用例失败。
 */
import { describe, it, expect } from 'vitest'
import {
  describeToolResultForMobile,
  describeThinkingForMobile,
} from '../../src/bridge/mobileBridge.js'

describe('describeToolResultForMobile', () => {
  it('从 user 消息的 tool_result 块提取结果（关键：role 是 user 不是 assistant）', () => {
    const r = describeToolResultForMobile({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_001',
            content: [{ type: 'text', text: 'npm test 通过' }],
          },
        ],
      },
    })
    expect(r).toBeTruthy()
    expect(r!.kind).toBe('tool')
    expect(r!.state).toBe('done')
    expect(r!.result).toBe('npm test 通过')
    expect(r!.toolUseId).toBe('toolu_001')
    expect(r!.truncated).toBe(false)
  })

  it('assistant 消息不产生工具结果（role 判定反了会误报）', () => {
    const r = describeToolResultForMobile({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'x' },
        ],
      },
    })
    expect(r).toBeNull()
  })

  it('is_error 为 true 时 state 为 error，否则为 done', () => {
    const err = describeToolResultForMobile({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 't1', is_error: true, content: '命令失败' },
        ],
      },
    })
    expect(err!.state).toBe('error')
    expect(err!.result).toBe('命令失败')
  })

  it('tool_result 的 content 为纯字符串时原样提取', () => {
    const r = describeToolResultForMobile({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '直接是字符串' }],
      },
    })
    expect(r!.result).toBe('直接是字符串')
    expect(r!.state).toBe('done')
  })

  it('tool_result 块里的图片用 [图片] 占位，不静默消失', () => {
    const r = describeToolResultForMobile({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [
              { type: 'text', text: '看图：' },
              { type: 'image' },
              { type: 'text', text: '结束' },
            ],
          },
        ],
      },
    })
    expect(r!.result).toBe('看图：\n[图片]\n结束')
  })

  it('无 tool_result 块的 user 消息返回 null', () => {
    const r = describeToolResultForMobile({
      type: 'user',
      message: { content: [{ type: 'text', text: '普通用户消息' }] },
    })
    expect(r).toBeNull()
  })

  it('超长结果截断到上限并如实标注 truncated 与 fullLength', () => {
    const long = 'a'.repeat(25000)
    const r = describeToolResultForMobile({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: long }] },
    })
    expect(r!.truncated).toBe(true)
    expect(r!.fullLength).toBe(25000)
    expect(r!.result.length).toBeLessThan(25000)
    expect(r!.result.length).toBeGreaterThan(0)
  })

  it('null / 非对象 / 缺 content 安全返回 null', () => {
    expect(describeToolResultForMobile(null)).toBeNull()
    expect(describeToolResultForMobile('str')).toBeNull()
    expect(describeToolResultForMobile({ type: 'user', message: {} })).toBeNull()
    expect(describeToolResultForMobile({ type: 'user' })).toBeNull()
  })
})

describe('describeThinkingForMobile', () => {
  it('从 assistant 消息的 thinking 块提取思考内容', () => {
    const t = describeThinkingForMobile({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: '我先定位这个文件……' }],
      },
    })
    expect(t).toBeTruthy()
    expect(t!.kind).toBe('thinking')
    expect(t!.name).toBe('思考')
    expect(t!.state).toBe('running')
    expect(t!.detail).toBe('我先定位这个文件……')
    expect(t!.truncated).toBe(false)
  })

  it('user 消息不产生思考内容（role 判定）', () => {
    const t = describeThinkingForMobile({
      type: 'user',
      message: { content: [{ type: 'thinking', thinking: 'xx' }] },
    })
    expect(t).toBeNull()
  })

  it('thinking 块内容为空或纯空白时不推送', () => {
    expect(
      describeThinkingForMobile({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: '' }] },
      }),
    ).toBeNull()
    expect(
      describeThinkingForMobile({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: '   \n  ' }] },
      }),
    ).toBeNull()
  })

  it('无 thinking 块的 assistant 消息返回 null（如纯文本回复）', () => {
    const t = describeThinkingForMobile({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '你好' }] },
    })
    expect(t).toBeNull()
  })

  it('超长思考内容截断到 8000 并标注', () => {
    const long = '思'.repeat(9000)
    const t = describeThinkingForMobile({
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: long }] },
    })
    expect(t!.truncated).toBe(true)
    expect(t!.fullLength).toBe(9000)
    expect(t!.detail.length).toBeLessThan(9000)
    expect(t!.detail.length).toBeGreaterThan(0)
  })

  it('null / 非对象 / 缺 content 安全返回 null', () => {
    expect(describeThinkingForMobile(null)).toBeNull()
    expect(describeThinkingForMobile(42)).toBeNull()
    expect(describeThinkingForMobile({ type: 'assistant' })).toBeNull()
    expect(describeThinkingForMobile({ type: 'assistant', message: { content: 'not-array' } })).toBeNull()
  })
})