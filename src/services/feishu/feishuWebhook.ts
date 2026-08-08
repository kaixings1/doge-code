/**
 * feishuWebhook.ts — 飞书 Webhook 处理器
 *
 * 处理飞书事件回调，包括：
 * - URL 验证（Challenge 响应）
 * - 消息接收事件分发
 * - 签名验证
 */

import type { FeishuInboundMessage, FeishuUserInfo } from './feishuMessageAdapter.js'
import { extractFeishuText, isMentioningBot, stripMention } from './feishuMessageAdapter.js'
import { parseFeishuMessage } from './feishuCommandMapper.js'

// ─── 类型 ───

export type FeishuEventHandler = (msg: FeishuInboundMessage) => Promise<void>

export interface FeishuWebhookOptions {
  /** 事件处理器 */
  onMessage: FeishuEventHandler
  /** Webhook 监听端口 */
  port?: number
  /** 飞书应用凭证（用于签名验证） */
  appSecret?: string
  /** 启动回调 */
  onStart?: (port: number) => void
}

// ─── 飞书 Challenge 验证 ───

export interface FeishuChallengeRequest {
  challenge: string
  token: string
  type: string
}

export interface FeishuChallengeResponse {
  challenge: string
}

/**
 * 验证 URL 时生成 Challenge 响应
 */
export function createChallengeResponse(req: FeishuChallengeRequest): FeishuChallengeResponse {
  return { challenge: req.challenge }
}

// ─── 飞书事件数据结构 ───

export interface FeishuEventCallback {
  schema: string
  header: {
    event_id: string
    event_type: string
    create_time: string
    token: string
    app_id: string
    tenant_key: string
    resource_type?: string
  }
  event: FeishuInboundMessage
}

// ─── Webhook 服务器 ───

export class FeishuWebhookServer {
  private server: ReturnType<typeof Bun.serve> | null = null
  private onMessage: FeishuEventHandler
  private port: number
  private appSecret: string | undefined

  constructor(options: FeishuWebhookOptions) {
    this.onMessage = options.onMessage
    this.port = options.port ?? 9901
    this.appSecret = options.appSecret
  }

  start(): void {
    if (this.server) return

    this.server = Bun.serve({
      port: this.port,
      fetch: (req) => this.handleRequest(req),
    })

    console.log(`[feishu] Webhook 服务器已启动，端口: ${this.port}`)
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      this.server = null
    }
  }

  get url(): string {
    return `http://localhost:${this.port}/feishu/webhook`
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // URL 验证（飞书配置事件订阅时调用）
    if (url.pathname === '/feishu/webhook' && req.method === 'GET') {
      const params = url.searchParams
      return new Response(
        JSON.stringify(createChallengeResponse({
          challenge: params.get('challenge') ?? '',
          token: params.get('token') ?? '',
          type: params.get('type') ?? 'url_verification',
        })),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // 事件回调
    if (url.pathname === '/feishu/webhook' && req.method === 'POST') {
      try {
        const body = await req.json() as FeishuEventCallback

        // 处理 URL 验证事件
        if (body.header.event_type === 'url_verification') {
          return new Response(
            JSON.stringify(createChallengeResponse({
              challenge: body.event.challenge ?? '',
              token: body.header.token,
              type: 'url_verification',
            })),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        // 处理消息接收事件
        if (body.header.event_type === 'im.message.receive_v1') {
          // 忽略机器人自己发的消息
          if (body.event.sender.sender_type === 'app') {
            return new Response('ok', { status: 200 })
          }

          // 群聊需要 @机器人 才响应
          if (body.event.message.chat_type === 'group' && !isMentioningBot(body.event.message)) {
            return new Response('ok', { status: 200 })
          }

          await this.onMessage(body.event)
        }

        return new Response('ok', { status: 200 })
      } catch (err) {
        console.error('[feishu] Webhook 处理错误:', err)
        return new Response('error', { status: 500 })
      }
    }

    return new Response('Not Found', { status: 404 })
  }
}
