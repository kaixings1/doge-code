import { describe, test, expect } from 'vitest'
import { handleMessageFromStream, type StreamingThinking } from '../../utils/messages.js'

// 验证主界面实时思考显示的数据链：
// content_block_start(thinking) 初始化 -> thinking_delta 累积 -> 非思考块开始收尾。
// 这条链是「输入 hi 后主界面不显示思考内容」问题的根因所在，
// 用真实 handleMessageFromStream 调用（非复刻逻辑），生产代码改变时会失败。
type Ctx = {
  thinking: StreamingThinking | null
  modes: string[]
  lengths: number
}

function run(events: any[]): Ctx {
  const ctx: Ctx = { thinking: null, modes: [], lengths: 0 }
  for (const ev of events) {
    handleMessageFromStream(
      { type: 'stream_event', event: ev } as any,
      () => {},
      (s: string) => {
        ctx.lengths += s.length
      },
      (m: any) => {
        ctx.modes.push(m)
      },
      () => {},
      undefined,
      (f: any) => {
        ctx.thinking = f(ctx.thinking)
      },
      undefined,
      () => {},
    )
  }
  return ctx
}

describe('实时思考显示数据链', () => {
  test('thinking_delta 累积到 streamingThinking 且 isStreaming=true', () => {
    const ctx = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考A' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考B' } },
    ])
    expect(ctx.thinking?.thinking).toBe('思考A思考B')
    expect(ctx.thinking?.isStreaming).toBe(true)
    expect(ctx.modes).toContain('thinking')
    // 思考内容也计入响应长度（token 计数）
    expect(ctx.lengths).toBe(6)
  })

  test('正文块开始 = 思考结束，带 streamingEndedAt', () => {
    const ctx = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    ])
    expect(ctx.thinking?.thinking).toBe('思考')
    expect(ctx.thinking?.isStreaming).toBe(false)
    expect(typeof ctx.thinking?.streamingEndedAt).toBe('number')
  })

  test('思考后直接调工具也收尾', () => {
    const ctx = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'Bash' } },
    ])
    expect(ctx.thinking?.isStreaming).toBe(false)
    expect(typeof ctx.thinking?.streamingEndedAt).toBe('number')
  })

  test('无思考块时 streamingThinking 保持 null（不误创建）', () => {
    const ctx = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '正文' } },
    ])
    expect(ctx.thinking).toBe(null)
  })
})
