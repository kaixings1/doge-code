/**
 * 文本处理工具函数
 * 吸收自 MetaGPT (metagpt/utils/common.py) 和 Graphiti (graphiti_core/utils/text_utils.py)
 *
 * - addAffix / removeAffix: 花括号/URL 编码封装与解封
 * - removeComments: 移除代码注释（仅 # 行注释）
 * - parseJsonCodeBlock: 从 Markdown 文本中提取 JSON 代码块
 * - truncateAtSentence: 按句子边界智能截断文本
 * - concatenateEpisodes: 拼接剧集内容
 */

// ==================== 花括号/URL 编码 ====================

/**
 * 为文本添加封装前缀/后缀。
 *
 * @param text - 要封装的文本
 * @param affix - 封装类型：brace 为花括号，url 为 URL 编码花括号，none 不封装
 * @returns 封装后的文本
 */
export function addAffix(text: string, affix: 'brace' | 'url' | 'none' = 'brace'): string {
  if (affix === 'brace') {
    return `{${text}}`
  }
  if (affix === 'url') {
    return encodeURIComponent(`{${text}}`)
  }
  return text
}

/**
 * 移除文本的封装前缀/后缀。
 *
 * @param text - 已封装的文本
 * @param affix - 封装类型：brace 为花括号，url 为 URL 编码花括号，none 不处理
 * @returns 解封后的文本
 */
export function removeAffix(text: string, affix: 'brace' | 'url' | 'none' = 'brace'): string {
  if (affix === 'brace') {
    return text.slice(1, -1)
  }
  if (affix === 'url') {
    return decodeURIComponent(text).slice(1, -1)
  }
  return text
}

// ==================== 代码注释移除 ====================

/**
 * 移除代码中的 # 行注释（Python/Shell 风格）。
 * 保留字符串内的 # 字符。
 *
 * @param code - 源代码字符串
 * @returns 移除注释后的代码
 */
export function removeComments(code: string): string {
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#.*?$)/gm
  const result = code.replace(pattern, (_, str, _comment) => {
    if (str !== undefined) {
      return str
    }
    return ''
  })
  return result.split('\n').map(s => s.trimEnd()).filter(s => s.trim()).join('\n')
}

// ==================== Markdown JSON 提取 ====================

/**
 * 从 Markdown 文本中提取 ```json 代码块内容。
 * 如果没有 ```json 块，则返回包含整个文本的数组。
 *
 * @param markdownText - Markdown 文本
 * @returns 提取的 JSON 代码块内容列表（已去除首尾空白）
 */
export function parseJsonCodeBlock(markdownText: string): string[] {
  if (!markdownText.includes('```json')) {
    return [markdownText.trim()]
  }
  const blocks = markdownText.match(/```json([\s\S]*?)```/g) || []
  return blocks.map(block => {
    const match = block.match(/```json([\s\S]*?)```/)
    return match ? match[1].trim() : block.trim()
  })
}

/**
 * 将 Unicode 转义序列解码为实际字符。
 * 例如: "hello\\u4e16\\u754c" → "hello世界"
 */
export function decodeUnicodeEscape(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
}

/**
 * 将段落按标点符号分割为多个子段落。
 * 先用 sep 中的分隔符尝试分割，如果分割后段数<=1则按字符数均分。
 *
 * @param paragraph - 要分割的段落
 * @param sep - 分隔符字符集合（默认 ".,"）
 * @param count - 目标分割数（默认 2）
 * @returns 分割后的段落列表
 */
export function splitParagraph(paragraph: string, sep = '.,', count = 2): string[] {
  for (const s of sep) {
    const sentences = Array.from(splitTextWithEnds(paragraph, s))
    if (sentences.length <= 1) continue
    return splitByCount(sentences, count).map(parts => parts.join(''))
  }
  return splitByCount(Array.from(splitToChars(paragraph)), count).map(parts => parts.join(''))
}

function splitByCount<T>(items: T[], count: number): T[][] {
  const avg = Math.floor(items.length / count)
  const remainder = items.length % count
  const result: T[][] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const end = start + avg + (i < remainder ? 1 : 0)
    result.push(items.slice(start, end))
    start = end
  }
  return result
}

function* splitTextWithEnds(text: string, sep = '.'): Generator<string, void, unknown> {
  const parts: string[] = []
  for (const ch of text) {
    parts.push(ch)
    if (ch === sep) {
      yield parts.join('')
      parts.length = 0
    }
  }
  if (parts.length > 0) {
    yield parts.join('')
  }
}

function splitToChars(s: string): string[] {
  return Array.from(s)
}

// ==================== 句子截断与剧集拼接 ====================

/**
 * 按句子边界智能截断文本。
 * 尝试在 max_chars 前最近的句号/感叹号/问号后截断，
 * 如果找不到句子边界则直接按字符数截断。
 *
 * @param text - 要截断的文本
 * @param maxChars - 最大字符数
 * @returns 截断后的文本
 */
export function truncateAtSentence(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text

  const truncated = text.slice(0, maxChars)
  const sentencePattern = /[.!?](?:\s|$)/g
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = sentencePattern.exec(truncated)) !== null) {
    matches.push(m)
  }

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return text.slice(0, lastMatch.index + lastMatch[0].length).trim()
  }

  return truncated.trim()
}

/**
 * 拼接剧集内容，每个剧集前加 [Episode N] 头。
 * 单个剧集直接返回内容，多个剧集用双换行分隔。
 *
 * @param episodes - 剧集列表，每项有 content 和可选 valid_at 时间戳
 * @returns 拼接后的文本
 */
export function concatenateEpisodes(
  episodes: { content: string; valid_at?: string }[],
): string {
  if (episodes.length === 1) {
    return episodes[0].content
  }
  const parts: string[] = []
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]
    const timestamp = ep.valid_at ?? 'unknown'
    parts.push(`[Episode ${i}] (timestamp: ${timestamp})\n${ep.content}`)
  }
  return parts.join('\n\n')
}
