/**
 * 飞书长连接（WebSocket 事件订阅）—— 无需公网回调地址的接入方式。
 *
 * 与 feishuWebhook.ts 的关系：
 *   - webhook：飞书主动 POST 到本机公网地址，需要穿透/端口映射。
 *   - 长连接：本机主动连飞书，NAT 后面也能用，无需任何公网配置。
 *   二者共用同一条「消息 → enqueue → 回复写回卡片」处理链路。
 *
 * 配对：首次使用需在飞书私聊机器人发送 `/pair <6位码>`（码打印在 CLI 终端）。
 * 成功后的 chat 写入 ~/.doge/feishu-bind.json，下次启动自动恢复，无需再配。
 */
import * as Lark from '@larksuiteoapi/node-sdk'
import { logForDebugging } from '../../utils/debug.js'
import { isFeishuLongConnectionEnabled } from '../../bridge/bridgeConfig.js'
import {
  type FeishuBinding,
  PairingSession,
  parsePairCommand,
  readBindings,
  saveBinding,
} from './pairing.js'

export type FeishuLongConnectionOptions = {
  appId: string
  appSecret: string
  /** 收到已绑定 chat 的文本消息（已去除配对指令）。 */
  onText: (input: { chatId: string; chatType: 'p2p' | 'group'; openId: string; text: string }) => Promise<void>
  /** 绑定状态变化（用于终端提示 / 命令面板刷新）。 */
  onBindingChange?: (bindings: FeishuBinding[]) => void
  /** 连接状态变化。 */
  onStateChange?: (state: 'connecting' | 'ready' | 'failed' | 'closed', detail?: string) => void
  /** 注入随机源与时钟，便于测试。 */
  now?: () => number
}

type WsHandle = {
  start: (params: { eventDispatcher: Lark.EventDispatcher }) => Promise<void>
  close?: () => void
}

export class FeishuLongConnection {
  private readonly options: FeishuLongConnectionOptions
  private readonly pairing = new PairingSession()
  private bindings: FeishuBinding[]
  private ws: WsHandle | null = null
  /** 机器人自身 open_id：首次收到消息时从事件里学习并写回绑定。 */
  private botOpenId: string | undefined

  constructor(options: FeishuLongConnectionOptions) {
    this.options = options
    this.bindings = readBindings().bindings
    this.botOpenId = this.bindings.find(b => b.botOpenId)?.botOpenId
  }

  /** 当前配对码（未生成则生成），供终端/命令展示。 */
  getPairingCode(): string {
    return this.pairing.issue(this.now())
  }

  getBindings(): FeishuBinding[] {
    return [...this.bindings]
  }

  getBotOpenId(): string | undefined {
    return this.botOpenId
  }

  isRunning(): boolean {
    return this.ws !== null
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now()
  }

