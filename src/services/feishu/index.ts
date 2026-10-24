/**
 * index.ts — FeishuBridge 主入口
 *
 * 飞书远程控制桥接器。
 * 架构：
 * - 飞书消息 → Webhook → FeishuBridge → Bridge 系统 → Claude Code
 * - Claude Code 输出 → Bridge → FeishuBridge → 飞书卡片/消息
 *
 * 环境变量：
 * - FEISHU_BRIDGE=1          启用飞书桥接
 * - FEISHU_APP_ID           飞书应用 App ID
 * - FEISHU_APP_SECRET       飞书应用 App Secret
 * - FEISHU_WEBHOOK_PORT     Webhook 监听端口（默认 9901）
 * - FEISHU_WEBHOOK_URL      公网 Webhook URL（用于飞书回调配置）
 */

import type { MobileRequest, MobileResponse } from '../../bridge/mobileProtocol.js'
import type { ReplBridgeHandle } from '../../bridge/replBridge.js'
import type { SDKMessage } from '../../entrypoints/agentSdkTypes.js'
import { feishuApi } from './feishuApiClient.js'
import { extractFeishuText, isMentioningBot, stripMention } from './feishuMessageAdapter.js'
import { parseFeishuMessage, toMobileRequest, toPromptRequest } from './feishuCommandMapper.js'
import { FeishuWebhookServer, type FeishuEventCallback } from './feishuWebhook.js'
import { logForDebugging } from '../../utils/debug.js'
import { enqueue } from '../../utils/messageQueueManager.js'
import { randomUUID } from 'crypto'
import type { UUID } from 'crypto'

// ─── 类型 ───

export interface FeishuSession {
  sessionId: string
  chatId: string
  userId: string
  userName?: string
  lastCardMessageId?: string
  connected: boolean
}

export interface FeishuBridgeOptions {
  appId: string
  appSecret: string
  port?: number
  webhookUrl?: string
  /** 开放平台「事件订阅」的 Verification Token（配置后校验回调来源）。 */
  verificationToken?: string
  /** 开放平台「事件订阅」的 Encrypt Key（配置后回调体为密文）。 */
  encryptKey?: string
  bridgeHandle: ReplBridgeHandle | null
  onResponse?: (response: MobileResponse) => Promise<void>
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
}

// ─── 主类 ───

export class FeishuBridge {
  private options: FeishuBridgeOptions
  private sessions = new Map<string, FeishuSession>()
  private webhookServer: FeishuWebhookServer | null = null
  private initialized = false

  constructor(options: FeishuBridgeOptions) {
    this.options = options
  }

  /** 处理 Bridge 传回的 SDK 消息（用户消息结果、权限请求等）。 */
  async handleSdkMessage(msg: SDKMessage): Promise<void> {
    // 找到对应的 chat session
    const chatId = Object.fromEntries(
      Array.from(this.sessions.entries()).filter(([, s]) => s.sessionId === msg.session_id)
    )
    const target = Object.values(chatId)[0]
    if (!target) return

    if (msg.type === 'result') {
      // 工具执行结果 — 不显示给用户（已完成卡片已由工具回调处理）
      return
    }

    if (msg.type === 'user' || msg.type === 'assistant') {
      const msgAny = msg as any
      const text = typeof msgAny.message?.content === 'string' ? msgAny.message.content : ''
      if (text) {
        const session = this.sessions.get(target.chatId)
        if (session) {
          await this.handleBridgeResponse(session.sessionId, {
            type: msg.type === 'assistant' ? 'result' : 'event',
            requestId: msg.uuid ?? '',
            data: text,
            success: true,
            timestamp: Date.now(),
          })
        }
      }
    }
  }

  /**
   * 注入长连接会话：长连接模式下消息不走 webhook，直接转给 FeishuBridge。
   * 保留 webhookServer 为空，避免同时开两个入口造成重复入队。
   */
  attachLongConnection(): void {
    this.initialized = true
    logForDebugging('[feishu] 使用长连接模式（无 webhook 端口）', { level: 'debug' })
  }

  /**
   * 长连接收到消息后的入口：与 webhook 走完全相同的处理链路
   * （建会话 → parse → enqueue → 登记回复目标）。
   */
  async handleLongConnectionMessage(input: {
    chatId: string
    chatType: 'p2p' | 'group'
    openId: string
    text: string
  }): Promise<void> {
    const session = this.getOrCreateSession(input.chatId, input.openId, input.openId)

    // 群聊的 @ 判定在长连接层完成（那里能拿到 mentions 与 bot open_id）。
    // 这里不再重复判断：传进来的 chat_type 若是 group，说明已确认 @ 过机器人。

    const parsed = parseFeishuMessage(input.text)
    const requestId = `ws-${Date.now()}`
    const mobileReq: MobileRequest = parsed
      ? toMobileRequest(parsed, session.sessionId, requestId)
      : toPromptRequest(input.text, session.sessionId, requestId)

    await this.sendToBridge(session, mobileReq, requestId)
  }

