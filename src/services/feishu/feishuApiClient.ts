/**
 * feishuApiClient.ts — 飞书 API 客户端
 *
 * 基于 @larksuiteoapi/node-sdk 封装飞书消息发送能力。
 * 支持：文本消息、卡片消息、图片/文件上传、CardKit 流式卡片 API。
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
   * 发送卡片消息
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
    return (result.data?.message_id as string | undefined) ?? ''
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
   * 上传图片 buffer，返回 image_key
   */
  async uploadImage(buffer: Buffer): Promise<string | null> {
    const client = this.ensureClient()
    try {
      const result = await client.im.image.create({
        data: {
          image_type: 'message',
          image: buffer,
        },
      })
      return (result.data?.image_key as string | undefined) ?? null
    } catch {
      return null
    }
  }

  /**
   * 上传文件，返回 file_key
   */
  async uploadFile(buffer: Buffer, fileName: string, fileType: string): Promise<string | null> {
    const client = this.ensureClient()
    try {
      const result = await client.im.file.create({
        data: {
          file_type: fileType,
          file_name: fileName,
          file: buffer,
        },
      })
      return (result.data?.file_key as string | undefined) ?? null
    } catch {
      return null
    }
  }

  // ─── CardKit API ───────────────────────────────────────────────────

  /**
   * 创建 CardKit 卡片实体，返回 card_id。
   */
  async createCardEntity(card: Record<string, unknown>): Promise<string> {
    const client = this.ensureClient()
    const result = await (client as any).cardkit.v1.card.create({
      data: {
        type: 'card_json',
        data: JSON.stringify(card),
      },
    })
    return (result.data?.card_id as string | undefined) ?? ''
  }

  /**
   * 把 CardKit 卡片通过 IM 消息挂到聊天窗，返回 message_id。
   */
  async sendCardAsMessage(chatId: string, cardId: string, replyToMessageId?: string): Promise<string> {
    const client = this.ensureClient()
    const content = JSON.stringify({
      type: 'card',
      data: { card_id: cardId },
    })
    const result = await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content,
      },
    })
    return (result.data?.message_id as string | undefined) ?? ''
  }

  /**
   * 流式更新指定 element 的内容。
   */
  async streamCardContent(cardId: string, elementId: string, content: string, sequence: number): Promise<number> {
    const client = this.ensureClient()
    await (client as any).cardkit.v1.cardElement.content({
      data: { content, sequence },
      path: { card_id: cardId, element_id: elementId },
    })
    return sequence + 1
  }

  /**
   * 开/关卡片流式模式。
   */
  async setCardStreamingMode(cardId: string, streamingMode: boolean, sequence: number): Promise<number> {
    const client = this.ensureClient()
    await (client as any).cardkit.v1.card.settings({
      data: {
        settings: JSON.stringify({ streaming_mode: streamingMode }),
        sequence,
      },
      path: { card_id: cardId },
    })
    return sequence + 1
  }

  /**
   * 全量替换卡片为新的 JSON。
   */
  async updateCardKitCard(cardId: string, card: Record<string, unknown>, sequence: number): Promise<void> {
    const client = this.ensureClient()
    await (client as any).cardkit.v1.card.update({
      data: {
        card: { type: 'card_json', data: JSON.stringify(card) },
        sequence,
      },
      path: { card_id: cardId },
    })
  }

  // ─── Helpers ──────────────────────────────────────────────────────

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
        { tag: 'markdown', content: '正在处理...' },
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
