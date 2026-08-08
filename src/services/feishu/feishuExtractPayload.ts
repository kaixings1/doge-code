/**
 * feishuExtractPayload.ts — 飞书入站消息解析器
 *
 * 将飞书 `im.message.receive_v1` 事件中的 message.content 解析为
 * 结构化 InboundPayload（纯文本 + 待下载附件列表）。
 *
 * 参考实现: cc-haha adapters/feishu/extract-payload.ts
 */

export type PendingDownload =
  | { kind: 'image'; fileKey: string; fileName?: string }
  | { kind: 'file'; fileKey: string; fileName?: string }

export interface InboundPayload {
  text: string
  pendingDownloads: PendingDownload[]
}

export function extractInboundPayload(content: string, msgType: string): InboundPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { text: '', pendingDownloads: [] }
  }

  if (msgType === 'text') {
    return {
      text: typeof (parsed as { text?: string }).text === 'string' ? (parsed as { text: string }).text : '',
      pendingDownloads: [],
    }
  }

  if (msgType === 'image') {
    if (typeof (parsed as { image_key?: string }).image_key === 'string' && (parsed as { image_key: string }).image_key) {
      return {
        text: '',
        pendingDownloads: [{ kind: 'image', fileKey: (parsed as { image_key: string }).image_key }],
      }
    }
    return { text: '', pendingDownloads: [] }
  }

  if (msgType === 'file' || msgType === 'file_archive') {
    if (typeof (parsed as { file_key?: string }).file_key === 'string' && (parsed as { file_key: string }).file_key) {
      return {
        text: '',
        pendingDownloads: [
          {
            kind: 'file',
            fileKey: (parsed as { file_key: string }).file_key,
            fileName: typeof (parsed as { file_name?: string }).file_name === 'string'
              ? (parsed as { file_name: string }).file_name
              : undefined,
          },
        ],
      }
    }
    return { text: '', pendingDownloads: [] }
  }

  if (msgType === 'post') {
    const nodes = (parsed as { zh_cn?: { content?: unknown[] }; en_us?: { content?: unknown[] } })
      .zh_cn?.content ?? (parsed as { en_us?: { content?: unknown[] } }).en_us?.content ?? []
    const flat = nodes.flat()
    const textParts: string[] = []
    const downloads: PendingDownload[] = []
    for (const node of flat) {
      if (!node || typeof node !== 'object') continue
      const n = node as Record<string, unknown>
      if (n.tag === 'text' || n.tag === 'md') {
        const t = (n.text ?? n.content) as string | undefined
        if (typeof t === 'string') textParts.push(t)
      } else if (n.tag === 'img' && typeof n.image_key === 'string') {
        downloads.push({ kind: 'image', fileKey: n.image_key })
      } else if (n.tag === 'file' && typeof n.file_key === 'string') {
        downloads.push({
          kind: 'file',
          fileKey: n.file_key,
          fileName: typeof n.file_name === 'string' ? n.file_name : undefined,
        })
      }
    }
    return { text: textParts.join(''), pendingDownloads: downloads }
  }

  return { text: '', pendingDownloads: [] }
}
