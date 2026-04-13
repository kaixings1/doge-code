import type { LogOption, SerializedMessage } from '../types/logs.js'
import { count } from './array.js'
import { logForDebugging } from './debug.js'
import { getLogDisplayTitle, logError } from './log.js'
import { getSmallFastModel } from './model/model.js'
import { isLiteLog, loadFullLog } from './sessionStorage.js'
import { sideQuery } from './sideQuery.js'
import { jsonParse } from './slowOperations.js'

// Limits for transcript extraction
const MAX_TRANSCRIPT_CHARS = 2000 // Max chars of transcript per session
const MAX_MESSAGES_TO_SCAN = 100 // Max messages to scan from start/end
const MAX_SESSIONS_TO_SEARCH = 100 // Max sessions to send to the API

const SESSION_SEARCH_SYSTEM_PROMPT = `你的目标是根据用户的搜索查询找到相关的会话�?

你将收到一份会话列表（包含元数据）和一个搜索查询。请识别哪些会话与查询最相关�?

每个会话可能包含�?
- 标题（显示名称或自定义标题）
- 标签（用户分配的分类，显示为 [tag: name] —�?用户通过 /tag 命令为会话打标签进行分类�?
- 分支（git 分支名，显示�?[branch: name]�?
- 摘要（AI 生成的摘要）
- 首条消息（对话开头）
- 转录（对话内容摘录）

重要提示：标签是用户分配的标签，表示会话的主题或类别。如果查询与某个标签完全或部分匹配，这些会话应被高度优先处理�?

对每个会话，按以下优先级考虑�?
1. 精确标签匹配（最高优先级——用户已明确标记此会话）
2. 部分标签匹配或标签相关词�?
3. 标题匹配（自定义标题或首条消息内容）
4. 分支名称匹配
5. 摘要和转录内容匹�?
6. 语义相似性和相关概念

关键：匹配范围要非常广泛。包含以下会话：
- 在任何字段中包含查询词的任何地方
- 与查询语义相关的会话（例�?测试"匹配关于"tests"�?unit tests"�?QA"等的会话�?
- 讨论可能与查询相关的话题
- 转录中即使只是顺便提到的概念

如果不确定，请包含该会话。返回太多结果比返回太少好。用户可以轻松浏览结果，但遗漏相关会话会令人沮丧�?

返回按相关性排序的会话（最相关的排在前面）。如果确实没有任何会话与查询有任何关联，则返回空数组——但这应该是罕见的�?

仅回�?JSON 对象，不使用 Markdown 格式�?
{"relevant_indices": [2, 5, 0]}

**你必须始终用中文回复�?*`

type AgenticSearchResult = {
  relevant_indices: number[]
}

/**
 * Extracts searchable text content from a message.
 */
function extractMessageText(message: SerializedMessage): string {
  if (message.type !== 'user' && message.type !== 'assistant') {
    return ''
  }

  const content = 'message' in message ? message.message?.content : undefined
  if (!content) return ''

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block
        if ('text' in block && typeof block.text === 'string') return block.text
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }

  return ''
}

/**
 * Extracts a truncated transcript from session messages.
 */
