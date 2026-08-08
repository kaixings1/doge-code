/**
 * feishuBridgeDaemon.ts — 飞书桥接守护进程
 *
 * 独立进程，通过 stdin/stdout 与 Claude Code 主进程通信。
 * 架构：
 *   Claude Code 主进程 ←──stdin/stdout──▶ FeishuBridgeDaemon ←──Webhook──▶ 飞书
 *
 * 这比深度集成 Bridge 系统更简单可靠，与 lark-coding-agent-bridge 同模式。
 */

import { randomUUID } from 'crypto'
import { feishuApi } from '../services/feishu/feishuApiClient.js'
import { extractFeishuText, stripMention, isMentioningBot, splitReply } from '../services/feishu/feishuMessageAdapter.js'
import { parseFeishuMessage, toMobileRequest, toPromptRequest, FEISHU_COMMANDS } from '../services/feishu/feishuCommandMapper.js'
import { FeishuWebhookServer } from '../services/feishu/feishuWebhook.js'
import { isFeishuBridgeAvailable, getFeishuAppId, getFeishuAppSecret, getFeishuWebhookPort } from './bridgeConfig.js'
import { logForDebugging } from '../utils/debug.js'

// ─── 进程间通信协议 ───

interface DaemonRequest {
  id: string
  type: 'send_message' | 'interrupt' | 'status'
  params: Record<string, unknown>
}

interface DaemonResponse {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

// ─── 主类 ───

export class FeishuBridgeDaemon {
  private appId: string
  private appSecret: string
  private port: number
  private webhookServer: FeishuWebhookServer | null = null
  private sessions = new Map<string, { chatId: string; lastCardId?: string }>()
  private pendingRequests = new Map<string, { resolve: (r: DaemonResponse) => void; reject: (e: Error) => void }>()
  private running = false

  constructor(appId: string, appSecret: string, port = 9901) {
    this.appId = appId
    this.appSecret = appSecret
    this.port = port
  }

  /**
   * 启动守护进程
   */
  async start(): Promise<void> {
    if (this.running) return

    // 初始化飞书 API
    feishuApi.init({ appId: this.appId, appSecret: this.appSecret })

    // 启动 Webhook 服务器
    this.webhookServer = new FeishuWebhookServer({
      port: this.port,
      appSecret: this.appSecret,
      onMessage: (msg) => this.handleIncomingMessage(msg),
    })
    this.webhookServer.start()

    // 监听父进程 stdin（接收来自 Claude Code 主进程的消息）
    this.startStdinListener()

    this.running = true
    console.error(`[feishu-daemon] 飞书桥接守护进程已启动，端口: ${this.port}`)
    console.error(`[feishu-daemon] Webhook URL: http://localhost:${this.port}/feishu/webhook`)
    console.error(`[feishu-daemon] 请将此 URL 配置到飞书开放平台的事件订阅中`)
  }

  /**
   * 停止守护进程
   */
  async stop(): Promise<void> {
    if (this.webhookServer) {
      this.webhookServer.stop()
      this.webhookServer = null
    }
    this.running = false
    console.error('[feishu-daemon] 飞书桥接守护进程已停止')
  }

  /**
   * 从 stdin 读取父进程指令
   */
  private startStdinListener(): void {
    const reader = process.stdin.getReader()
    const decoder = new TextDecoder()

    const readLoop = async (): Promise<void> => {
      while (this.running) {
        try {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              const req = JSON.parse(line) as DaemonRequest
              this.handleDaemonRequest(req)
            } catch {
              // 忽略非 JSON 行
            }
          }
        } catch {
          break
        }
      }
    }

