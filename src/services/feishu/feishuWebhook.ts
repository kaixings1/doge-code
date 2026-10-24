/**
 * feishuWebhook.ts — 飞书 Webhook 处理器
 *
 * 处理飞书事件回调，包括：
 * - URL 验证（Challenge 响应）
 * - 消息接收事件分发
 * - 签名验证
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { createHash, createDecipheriv, timingSafeEqual } from 'crypto'
import type { FeishuInboundMessage } from './feishuMessageAdapter.js'
import { extractFeishuText, isMentioningBot, stripMention } from './feishuMessageAdapter.js'
import { parseFeishuMessage } from './feishuCommandMapper.js'

// ─── 类型 ───

export type FeishuEventHandler = (msg: FeishuInboundMessage) => Promise<void>

export interface FeishuWebhookOptions {
  onMessage: FeishuEventHandler
  port?: number
  appSecret?: string
  /** 开放平台「事件订阅 → Verification Token」。未配置则不校验（不推荐）。 */
  verificationToken?: string
  /** 开放平台「事件订阅 → Encrypt Key」。配置后回调体为密文。 */
  encryptKey?: string
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

// ─── 回调鉴权 ───
//
// 飞书事件订阅有两种安全机制，本实现都支持：
//   1. Verification Token：header.token 与开放平台里配置的 token 比对。
//   2. Encrypt Key（可选）：body 被 AES-256-CBC 加密，key = SHA256(encryptKey)。
//
// 注意：这些机制只有配置后才会生效。未配置任何一项时桥接仍会工作，
// 但公网暴露的端口等于允许任何人向本机会话注入消息——务必至少配置一项。

/** 常量时间比较，避免按字节提前返回泄露 token 前缀。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** 校验 verification token（未配置时视为通过，保持向后兼容）。 */
export function verifyWebhookToken(received: string | void, expected: string | void): boolean {
  if (!expected) return true
  if (!received) return false
  return safeEqual(received, expected)
}

/** 飞书加密回调解密：AES-256-CBC，key = SHA256(encryptKey)，前 16 字节为 IV。 */
export function decryptFeishuPayload(encrypt: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const raw = Buffer.from(encrypt, 'base64')
  const iv = raw.subarray(0, 16)
  const ciphertext = raw.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
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
  /** 开放平台「事件订阅」的 Verification Token，配置后校验 header.token。 */
  private verificationToken?: string
  /** 开放平台「事件订阅」的 Encrypt Key，配置后回调体为密文。 */
  private encryptKey?: string
  private port: number
  private appSecret: string | undefined

  constructor(options: FeishuWebhookOptions) {
    this.onMessage = options.onMessage
    this.port = options.port ?? 9901
    this.appSecret = options.appSecret
    this.verificationToken = options.verificationToken
    this.encryptKey = options.encryptKey
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
          const rawBody = Buffer.concat(chunks).toString('utf8')
          const parsed = JSON.parse(rawBody) as FeishuEventCallback | { encrypt?: string }

          // 配置了 Encrypt Key 时，飞书会把整个事件加密后放在 encrypt 字段。
          // 解不开说明请求不是飞书发的（或 key 配错），直接拒绝。
          let body: FeishuEventCallback
          if (typeof (parsed as { encrypt?: string }).encrypt === 'string') {
            if (!this.encryptKey) {
              res.writeHead(400)
              res.end('encrypted payload but no encrypt key configured')
              return
            }
            try {
              body = JSON.parse(
                decryptFeishuPayload((parsed as { encrypt: string }).encrypt, this.encryptKey),
              ) as FeishuEventCallback
            } catch {
              res.writeHead(400)
              res.end('decrypt failed')
              return
            }
          } else {
            body = parsed as FeishuEventCallback
          }

          // 配置了 verification token 时必须匹配，否则任何知道端口的人
          // 都能向本机会话注入指令。
          if (!verifyWebhookToken(body.header?.token, this.verificationToken)) {
            res.writeHead(403)
            res.end('invalid verification token')
            return
          }

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
          console.error('❌ 错误: [feishu] Webhook 处理错误:', err)
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
