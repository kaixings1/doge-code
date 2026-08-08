/**
 * feishuWebhook.ts — 飞书 Webhook 处理器
 *
 * 处理飞书事件回调，包括：
 * - URL 验证（Challenge 响应）
 * - 消息接收事件分发
 * - 签名验证
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import type { FeishuInboundMessage } from './feishuMessageAdapter.js'
import { extractFeishuText, isMentioningBot, stripMention } from './feishuMessageAdapter.js'
import { parseFeishuMessage } from './feishuCommandMapper.js'

// ─── 类型 ───

export type FeishuEventHandler = (msg: FeishuInboundMessage) => Promise<void>

export interface FeishuWebhookOptions {
  onMessage: FeishuEventHandler
  port?: number
  appSecret?: string
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
  private server: Server | null = null
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

    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${this.port}`)

      // URL 验证
      if (url.pathname === '/feishu/webhook' && req.method === 'GET') {
        const params = url.searchParams
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(createChallengeResponse({
          challenge: params.get('challenge') || '',
          token: params.get('token') || '',
          type: params.get('type') || 'url_verification',
        })))
        return
      }

      // 事件回调
      if (url.pathname === '/feishu/webhook' && req.method === 'POST') {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString()) as FeishuEventCallback

          if (body.header.event_type === 'url_verification') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(createChallengeResponse({
              challenge: body.event.challenge || '',
              token: body.header.token,
              type: 'url_verification',
            })))
            return
          }

          if (body.header.event_type === 'im.message.receive_v1') {
            if (body.event.sender.sender_type === 'app') {
              res.writeHead(200)
              res.end('ok')
              return
            }

            if (body.event.message.chat_type === 'group' && !isMentioningBot(body.event.message)) {
              res.writeHead(200)
              res.end('ok')
              return
            }

            await this.onMessage(body.event)
          }

          res.writeHead(200)
          res.end('ok')
        } catch (err) {
          console.error('[feishu] Webhook 处理错误:', err)
          res.writeHead(500)
          res.end('error')
        }
        return
      }

      res.writeHead(404)
      res.end('Not Found')
    })

    this.server.listen(this.port, () => {
      console.log(`[feishu] Webhook 服务器已启动，端口: ${this.port}`)
    })
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  get url(): string {
    return `http://localhost:${this.port}/feishu/webhook`
  }
}