  async init(): Promise<void> {
    if (this.initialized) return

    feishuApi.init({
      appId: this.options.appId,
      appSecret: this.options.appSecret,
    })

    this.webhookServer = new FeishuWebhookServer({
      port: this.options.port ?? 9901,
      appSecret: this.options.appSecret,
      verificationToken: this.options.verificationToken,
      encryptKey: this.options.encryptKey,
      onMessage: (msg) => this.handleIncomingMessage(msg),
    })

    // 未配置任何鉴权时给出明确告警：公网回调端口等于会话注入入口。
    if (!this.options.verificationToken && !this.options.encryptKey) {
      logForDebugging(
        '[feishu] 未配置 FEISHU_VERIFICATION_TOKEN / FEISHU_ENCRYPT_KEY：' +
          '回调不做来源校验，任何知道端口的人都能向本机会话注入消息。',
        { level: 'error' },
      )
    }
    this.webhookServer.start()

    this.initialized = true
    logForDebugging('[feishu] FeishuBridge 初始化完成', { level: 'debug' })
  }

  async shutdown(): Promise<void> {
    if (this.webhookServer) {
      this.webhookServer.stop()
      this.webhookServer = null
    }
    this.sessions.clear()
    this.initialized = false
    logForDebugging('[feishu] FeishuBridge 已关闭', { level: 'debug' })
  }

  private getOrCreateSession(chatId: string, userId: string, userName?: string): FeishuSession {
    let session = this.sessions.get(chatId)
    if (!session) {
      session = {
        sessionId: `feishu-${chatId}`,
        chatId,
        userId,
        userName,
        connected: true,
      }
      this.sessions.set(chatId, session)
    }
    return session
  }

  private async handleIncomingMessage(msg: FeishuEventCallback['event']): Promise<void> {
    const chatId = msg.message.chat_id
    const userId = msg.sender.sender_id.open_id ?? msg.sender.sender_id.user_id ?? 'unknown'
    const userName = msg.sender.sender_id.open_id ?? msg.sender.sender_id.user_id
    const rawText = extractFeishuText(msg.message)

    logForDebugging(`[feishu] 收到消息: chat=${chatId}, user=${userId}, text=${rawText.slice(0, 100)}`, { level: 'debug' })

    // 群聊必须 @机器人 才响应。webhook 层已过滤一次，但 handleIncomingMessage
    // 也可能被直接调用（测试、未来其它入口），这里必须自证，不能依赖调用方。
    if (!isMentioningBot(msg.message)) {
      logForDebugging('[feishu] 群聊消息未 @机器人，忽略', { level: 'debug' })
      return
    }

    const text = msg.message.chat_type === 'group'
      ? stripMention(rawText, msg.message)
      : rawText

    if (!text) return

    const session = this.getOrCreateSession(chatId, userId, userName)

    const parsed = parseFeishuMessage(text)
    const requestId = msg.event_id
    const mobileReq: MobileRequest = parsed
      ? toMobileRequest(parsed, session.sessionId, requestId)
      : toPromptRequest(text, session.sessionId, requestId)

    await this.sendToBridge(session, mobileReq, msg.message.message_id)
  }

