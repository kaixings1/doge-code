import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import memoize from 'lodash-es/memoize.js'
import { z } from 'zod/v4'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import {
  buildTool,
  findToolByName,
  type Tool,
  type ToolDef,
  type Tools,
} from '../../../Tool.js'
import { logForDebugging } from '../../../utils/debug.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import { escapeRegExp } from '../../../utils/stringUtils.js'
import { isToolSearchEnabledOptimistic } from '../../../utils/toolSearch.js'
import { getPrompt, isDeferredTool, TOOL_SEARCH_TOOL_NAME } from './prompt.js'

export const inputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .describe(
        '查询以查找延迟工具。使）"select:<tool_name>" 进行直接选择，或使用关键词进行搜索）,
      ),
    max_results: z
      .number()
      .optional()
      .default(5)
      .describe('返回的最大结果数（默）5）),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    matches: z.array(z.string()),
    query: z.string(),
    total_deferred_tools: z.number(),
    pending_mcp_servers: z.array(z.string()).optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// 跟踪延迟工具名称，以检测何时应清除缓存
let cachedDeferredToolNames: string | null = null

/**
 * 获取表示当前延迟工具集的缓存键。
 */
function getDeferredToolsCacheKey(deferredTools: Tools): string {
  return deferredTools
    .map(t => t.name)
    .sort()
    .join(',')
}

/**
 * 获取工具描述，按工具名称记忆化。
 * 用于关键词搜索评分。
 */
const getToolDescriptionMemoized = memoize(
  async (toolName: string, tools: Tools): Promise<string> => {
    const tool = findToolByName(tools, toolName)
    if (!tool) {
      return ''
    }
    return tool.prompt({
      getToolPermissionContext: async () => ({
        mode: 'default' as const,
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      }),
      tools,
      agents: [],
    })
  },
  (toolName: string) => toolName,
)

/**
 * 如果延迟工具集发生变化，使描述缓存失效。
 */
function maybeInvalidateCache(deferredTools: Tools): void {
  const currentKey = getDeferredToolsCacheKey(deferredTools)
  if (cachedDeferredToolNames !== currentKey) {
    logForDebugging(
      `ToolSearchTool: 缓存已失）- 延迟工具集发生变化`,
    )
    getToolDescriptionMemoized.cache.clear?.()
    cachedDeferredToolNames = currentKey
  }
}

export function clearToolSearchDescriptionCache(): void {
  getToolDescriptionMemoized.cache.clear?.()
  cachedDeferredToolNames = null
}

/**
 * 构建搜索结果输出结构。
 */
function buildSearchResult(
  matches: string[],
  query: string,
  totalDeferredTools: number,
  pendingMcpServers?: string[],
): { data: Output } {
  return {
    data: {
      matches,
      query,
      total_deferred_tools: totalDeferredTools,
      ...(pendingMcpServers && pendingMcpServers.length > 0
        ? { pending_mcp_servers: pendingMcpServers }
        : {}),
    },
  }
}

/**
 * 将工具名称解析为可搜索的部分。
 * 处理 MCP 工具（mcp__server__action）和常规工具（驼峰命名）。
 */
function parseToolName(name: string): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  // 检查是否为 MCP 工具
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix.split('__').flatMap(p => p.split('_'))
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  // 常规工具 - 按驼峰命名和下划线拆。
  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // 驼峰转空。
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return {
    parts,
    full: parts.join(' '),
    isMcp: false,
  }
}

/**
 * 为所有搜索词预编译单词边界正则表达式。
 * 每次搜索调用一次，而不）tools×terms×2 次。
 */
function compileTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`))
    }
  }
  return patterns
}

/**
 * 基于关键词搜索工具名称和描述。
 * 处理 MCP 工具（mcp__server__action）和常规工具（驼峰命名）。
 *
 * 模型通常使用以下方式查询。
 * - 当知道集成时使用服务器名称（）"slack"）github"。
 * - 查找功能时使用动作词（如 "read"）list"）create"。
 * - 工具特定术语（如 "notebook"）shell"）kill"。
 */
async function searchToolsWithKeywords(
  query: string,
  deferredTools: Tools,
  tools: Tools,
  maxResults: number,
): Promise<string[]> {
  const queryLower = query.toLowerCase().trim()

  // 快速路径：如果查询精确匹配某个工具名称，直接返回。
  // 处理模型使用裸工具名称而不）select: 前缀的情况（见于子代）压缩后）。
  // 先检查延迟工具，再回退到完整工具集 —）选择一个已加载的工具是无害的空操作。
  // 让模型无需重试即可继续。
  const exactMatch =
    deferredTools.find(t => t.name.toLowerCase() === queryLower) ??
    tools.find(t => t.name.toLowerCase() === queryLower)
  if (exactMatch) {
    return [exactMatch.name]
  }

  // 如果查询看起来像 MCP 工具前缀（mcp__server），找到匹配的工具。
  // 处理模型使用 mcp__ 前缀按服务器名称搜索的情况。
  if (queryLower.startsWith('mcp__') && queryLower.length > 5) {
    const prefixMatches = deferredTools
      .filter(t => t.name.toLowerCase().startsWith(queryLower))
      .slice(0, maxResults)
      .map(t => t.name)
    if (prefixMatches.length > 0) {
      return prefixMatches
    }
  }

  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0)

  // 将查询词划分为必需）前缀）和可选部。
  const requiredTerms: string[] = []
  const optionalTerms: string[] = []
  for (const term of queryTerms) {
    if (term.startsWith('+') && term.length > 1) {
      requiredTerms.push(term.slice(1))
    } else {
      optionalTerms.push(term)
    }
  }

  const allScoringTerms =
    requiredTerms.length > 0 ? [...requiredTerms, ...optionalTerms] : queryTerms
  const termPatterns = compileTermPatterns(allScoringTerms)

  // 预过滤：仅保留在名称或描述中匹配所有必需词的工具
  let candidateTools = deferredTools
  if (requiredTerms.length > 0) {
    const matches = await Promise.all(
      deferredTools.map(async tool => {
        const parsed = parseToolName(tool.name)
        const description = await getToolDescriptionMemoized(tool.name, tools)
        const descNormalized = description.toLowerCase()
        const hintNormalized = tool.searchHint?.toLowerCase() ?? ''
        const matchesAll = requiredTerms.every(term => {
          const pattern = termPatterns.get(term)!
          return (
            parsed.parts.includes(term) ||
            parsed.parts.some(part => part.includes(term)) ||
            pattern.test(descNormalized) ||
            (hintNormalized && pattern.test(hintNormalized))
          )
        })
        return matchesAll ? tool : null
      }),
    )
    candidateTools = matches.filter((t): t is Tool => t !== null)
  }

  const scored = await Promise.all(
    candidateTools.map(async tool => {
      const parsed = parseToolName(tool.name)
      const description = await getToolDescriptionMemoized(tool.name, tools)
      const descNormalized = description.toLowerCase()
      const hintNormalized = tool.searchHint?.toLowerCase() ?? ''

      let score = 0
      for (const term of allScoringTerms) {
        const pattern = termPatterns.get(term)!

        // 精确部分匹配（MCP 服务器名称、工具名称部分权重高。
        if (parsed.parts.includes(term)) {
          score += parsed.isMcp ? 12 : 10
        } else if (parsed.parts.some(part => part.includes(term))) {
          score += parsed.isMcp ? 6 : 5
        }

        // 完整名称后备（边缘情况）
        if (parsed.full.includes(term) && score === 0) {
          score += 3
        }

        // searchHint 匹配 —）精选的功能短语，比提示信号更强
        if (hintNormalized && pattern.test(hintNormalized)) {
          score += 4
        }

        // 描述匹配 —）使用单词边界避免误报
        if (pattern.test(descNormalized)) {
          score += 2
        }
      }

      return { name: tool.name, score }
    }),
  )

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.name)
}

export const ToolSearchTool = buildTool({
  isEnabled() {
    return isToolSearchEnabledOptimistic()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  name: TOOL_SEARCH_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() {
    return getPrompt()
  },
  async prompt() {
    return getPrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call(input, { options: { tools }, getAppState }) {
    const { query, max_results = 5 } = input

    const deferredTools = tools.filter(isDeferredTool)
    maybeInvalidateCache(deferredTools)

    // 检查仍在连接中）MCP 服务。
    function getPendingServerNames(): string[] | undefined {
      const appState = getAppState()
      const pending = appState.mcp.clients.filter(c => c.type === 'pending')
      return pending.length > 0 ? pending.map(s => s.name) : undefined
    }

    // 辅助函数：记录搜索结。
    function logSearchOutcome(
      matches: string[],
      queryType: 'select' | 'keyword',
    ): void {
      logEvent('tengu_tool_search_outcome', {
        query:
          query as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        queryType:
          queryType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        matchCount: matches.length,
        totalDeferredTools: deferredTools.length,
        maxResults: max_results,
        hasMatches: matches.length > 0,
      })
    }

    // 检）select: 前缀 —）直接选择工具。
    // 支持逗号分隔的多选：`select:A,B,C`。
    // 如果名称不在延迟工具集中，但在完整工具集中，
    // 我们仍然返回）—）该工具已经加载，因此“选择”它是无害的空操作，
    // 让模型无需重试即可继续。
    const selectMatch = query.match(/^select:(.+)$/i)
    if (selectMatch) {
      const requested = selectMatch[1]!
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const found: string[] = []
      const missing: string[] = []
      for (const toolName of requested) {
        const tool =
          findToolByName(deferredTools, toolName) ??
          findToolByName(tools, toolName)
        if (tool) {
          if (!found.includes(tool.name)) found.push(tool.name)
        } else {
          missing.push(toolName)
        }
      }

      if (found.length === 0) {
        logForDebugging(
          `ToolSearchTool: 选择失败 ）未找到任何工。 ${missing.join(', ')}`,
        )
        logSearchOutcome([], 'select')
        const pendingServers = getPendingServerNames()
        return buildSearchResult(
          [],
          query,
          deferredTools.length,
          pendingServers,
        )
      }

      if (missing.length > 0) {
        logForDebugging(
          `ToolSearchTool: 部分选择成功 ）已找。 ${found.join(', ')}, 未找。 ${missing.join(', ')}`,
        )
      } else {
        logForDebugging(`ToolSearchTool: 已选择 ${found.join(', ')}`)
      }
      logSearchOutcome(found, 'select')
      return buildSearchResult(found, query, deferredTools.length)
    }

    // 关键词搜。
    const matches = await searchToolsWithKeywords(
      query,
      deferredTools,
      tools,
      max_results,
    )

    logForDebugging(
      `ToolSearchTool: 关键词搜）"${query}"，找）${matches.length} 个匹配项`,
    )

    logSearchOutcome(matches, 'keyword')

    // 当搜索无匹配时，包含待处理的服务器信。
    if (matches.length === 0) {
      const pendingServers = getPendingServerNames()
      return buildSearchResult(
        matches,
        query,
        deferredTools.length,
        pendingServers,
      )
    }

    return buildSearchResult(matches, query, deferredTools.length)
  },
  renderToolUseMessage() {
    return null
  },
  userFacingName: () => '',
  /**
   * 返回带有 tool_reference 块的 tool_result。
   * 此格式适用）1P/Foundry。Bedrock/Vertex 可能尚不支持客户）tool_reference 扩展。
   */
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.matches.length === 0) {
      let text = '未找到匹配的延迟工具'
      if (
        content.pending_mcp_servers &&
        content.pending_mcp_servers.length > 0
      ) {
        text += `。部）MCP 服务器仍在连接中）{content.pending_mcp_servers.join(', ')}。它们的工具将很快可）—）请稍后再次搜索。`
      }
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: text,
      }
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: content.matches.map(name => ({
        type: 'tool_reference' as const,
        tool_name: name,
      })),
    } as unknown as ToolResultBlockParam
  },
} satisfies ToolDef<InputSchema, Output>)