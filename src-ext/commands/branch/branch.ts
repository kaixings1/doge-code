import { randomUUID, type UUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type {
  ContentReplacementEntry,
  Entry,
  LogOption,
  SerializedMessage,
  TranscriptMessage,
} from '../../types/logs.js'
import { parseJSONL } from '../../utils/json.js'
import {
  getProjectDir,
  getTranscriptPath,
  getTranscriptPathForSession,
  isTranscriptMessage,
  saveCustomTitle,
  searchSessionsByCustomTitle,
} from '../../utils/sessionStorage.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { escapeRegExp } from '../../utils/stringUtils.js'

type TranscriptEntry = TranscriptMessage & {
  forkedFrom?: {
    sessionId: string
    messageUuid: UUID
  }
}

/**
 * Derive a single-line title base from the first user message.
 * Collapses whitespace — multiline first messages (pasted stacks, code)
 * otherwise flow into the saved title and break the resume hint.
 */
export function deriveFirstPrompt(
  firstUserMessage: Extract<SerializedMessage, { type: 'user' }> | undefined,
): string {
  const content = firstUserMessage?.message?.content
  if (!content) return '已分支对话'
  const raw =
    typeof content === 'string'
      ? content
      : content.find(
          (block): block is { type: 'text'; text: string } =>
            block.type === 'text',
        )?.text
  if (!raw) return '已分支对话'
  return (
    raw.replace(/\s+/g, ' ').trim().slice(0, 100) || '已分支对话'
  )
}

/**
 * Creates a fork of the current conversation by copying from the transcript file.
 * Preserves all original metadata (timestamps, gitBranch, etc.) while updating
 * sessionId and adding forkedFrom traceability.
 */
async function createFork(customTitle?: string): Promise<{
  sessionId: UUID
  title: string | undefined
  forkPath: string
  serializedMessages: SerializedMessage[]
  contentReplacementRecords: ContentReplacementEntry['replacements']
}> {
  const forkSessionId = randomUUID() as UUID
  const originalSessionId = getSessionId()
  const projectDir = getProjectDir(getOriginalCwd())
  const forkSessionPath = getTranscriptPathForSession(forkSessionId)
  const currentTranscriptPath = getTranscriptPath()

  // 确保项目目录存在
  await mkdir(projectDir, { recursive: true, mode: 0o700 })

  // 读取当前转录文件
  let transcriptContent: Buffer
  try {
    transcriptContent = await readFile(currentTranscriptPath)
  } catch {
    throw new Error('没有可分支的对话')
  }

  if (transcriptContent.length === 0) {
    throw new Error('没有可分支的对话')
  }

  // 解析所有转录条目（消息 + 如 content-replacement 的元数据条目）
  const entries = parseJSONL<Entry>(transcriptContent)

  // 仅过滤主要对话消息（排除 sidechains 和非消息条目）
  const mainConversationEntries = entries.filter(
    (entry): entry is TranscriptMessage =>
      isTranscriptMessage(entry) && !entry.isSidechain,
  )

  // 原始会话的 content-replacement 条目。这些记录哪些
  // tool_result 块被每个消息预算替换为预览。
  // 如果分支 JSONL 中没有它们，`claude -r {forkId}` 将重建状态
  // 使用空的 replacements Map 话 'previously-replaced results 被分类
  // 为 FROZEN 并作为完整内容发送（提示缓存未命中 + 永久超出限制）。
  // sessionId must be rewritten since loadTranscriptFile keys lookup by the
  // session's messages' sessionId.
  const contentReplacementRecords = entries
    .filter(
      (entry): entry is ContentReplacementEntry =>
        entry.type === 'content-replacement' &&
        entry.sessionId === originalSessionId,
    )
    .flatMap(entry => entry.replacements)

  if (mainConversationEntries.length === 0) {
    throw new Error('没有可分支的消息')
  }

  // 使用新的 sessionId 和保留的元数据构建分支条目
  let parentUuid: UUID | null = null
  const lines: string[] = []
  const serializedMessages: SerializedMessage[] = []

  for (const entry of mainConversationEntries) {
    // 创建分支转录条目，保留所有原始元数据
    const forkedEntry: TranscriptEntry = {
      ...entry,
      sessionId: forkSessionId,
      parentUuid,
      isSidechain: false,
      forkedFrom: {
        sessionId: originalSessionId,
        messageUuid: entry.uuid,
      },
    }

    // 为 LogOption 构建序列化消息
    const serialized: SerializedMessage = {
      ...entry,
      sessionId: forkSessionId,
    }

    serializedMessages.push(serialized)
    lines.push(jsonStringify(forkedEntry))
    if (entry.type !== 'progress') {
      parentUuid = entry.uuid
    }
  }

  // 追加 content-replacement 条目（如果有），使用分支的 sessionId。
  // 写为单个条目（与 insertContentReplacement 相同形状）以便
  // loadTranscriptFile's content-replacement branch picks it up.
  if (contentReplacementRecords.length > 0) {
    const forkedReplacementEntry: ContentReplacementEntry = {
      type: 'content-replacement',
      sessionId: forkSessionId,
      replacements: contentReplacementRecords,
    }
    lines.push(jsonStringify(forkedReplacementEntry))
  }

  // 写入分支会话文件
  await writeFile(forkSessionPath, lines.join('\n') + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })

  return {
    sessionId: forkSessionId,
    title: customTitle,
    forkPath: forkSessionPath,
    serializedMessages,
    contentReplacementRecords,
  }
}

