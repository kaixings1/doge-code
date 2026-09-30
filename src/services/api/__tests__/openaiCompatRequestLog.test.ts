import { describe, it, expect, vi, afterAll } from 'vitest'

/**
 * 守护请求侧日志：请求体日志曾在提交 701f413aa 中被静默注释掉，
 * 导致排查问题时只能看到 SSE 响应、看不到发送内容。
 * 这里锁定"发出请求前必须记录请求内容"这一契约。
 *
 * logForDebugging 在 NODE_ENV=test 下默认静默，需 --debug-to-stderr 才写 stderr。
 * debug.ts 的 isDebugToStdErr 是 memoize 的，因此必须在 import 模块前设置 argv。
 */
const originalArgv = process.argv
process.argv = [...originalArgv, '--debug-to-stderr']

const { createOpenAICompatStream } = await import('../openaiCompat.js')

function sseStream(): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'),
      )
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('createOpenAICompatStream 请求侧日志', () => {
  const written: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
    written.push(String(chunk))
    return true
  })

  afterAll(() => {
    spy.mockRestore()
    process.argv = originalArgv
  })

  it('请求前写出摘要与最后一条 user 消息', async () => {
    written.length = 0
    const fetchMock = vi.fn(async () => sseStream())
    await createOpenAICompatStream(
      { apiKey: 'test-key', baseURL: 'https://example.com/v1/chat', fetch: fetchMock as any },
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'x'.repeat(100) },
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'answer' },
          { role: 'user', content: '看看这个文件' },
        ],
        tools: [{ type: 'function', function: { name: 'Read' } }],
      },
      new AbortController().signal,
    )

    const all = written.join('')
    expect(all).toContain('[openaiCompat] 请求 URL: https://example.com/v1/chat')
    expect(all).toContain('请求体摘要')
    expect(all).toContain('model=deepseek-chat')
    expect(all).toContain('消息数=4')
    expect(all).toContain('工具数=1')
    expect(all).toContain('system:100, user:14, assistant:6, user:6')
    expect(all).toContain('最后一条 user 消息: 看看这个文件')
    // 附加工具必须落到日志里：排查"拼接了什么工具"全靠这一行
    expect(all).toContain('本次请求附加工具: [Read]')
    expect(all).toContain('system prompt 长度=100')
    // 完整 system prompt 与完整请求体默认不落盘，避免日志膨胀
    expect(all).not.toContain('x'.repeat(100))
    expect(all).not.toContain('完整请求体 JSON')

    // 日志必须在 fetch 之前发出，请求失败时才能看到发送内容
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sentBody = JSON.parse((fetchMock.mock.calls[0]![1] as any).body)
    expect(sentBody.stream).toBe(true)
    expect(sentBody.messages).toHaveLength(4)
  })

  it('无 user 消息时不崩溃', async () => {
    written.length = 0
    const fetchMock = vi.fn(async () => sseStream())
    await createOpenAICompatStream(
      { apiKey: 'k', baseURL: 'https://example.com/v1', fetch: fetchMock as any },
      { model: 'm', messages: [{ role: 'system', content: 's' }] },
      new AbortController().signal,
    )
    const all = written.join('')
    expect(all).toContain('请求体摘要')
    expect(all).toContain('消息数=1')
    expect(all).not.toContain('最后一条 user 消息')
  })
})
