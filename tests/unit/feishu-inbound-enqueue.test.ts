/**
 * 飞书入站路径回归测试：必须走 messageQueueManager.enqueue()，
 * 绝不能走 bridgeHandle.writeMessages()。
 *
 * 背景（真实缺陷，本测试即为锁定它）：
 *   services/feishu/index.ts 的 sendToBridge() 此前调用
 *   bridgeHandle.writeMessages([...])。但 writeMessages 是**出站**
 *   （把本地对话镜像到远端服务器，见 remoteBridgeCore 的 transport 调用），
 *   完全绕过入站入口 enqueue()。后果：
 *     - 飞书发的普通文本不会进入本机对话
 *     - 所有 /run /read 等命令同样无效
 *     - 用户看到飞书卡片永远停在「发送中」，日志无任何报错
 *
 * mobileBridge.ts 的 forwardToBridge() 注释早已记录过同一个坑，飞书侧漏改。
 *
 * 变异验证方式：把实现改回 writeMessages ——
 * `writeMessages 未被调用` 与 `进入命令队列` 两条断言必然失败。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/services/feishu/feishuApiClient.js', () => ({
  feishuApi: {
    init: vi.fn(),
    sendText: vi.fn(async () => {}),
    sendCard: vi.fn(async () => 'card-1'),
    updateCard: vi.fn(async () => {}),
    createStreamingCard: vi.fn(() => ({ card: 'streaming' })),
    createResultCard: vi.fn(() => ({ card: 'result' })),
  },
}))

vi.mock('../../src/services/feishu/feishuWebhook.js', () => ({
  FeishuWebhookServer: class {
    constructor(_opts: unknown) {}
    start() {}
    stop() {}
  },
}))

import { FeishuBridge } from '../../src/services/feishu/index.js'
import { clearCommandQueue, getCommandQueue } from '../../src/utils/messageQueueManager.js'

function makeHandle() {
  return { bridgeSessionId: 'session_test', writeMessages: vi.fn() }
}

/** 构造一条真实的飞书 webhook 事件（字段结构与 feishuMessageAdapter 对齐）。 */
function feishuEvent(chatId: string, text: string, eventId = 'ev-1') {
  return {
    event_id: eventId,
    event_type: 'im.message.receive_v1',
    tenant_key: 'tk',
    sender: {
      sender_id: { open_id: 'ou_user' },
      sender_type: 'user',
      tenant_key: 'tk',
    },
    message: {
      message_id: `m-${eventId}`,
      create_time: String(Date.now()),
      chat_id: chatId,
      chat_type: 'p2p',
      message_type: 'text',
      // 飞书把正文放在 JSON 字符串里
      content: JSON.stringify({ text }),
    },
  }
}

type BridgeInternals = {
  handleIncomingMessage: (m: unknown) => Promise<void>
}

describe('飞书入站：必须 enqueue 到命令队列', () => {
  beforeEach(() => {
    clearCommandQueue()
  })

  afterEach(() => {
    clearCommandQueue()
    vi.clearAllMocks()
  })

  it('普通文本消息进入命令队列（而不是只被镜像出去）', async () => {
    const handle = makeHandle()
    const bridge = new FeishuBridge({
      appId: 'a',
      appSecret: 'b',
      bridgeHandle: handle as never,
    })

    await (bridge as unknown as BridgeInternals).handleIncomingMessage(
      feishuEvent('chat-1', '你好，帮我看看代码'),
    )

    const queue = getCommandQueue()
    expect(queue.length, '命令队列应有 1 条入站消息').toBe(1)
    expect(queue[0]!.value).toBe('你好，帮我看看代码')
    expect(queue[0]!.mode).toBe('prompt')
    // 飞书自己的 /run /read 前缀不是 CLI 斜杠命令，必须跳过解析
    expect(queue[0]!.skipSlashCommands).toBe(true)
  })

  it('writeMessages 未被调用（证明没走错误的出站入口）', async () => {
    const handle = makeHandle()
    const bridge = new FeishuBridge({
      appId: 'a',
      appSecret: 'b',
      bridgeHandle: handle as never,
    })

    await (bridge as unknown as BridgeInternals).handleIncomingMessage(
      feishuEvent('chat-2', '普通消息', 'ev-2'),
    )

    expect(
      handle.writeMessages,
      '入站消息绝不能走 writeMessages（那是出站镜像，消息进不了对话）',
    ).not.toHaveBeenCalled()
  })

  it('斜杠前缀的命令类消息同样进入队列（不致石沉大海）', async () => {
    const handle = makeHandle()
    const bridge = new FeishuBridge({
      appId: 'a',
      appSecret: 'b',
      bridgeHandle: handle as never,
    })

    await (bridge as unknown as BridgeInternals).handleIncomingMessage(
      feishuEvent('chat-3', '/status', 'ev-3'),
    )

    expect(getCommandQueue().length, '命令类消息也应进入队列').toBeGreaterThanOrEqual(1)
  })

  it('未被 @ 的群聊消息不进入队列（不误吞无关消息）', async () => {
    const handle = makeHandle()
    const bridge = new FeishuBridge({
      appId: 'a',
      appSecret: 'b',
      bridgeHandle: handle as never,
    })

    const ev = feishuEvent('chat-4', '别人在聊天', 'ev-4')
    ;(ev.message as unknown as Record<string, unknown>).chat_type = 'group'

    await (bridge as unknown as BridgeInternals).handleIncomingMessage(ev)

    expect(getCommandQueue().length, '群聊未 @ 机器人时不应入队').toBe(0)
  })
})