/**
 * Generates a unique fork name by checking for collisions with existing session names.
 * If "baseName (Branch)" already exists, tries "baseName (Branch 2)", "baseName (Branch 3)", etc.
 */
async function getUniqueForkName(baseName: string): Promise<string> {
  const candidateName = `${baseName} (分支)`

  // 检查此确切名称是否已存在
  const existingWithExactName = await searchSessionsByCustomTitle(
    candidateName,
    { exact: true },
  )

  if (existingWithExactName.length === 0) {
    return candidateName
  }

  // 名称冲突 - 查找唯一的编号后缀
  // 查找所有以基本模式开头的会话
  const existingForks = await searchSessionsByCustomTitle(`${baseName} (分支`)

  // 提取现有的分支数字以找到下一个可用的
  const usedNumbers = new Set<number>([1]) // Consider " (Branch)" as number 1
  const forkNumberPattern = new RegExp(
    `^${escapeRegExp(baseName)} \\(Branch(?: (\\d+))?\\)$`,
  )

  for (const session of existingForks) {
    const match = session.customTitle?.match(forkNumberPattern)
    if (match) {
      if (match[1]) {
        usedNumbers.add(parseInt(match[1], 10))
      } else {
        usedNumbers.add(1) // " (Branch)" without number is treated as 1
      }
    }
  }

  // 查找下一个可用的数字
  let nextNumber = 2
  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }

  return `${baseName} (分支 ${nextNumber})`
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const customTitle = args?.trim() || undefined

  const originalSessionId = getSessionId()

  try {
    const {
      sessionId,
      title,
      forkPath,
      serializedMessages,
      contentReplacementRecords,
    } = await createFork(customTitle)

    // 为 resume 构建 LogOption
    const now = new Date()
    const firstPrompt = deriveFirstPrompt(
      serializedMessages.find(m => m.type === 'user'),
    )

    // 保存自定义标题 - 使用提供的标题或 firstPrompt 作为默认值
    // 这确保 /status 和 /resume 显示相同的会话名称
    // 始终添加 " (Branch)" 后缀以明确这是分支会话
    // 通过添加数字后缀处理冲突（例如，" (Branch 2)", " (Branch 3)）
    const baseName = title ?? firstPrompt
    const effectiveTitle = await getUniqueForkName(baseName)
    await saveCustomTitle(sessionId, effectiveTitle, forkPath)

    logEvent('tengu_conversation_forked', {
      message_count: serializedMessages.length,
      has_custom_title: !!title,
    })

    const forkLog: LogOption = {
      date: now.toISOString().split('T')[0]!,
      messages: serializedMessages,
      fullPath: forkPath,
      value: now.getTime(),
      created: now,
      modified: now,
      firstPrompt,
      messageCount: serializedMessages.length,
      isSidechain: false,
      sessionId,
      customTitle: effectiveTitle,
      contentReplacements: contentReplacementRecords,
    }

    // 恢复到分支
    const titleInfo = title ? ` "${title}"` : ''
    const resumeHint = `\n要恢复原始会话：claude -r ${originalSessionId}`
    const successMessage = `已分支对话'{titleInfo}。你现在处于分支中话'{resumeHint}`

    if (context.resume) {
      await context.resume(sessionId, forkLog, 'fork')
      onDone(successMessage, { display: 'system' })
    } else {
      // 如果无法恢复则使用回退
      onDone(
        `已分支对话'{titleInfo}。使用以下命令恢复：/resume ${sessionId}`,
      )
    }

    return null
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '发生未知错误'
    onDone(`分支对话失败: ${message}`)
    return null
  }
}