  async start(): Promise<void> {
    if (this.ws) return
    this.options.onStateChange?.('connecting')

    const dispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        try {
          await this.handleEvent(data)
        } catch (err) {
          logForDebugging(
            `[feishu:ws] 处理事件失败: ${err instanceof Error ? err.message : String(err)}`,
            { level: 'error' },
          )
        }
      },
    })

    const client = new Lark.WSClient({
      appId: this.options.appId,
      appSecret: this.options.appSecret,
      loggerLevel: Lark.LoggerLevel.warn,
      autoReconnect: true,
      onReady: () => this.options.onStateChange?.('ready'),
      onError: (err: Error) => this.options.onStateChange?.('failed', err.message),
    })

    try {
      await client.start({ eventDispatcher: dispatcher })
      this.ws = client as unknown as WsHandle
    } catch (err) {
      // 进程存活优先，最坏情况退化为「未连接」。
      this.options.onStateChange?.('failed', String(err))
      throw err
    }
  }

  async stop(): Promise<void> {
    try {
      this.ws?.close?.()
    } catch {
      // 忽略关闭期异常
    }
    this.ws = null
    this.options.onStateChange?.('closed')
  }

  /**
   * 处理 im.message.receive_v1。
   * 结构参考飞书事件体：event.message.{chat_id,chat_type,message_type,content}
   */
  private async handleEvent(data: unknown): Promise<void> {
    const event = (data as {
      event?: {
        message?: {
          chat_id?: string
          chat_type?: 'p2p' | 'group'
          message_type?: string
          content?: string
          mentions?: Array<{ id?: { open_id?: string } }>
        }
        sender?: { sender_id?: { open_id?: string }; sender_type?: string }
      }
    })?.event

    const message = event?.message
    if (!message?.chat_id) return
    if (event?.sender?.sender_type === 'app') return

    const chatId = message.chat_id
    const chatType: 'p2p' | 'group' = message.chat_type === 'group' ? 'group' : 'p2p'
    const openId = event?.sender?.sender_id?.open_id ?? 'unknown'

    // 机器人自身 open_id：@ 的 open_id 与发送者不同时，取 mention 里的非发送者 id。
    if (!this.botOpenId && message.mentions?.length) {
      const candidate = message.mentions
        .map(m => m.id?.open_id)
        .find(id => id && id !== openId)
      if (candidate) {
        this.botOpenId = candidate
      }
    }

    const text = extractText(message)

    // 1) 配对指令优先处理（未绑定时也能用）。
    const code = parsePairCommand(text)
    if (code) {
      if (!this.pairing.consume(code, this.now())) {
        await this.reply(chatId, '配对码无效或已过期。请在 CLI 终端查看最新配对码后重试。')
        return
      }
      const bindings = saveBinding({
        chatId,
        chatType,
        openId,
        boundAt: new Date(this.now()).toISOString(),
        botOpenId: this.botOpenId,
      })
      this.bindings = bindings
      this.options.onBindingChange?.(this.getBindings())
      await this.reply(chatId, '✅ 配对成功。之后直接发消息即可，本机 CLI 会持续接收。')
      return
    }

    // 2) 未绑定的 chat：不吞消息，明确引导。
    if (!this.bindings.some(b => b.chatId === chatId)) {
      await this.reply(
        chatId,
        '尚未配对。请在电脑上运行 CLI 查看配对码，然后发送 `/pair 123456`。',
      )
      return
    }

    // 3) 群聊需 @机器人。
    if (chatType === 'group') {
      const mentioned = message.mentions?.some(m => m.id?.open_id === this.botOpenId)
      if (!mentioned) return
    }

    const cleaned = stripMentions(text, message)
    if (!cleaned.trim()) return
    await this.options.onText({ chatId, chatType, openId, text: cleaned })
  }

  private async reply(chatId: string, text: string): Promise<void> {
    try {
      const client = new Lark.Client({
        appId: this.options.appId,
        appSecret: this.options.appSecret,
        loggerLevel: Lark.LoggerLevel.warn,
      })
      await client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      })
    } catch (err) {
      logForDebugging(
        `[feishu:ws] 回复失败: ${err instanceof Error ? err.message : String(err)}`,
        { level: 'error' },
      )
    }
  }
}

function extractText(message: {
  message_type?: string
  content?: string
}): string {
  const content = message.content ?? ''
  if (message.message_type === 'text') {
    try {
      return (JSON.parse(content) as { text?: string }).text ?? ''
    } catch {
      return content
    }
  }
  if (message.message_type === 'image') return '[图片]'
  if (message.message_type === 'file') return '[文件]'
  return ''
}

/** 去掉 @_user_N 占位符与 @昵称。 */
function stripMentions(
  text: string,
  message: { mentions?: Array<{ key?: string; name?: string }> },
): string {
  let result = text
  for (const m of message.mentions ?? []) {
    if (m.key) result = result.replace(m.key, '')
    if (m.name) result = result.replace(`@${m.name}`, '')
  }
  return result.replace(/@_user_\d+/g, '').trim()
}

/** 长连接模式是否启用（与 webhook 互斥：同时配了优先用长连接）。 */
export function isFeishuLongConnectionMode(): boolean {
  return isFeishuLongConnectionEnabled()
}