    readLoop().catch(() => {})
  }

  /**
   * 处理来自 Claude Code 主进程的请求
   */
  private handleDaemonRequest(req: DaemonRequest): void {
    const pending = this.pendingRequests.get(req.id)

    switch (req.type) {
      case 'send_message':
        // 发送消息到指定飞书会话
        this.sendToFeishu(req.params as { chatId: string; text: string })
          .then(() => pending?.resolve({ id: req.id, success: true }))
          .catch(err => pending?.reject(err))
        break
      case 'interrupt':
        // 中断当前操作（发送中断通知到飞书）
        this.notifyInterrupt(req.params as { chatId: string })
          .then(() => pending?.resolve({ id: req.id, success: true }))
          .catch(err => pending?.reject(err))
        break
      case 'status':
        pending?.resolve({
          id: req.id,
          success: true,
          data: {
            running: this.running,
            activeSessions: this.sessions.size,
            port: this.port,
          },
        })
        break
      default:
        pending?.reject(new Error(`Unknown request type: ${(req as any).type}`))
    }

    if (pending) {
      this.pendingRequests.delete(req.id)
    }
  }

  /**
   * 处理收到的飞书消息
   */
  private async handleIncomingMessage(msg: FeishuEventCallback): Promise<void> {
    const chatId = msg.event.message.chat_id
    const userId = msg.event.sender.sender_id.open_id ?? msg.event.sender.sender_id.user_id ?? 'unknown'
    const rawText = extractFeishuText(msg.event.message)

    logForDebugging(`[feishu-daemon] 收到消息: chat=${chatId}, text=${rawText.slice(0, 50)}`, { level: 'debug' })

    // 群聊：必须 @机器人
    if (msg.event.message.chat_type === 'group' && !isMentioningBot(msg.event.message)) {
      return
    }

    // 去掉 @标记
    const text = msg.event.message.chat_type === 'group'
      ? stripMention(rawText, msg.event.message)
      : rawText

    if (!text) return

    // 获取或创建会话
    let session = this.sessions.get(chatId)
    if (!session) {
      session = { chatId }
      this.sessions.set(chatId, session)
    }

    // 解析命令
    const parsed = parseFeishuMessage(text)

    // 构建要发送给 Claude Code 的请求
    const daemonReq: DaemonRequest = {
      id: randomUUID(),
      type: 'send_message',
      params: {
        chatId,
        messageId: msg.event.message.message_id,
        action: parsed?.action ?? 'sendMessage',
        text: parsed ? `/${parsed.command.slice(1)} ${parsed.params.args ?? ''}`.trim() : text,
        isCommand: Boolean(parsed),
        commandArgs: parsed?.params,
        userId,
      },
    }

    // 发送到 stdout（Claude Code 主进程会读取）
    this.writeToStdout(daemonReq)

    // 发送"处理中"卡片
    const card = feishuApi.createStreamingCard('Claude Code')
    session.lastCardId = await feishuApi.sendCard(chatId, card)
  }

  /**
   * 发送消息到飞书
   */
  private async sendToFeishu(params: { chatId: string; text: string }): Promise<void> {
    const session = this.sessions.get(params.chatId)
    const text = params.text.slice(0, 3500)
    const card = feishuApi.createResultCard('Claude Code', text)

    if (session?.lastCardId) {
      try {
        await feishuApi.updateCard(session.lastCardId, card)
        return
      } catch {
        // 更新失败，发送新消息
      }
    }
    session.lastCardId = await feishuApi.sendCard(params.chatId, card)
  }

  /**
   * 发送中断通知
   */
  private async notifyInterrupt(params: { chatId: string }): Promise<void> {
    await feishuApi.sendText(params.chatId, '⏹️ 已中断当前操作')
  }

  /**
   * 向 Claude Code 主进程写入请求
   */
  private writeToStdout(req: DaemonRequest): void {
    process.stdout.write(JSON.stringify(req) + '\n')
  }

  /**
   * 从 stdin 发送请求并等待响应
   */
  sendRequest(req: Omit<DaemonRequest, 'id'>): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      this.pendingRequests.set(id, { resolve, reject })
      process.stdout.write(JSON.stringify({ ...req, id } as DaemonRequest) + '\n')
    })
  }
}