  private async sendToBridge(
    session: FeishuSession,
    request: MobileRequest,
    sourceMessageId?: string,
  ): Promise<void> {
    if (!this.options.bridgeHandle) {
      await feishuApi.sendText(
        session.chatId,
        'Claude Code 未连接桥接服务。请先在本机启动 Claude Code 并启用远程控制。',
      )
      return
    }

    logForDebugging(`[feishu] 转发请求到 Bridge: action=${request.action}`, { level: 'debug' })

    // 入站消息的唯一正确入口是 enqueue()。
    // writeMessages 是**出站**（把本地对话镜像到远端），用它转发入站消息会让
    // 消息完全绕过对话主循环：飞书文本进不了本机会话、/run 等命令无效，
    // 且卡片停在「发送中」而日志无报错。mobileBridge 的 forwardToBridge
    // 早已改用同一写法，飞书侧此前漏改。
    const value = typeof request.params.message === 'string'
      ? request.params.message
      : JSON.stringify(request.params)
    if (!value) {
      await feishuApi.sendText(session.chatId, '收到空消息，已忽略。')
      return
    }

    const card = feishuApi.createStreamingCard()
    try {
      const cardId = await feishuApi.sendCard(session.chatId, card)
      session.lastCardMessageId = cardId

      const uuid = (sourceMessageId || randomUUID()) as UUID
      enqueue({
        value,
        mode: 'prompt',
        // 飞书的 /run、/read 等前缀不是 CLI 斜杠命令，不能触发本地技能解析。
        skipSlashCommands: true,
        bridgeOrigin: true,
        // 透传飞书事件 ID 作为该 user 消息 uuid，便于回推时去重。
        uuid,
      })
      // 登记回复目标：出站转发取最早的一条，把助手回复写回这张卡片。
      registerFeishuPendingReply(session.chatId, session.sessionId, String(uuid))
    } catch (err) {
      await feishuApi.sendText(
        session.chatId,
        `发送失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 把助手回复写回该 chat 的卡片（出站主路径）。
   *
   * 此前只有 handleSdkMessage 一个入口，而它从未被接线，导致飞书发出的消息
   * 永远停在「发送中」。现在由 useReplBridge 的出站转发直接调用。
   */
  async deliverAssistantReply(sessionId: string, text: string): Promise<void> {
    const session = Array.from(this.sessions.values()).find(s => s.sessionId === sessionId)
    if (!session) {
      logForDebugging(`[feishu] 未找到会话 ${sessionId}，回复丢弃`, { level: 'error' })
      return
    }
    await this.handleBridgeResponse(sessionId, {
      type: 'result',
      requestId: '',
      data: text,
      success: true,
      timestamp: Date.now(),
    })
  }

  async handleBridgeResponse(sessionId: string, response: MobileResponse): Promise<void> {
    const session = Array.from(this.sessions.values()).find(s => s.sessionId === sessionId)
    if (!session) return

    const { success, data } = response
    let text = ''

    if (success) {
      if (typeof data === 'string') {
        text = data
      } else if (data && typeof data === 'object') {
        text = JSON.stringify(data, null, 2)
      } else {
        text = '操作完成'
      }
    } else {
      const errorMsg = typeof data === 'string' ? data : (data as any)?.error ?? String(data)
      text = `错误: ${errorMsg}`
    }

    const truncated = text.slice(0, 3500)
    const card = feishuApi.createResultCard(
      success ? 'Claude Code' : '❌ 错误: Claude Code (错误)',
      truncated,
      !success,
    )

    if (session.lastCardMessageId) {
      try {
        await feishuApi.updateCard(session.lastCardMessageId, card)
      } catch {
        await feishuApi.sendCard(session.chatId, card)
        session.lastCardMessageId = undefined
      }
    } else {
      session.lastCardMessageId = await feishuApi.sendCard(session.chatId, card)
    }
  }

  async sendText(chatId: string, text: string): Promise<void> {
    const session = this.sessions.get(chatId)
    if (!session) return
    const truncated = text.slice(0, 3500)
    session.lastCardMessageId = await feishuApi.sendCard(
      session.chatId,
      feishuApi.createResultCard('Claude Code', truncated),
    )
  }

  get isInitialized(): boolean {
    return this.initialized
  }

  get activeSessionCount(): number {
    return this.sessions.size
  }
}

let instance: FeishuBridge | null = null

export function getFeishuBridge(): FeishuBridge | null {
  return instance
}

export function setFeishuBridge(bridge: FeishuBridge | null): void {
  instance = bridge
}

/**
 * 入站请求 → 等待回复的 chat 绑定。
 *
 * 飞书的回复是**异步**从对话主循环产生的，不像手机端有常驻 WS 连接可广播。
 * 这里用一个简单队列把「谁发了消息」与「下一条助手回复发给谁」对应起来：
 * 入站时记下 chatId，出站推送取最早的一条；长时间无回复则过期丢弃，
 * 避免用户在终端随手聊天时被误推到飞书。
 */
const FEISHU_REPLY_TTL_MS = 10 * 60 * 1000

type PendingReply = {
  chatId: string
  sessionId: string
  /** 入站消息 uuid，用于日志与去重排查。 */
  uuid: string
  createdAt: number
}

const pendingReplies: PendingReply[] = []

/** 入站时登记：这条飞书消息来自哪个 chat。 */
export function registerFeishuPendingReply(
  chatId: string,
  sessionId: string,
  uuid: string,
): void {
  pendingReplies.push({ chatId, sessionId, uuid, createdAt: Date.now() })
  // 只保留最近若干条，防止无回复消息无限堆积
  if (pendingReplies.length > 20) {
    pendingReplies.splice(0, pendingReplies.length - 20)
  }
}

function takePendingReply(): PendingReply | null {
  const now = Date.now()
  while (pendingReplies.length > 0) {
    const head = pendingReplies.shift()!
    if (now - head.createdAt <= FEISHU_REPLY_TTL_MS) return head
  }
  return null
}

/** 是否有等待中的飞书请求（出站转发用它决定要不要处理这条消息）。 */
export function hasPendingFeishuReply(): boolean {
  const now = Date.now()
  return pendingReplies.some(p => now - p.createdAt <= FEISHU_REPLY_TTL_MS)
}

/**
 * 把一段助手回复推送到飞书（由 useReplBridge 的出站转发调用）。
 *
 * 与 mobileBridge 的 pushToMobileClients 同理：这是旁路能力，
 * 未启用/无等待中的请求时静默返回，任何异常都不得影响主对话流程。
 */
export async function pushAssistantTextToFeishu(text: string): Promise<boolean> {
  const bridge = getFeishuBridge()
  if (!bridge || !text.trim()) return false
  const pending = takePendingReply()
  if (!pending) return false
  try {
    await bridge.deliverAssistantReply(pending.sessionId, text)
    return true
  } catch (err) {
    logForDebugging(
      `[feishu] 推送回复失败（已忽略）：${err instanceof Error ? err.message : String(err)}`,
      { level: 'error' },
    )
    return false
  }
}

/** 仅供测试：重置等待队列。 */
export function __resetFeishuPendingRepliesForTesting(): void {
  pendingReplies.length = 0
}
