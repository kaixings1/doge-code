import { queryHaiku } from '../../services/api/claude.js'
import { logError } from '../log.js'
import { extractTextContent } from '../messages.js'
import { asSystemPrompt } from '../systemPromptType.js'

export type DateTimeParseResult =
  | { success: true; value: string }
  | { success: false; error: string }

/**
 * 使用 Haiku 将自然语言日期/时间输入解析为 ISO 8601 格式。
 *
 * 示例：
 * - "tomorrow at 3pm" → "2025-10-15T15:00:00-07:00"
 * - "next Monday" → "2025-10-20"
 * - "in 2 hours" → "2025-10-14T12:30:00-07:00"
 *
 * @param input 用户提供的自然语言日期/时间字符串
 * @param format 解析为 'date' (YYYY-MM-DD) 或 'date-time' (带时间的完整 ISO 8601)
 * @param signal 用于取消的 AbortSignal
 * @returns 解析后的 ISO 8601 字符串或错误信息
 */
export async function parseNaturalLanguageDateTime(
  input: string,
  format: 'date' | 'date-time',
  signal: AbortSignal,
): Promise<DateTimeParseResult> {
  // 获取带时区的当前日期时间作为上下文
  const now = new Date()
  const currentDateTime = now.toISOString()
  const timezoneOffset = -now.getTimezoneOffset() // 分钟，已取反
  const tzHours = Math.floor(Math.abs(timezoneOffset) / 60)
  const tzMinutes = Math.abs(timezoneOffset) % 60
  const tzSign = timezoneOffset >= 0 ? '+' : '-'
  const timezone = `${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMinutes).padStart(2, '0')}`
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' })

  // 构建包含上下文的系统提示
  const systemPrompt = asSystemPrompt([
    '你是一个日期/时间解析器，用于将自然语言转换为 ISO 8601 格式。',
    '你必须只回复 ISO 8601 格式的字符串，不得包含任何解释或额外文本。',
    '如果输入有歧义，优先选择未来的日期而不是过去的日期。',
    '对于没有指定日期的时间，使用今天的日期。',
    '对于没有指定时间的日期，不要包含时间部分。',
    '如果输入不完整或你无法自信地解析为有效日期，请准确回复 "INVALID"（不附加任何内容）。',
    '无效输入示例：不完整的日期如 "2025-01-"，单独的数字如 "13"，无意义的输入。',
    '有效自然语言示例："明天", "下周一", "2025年1月1日", "2小时后", "昨天"。',
  ])

  // 构建包含丰富上下文的用户提示
  const formatDescription =
    format === 'date'
      ? 'YYYY-MM-DD (仅日期，无时间)'
      : `YYYY-MM-DDTHH:MM:SS${timezone} (带时区的完整日期时间)`

  const userPrompt = `当前上下文：
- 当前日期时间: ${currentDateTime} (UTC)
- 本地时区: ${timezone}
- 星期: ${dayOfWeek}

用户输入: "${input}"

输出格式: ${formatDescription}

请将用户输入解析为 ISO 8601 格式。只返回格式化后的字符串，如果输入不完整或无法解析则返回 "INVALID"。`

  try {
    const result = await queryHaiku({
      systemPrompt,
      userPrompt,
      signal,
      options: {
        querySource: 'mcp_datetime_parse',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        enablePromptCaching: false,
      },
    })

    // 从结果中提取文本
    const parsedText = extractTextContent(result.message.content).trim()

    // 验证我们是否得到了可用的结果
    if (!parsedText || parsedText === 'INVALID') {
      return {
        success: false,
        error: '无法从输入中解析出日期/时间',
      }
    }

    // 基本合理性检查 - 应以数字开头（年份）
    if (!/^\d{4}/.test(parsedText)) {
      return {
        success: false,
        error: '无法从输入中解析出日期/时间',
      }
    }

    return { success: true, value: parsedText }
  } catch (error) {
    // 记录错误但不向用户暴露细节
    logError(error)
    return {
      success: false,
      error: '无法解析日期/时间，请手动输入 ISO 8601 格式。',
    }
  }
}

/**
 * 检查一个字符串是否看起来像 ISO 8601 日期/时间格式。
 * 用于决定是否尝试自然语言解析。
 */
export function looksLikeISO8601(input: string): boolean {
  // ISO 8601 日期: YYYY-MM-DD
  // ISO 8601 日期时间: YYYY-MM-DDTHH:MM:SS...
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(input.trim())
}