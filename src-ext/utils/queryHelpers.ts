import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import last from 'lodash-es/last.js'
import {
  getSessionId,
  isSessionPersistenceDisabled,
} from '../bootstrap/state.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { runTools } from '../services/tools/toolOrchestration.js'
import { findToolByName, type Tool, type Tools } from '../Tool.js'
import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import type { Input as FileReadInput } from '../tools/FileReadTool/FileReadTool.js'
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import type { Message } from '../types/message.js'
import type { OrphanedPermission } from '../types/textInputTypes.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import { isFsInaccessible } from './errors.js'
import { getFileModificationTime, stripLineNumberPrefix } from './file.js'
import { readFileSyncWithMetadata } from './fileRead.js'
import {
  createFileStateCacheWithSizeLimit,
  type FileStateCache,
} from './fileStateCache.js'
import { isNotEmptyMessage, normalizeMessages } from './messages.js'
import { expandPath } from './path.js'
import type {
  inputSchema as permissionToolInputSchema,
  outputSchema as permissionToolOutputSchema,
} from './permissions/PermissionPromptToolResultSchema.js'
import type { ProcessUserInputContext } from './processUserInput/processUserInput.js'
import { recordTranscript } from './sessionStorage.js'

export type PermissionPromptTool = Tool<
  ReturnType<typeof permissionToolInputSchema>,
  ReturnType<typeof permissionToolOutputSchema>
>

// ask 操作使用较小的缓存大小，通常在权限提示或受限工具操作期间仅访问少量文件
const ASK_READ_FILE_STATE_CACHE_SIZE = 10

/**
 * 根据最后一条消息判断结果是否应视为成功。
 * 以下情况返回 true：
 * - 最后一条消息是包含文本或思考内容的助手消息
 * - 最后一条消息是仅含 tool_result 块的用户消息
 * - 最后一条消息是用户提示，但 API 以 end_turn 完成（模型选择不输出任何内容块）
 */
export function isResultSuccessful(
  message: Message | undefined,
  stopReason: string | null = null,
): message is Message {
  if (!message) return false

  if (message.type === 'assistant') {
    const lastContent = last(message.message.content)
    return (
      lastContent?.type === 'text' ||
      lastContent?.type === 'thinking' ||
      lastContent?.type === 'redacted_thinking'
    )
  }

  if (message.type === 'user') {
    // 检查所有内容块是否均为 tool_result 类型
    const content = message.message.content
    if (
      Array.isArray(content) &&
      content.length > 0 &&
      content.every(block => 'type' in block && block.type === 'tool_result')
    ) {
      return true
    }
  }

  // 例外情况：API 已完成（message_delta 设置了 stop_reason）但未产出助手内容 —
  // last(messages) 仍是本轮次的提示。claude.ts:2026 将 end_turn-with-zero-content-blocks 视为合法并通过，不抛出错误。
  // 在 task_notification 排空轮次中观察到：模型返回 stop_reason=end_turn, outputTokens=4, textContentLength=0 —
  // 它看到了子代理结果并判断无需多言。若无此处理，QueryEngine 会发出 error_during_execution，
  // 其 errors[] 为整个进程累积的 logError() 缓冲区。涵盖字符串内容及文本块内容的用户提示，以及任何其他未通过的情况。
  return stopReason === 'end_turn'
}

// 按工具使用 ID 跟踪工具进度消息的最后发送时间
// 仅保留最后 100 条记录以防止无限制增长
const MAX_TOOL_PROGRESS_TRACKING_ENTRIES = 100
const TOOL_PROGRESS_THROTTLE_MS = 30000
const toolProgressLastSentTime = new Map<string, number>()

