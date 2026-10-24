/**
 * 飞书出站回路回归测试：入站登记 → 助手回复写回对应卡片。
 *
 * 背景（真实缺陷）：入站消息此前走 writeMessages（出站镜像）绕过 enqueue，
 * 且没有任何代码把助手回复推回飞书——飞书侧只能停在「发送中」。
 * 本测试锁定完整回路：
 *   1. 飞书消息入队后，登记了回复目标；
 *   2. pushAssistantTextToFeishu 取到该目标并更新对应卡片；
 *   3. 没有等待中的请求时不推送（用户在终端聊天不应被推到飞书）。
 *
 * 变异验证：
 *   - 去掉 sendToBridge 里的 registerFeishuPendingReply → 用例 1/2 失败
 *   - 把 takePendingReply 改成不清空 → 用例 3 失败
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendCard = vi.fn(async (_chatId: string, _card: unknown) => 'card-1')
const updateCard = vi.fn(async (_id: string, _card: unknown) => {})
const sendText = vi.fn(async (_chatId: string, _text: string) => {})

vi.mock('../../src/services/feishu/feishuApiClient.js', () => ({
  feishuApi: {
    init: vi.fn(),
    sendText: (...args: [string, string]) => sendText(...args),
    sendCard: (...args: [string, unknown]) => sendCard(...args),
    updateCard: (...args: [string, unknown]) => updateCard(...args),
    createStreamingCard: vi.fn(() => ({ card: 'streaming' })),
    createResultCard: vi.fn((title: string, text: string) => ({ card: 'result', title, text })),
  },
}))

vi.mock('../../src/services/feishu/feishuWebhook.js', () => ({
  FeishuWebhookServer: class {
    constructor(_opts: unknown) {}
    start() {}
    stop() {}
  },
}))

import {
  FeishuBridge,
  __resetFeishuPendingRepliesForTesting,
  pushAssistantTextToFeishu,
  setFeishuBridge,
} from '../../src/services/feishu/index.js'
import { clearCommandQueue } from '../../src/utils/messageQueueManager.js'

function makeBridge() {
  return new FeishuBridge({
    appId: 'a',
    appSecret: 'b',
    bridgeHandle: { bridgeSessionId: 's', writeMessages: vi.fn() } as never,
  })
}

function feishuEvent(chatId: string, text: string, eventId = 'ev-1') {
  return {
    event_id: eventId,
    event_type: 'im.message.receive_v1',
    tenant_key: 'tk',
    sender: { sender_id: { open_id: 'ou_user' }, sender_type: 'user', tenant_key: 'tk' },
    message: {
      message_id: `m-${eventId}`,
      create_time: String(Date.now()),
      chat_id: chatId,
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({ text }),
    },
  }
}

describe('飞书出站回路', () => {
  beforeEach(() => {
    clearCommandQueue()
    __resetFeishuPendingRepliesForTesting()
    setFeishuBridge(null)
    vi.clearAllMocks()
  })

  it('入站后助手回复写回同一张卡片', async () => {
    const bridge = makeBridge()
    setFeishuBridge(bridge)

    await (bridge as unknown as { handleIncomingMessage: (m: unknown) => Promise<void> })
      .handleIncomingMessage(feishuEvent('chat-a', '帮我看看', 'ev-a'))

    // 入站会先发一张「发送中」卡片
    expect(sendCard).toHaveBeenCalledTimes(1)

    const delivered = await pushAssistantTextToFeishu('这是助手的回复')
    expect(delivered).toBe(true)
    // 回复走 updateCard 写回同一张卡
    expect(updateCard).toHaveBeenCalledTimes(1)
    const [, card] = updateCard.mock.calls[0] as [string, { text?: string }]
    expect(card.text).toBe('这是助手的回复')
  })

  it('没有等待中的请求时不推送（避免把终端对话漏推给飞书）', async () => {
    setFeishuBridge(makeBridge())
    const delivered = await pushAssistantTextToFeishu('终端里随手聊的内容')
    expect(delivered).toBe(false)
    expect(updateCard).not.toHaveBeenCalled()
  })

  it('回复消费一次后不会重复推给下一条', async () => {
    const bridge = makeBridge()
    setFeishuBridge(bridge)
    await (bridge as unknown as { handleIncomingMessage: (m: unknown) => Promise<void> })
      .handleIncomingMessage(feishuEvent('chat-b', '第一条', 'ev-b'))

    expect(await pushAssistantTextToFeishu('回复一')).toBe(true)
    expect(await pushAssistantTextToFeishu('回复二')).toBe(false)
    expect(updateCard).toHaveBeenCalledTimes(1)
  })

  it('多条入站按先进先出各自对应一条回复', async () => {
    const bridge = makeBridge()
    setFeishuBridge(bridge)
    const internals = bridge as unknown as { handleIncomingMessage: (m: unknown) => Promise<void> }
    await internals.handleIncomingMessage(feishuEvent('chat-c', '问题一', 'ev-c1'))
    await internals.handleIncomingMessage(feishuEvent('chat-c', '问题二', 'ev-c2'))

    expect(await pushAssistantTextToFeishu('答一')).toBe(true)
    expect(await pushAssistantTextToFeishu('答二')).toBe(true)
    expect(updateCard).toHaveBeenCalledTimes(2)
  })

  it('未启动飞书桥接时推送直接返回 false', async () => {
    expect(await pushAssistantTextToFeishu('无人接收')).toBe(false)
  })
})
