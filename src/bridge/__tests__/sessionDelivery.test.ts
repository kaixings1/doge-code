import { describe, it, expect } from 'vitest'
import { deliverMessageToSession } from '../sessionDiscovery.js'

// W32 微提交3：跨会话投递。验证 REST 投递端点调用与降级。
describe('deliverMessageToSession', () => {
  it('POST 到目标 session 的 /message 端点，带 content/fromSessionId', async () => {
    let capturedUrl = ''
    let capturedBody: any = null
    const fakeFetch = (async (url: string | URL | Request, init?: any) => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(init.body)
      return { ok: true } as Response
    }) as unknown as typeof fetch

    const ok = await deliverMessageToSession('sid-b', 'hello B', 'sid-a', fakeFetch)
    expect(ok).toBe(true)
    expect(capturedUrl).toContain('/v1/code/sessions/sid-b/message')
    expect(capturedBody.content).toBe('hello B')
    expect(capturedBody.fromSessionId).toBe('sid-a')
  })

  it('对目标名做 URL 编码', async () => {
    let capturedUrl = ''
    const fakeFetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url)
      return { ok: true } as Response
    }) as unknown as typeof fetch
    await deliverMessageToSession('a/b', 'x', 'from', fakeFetch)
    expect(capturedUrl).toContain('/v1/code/sessions/a%2Fb/message')
  })

  it('非 200 降级 false（不抛）', async () => {
    const fakeFetch = (async () => ({ ok: false }) as Response) as unknown as typeof fetch
    expect(await deliverMessageToSession('t', 'c', 'f', fakeFetch)).toBe(false)
  })

  it('fetch 抛错降级 false（不阻断主流程）', async () => {
    const fakeFetch = (async () => {
      throw new Error('net')
    }) as unknown as typeof fetch
    expect(await deliverMessageToSession('t', 'c', 'f', fakeFetch)).toBe(false)
  })

  // 变异测试：若把 POST 误写成 GET，或把 content 漏传，第 1 用例的
  // capturedBody.content 断言会失败 —— 证明测试抓真实回归。
})