export function* normalizeMessage(message: Message): Generator<SDKMessage> {
  switch (message.type) {
    case 'assistant':
      for (const _ of normalizeMessages([message])) {
        // 跳过不应输出到 SDK 的空消息（例如 "(无内容)"）
        if (!isNotEmptyMessage(_)) {
          continue
        }
        yield {
          type: 'assistant',
          message: _.message,
          parent_tool_use_id: null,
          session_id: getSessionId(),
          uuid: _.uuid,
          error: _.error,
        }
      }
      return
    case 'progress':
      if (
        message.data.type === 'agent_progress' ||
        message.data.type === 'skill_progress'
      ) {
        for (const _ of normalizeMessages([message.data.message])) {
          switch (_.type) {
            case 'assistant':
              // 跳过不应输出到 SDK 的空消息（例如 "(无内容)"）
              if (!isNotEmptyMessage(_)) {
                break
              }
              yield {
                type: 'assistant',
                message: _.message,
                parent_tool_use_id: message.parentToolUseID,
                session_id: getSessionId(),
                uuid: _.uuid,
                error: _.error,
              }
              break
            case 'user':
              yield {
                type: 'user',
                message: _.message,
                parent_tool_use_id: message.parentToolUseID,
                session_id: getSessionId(),
                uuid: _.uuid,
                timestamp: _.timestamp,
                isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
                tool_use_result: _.mcpMeta
                  ? { content: _.toolUseResult, ..._.mcpMeta }
                  : _.toolUseResult,
              }
              break
          }
        }
      } else if (
        message.data.type === 'bash_progress' ||
        message.data.type === 'powershell_progress'
      ) {
        // 过滤 bash 进度，每分钟最多发送一次
        // 目前仅针对 Claude Code Remote 发出
        if (
          !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
          !process.env.CLAUDE_CODE_CONTAINER_ID
        ) {
          break
        }

        // 使用 parentToolUseID 作为键，因为 toolUseID 在每次进度消息中都会变化
        const trackingKey = message.parentToolUseID
        const now = Date.now()
        const lastSent = toolProgressLastSentTime.get(trackingKey) || 0
        const timeSinceLastSent = now - lastSent

        // 距离上次更新至少 30 秒才发送
        if (timeSinceLastSent >= TOOL_PROGRESS_THROTTLE_MS) {
          // 若容量已满，移除最旧的条目（LRU 驱逐）
          if (
            toolProgressLastSentTime.size >= MAX_TOOL_PROGRESS_TRACKING_ENTRIES
          ) {
            const firstKey = toolProgressLastSentTime.keys().next().value
            if (firstKey !== undefined) {
              toolProgressLastSentTime.delete(firstKey)
            }
          }

          toolProgressLastSentTime.set(trackingKey, now)
          yield {
            type: 'tool_progress',
            tool_use_id: message.toolUseID,
            tool_name:
              message.data.type === 'bash_progress' ? 'Bash' : 'PowerShell',
            parent_tool_use_id: message.parentToolUseID,
            elapsed_time_seconds: message.data.elapsedTimeSeconds,
            task_id: message.data.taskId,
            session_id: getSessionId(),
            uuid: message.uuid,
          }
        }
      }
      break
    case 'user':
      for (const _ of normalizeMessages([message])) {
        yield {
          type: 'user',
          message: _.message,
          parent_tool_use_id: null,
          session_id: getSessionId(),
          uuid: _.uuid,
          timestamp: _.timestamp,
          isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
          tool_use_result: _.mcpMeta
            ? { content: _.toolUseResult, ..._.mcpMeta }
            : _.toolUseResult,
        }
      }
      return
    default:
    // 不产出任何内容
  }
}

