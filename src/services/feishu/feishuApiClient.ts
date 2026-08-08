/**
 * feishuApiClient.ts — 飞书 API 客户端
 *
 * 基于 @larksuiteoapi/node-sdk 封装飞书消息发送能力。
 * 支持：文本消息、卡片消息、图片/文件上传。
 */

import { Client } from '@larksuiteoapi/node-sdk'

export interface FeishuApiConfig {
  appId: string
  appSecret: string
}

export interface FeishuMessage {
  receiveId: string
  msgType: 'text' | 'interactive' | 'image' | 'file'
  content: string
}

export interface FeishuCard {
  header: {
    title: { tag: string; content: string }
    template?: string
  }
  elements: Array<{
    tag: string
    content?: string
    actions?: Array<{ tag: string; text: { tag: string; content: string }; type: string; url?: string; value?: Record<string, string> }>
    fields?: Array<{ is_short?: boolean; text: { tag: string; content: string } }>
  }>
}

class FeishuApiClient {
  private client: Client | null = null
  private config: FeishuApiConfig | null = null

  private ensureClient(): Client {
    if (!this.client) {
      throw new Error('FeishuApiClient 未初始化，请先调用 init()')
    }
    return this.client
  }

  init(config: FeishuApiConfig): void {
    this.config = config
    this.client = new Client({
      appId: config.appId,
      appSecret: config.appSecret,
    })
  }

  get isInitialized(): boolean {
    return this.client !== null
  }

  /**
   * 发送文本消息
   */
  async sendText(receiveId: string, text: string): Promise<void> {
    const client = this.ensureClient()
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  }

  /**
   * 发送卡片消息（支持流式更新）
   */
  async sendCard(receiveId: string, card: FeishuCard): Promise<string> {
    const client = this.ensureClient()
    const result = await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })
    return result.data?.message_id ?? ''
  }

  /**
   * 更新已有卡片消息
   */
  async updateCard(messageId: string, card: FeishuCard): Promise<void> {
    const client = this.ensureClient()
    await client.im.message.update({
      path: { message_id: messageId },
      data: { content: JSON.stringify(card) },
    })
  }

  /**
   * 发送回复消息（回复指定消息）
   */
  async reply(messageId: string, text: string): Promise<void> {
    const client = this.ensureClient()
    await client.im.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  }

  /**
   * 上传图片
   */
  async uploadImage(imagePath: string): Promise<string | null> {
    const client = this.ensureClient()
    try {
      const fs = await import('node:fs/promises')
      const buffer = await fs.readFile(imagePath)
      const result = await client.im.image.create({
        data: {
          image_type: 'message',
          image: Buffer.from(buffer).toString('base64'),
        },
      })
      return result.data?.image_key ?? null
    } catch {
      return null
    }
  }

  /**
   * 发送 Markdown 卡片（简化版，用于 Claude 输出）
   */
  createMarkdownCard(title: string, markdown: string, color: string = 'blue'): FeishuCard {
    return {
      header: {
        title: { tag: 'plain_text', content: title },
        template: color,
      },
      elements: [
        { tag: 'markdown', content: markdown.slice(0, 20000) },
      ],
    }
  }

  /**
   * 创建流式响应占位卡片
   */
  createStreamingCard(title: string = 'Claude Code'): FeishuCard {
    return {
      header: {
        title: { tag: 'plain_text', content: `${title} 正在思考...` },
        template: 'grey',
      },
      elements: [
        { tag: 'markdown', content: '⏳ 正在处理...' },
      ],
    }
  }

  /**
   * 创建结果卡片
   */
  createResultCard(title: string, markdown: string, isError = false): FeishuCard {
    return {
      header: {
        title: { tag: 'plain_text', content: title },
        template: isError ? 'red' : 'green',
      },
      elements: [
        { tag: 'markdown', content: markdown.slice(0, 20000) },
      ],
    }
  }
}

export const feishuApi = new FeishuApiClient()
