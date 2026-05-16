import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type ListToolsResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import review from '../commands/review.js'
import type { Command } from '../commands.js'
import {
  findToolByName,
  getEmptyToolPermissionContext,
  type ToolUseContext,
} from '../Tool.js'
import { getTools } from '../tools.js'
import { createAbortController } from '../utils/abortController.js'
import { createFileStateCacheWithSizeLimit } from '../utils/fileStateCache.js'
import { logError } from '../utils/log.js'
import { createAssistantMessage } from '../utils/messages.js'
import { getMainLoopModel } from '../utils/model/model.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'
import { setCwd } from '../utils/Shell.js'
import { jsonStringify } from '../utils/slowOperations.js'
import { getErrorParts } from '../utils/toolErrors.js'
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js'

type ToolInput = Tool['inputSchema']
type ToolOutput = Tool['outputSchema']

const MCP_COMMANDS: Command[] = [review]

export async function startMCPServer(
  cwd: string,
  debug: boolean,
  verbose: boolean,
): Promise<void> {
  // 使用大小限制的 LRU 缓存来防止无界的内存增长
  // 100 个文件和 25MB 限制应足以满足 MCP 服务器操作
  const READ_FILE_STATE_CACHE_SIZE = 100
  const readFileStateCache = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )
  setCwd(cwd)
  const server = new Server(
    {
      name: 'claude/tengu',
      version: MACRO.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => {
      // TODO：也重新暴露任何 MCP 工具
      const toolPermissionContext = getEmptyToolPermissionContext()
      const tools = getTools(toolPermissionContext)
      return {
        tools: await Promise.all(
          tools.map(async tool => {
            let outputSchema: ToolOutput | undefined
            if (tool.outputSchema) {
              const convertedSchema = zodToJsonSchema(tool.outputSchema)
              // MCP SDK 要求 outputSchema 在根级别具有 type: "object"
              // 跳过根级别包含 anyOf/oneOf 的模式（来自 z.union、z.discriminatedUnion 等）
              // 参见：https://github.com/anthropics/claude-code/issues/8014
              if (
                typeof convertedSchema === 'object' &&
                convertedSchema !== null &&
                'type' in convertedSchema &&
                convertedSchema.type === 'object'
              ) {
                outputSchema = convertedSchema as ToolOutput
              }
            }
            return {
              ...tool,
              description: await tool.prompt({
                getToolPermissionContext: async () => toolPermissionContext,
                tools,
                agents: [],
              }),
              inputSchema: zodToJsonSchema(tool.inputSchema) as ToolInput,
              outputSchema,
            }
          }),
        ),
      }
    },
  )

  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params: { name, arguments: args } }): Promise<CallToolResult> => {
      const toolPermissionContext = getEmptyToolPermissionContext()
      // TODO：也重新暴露任何 MCP 工具
      const tools = getTools(toolPermissionContext)
      const tool = findToolByName(tools, name)
      if (!tool) {
        throw new Error(`找不到工具 ${name}`)
      }

      // 假设 MCP 服务器不会独立于工具调用参数来读取消息。
      const toolUseContext: ToolUseContext = {
        abortController: createAbortController(),
        options: {
          commands: MCP_COMMANDS,
          tools,
          mainLoopModel: getMainLoopModel(),
          thinkingConfig: { type: 'disabled' },
          mcpClients: [],
          mcpResources: {},
          isNonInteractiveSession: true,
          debug,
          verbose,
          agentDefinitions: { activeAgents: [], allAgents: [] },
        },
        getAppState: () => getDefaultAppState(),
        setAppState: () => {},
        messages: [],
        readFileState: readFileStateCache,
        setInProgressToolUseIDs: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => {},
        updateAttributionState: () => {},
      }

      // TODO：使用 zod 验证输入类型
      try {
        if (!tool.isEnabled()) {
          throw new Error(`工具 ${name} 未启用`)
        }
        const validationResult = await tool.validateInput?.(
          (args as never) ?? {},
          toolUseContext,
        )
        if (validationResult && !validationResult.result) {
          throw new Error(
            `工具 ${name} 的输入无效：${validationResult.message}`,
          )
        }
        const finalResult = await tool.call(
          (args ?? {}) as never,
          toolUseContext,
          hasPermissionsToUseTool,
          createAssistantMessage({
            content: [],
          }),
        )

        return {
          content: [
            {
              type: 'text' as const,
              text:
                typeof finalResult === 'string'
                  ? finalResult
                  : jsonStringify(finalResult.data),
            },
          ],
        }
      } catch (error) {
        logError(error)

        const parts =
          error instanceof Error ? getErrorParts(error) : [String(error)]
        const errorText = parts.filter(Boolean).join('\n').trim() || 'Error'

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: errorText,
            },
          ],
        }
      }
    },
  )

  async function runServer() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }

  return await runServer()
}