export async function* handleOrphanedPermission(
  orphanedPermission: OrphanedPermission,
  tools: Tools,
  mutableMessages: Message[],
  processUserInputContext: ProcessUserInputContext,
): AsyncGenerator<SDKMessage, void, unknown> {
  const persistSession = !isSessionPersistenceDisabled()
  const { permissionResult, assistantMessage } = orphanedPermission
  const { toolUseID } = permissionResult

  if (!toolUseID) {
    return
  }

  const content = assistantMessage.message.content
  let toolUseBlock: ToolUseBlock | undefined
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_use' && block.id === toolUseID) {
        toolUseBlock = block as ToolUseBlock
        break
      }
    }
  }

  if (!toolUseBlock) {
    return
  }

  const toolName = toolUseBlock.name
  const toolInput = toolUseBlock.input

  const toolDefinition = findToolByName(tools, toolName)
  if (!toolDefinition) {
    return
  }

  // 若权限被允许，则使用更新后的输入创建 ToolUseBlock
  let finalInput = toolInput
  if (permissionResult.behavior === 'allow') {
    if (permissionResult.updatedInput !== undefined) {
      finalInput = permissionResult.updatedInput
    } else {
      logForDebugging(
        `${toolName} 的孤立权限：updatedInput 未定义，回退到原始工具输入`,
        { level: 'warn' },
      )
    }
  }
  const finalToolUseBlock: ToolUseBlock = {
    ...toolUseBlock,
    input: finalInput,
  }

  const canUseTool: CanUseToolFn = async () => ({
    ...permissionResult,
    decisionReason: {
      type: 'mode',
      mode: 'default' as const,
    },
  })

  // 在执行前将包含 tool_use 的助手消息添加到 messages 中，以便对话历史完整（tool_use -> tool_result）。
  //
  // 在 CCR 恢复时，mutableMessages 从记录中初始化，可能已包含此 tool_use。再次压入会导致 normalizeMessagesForAPI
  // 合并相同 ID 的助手消息（拼接内容）并产生重复的 tool_use ID，API 会因 "tool_use ids must be unique" 而拒绝。
  //
  // 检查特定的 tool_use_id 而非 message.id：流式输出将每个内容块作为单独的 AssistantMessage 产出，
  // 它们共享同一个 message.id，因此 [text, tool_use] 响应会以两条记录形式存在。filterUnresolvedToolUses
  // 可能移除 tool_use 条目但保留文本条目；基于 id 的检查此时会错误地跳过压入，而 runTools 下方仍会执行，
  // 导致结果成为孤儿。
  const alreadyPresent = mutableMessages.some(
    m =>
      m.type === 'assistant' &&
      Array.isArray(m.message.content) &&
      m.message.content.some(
        b => b.type === 'tool_use' && 'id' in b && b.id === toolUseID,
      ),
  )
  if (!alreadyPresent) {
    mutableMessages.push(assistantMessage)
    if (persistSession) {
      await recordTranscript(mutableMessages)
    }
  }

  const sdkAssistantMessage: SDKMessage = {
    ...assistantMessage,
    session_id: getSessionId(),
    parent_tool_use_id: null,
  } as SDKMessage
  yield sdkAssistantMessage

  // 执行工具 - 错误由 runToolUse 内部处理
  for await (const update of runTools(
    [finalToolUseBlock],
    [assistantMessage],
    canUseTool,
    processUserInputContext,
  )) {
    if (update.message) {
      mutableMessages.push(update.message)
      if (persistSession) {
        await recordTranscript(mutableMessages)
      }

      const sdkMessage: SDKMessage = {
        ...update.message,
        session_id: getSessionId(),
        parent_tool_use_id: null,
      } as SDKMessage

      yield sdkMessage
    }
  }
}

