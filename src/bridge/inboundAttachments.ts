/**
 * 解析入站桥接器用户消息上的 file_uuid 附件。
 *
 * Web 创作器通过 cookie 认证的 /api/{org}/upload 上传，随消息一起发送 file_uuid。
 * 这里我们通过 GET /api/oauth/files/{uuid}/content 获取每个文件
 * （oauth 认证，同一存储），写入 ~/.claude/uploads/{sessionId}/，
 * 并返回要前置的 @path 引用。Claude 的 Read 工具会从那里接手。
 *
 * 尽力而为：任何失败（无令牌、网络、非 2xx、磁盘）都会记录调试日志并
 * 跳过该附件。消息仍然会到达 Claude，只是没有 @path。
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import axios from 'axios'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { z } from 'zod/v4'
import { getSessionId } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { lazySchema } from '../utils/lazySchema.js'
import { getBridgeAccessToken, getBridgeBaseUrl } from './bridgeConfig.js'

const DOWNLOAD_TIMEOUT_MS = 30_000

function debug(msg: string): void {
  logForDebugging(`[bridge:inbound-attach] ${msg}`)
}

const attachmentSchema = lazySchema(() =>
  z.object({
    file_uuid: z.string(),
    file_name: z.string(),
  }),
)
const attachmentsArraySchema = lazySchema(() => z.array(attachmentSchema()))

export type InboundAttachment = z.infer<ReturnType<typeof attachmentSchema>>

/** 从松散类型的入站消息中提取 file_attachments。 */
export function extractInboundAttachments(msg: unknown): InboundAttachment[] {
  if (typeof msg !== 'object' || msg === null || !('file_attachments' in msg)) {
    return []
  }
  const parsed = attachmentsArraySchema().safeParse(msg.file_attachments)
  return parsed.success ? parsed.data : []
}

/**
 * 去除路径组件，只保留文件名安全的字符。file_name 来自
 * 网络（web 创作器），因此即使创作器控制它，也将其视为不受信任的。
 */
function sanitizeFileName(name: string): string {
  const base = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_')
  return base || 'attachment'
}

function uploadsDir(): string {
  return join(getClaudeConfigHomeDir(), 'uploads', getSessionId())
}

/**
 * 获取并写入一个附件。成功时返回绝对路径，
 * 失败时返回 undefined。
 */
async function resolveOne(att: InboundAttachment): Promise<string | undefined> {
  const token = getBridgeAccessToken()
  if (!token) {
    debug('跳过: 无 oauth 令牌')
    return undefined
  }

  let data: Buffer
  try {
    // getOauthConfig()（通过 getBridgeBaseUrl）在未列入白名单的
    // CLAUDE_CODE_CUSTOM_OAUTH_URL 上会抛出异常 — 保持在 try 内部，以便错误的
    // FedStart URL 降级为"无 @path"而不是使 print.ts 的
    // reader 循环崩溃（其在 await 周围没有 catch）。
    const url = `${getBridgeBaseUrl()}/api/oauth/files/${encodeURIComponent(att.file_uuid)}/content`
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      debug(`获取 ${att.file_uuid} 失败: 状态=${response.status}`)
      return undefined
    }
    data = Buffer.from(response.data)
  } catch (e) {
    debug(`获取附件 ${att.file_uuid} 失败：${e}`)
    return undefined
  }

  // uuid 前缀使跨消息和单消息内的冲突不可能发生
  //（相同文件名，不同文件）。8 个字符就足够了 — 这不是安全相关。
  const safeName = sanitizeFileName(att.file_name)
  const prefix = (
    att.file_uuid.slice(0, 8) || randomUUID().slice(0, 8)
  ).replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = uploadsDir()
  const outPath = join(dir, `${prefix}-${safeName}`)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(outPath, data)
  } catch (e) {
    debug(`写入 ${outPath} 失败: ${e}`)
    return undefined
  }

  debug(`resolved ${att.file_uuid} → ${outPath} (${data.length} bytes)`)
  return outPath
}

/**
 * 将入站消息上的所有附件解析为 @path 引用的前缀字符串。
 * 如果没有解析到任何附件，返回空字符串。
 */
export async function resolveInboundAttachments(
  attachments: InboundAttachment[],
): Promise<string> {
  if (attachments.length === 0) return ''
  debug(`正在解析 ${attachments.length} 个附件`)
  const paths = await Promise.all(attachments.map(resolveOne))
  const ok = paths.filter((p): p is string => p !== undefined)
  if (ok.length === 0) return ''
  // 引用形式 — extractAtMentionedFiles 会在第一个空格处截断未引用的 @refs，
  // 这会导致任何包含空格的 home 目录（如 /Users/John Smith/）出现问题。
  return ok.map(p => `@"${p}"`).join(' ') + ' '
}

/**
 * 将 @path 引用前置到内容中，无论其采用何种形式。
 * 目标是最后一个文本块 — processUserInputBase 从
 * processedBlocks[processedBlocks.length - 1] 读取 inputString，因此将引用放在
 * block[0] 意味着对于 [text, image] 内容它们会被静默忽略。
 */
export function prependPathRefs(
  content: string | Array<ContentBlockParam>,
  prefix: string,
): string | Array<ContentBlockParam> {
  if (!prefix) return content
  if (typeof content === 'string') return prefix + content
  const i = content.findLastIndex(b => b.type === 'text')
  if (i !== -1) {
    const b = content[i]!
    if (b.type === 'text') {
      return [
        ...content.slice(0, i),
        { ...b, text: prefix + b.text },
        ...content.slice(i + 1),
      ]
    }
  }
  // 没有文本块 — 在末尾追加一个，使其成为最后一个。
  return [...content, { type: 'text', text: prefix.trimEnd() }]
}

/**
 * 便捷函数：提取 + 解析 + 前置。当消息没有
 * file_attachments 字段时为无操作（快速路径 — 无网络，返回同一引用）。
 */
export async function resolveAndPrepend(
  msg: unknown,
  content: string | Array<ContentBlockParam>,
): Promise<string | Array<ContentBlockParam>> {
  const attachments = extractInboundAttachments(msg)
  if (attachments.length === 0) return content
  const prefix = await resolveInboundAttachments(attachments)
  return prependPathRefs(content, prefix)
}
