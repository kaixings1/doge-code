import { z } from 'zod/v4'
import {
  ensureConnectedClient,
  fetchResourcesForClient,
} from '../../../services/mcp/client.js'
import { buildTool, type ToolDef } from '../../../Tool.js'
import { errorMessage } from '../../../utils/errors.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import { logMCPError } from '../../../utils/log.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { isOutputLineTruncated } from '../../../utils/terminal.js'
import { DESCRIPTION, LIST_MCP_RESOURCES_TOOL_NAME, PROMPT } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.object({
    server: z
      .string()
      .optional()
      .describe('可选的服务器名称用于过滤资）),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.array(
    z.object({
      uri: z.string().describe('资源 URI'),
      name: z.string().describe('资源名称'),
      mimeType: z.string().optional().describe('资源）MIME 类型'),
      description: z.string().optional().describe('资源描述'),
      server: z.string().describe('提供此资源的服务）),
    }),
  ),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ListMcpResourcesTool = buildTool({
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.server ?? ''
  },
  shouldDefer: true,
  name: LIST_MCP_RESOURCES_TOOL_NAME,
  searchHint: '列出已连）MCP 服务器的资源',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call(input, { options: { mcpClients } }) {
    const { server: targetServer } = input

    const clientsToProcess = targetServer
      ? mcpClients.filter(client => client.name === targetServer)
      : mcpClients

    if (targetServer && clientsToProcess.length === 0) {
      throw new Error(
        `Server "${targetServer}" not found. Available servers: ${mcpClients.map(c => c.name).join(', ')}`,
      )
    }

    // fetchResourcesForClient is LRU-cached (by server name) and already
    // warm from startup prefetch. Cache is invalidated on onclose and on
    // resources/list_changed notifications, so results are never stale.
    // ensureConnectedClient is a no-op when healthy (memoize hit), but after
    // onclose it returns a fresh connection so the re-fetch succeeds.
    const results = await Promise.all(
      clientsToProcess.map(async client => {
        if (client.type !== 'connected') return []
        try {
          const fresh = await ensureConnectedClient(client)
          return await fetchResourcesForClient(fresh)
        } catch (error) {
          // One server's reconnect failure shouldn't sink the whole result.
          logMCPError(client.name, errorMessage(error))
          return []
        }
      }),
    )

    return {
      data: results.flat(),
    }
  },
  renderToolUseMessage,
  userFacingName: () => 'listMcpResources',
  renderToolResultMessage,
  isResultTruncated(output: Output): boolean {
    return isOutputLineTruncated(jsonStringify(output))
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    if (!content || content.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content:
          '未找到资源。即使没有资源，MCP 服务器仍可能提供工具）,
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(content),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
