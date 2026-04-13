import type {
  BetaContentBlock,
  BetaWebSearchTool20250305,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { getAPIProvider } from '../../../../utils/model/providers.js'
import type { PermissionResult } from '../../../../utils/permissions/PermissionResult.js'
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { queryModelWithStreaming } from '../../../services/api/claude.js'
import { buildTool, type ToolDef } from '../../../Tool.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import { logError } from '../../../utils/log.js'
import { createUserMessage } from '../../../utils/messages.js'
import { getMainLoopModel, getSmallFastModel } from '../../../utils/model/model.js'
import { jsonParse, jsonStringify } from '../../../utils/slowOperations.js'
import { asSystemPrompt } from '../../../utils/systemPromptType.js'
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('搜索查询关键）),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe('仅包含这些域名的搜索结果'),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe('不包含这些域名的搜索结果'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

type Input = z.infer<InputSchema>

const searchResultSchema = lazySchema(() => {
  const searchHitSchema = z.object({
    title: z.string().describe('搜索结果标题'),
    url: z.string().describe('搜索结果 URL'),
  })

  return z.object({
    tool_use_id: z.string().describe('工具使用）ID'),
    content: z.array(searchHitSchema).describe('搜索结果数组'),
  })
})

export type SearchResult = z.infer<ReturnType<typeof searchResultSchema>>

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('已执行的搜索查询'),
    results: z
      .array(z.union([searchResultSchema(), z.string()]))
      .describe('搜索结果）或模型的文本评论'),
    durationSeconds: z
      .number()
      .describe('完成搜索操作的耗时'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// 重新导出 WebSearchProgress 以打破循环依。
export type { WebSearchProgress } from '../../../types/tools.js'

import type { WebSearchProgress } from '../../../types/tools.js'

function makeToolSchema(input: Input): BetaWebSearchTool20250305 {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    allowed_domains: input.allowed_domains,
    blocked_domains: input.blocked_domains,
    max_uses: 8, // 硬编码最）8 次搜。
  }
}

function makeOutputFromSearchResponse(
  result: BetaContentBlock[],
  query: string,
  durationSeconds: number,
): Output {
  // 结果是以下块的序列：
  // - 开头的文本））总是存在。
  // [
  //    - server_tool_use
  //    - web_search_tool_result
  //    - 文本和引用块交错
  //  ]+ （每次搜索重复此块）

  const results: (SearchResult | string)[] = []
  let textAcc = ''
  let inText = true

  for (const block of result) {
    if (block.type === 'server_tool_use') {
      if (inText) {
        inText = false
        if (textAcc.trim().length > 0) {
          results.push(textAcc.trim())
        }
        textAcc = ''
      }
      continue
    }

    if (block.type === 'web_search_tool_result') {
      // 处理错误情况 ）content ）WebSearchToolResultError 类型
      if (!Array.isArray(block.content)) {
        const errorMessage = `网络搜索错误）{block.content.error_code}`
        logError(new Error(errorMessage))
        results.push(errorMessage)
        continue
      }
      // 成功情况 ）将结果添加到集合。
      const hits = block.content.map(r => ({ title: r.title, url: r.url }))
      results.push({
        tool_use_id: block.tool_use_id,
        content: hits,
      })
    }

    if (block.type === 'text') {
      if (inText) {
        textAcc += block.text
      } else {
        inText = true
        textAcc = block.text
      }
    }
  }

  if (textAcc.length) {
    results.push(textAcc.trim())
  }

  return {
    query,
    results,
    durationSeconds,
  }
}

export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: '搜索网页获取当前信息',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    return `Claude 想搜索网页：${input.query}`
  },
  userFacingName() {
    return '网页搜索'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在搜索 ${summary}` : '正在搜索网络'
  },
  isEnabled() {
    const provider = getAPIProvider()
    const model = getMainLoopModel()

    // ）firstParty 启用
    if (provider === 'firstParty') {
      return true
    }

    // 为支持模型的 Vertex AI 启用（Claude 4.0+。
    if (provider === 'vertex') {
      const supportsWebSearch =
        model.includes('claude-opus-4') ||
        model.includes('claude-sonnet-4') ||
        model.includes('claude-haiku-4')

      return supportsWebSearch
    }

    // Foundry 仅提供已支持网络搜索的模。
    if (provider === 'foundry') {
      return true
    }

    return false
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  async checkPermissions(_input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool 需要权限）,
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    }
  },
  async prompt() {
    return getWebSearchPrompt()
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  extractSearchText() {
    // renderToolResultMessage 只显示“已完成 N 次搜索，用时 X 秒”的边框 。
    // results[] 的内容从不显示在屏幕上。启发式方法会索）results[] 中的字符串条目（幻影匹配）。
    // 没有可搜索的内容。
    return ''
  },
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    if (!query.length) {
      return {
        result: false,
        message: '错误：缺少查）,
        errorCode: 1,
      }
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message:
          '错误：不能在同一请求中同时指定允许和阻止的域）,
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const startTime = performance.now()
    const { query } = input
    const userMessage = createUserMessage({
      content: '正在执行网络搜索。 + query,
    })
    const toolSchema = makeToolSchema(input)

    const useHaiku = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_plum_vx3',
      false,
    )

    const appState = context.getAppState()
    const queryStream = queryModelWithStreaming({
      messages: [userMessage],
      systemPrompt: asSystemPrompt([
        '你是一个执行网络搜索工具使用的助手',
      ]),
      thinkingConfig: useHaiku
        ? { type: 'disabled' as const }
        : context.options.thinkingConfig,
      tools: [],
      signal: context.abortController.signal,
      options: {
        getToolPermissionContext: async () => appState.toolPermissionContext,
        model: useHaiku ? getSmallFastModel() : context.options.mainLoopModel,
        toolChoice: useHaiku ? { type: 'tool', name: 'web_search' } : undefined,
        isNonInteractiveSession: context.options.isNonInteractiveSession,
        hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
        extraToolSchemas: [toolSchema],
        querySource: 'web_search_tool',
        agents: context.options.agentDefinitions.activeAgents,
        mcpTools: [],
        agentId: context.agentId,
        effortValue: appState.effortValue,
      },
    })

    const allContentBlocks: BetaContentBlock[] = []
    let currentToolUseId = null
    let currentToolUseJson = ''
    let progressCounter = 0
    const toolUseQueries = new Map() // 映射 tool_use_id 到查询词

    for await (const event of queryStream) {
      if (event.type === 'assistant') {
        allContentBlocks.push(...event.message.content)
        continue
      }

      // ）server_tool_use 开始时跟踪工具使用 ID
      if (
        event.type === 'stream_event' &&
        event.event?.type === 'content_block_start'
      ) {
        const contentBlock = event.event.content_block
        if (contentBlock && contentBlock.type === 'server_tool_use') {
          currentToolUseId = contentBlock.id
          currentToolUseJson = ''
          // 注意：ServerToolUseBlock 不包）input.query
          // 实际的查询词通过 input_json_delta 事件传。
          continue
        }
      }

      // 累积当前工具使用）JSON
      if (
        currentToolUseId &&
        event.type === 'stream_event' &&
        event.event?.type === 'content_block_delta'
      ) {
        const delta = event.event.delta
        if (delta?.type === 'input_json_delta' && delta.partial_json) {
          currentToolUseJson += delta.partial_json

          // 尝试从部）JSON 中提取查询词用于进度更新
          try {
            // 查找完整）query 字段
            const queryMatch = currentToolUseJson.match(
              /"query"\s*:\s*"((?:[^"\\]|\\.)*)"/,
            )
            if (queryMatch && queryMatch[1]) {
              // 正则表达式正确处理了转义字符
              const query = jsonParse('"' + queryMatch[1] + '"')

              if (
                !toolUseQueries.has(currentToolUseId) ||
                toolUseQueries.get(currentToolUseId) !== query
              ) {
                toolUseQueries.set(currentToolUseId, query)
                progressCounter++
                if (onProgress) {
                  onProgress({
                    toolUseID: `search-progress-${progressCounter}`,
                    data: {
                      type: 'query_update',
                      query,
                    },
                  })
                }
              }
            }
          } catch {
            // 忽略部分 JSON 的解析错。
          }
        }
      }

      // 当搜索结果到达时产生进度
      if (
        event.type === 'stream_event' &&
        event.event?.type === 'content_block_start'
      ) {
        const contentBlock = event.event.content_block
        if (contentBlock && contentBlock.type === 'web_search_tool_result') {
          // 获取此次搜索使用的实际查询词
          const toolUseId = contentBlock.tool_use_id
          const actualQuery = toolUseQueries.get(toolUseId) || query
          const content = contentBlock.content

          progressCounter++
          if (onProgress) {
            onProgress({
              toolUseID: toolUseId || `search-progress-${progressCounter}`,
              data: {
                type: 'search_results_received',
                resultCount: Array.isArray(content) ? content.length : 0,
                query: actualQuery,
              },
            })
          }
        }
      }
    }

    // 处理最终结。
    const endTime = performance.now()
    const durationSeconds = (endTime - startTime) / 1000

    const data = makeOutputFromSearchResponse(
      allContentBlocks,
      query,
      durationSeconds,
    )
    return { data }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results } = output

    let formattedOutput = `查询 "${query}" 的网络搜索结果：\n\n`

    // 处理 results 数组 —）它可能包含字符串摘要和搜索结果对象。
    // 防止 JSON 往返（例如压缩或对话反序列化）后出现的 null/undefined 条目。
    ;(results ?? []).forEach(result => {
      if (result == null) {
        return
      }
      if (typeof result === 'string') {
        // 文本摘要
        formattedOutput += result + '\n\n'
      } else {
        // 带链接的搜索结果
        if (result.content?.length > 0) {
          formattedOutput += `链接）{jsonStringify(result.content)}\n\n`
        } else {
          formattedOutput += '未找到链接。\n\n'
        }
      }
    })

    formattedOutput +=
      '\n提醒：你必须在回复中使用 Markdown 超链接包含上述来源。

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    }
  },
} satisfies ToolDef<InputSchema, Output, WebSearchProgress>)