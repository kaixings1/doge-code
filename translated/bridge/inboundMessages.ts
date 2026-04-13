import type {
  Base64ImageSource,
  ContentBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import type { UUID } from 'crypto'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { detectImageFormatFromBase64 } from '../utils/imageResizer.js'

/**
 * 处理来自桥接的传入用户消息，提取内容和UUID以便入队。支持字符串内容以及ContentBlockParam数组（例如包含图片的消息）。
 *
 * 将桥接客户端中可能使用camelCase `mediaType`而不是snake_case `media_type`（mobile-apps#5825）的图像块进行规范化处理。
 *
 * 如果消息应被跳过（非用户类型、内容缺失/为空），则返回提取的字段或undefined。
 */
export function extractInboundMessageFields(
  msg: SDKMessage,
):
  | { content: string | Array<ContentBlockParam>; uuid: UUID | undefined }
  | undefined {
  if (msg.type !== 'user') return undefined
  const content = msg.message?.content
  if (!content) return undefined
  if (Array.isArray(content) && content.length === 0) return undefined

  const uuid =
    'uuid' in msg && typeof msg.uuid === 'string'
      ? (msg.uuid as UUID)
      : undefined

  return {
    content: Array.isArray(content) ? normalizeImageBlocks(content) : content,
    uuid,
  }
}

/**
 * 将桥接客户端的图像内容块进行规范化处理。iOS/web客户端可能会发送`mediaType`（camelCase）而不是`media_type`（snake_case），或者完全省略该字段。
 * 不进行规范化会导致无效的块污染会话——每个后续API调用都会因"media_type: 字段为必填项"而失败。
 *
 * 高效路径扫描在无需规范化时返回原始数组引用（在高效路径上实现零分配）。
 */
export function normalizeImageBlocks(
  blocks: Array<ContentBlock = { source: Base64ImageSource }>,
): Array<ContentBlockParam> {
  if (!blocks.some(isMalformedBase64Image)) return blocks

  return blocks.map(block => {
    if (!isMalformedBase64Image(block)) return block
    const src = block.source as unknown as Record<string, unknown>
    const mediaType =
      typeof src.mediaType === 'string' && src.mediaType
        ? src.mediaType
        : detectImageFormatFromBase64(block.source.data)
    return {
      ...block,
      source: {
        type: 'base64' as const,
        media_type: mediaType as Base64ImageSource['media_type'],
        data: block.source.data,
      },
    }
  })
}

function isMalformedBase64Image(
  block: ContentBlockParam,
): block is ImageBlockParam & { source: Base64ImageSource } {
  if (block.type !== 'image' || block.source?.type !== 'base64') return false
  return !(block.source as unknown as Record<string, unknown>).media_type
}