/**
 * 飞书长连接事件处理回归测试（不联网，替换 SDK 客户端）。
 *
 * 覆盖：未绑定时的引导、配对成功、绑定后进队列、群聊需 @、重复配对码失效。
 *
 * 变异验证：
 *   - 去掉「未绑定 chat 发引导」分支 → 用例 1 失败
 *   - 去掉群聊 @ 判定 → 用例 4 失败
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const createdMessages: Array<{ chatId: string; text: string }> = []

vi.mock('@larksuiteoapi/node-sdk', () => {
  class WSClient {
    start = vi.fn(async () => {})
    close = vi.fn()
  }
  class EventDispatcher {
    private handlers: Record<string, (data: unknown) => Promise<void>> = {}
    register(map: Record<string, (data: unknown) => Promise<void>>) {
      this.handlers = { ...this.handlers, ...map }
      return this
    }
  }
  class Client {
    im = {
      v1: {
        message: {
          create: vi.fn(async (args: { data: { receive_id: string; content: string } }) => {
            createdMessages.push({
              chatId: args.data.receive_id,
              text: JSON.parse(args.data.content).text as string,
            })
            return {}
          }),
        },
      },
    }
  }
  return {
    WSClient,
    EventDispatcher,
    Client,
    LoggerLevel: { warn: 'warn', info: 'info', error: 'error' },
  }
})

let root: string
let originalHome: string | undefined
let FeishuLongConnection: typeof import('../../src/services/feishu/feishuLongConnection.js')['FeishuLongConnection']

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'doge-feishu-ws-'))
  originalHome = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = root
  ;({ FeishuLongConnection } = await import('../../src/services/feishu/feishuLongConnection.js'))
})

afterAll(async () => {
  if (originalHome === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalHome
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  createdMessages.length = 0
})

function event(chatId: string, text: string, opts: {
  chatType?: 'p2p' | 'group'
  openId?: string
  mentions?: Array<{ id: { open_id: string } }>
} = {}) {
  return {
    event: {
      message: {
        chat_id: chatId,
        chat_type: opts.chatType ?? 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text }),
        mentions: opts.mentions,
      },
      sender: {
        sender_type: 'user',
        sender_id: { open_id: opts.openId ?? 'ou_user' },
      },
    },
  }
}

function makeConn(onText: (input: { chatId: string; text: string }) => Promise<void>) {
  return new FeishuLongConnection({
    appId: 'a',
    appSecret: 'b',
    onText: onText as never,
    now: () => Date.now(),
  })
}

async function deliver(
  conn: InstanceType<typeof FeishuLongConnection>,
  data: unknown,
) {
  await (conn as unknown as { handleEvent: (d: unknown) => Promise<void> }).handleEvent(data)
}

describe('飞书长连接事件处理', () => {
  it('未绑定的 chat 会被明确引导，而不是被吞掉', async () => {
    const conn = makeConn(async () => {})
    await deliver(conn, event('chat-unbound', '你好'))
    expect(createdMessages.at(-1)?.text).toContain('尚未配对')
  })

  it('配对码正确时建立绑定并回执', async () => {
    const conn = makeConn(async () => {})
    const code = conn.getPairingCode()
    await deliver(conn, event('chat-pair', `/pair ${code}`))

    expect(createdMessages.at(-1)?.text).toContain('配对成功')
    expect(conn.getBindings().map(b => b.chatId)).toContain('chat-pair')

    const raw = await readFile(join(root, 'feishu-bind.json'), 'utf-8')
    expect(raw).toContain('chat-pair')
    expect(raw).not.toMatch(/appSecret|"b"/)
  })

  it('绑定后消息交给 onText（进入会话队列）', async () => {
    const received: Array<{ chatId: string; text: string }> = []
    const conn = makeConn(async input => {
      received.push({ chatId: input.chatId, text: input.text })
    })
    await deliver(conn, event('chat-use', `/pair ${conn.getPairingCode()}`))
    await deliver(conn, event('chat-use', '帮我看看代码'))

    expect(received).toEqual([{ chatId: 'chat-use', text: '帮我看看代码' }])
  })

  it('同一个配对码不能复用', async () => {
    const conn = makeConn(async () => {})
    const code = conn.getPairingCode()
    await deliver(conn, event('chat-a', `/pair ${code}`))
    await deliver(conn, event('chat-b', `/pair ${code}`))

    expect(conn.getBindings().map(b => b.chatId)).not.toContain('chat-b')
    expect(createdMessages.at(-1)?.text).toContain('配对码无效或已过期')
  })

  it('群聊未 @机器人 时不入队', async () => {
    const received: string[] = []
    const conn = makeConn(async input => {
      received.push(input.text)
    })
    await deliver(conn, event('chat-group', `/pair ${conn.getPairingCode()}`, { chatType: 'group' }))
    await deliver(conn, event('chat-group', '别人在聊天', { chatType: 'group' }))
    expect(received).toEqual([])
  })

  it('群聊 @机器人 后正常入队并去掉 @占位符', async () => {
    const received: string[] = []
    const conn = makeConn(async input => {
      received.push(input.text)
    })
    // 先通过一条带 mention 的消息学习 bot open_id
    await deliver(
      conn,
      event('chat-group2', `/pair ${conn.getPairingCode()}`, {
        chatType: 'group',
        mentions: [{ id: { open_id: 'ou_bot' } }],
      }),
    )
    await deliver(
      conn,
      event('chat-group2', '@_user_1 帮我看看', {
        chatType: 'group',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }] as never,
      }),
    )
    expect(received).toEqual(['帮我看看'])
  })
})