// 从消息中提取读取文件的函数
export function extractReadFilesFromMessages(
  messages: Message[],
  cwd: string,
  maxSize: number = ASK_READ_FILE_STATE_CACHE_SIZE,
): FileStateCache {
  const cache = createFileStateCacheWithSizeLimit(maxSize)

  // 第一遍：在助手消息中查找所有 FileReadTool/FileWriteTool/FileEditTool 的使用
  const fileReadToolUseIds = new Map<string, string>() // toolUseId -> filePath
  const fileWriteToolUseIds = new Map<
    string,
    { filePath: string; content: string }
  >() // toolUseId -> { filePath, content }
  const fileEditToolUseIds = new Map<string, string>() // toolUseId -> filePath

  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message.content)
    ) {
      for (const content of message.message.content) {
        if (
          content.type === 'tool_use' &&
          content.name === FILE_READ_TOOL_NAME
        ) {
          // 从工具使用输入中提取 file_path
          const input = content.input as FileReadInput | undefined
          // 范围读取不加入缓存。
          if (
            input?.file_path &&
            input?.offset === undefined &&
            input?.limit === undefined
          ) {
            // 规范化为绝对路径以便缓存查找一致
            const absolutePath = expandPath(input.file_path, cwd)
            fileReadToolUseIds.set(content.id, absolutePath)
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_WRITE_TOOL_NAME
        ) {
          // 从 Write 工具使用输入中提取 file_path 和 content
          const input = content.input as
            | { file_path?: string; content?: string }
            | undefined
          if (input?.file_path && input?.content) {
            // 规范化为绝对路径以便缓存查找一致
            const absolutePath = expandPath(input.file_path, cwd)
            fileWriteToolUseIds.set(content.id, {
              filePath: absolutePath,
              content: input.content,
            })
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_EDIT_TOOL_NAME
        ) {
          // Edit 的输入包含 old_string/new_string，而非最终内容。
          // 跟踪路径，以便第二遍读取当前磁盘状态。
          const input = content.input as { file_path?: string } | undefined
          if (input?.file_path) {
            const absolutePath = expandPath(input.file_path, cwd)
            fileEditToolUseIds.set(content.id, absolutePath)
          }
        }
      }
    }
  }

  // 第二遍：查找对应的工具结果并提取内容
  for (const message of messages) {
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const content of message.message.content) {
        if (content.type === 'tool_result' && content.tool_use_id) {
          // 处理 Read 工具结果
          const readFilePath = fileReadToolUseIds.get(content.tool_use_id)
          if (
            readFilePath &&
            typeof content.content === 'string' &&
            // 去重存根不包含文件内容 — 更早的真实 Read 已缓存。按时间顺序最后覆盖会错误地用存根文本覆盖真实条目。
            !content.content.startsWith(FILE_UNCHANGED_STUB)
          ) {
            // 从内容中移除系统提醒块
            const processedContent = content.content.replace(
              /<system-reminder>[\s\S]*?<\/system-reminder>/g,
              '',
            )

            // 从工具结果中提取实际文件内容
            // 文本文件的工具结果包含行号，需要去除
            const fileContent = processedContent
              .split('\n')
              .map(stripLineNumberPrefix)
              .join('\n')
              .trim()

            // 使用消息时间戳缓存文件内容
            if (message.timestamp) {
              const timestamp = new Date(message.timestamp).getTime()
              cache.set(readFilePath, {
                content: fileContent,
                timestamp,
                offset: undefined,
                limit: undefined,
              })
            }
          }

          // 处理 Write 工具结果 - 使用工具输入中的内容
          const writeToolData = fileWriteToolUseIds.get(content.tool_use_id)
          if (writeToolData && message.timestamp) {
            const timestamp = new Date(message.timestamp).getTime()
            cache.set(writeToolData.filePath, {
              content: writeToolData.content,
              timestamp,
              offset: undefined,
              limit: undefined,
            })
          }

          // 处理 Edit 工具结果 — 编辑后的内容既不在 tool_use 输入中（仅有 old_string/new_string），
          // 也不完全在结果中（仅含片段）。从磁盘读取，使用实际 mtime，以便下一轮次 getChangedFiles 的 mtime 检查通过。
          //
          // 调用方在进程启动时初始化一次缓存（print.ts --resume、Cowork 每轮次冷重启），
          // 因此提取时的磁盘内容即为编辑后的状态。无需去重：处理每个 Edit 可保持 Read/Write 交错时的最后覆盖语义。
          const editFilePath = fileEditToolUseIds.get(content.tool_use_id)
          if (editFilePath && content.is_error !== true) {
            try {
              const { content: diskContent } =
                readFileSyncWithMetadata(editFilePath)
              cache.set(editFilePath, {
                content: diskContent,
                timestamp: getFileModificationTime(editFilePath),
                offset: undefined,
                limit: undefined,
              })
            } catch (e: unknown) {
              if (!isFsInaccessible(e)) {
                throw e
              }
              // 文件自 Edit 后被删除或无法访问 — 跳过
            }
          }
        }
      }
    }
  }

  return cache
}

/**
 * 从消息历史中提取 BashTool 调用所使用的顶层 CLI 工具名称。
 * 返回去重后的命令名称集合（例如 'vercel'、'aws'、'git'）。
 */
export function extractBashToolsFromMessages(messages: Message[]): Set<string> {
  const tools = new Set<string>()
  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message.content)
    ) {
      for (const content of message.message.content) {
        if (content.type === 'tool_use' && content.name === BASH_TOOL_NAME) {
          const { input } = content
          if (
            typeof input !== 'object' ||
            input === null ||
            !('command' in input)
          )
            continue
          const cmd = extractCliName(
            typeof input.command === 'string' ? input.command : undefined,
          )
          if (cmd) {
            tools.add(cmd)
          }
        }
      }
    }
  }
  return tools
}

const STRIPPED_COMMANDS = new Set(['sudo'])

/**
 * 从 bash 命令字符串中提取实际的 CLI 名称，跳过环境变量赋值（如 `FOO=bar vercel` → `vercel`）
 * 以及 STRIPPED_COMMANDS 中的前缀。
 */
function extractCliName(command: string | undefined): string | undefined {
  if (!command) return undefined
  const tokens = command.trim().split(/\s+/)
  for (const token of tokens) {
    if (/^[A-Za-z_]\w*=/.test(token)) continue
    if (STRIPPED_COMMANDS.has(token)) continue
    return token
  }
  return undefined
}