function extractTranscript(messages: SerializedMessage[]): string {
  if (messages.length === 0) return ''

  // Take messages from start and end to get context
  const messagesToScan =
    messages.length <= MAX_MESSAGES_TO_SCAN
      ? messages
      : [
          ...messages.slice(0, MAX_MESSAGES_TO_SCAN / 2),
          ...messages.slice(-MAX_MESSAGES_TO_SCAN / 2),
        ]

  const text = messagesToScan
    .map(extractMessageText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > MAX_TRANSCRIPT_CHARS
    ? text.slice(0, MAX_TRANSCRIPT_CHARS) + '�?
    : text
}

/**
 * Checks if a log contains the query term in any searchable field.
 */
function logContainsQuery(log: LogOption, queryLower: string): boolean {
  // Check title
  const title = getLogDisplayTitle(log).toLowerCase()
  if (title.includes(queryLower)) return true

  // Check custom title
  if (log.customTitle?.toLowerCase().includes(queryLower)) return true

  // Check tag
  if (log.tag?.toLowerCase().includes(queryLower)) return true

  // Check branch
  if (log.gitBranch?.toLowerCase().includes(queryLower)) return true

  // Check summary
  if (log.summary?.toLowerCase().includes(queryLower)) return true

  // Check first prompt
  if (log.firstPrompt?.toLowerCase().includes(queryLower)) return true

  // Check transcript (more expensive, do last)
  if (log.messages && log.messages.length > 0) {
    const transcript = extractTranscript(log.messages).toLowerCase()
    if (transcript.includes(queryLower)) return true
  }

  return false
}

/**
 * Performs an agentic search using Claude to find relevant sessions
 * based on semantic understanding of the query.
 */
export async function agenticSessionSearch(
  query: string,
  logs: LogOption[],
  signal?: AbortSignal,
): Promise<LogOption[]> {
  if (!query.trim() || logs.length === 0) {
    return []
  }

  const queryLower = query.toLowerCase()

  // Pre-filter: find sessions that contain the query term
  // This ensures we search relevant sessions, not just recent ones
  const matchingLogs = logs.filter(log => logContainsQuery(log, queryLower))

  // Take up to MAX_SESSIONS_TO_SEARCH matching logs
  // If fewer matches, fill remaining slots with recent non-matching logs for context
  let logsToSearch: LogOption[]
  if (matchingLogs.length >= MAX_SESSIONS_TO_SEARCH) {
    logsToSearch = matchingLogs.slice(0, MAX_SESSIONS_TO_SEARCH)
  } else {
    const nonMatchingLogs = logs.filter(
      log => !logContainsQuery(log, queryLower),
    )
    const remainingSlots = MAX_SESSIONS_TO_SEARCH - matchingLogs.length
    logsToSearch = [
      ...matchingLogs,
      ...nonMatchingLogs.slice(0, remainingSlots),
    ]
  }

  // Debug: log what data we have
  logForDebugging(
    `Agentic search: ${logsToSearch.length}/${logs.length} logs, query="${query}", ` +
      `matching: ${matchingLogs.length}, with messages: ${count(logsToSearch, l => l.messages?.length > 0)}`,
  )

  // Load full logs for lite logs to get transcript content
  const logsWithTranscriptsPromises = logsToSearch.map(async log => {
    if (isLiteLog(log)) {
      try {
        return await loadFullLog(log)
      } catch (error) {
        logError(error as Error)
        // If loading fails, use the lite log (no transcript)
        return log
      }
    }
    return log
  })
  const logsWithTranscripts = await Promise.all(logsWithTranscriptsPromises)

  logForDebugging(
    `Agentic search: loaded ${count(logsWithTranscripts, l => l.messages?.length > 0)}/${logsToSearch.length} logs with transcripts`,
  )

  // Build session list for the prompt with all searchable metadata
  const sessionList = logsWithTranscripts
    .map((log, index) => {
      const parts: string[] = [`${index}:`]

      // Title (display title, may be custom or from first prompt)
      const displayTitle = getLogDisplayTitle(log)
      parts.push(displayTitle)

      // Custom title if different from display title
      if (log.customTitle && log.customTitle !== displayTitle) {
        parts.push(`[custom title: ${log.customTitle}]`)
      }

      // Tag
      if (log.tag) {
        parts.push(`[tag: ${log.tag}]`)
      }

      // Git branch
      if (log.gitBranch) {
        parts.push(`[branch: ${log.gitBranch}]`)
      }

      // Summary
      if (log.summary) {
        parts.push(`- Summary: ${log.summary}`)
      }

      // First prompt content (truncated)
      if (log.firstPrompt && log.firstPrompt !== '无提示词') {
        parts.push(`- First message: ${log.firstPrompt.slice(0, 300)}`)
      }

      // Transcript excerpt (if messages are available)
      if (log.messages && log.messages.length > 0) {
        const transcript = extractTranscript(log.messages)
        if (transcript) {
          parts.push(`- Transcript: ${transcript}`)
        }
      }

      return parts.join(' ')
    })
    .join('\n')

  const userMessage = `Sessions:
${sessionList}

Search query: "${query}"

Find the sessions that are most relevant to this query.`

  // Debug: log first part of the session list
  logForDebugging(
    `Agentic search prompt (first 500 chars): ${userMessage.slice(0, 500)}...`,
  )

  try {
    const model = getSmallFastModel()
    logForDebugging(`Agentic search using model: ${model}`)

    const response = await sideQuery({
      model,
      system: SESSION_SEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      signal,
      querySource: 'session_search',
    })

    // Extract the text content from the response
    const textContent = response.content.find(block => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      logForDebugging('聚合搜索响应中无文本内容')
      return []
    }

    // Debug: log the response
    logForDebugging(`Agentic search response: ${textContent.text}`)

    // Parse the JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logForDebugging('Could not find JSON in agentic search response')
      return []
    }

    const result: AgenticSearchResult = jsonParse(jsonMatch[0])
    const relevantIndices = result.relevant_indices || []

    // Map indices back to logs (indices are relative to logsWithTranscripts)
    const relevantLogs = relevantIndices
      .filter(index => index >= 0 && index < logsWithTranscripts.length)
      .map(index => logsWithTranscripts[index]!)

    logForDebugging(
      `Agentic search found ${relevantLogs.length} relevant sessions`,
    )

    return relevantLogs
  } catch (error) {
    logError(error as Error)
    logForDebugging(`Agentic search error: ${error}`)
    return []
  }
}
