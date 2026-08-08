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
import { feishuApi } from './feishuApiClient.js'
import { extractFeishuText, isMentioningBot, stripMention } from './feishuMessageAdapter.js'
import { parseFeishuMessage, toMobileRequest, toPromptRequest } from './feishuCommandMapper.js'
import { FeishuWebhookServer } from './feishuWebhook.js'
import { logForDebugging } from '../../utils/debug.js'

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
  bridgeHandle: ReplBridgeHandle | null
  onResponse?: (response: MobileResponse) => Promise<void>
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

  async init(): Promise<void> {
    if (this.initialized) return

    feishuApi.init({
      appId: this.options.appId,
      appSecret: this.options.appSecret,
    })

    this.webhookServer = new FeishuWebhookServer({
      port: this.options.port ?? 9901,
      appSecret: this.options.appSecret,
      onMessage: (msg) => this.handleIncomingMessage(msg),
    })
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

    const card = feishuApi.createStreamingCard()
    try {
      const cardId = await feishuApi.sendCard(session.chatId, card)
      session.lastCardMessageId = cardId

      this.options.bridgeHandle.writeMessages([{
        type: 'user',
        uuid: sourceMessageId,
        timestamp: new Date().toISOString(),
        message: {
          content: typeof request.params.message === 'string'
            ? request.params.message
            : JSON.stringify(request.params),
        },
      }])
    } catch (err) {
      await feishuApi.sendText(
        session.chatId,
        `发送失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
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
      success ? 'Claude Code' : 'Claude Code (错误)',
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

export function setFeishuBridge(bridge: FeishuBridge): void {
  instance = bridge
}
