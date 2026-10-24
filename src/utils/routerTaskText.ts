/**
 * 从会话消息里提取「最近的用户任务文本」，供 /router 降级分类使用。
 *
 * 单独成文件的原因：Message 是结构化联合类型（role 不是简单字符串、
 * content 有多种形态），把它塞进 routerDowngrade 的宽松签名会引发类型不兼容。
 * 这里只做一件事：把任意 Message 归一成纯文本。
 */

interface AnyMessage {
  type?: string
  role?: string
  message?: { role?: string; content?: unknown }
  content?: unknown
}

export function extractTaskTextFromMessages(messages: ReadonlyArray<unknown>, maxLen = 4000): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as AnyMessage | null | undefined
    if (!msg || typeof msg !== 'object') continue

    // 包装格式 { type: 'user', message: { role, content } }
    const inner = msg.message
    if (inner && inner.role === 'user') {
      const text = textOf(inner.content)
      if (text) return text.slice(0, maxLen)
    }

    // 裸格式 { role: 'user', content } 或 { type: 'user', content }
    const role = msg.role ?? msg.type
    if (role === 'user') {
      const text = textOf(msg.content)
      if (text) return text.slice(0, maxLen)
    }
  }
  return ''
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object') {
      const rec = block as Record<string, unknown>
      if (rec.type === 'text' && typeof rec.text === 'string') parts.push(rec.text)
    }
  }
  return parts.join('\n')
}
