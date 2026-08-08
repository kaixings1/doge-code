/**
 * feishuMessageAdapter.ts — 飞书消息适配器
 *
 * 负责飞书消息格式与内部消息格式之间的双向转换。
 */

/**
 * 飞书 Webhook 事件中的消息结构
 */
export interface FeishuInboundMessage {
  event_id: string
  event_type: 'im.message.receive_v1' | 'url_verification'
  tenant_key: string
  tenant_access_token?: string
  challenge?: string
  message?: {
    message_id: string
    root_id?: string
    parent_id?: string
    create_time: string
    chat_id: string
    chat_type: 'p2p' | 'group'
    message_type: string
    content: string
    mentions?: Array<{ id?: string; name?: string }>
  }
  sender?: {
    sender_id: {
      open_id?: string
      user_id?: string
      union_id?: string
    }
    sender_type: 'user' | 'app'
    tenant_key: string
  }
}

/**
 * 飞书发送消息参数
 */
export interface FeishuSendParams {
  receiveId: string
  messageId?: string
  content: string
  msgType?: 'text' | 'interactive'
}

export interface FeishuUserInfo {
  openId?: string
  userId?: string
  unionId?: string
  tenantKey?: string
  name?: string
}

/**
 * 从飞书 Webhook 事件提取纯文本内容
 */
export function extractFeishuText(message: FeishuInboundMessage['message']): string {
  if (message.message_type === 'text') {
    try {
      const content = JSON.parse(message.content) as { text: string }
      return content.text ?? ''
    } catch {
      return message.content
    }
  }
  if (message.message_type === 'image') {
    return '[图片]'
  }
  if (message.message_type === 'file') {
    return '[文件]'
  }
  if (message.message_type === 'interactive') {
    return '[卡片消息]'
  }
  return `[${message.message_type}]`
}

/**
 * 检查消息是否 @了机器人
 */
export function isMentioningBot(message: FeishuInboundMessage['message']): boolean {
  // 群聊中需要 @机器人 才会响应
  if (message.chat_type === 'p2p') return true
  if (!message.mentions || message.mentions.length === 0) return false
  // 有 @mention 即视为目标消息
  return true
}

/**
 * 去掉文本中的 @机器人 标记
 */
export function stripMention(text: string, message: FeishuInboundMessage['message']): string {
  if (!message.mentions) return text.trim()
  let result = text
  for (const mention of message.mentions) {
    const name = mention.name ?? ''
    // 去掉 @name
    result = result.replace(`@${name}`, '').trim()
    // 去掉 HTML 实体 @_user_N
    if (mention.id && mention.id.startsWith('ou_')) {
      result = result.replace(/@_user_\d+/, '').trim()
    }
  }
  return result.trim()
}

/**
 * 构建发送给飞书的文本消息
 */
export function buildTextMessage(text: string): FeishuSendParams {
  return {
    receiveId: '',
    content: JSON.stringify({ text }),
    msgType: 'text',
  }
}

/**
 * 截断过长的消息以适应飞书限制（单条消息最大 4KB）
 */
export function truncateForFeishu(text: string, maxLength = 3500): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + `\n\n... (已截断，共 ${text.length} 字符)`
}

/**
 * 将多条回复分片为飞书可发送的消息列表
 */
export function splitReply(text: string, maxLength = 3500): string[] {
  if (text.length <= maxLength) return [text]
  const parts: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining)
      break
    }
    // 尝试在换行符处截断
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt < maxLength * 0.5) {
      splitAt = maxLength
    }
    parts.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  return parts
}
