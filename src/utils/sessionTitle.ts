/**
 * 通过 Haiku 生成会话标题。
 *
 * 独立模块，依赖极简，可从 print.ts（SDK 控制请求处理器）导入，而无需引入 teleport.tsx 所携带的 React/chalk/git 依赖链。
 *
 * 此为面向所有界面生成 AI 会话标题的唯一事实来源。此前存在多个独立的 Haiku 标题生成器：
 * - teleport.tsx 中的 generateTitleAndBranch（用于 CCR 的 6 词标题 + 分支名称）
 * - rename/generateSessionName.ts（用于 /rename 的 kebab-case 名称）
 * 以上均保留以保持向后兼容；新调用方应使用本模块。
 */

import { z } from 'zod/v4'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { queryHaiku } from '../services/api/claude.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'
import { safeParseJSON } from './json.js'
import { lazySchema } from './lazySchema.js'
import { extractTextContent } from './messages.js'
import { asSystemPrompt } from './systemPromptType.js'

const MAX_CONVERSATION_TEXT = 1000

/**
 * 将消息数组扁平化为单个文本字符串，作为 Haiku 标题生成的输入。
 * 跳过元数据/非人类消息。当会话内容过长时，仅截取最后 1000 个字符，
 * 以确保最近的上下文信息优先。
 */
export function extractConversationText(messages: Message[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue
    if ('isMeta' in msg && msg.isMeta) continue
    if ('origin' in msg && msg.origin && msg.origin.kind !== 'human') continue
    const content = msg.message.content
    if (typeof content === 'string') {
      parts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if ('type' in block && block.type === 'text' && 'text' in block) {
          parts.push(block.text as string)
        }
      }
    }
  }
  const text = parts.join('\n')
  return text.length > MAX_CONVERSATION_TEXT
    ? text.slice(-MAX_CONVERSATION_TEXT)
    : text
}

const SESSION_TITLE_PROMPT = `请生成一个简洁的、采用句子大小写格式的标题（3-7 个词），以概括本次编码会话的主要话题或目标。标题应足够清晰，使用户在列表中能够轻松识别该会话。采用句子大小写：仅首词及专有名词首字母大写。

返回包含单个 "title" 字段的 JSON。

良好示例：
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

不佳示例（过于笼统）：{"title": "Code changes"}
不佳示例（过长）：{"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
不佳示例（大小写错误）：{"title": "Fix Login Button On Mobile"}`

const titleSchema = lazySchema(() => z.object({ title: z.string() }))

/**
 * 根据描述或首条消息生成句子大小写的会话标题。
 * 若出错或 Haiku 返回无法解析的响应，则返回 null。
 *
 * @param description - 用户的首条消息或会话描述
 * @param signal - 用于取消的 AbortSignal
 */
export async function generateSessionTitle(
  description: string,
  signal: AbortSignal,
): Promise<string | null> {
  const trimmed = description.trim()
  if (!trimmed) return null

  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([SESSION_TITLE_PROMPT]),
      userPrompt: trimmed,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'generate_session_title',
        agents: [],
        // 反映实际会话模式——本模块既可能从 SDK print 路径（非交互式）调用，
        // 也可能通过 useRemoteSession 从 CCR 远程会话路径（交互式）调用。
        isNonInteractiveSession: getIsNonInteractiveSession(),
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const text = extractTextContent(result.message.content)

    const parsed = titleSchema().safeParse(safeParseJSON(text))
    const title = parsed.success ? parsed.data.title.trim() || null : null

    logEvent('tengu_session_title_generated', { success: title !== null })

    return title
  } catch (error) {
    logForDebugging(`generateSessionTitle 失败: ${error}`, {
      level: 'error',
    })
    logEvent('tengu_session_title_generated', { success: false })
    return null
  }
}