import type { Base64ImageSource } from '@anthropic-ai/sdk/resources/index.mjs'
import { readdir, readFile as readFileAsync } from 'fs/promises'
import * as path from 'path'
import { posix, win32 } from 'path'
import { z } from 'zod/v4'
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_PAGES_PER_READ,
} from '../../constants/apiLimits.js'
import { hasBinaryExtension } from '../../constants/files.js'
import { memoryFreshnessNote } from '../../memdir/memoryAge.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { logEvent } from '../../services/analytics/index.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  getFileExtensionForAnalytics,
} from '../../services/analytics/metadata.js'
import {
  countTokensWithAPI,
  roughTokenCountEstimationForFileType,
} from '../../services/tokenEstimation.js'
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths,
} from '../../skills/loadSkillsDir.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from '../../utils/envUtils.js'
import { getErrnoCode, isENOENT } from '../../utils/errors.js'
import {
  addLineNumbers,
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTimeAsync,
  suggestPathUnderCwd,
} from '../../utils/file.js'
import { logFileOperation } from '../../utils/fileOperationAnalytics.js'
import { formatFileSize } from '../../utils/format.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import {
  compressImageBufferWithTokenLimit,
  createImageMetadataText,
  detectImageFormatFromBuffer,
  type ImageDimensions,
  ImageResizeError,
  maybeResizeAndDownsampleImageBuffer,
} from '../../utils/imageResizer.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { isAutoMemFile } from '../../utils/memoryFileDetection.js'
import { createUserMessage } from '../../utils/messages.js'
import { getCanonicalName, getMainLoopModel } from '../../utils/model/model.js'
import {
  mapNotebookCellsToToolResult,
  readNotebook,
} from '../../utils/notebook.js'
import { expandPath } from '../../utils/path.js'
import { extractPDFPages, getPDFPageCount, readPDF } from '../../utils/pdf.js'
import {
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange,
} from '../../utils/pdfUtils.js'
import {
  checkReadPermissionForTool,
  matchingRuleForInput,
} from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { readFileInRange } from '../../utils/readFileInRange.js'
import { semanticNumber } from '../../utils/semanticNumber.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { getDefaultFileReadingLimits } from './limits.js'
import {
  DESCRIPTION,
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
} from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName,
} from './UI.js'

// 会导致进程挂起的设备文件：无限输出或阻塞输入。
// 仅通过路径检查（无 I/O）。安全的设备（如 /dev/null）有意被排除在外。
const BLOCKED_DEVICE_PATHS = new Set([
  // 无限输出 — 永远不会读到 EOF
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/full',
  // 阻塞等待输入
  '/dev/stdin',
  '/dev/tty',
  '/dev/console',
  // 无意义去读取
  '/dev/stdout',
  '/dev/stderr',
  // stdin/stdout/stderr 的文件描述符别名
  '/dev/fd/0',
  '/dev/fd/1',
  '/dev/fd/2',
])

function isBlockedDevicePath(filePath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true
  // Linux 上 /proc/self/fd/0-2 以及 /proc/<pid>/fd/0-2 是标准 I/O 的别名
  if (
    filePath.startsWith('/proc/') &&
    (filePath.endsWith('/fd/0') ||
      filePath.endsWith('/fd/1') ||
      filePath.endsWith('/fd/2'))
  )
    return true
  return false
}

// 某些 macOS 版本在截屏文件名中使用的窄不间断空格（U+202F）
const THIN_SPACE = String.fromCharCode(8239)

/**
 * 解析可能含有不同空格字符的 macOS 截屏路径。
 * macOS 在截屏文件名中的 AM/PM 之前使用普通空格或窄空格（U+202F），
 * 具体取决于 macOS 版本。如果给定路径的文件不存在，此函数会尝试使用另一种空格字符。
 *
 * @param filePath - 要解析的标准化文件路径
 * @returns 磁盘上实际文件的路径（可能在空格字符上有所不同）
 */
/**
 * 对于包含 AM/PM 的 macOS 截屏路径，AM/PM 前面的空格可能是普通空格或窄空格，
 * 具体取决于 macOS 版本。如果原路径不存在，则返回替代路径以供尝试；若无需替代，则返回 undefined。
 */
function getAlternateScreenshotPath(filePath: string): string | undefined {
  const filename = path.basename(filePath)
  const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/
  const match = filename.match(amPmPattern)
  if (!match) return undefined

  const currentSpace = match[2]
  const alternateSpace = currentSpace === ' ' ? THIN_SPACE : ' '
  return filePath.replace(
    `${currentSpace}${match[3]}${match[4]}`,
    `${alternateSpace}${match[3]}${match[4]}`,
  )
}

// 文件读取监听器 - 允许其他服务在文件被读取时收到通知
type FileReadListener = (filePath: string, content: string) => void
const fileReadListeners: FileReadListener[] = []

export function registerFileReadListener(
  listener: FileReadListener,
): () => void {
  fileReadListeners.push(listener)
  return () => {
    const i = fileReadListeners.indexOf(listener)
    if (i >= 0) fileReadListeners.splice(i, 1)
  }
}

export class MaxFileReadTokenExceededError extends Error {
  constructor(
    public tokenCount: number,
    public maxTokens: number,
  ) {
    super(
      `文件内容（${tokenCount} tokens）超过了允许的最大 tokens 数（${maxTokens}）。请使用 offset 和 limit 参数读取文件的特定部分，或搜索特定内容，而不是读取整个文件。`,
    )
    this.name = 'MaxFileReadTokenExceededError'
  }
}

// 常见的图片扩展名
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/**
 * 检测文件路径是否为与会话相关的文件，用于分析日志记录。
 * 仅匹配 Claude 配置目录（如 ~/.claude）内的文件。
 * 返回会话文件类型，如果不是则会话文件则返回 null。
 */
function detectSessionFileType(
  filePath: string,
): 'session_memory' | 'session_transcript' | null {
  const configDir = getClaudeConfigHomeDir()

  // 仅匹配 Claude 配置目录内的文件
  if (!filePath.startsWith(configDir)) {
    return null
  }

  // 将路径规范化为正斜杠，以便跨平台一致匹配
  const normalizedPath = filePath.split(win32.sep).join(posix.sep)

  // 会话记忆文件：~/.claude/session-memory/*.md（包括 summary.md）
  if (
    normalizedPath.includes('/session-memory/') &&
    normalizedPath.endsWith('.md')
  ) {
    return 'session_memory'
  }

  // 会话 JSONL 记录文件：~/.claude/projects/*/*.jsonl
  if (
    normalizedPath.includes('/projects/') &&
    normalizedPath.endsWith('.jsonl')
  ) {
    return 'session_transcript'
  }

  return null
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('要读取的文件的绝对路径'),
    offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
      '开始读取的行号。仅在文件过大无法一次读取时提供',
    ),
    limit: semanticNumber(z.number().int().positive().optional()).describe(
      '要读取的行数。仅在文件过大无法一次读取时提供。',
    ),
    pages: z
      .string()
      .optional()
      .describe(
        `PDF 文件的页面范围（例如 "1-5"、"3"、"10-20"）。仅适用于 PDF 文件。每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页。`,
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() => {
  // 定义支持的图片媒体类型
  const imageMediaTypes = z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ])

  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      file: z.object({
        filePath: z.string().describe('被读取文件的路径'),
        content: z.string().describe('文件内容'),
        numLines: z
          .number()
          .describe('返回内容中的行数'),
        startLine: z.number().describe('起始行号'),
        totalLines: z.number().describe('文件中的总行数'),
      }),
    }),
    z.object({
      type: z.literal('image'),
      file: z.object({
        base64: z.string().describe('Base64 编码的图像数据'),
        type: imageMediaTypes.describe('图像的 MIME 类型'),
        originalSize: z.number().describe('原始文件大小（字节）'),
        dimensions: z
          .object({
            originalWidth: z
              .number()
              .optional()
              .describe('原始图像宽度（像素）'),
            originalHeight: z
              .number()
              .optional()
              .describe('原始图像高度（像素）'),
            displayWidth: z
              .number()
              .optional()
              .describe('显示时的图像宽度（像素，缩放后）'),
            displayHeight: z
              .number()
              .optional()
              .describe('显示时的图像高度（像素，缩放后）'),
          })
          .optional()
          .describe('图像尺寸信息，用于坐标映射'),
      }),
    }),
    z.object({
      type: z.literal('notebook'),
      file: z.object({
        filePath: z.string().describe('笔记本文件的路径'),
        cells: z.array(z.any()).describe('笔记本单元格数组'),
      }),
    }),
    z.object({
      type: z.literal('pdf'),
      file: z.object({
        filePath: z.string().describe('PDF 文件的路径'),
        base64: z.string().describe('Base64 编码的 PDF 数据'),
        originalSize: z.number().describe('原始文件大小（字节）'),
      }),
    }),
    z.object({
      type: z.literal('parts'),
      file: z.object({
        filePath: z.string().describe('PDF 文件的路径'),
        originalSize: z.number().describe('原始文件大小（字节）'),
        count: z.number().describe('已提取的页数'),
        outputDir: z
          .string()
          .describe('包含已提取页面图像的目录'),
      }),
    }),
    z.object({
      type: z.literal('file_unchanged'),
      file: z.object({
        filePath: z.string().describe('文件的路径'),
      }),
    }),
  ])
})
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const FileReadTool = buildTool({
  name: FILE_READ_TOOL_NAME,
  searchHint: '读取文件、图片、PDF、笔记本',
  // 输出大小受 maxTokens 限制（validateContentTokens）。将内容持久化到文件，
  // 然后让模型通过 Read 回读是循环做法 — 永远不要持久化。
  maxResultSizeChars: Infinity,
  strict: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    const limits = getDefaultFileReadingLimits()
    const maxSizeInstruction = limits.includeMaxSizeInPrompt
      ? `。大于 ${formatFileSize(limits.maxSizeBytes)} 的文件将返回错误；对于较大的文件请使用 offset 和 limit 参数`
      : ''
    const offsetInstruction = limits.targetedRangeNudge
      ? OFFSET_INSTRUCTION_TARGETED
      : OFFSET_INSTRUCTION_DEFAULT
    return renderPromptTemplate(
      pickLineFormatInstruction(),
      maxSizeInstruction,
      offsetInstruction,
    )
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在读取 ${summary}` : '正在读取文件'
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.file_path
  },
  isSearchOrReadCommand() {
    return { isSearch: false, isRead: true }
  },
  getPath({ file_path }): string {
    return file_path || getCwd()
  },
  backfillObservableInput(input) {
    // hooks.mdx 中说明 file_path 应为绝对路径；将其展开，以防止通过 ~ 或相对路径绕过钩子允许列表。
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path)
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      FileReadTool,
      input,
      appState.toolPermissionContext,
    )
  },
  renderToolUseMessage,
  renderToolUseTag,
  renderToolResultMessage,
  // UI.tsx:140 — 所有类型都只渲染摘要外壳："已读取 N 行"、"已读取图片 (42KB)"。
  // 绝不渲染内容本身。面向模型的序列化（下方）发送内容 + CYBER_RISK_MITIGATION_REMINDER
  // + 行前缀；UI 不显示其中任何内容。无需索引。最初声称有 file.content 时被渲染保真度测试捕获。
  extractSearchText() {
    return ''
  },
  renderToolUseErrorMessage,
  async validateInput({ file_path, pages }, toolUseContext: ToolUseContext) {
    // 验证 pages 参数（纯字符串解析，无 I/O）
    if (pages !== undefined) {
      const parsed = parsePDFPageRange(pages)
      if (!parsed) {
        return {
          result: false,
          message: `无效的 pages 参数："${pages}"。请使用如 "1-5"、"3" 或 "10-20" 的格式。页码从 1 开始。`,
          errorCode: 7,
        }
      }
      const rangeSize =
        parsed.lastPage === Infinity
          ? PDF_MAX_PAGES_PER_READ + 1
          : parsed.lastPage - parsed.firstPage + 1
      if (rangeSize > PDF_MAX_PAGES_PER_READ) {
        return {
          result: false,
          message: `页面范围 "${pages}" 超过了每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页的限制。请使用更小的范围。`,
          errorCode: 8,
        }
      }
    }

    // 路径展开 + 拒绝规则检查（无 I/O）
    const fullFilePath = expandPath(file_path)

    const appState = toolUseContext.getAppState()
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      'read',
      'deny',
    )
    if (denyRule !== null) {
      return {
        result: false,
        message:
          '文件位于你的权限设置所禁止访问的目录中。',
        errorCode: 1,
      }
    }

    // 安全性：UNC 路径检查（无 I/O）— 在用户授予权限之前推迟文件系统操作，
    // 以防止 NTLM 凭据泄漏
    const isUncPath =
      fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')
    if (isUncPath) {
      return { result: true }
    }

    // 二进制扩展名检查（仅检查扩展名字符串，无 I/O）。
    // PDF、图片和 SVG 被排除 — 此工具原生支持渲染它们。
    const ext = path.extname(fullFilePath).toLowerCase()
    if (
      hasBinaryExtension(fullFilePath) &&
      !isPDFExtension(ext) &&
      !IMAGE_EXTENSIONS.has(ext.slice(1))
    ) {
      return {
        result: false,
        message: `此工具无法读取二进制文件。该文件似乎是一个二进制 ${ext} 文件。请使用适合二进制文件分析的工具。`,
        errorCode: 4,
      }
    }

    // 阻止会挂起的特定设备文件（无限输出或阻塞输入）。
    // 这是基于路径的检查，无 I/O — 像 /dev/null 这样的安全特殊文件会被允许。
    if (isBlockedDevicePath(fullFilePath)) {
      return {
        result: false,
        message: `无法读取 '${file_path}'：此设备文件会阻塞或产生无限输出。`,
        errorCode: 9,
      }
    }

    return { result: true }
  },
  async call(
    { file_path, offset = 1, limit = undefined, pages },
    context,
    _canUseTool?,
    parentMessage?,
  ) {
    const { readFileState, fileReadingLimits } = context

    const defaults = getDefaultFileReadingLimits()
    const maxSizeBytes =
      fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens

    // 遥测：追踪调用者何时覆盖默认读取限制。
    // 仅在覆盖时触发（低流量）— 事件计数 = 覆盖频率。
    if (fileReadingLimits !== undefined) {
      logEvent('tengu_file_read_limits_override', {
        hasMaxTokens: fileReadingLimits.maxTokens !== undefined,
        hasMaxSizeBytes: fileReadingLimits.maxSizeBytes !== undefined,
      })
    }

    const ext = path.extname(file_path).toLowerCase().slice(1)
    // 使用 expandPath 以与 FileEditTool/FileWriteTool 保持一致的路径标准化
    // （尤其处理空白符修剪和 Windows 路径分隔符）
    const fullFilePath = expandPath(file_path)

    // 去重：如果我们已经读取过完全相同的范围且磁盘上的文件未发生变化，
    // 则返回存根而不重新发送完整内容。之前的 Read tool_result 仍在上下文中 —
    // 两个完整副本会在每个后续轮次中浪费 cache_creation tokens。BQ 代理显示约 18% 的 Read 调用为同文件冲突
    // （最高占全量 cache_creation 的 2.64%）。仅适用于文本/笔记本读取 — 图片/PDF
    // 未缓存在 readFileState 中，因此不会在此处匹配。
    //
    // 浸泡测试：2 小时内 1,734 次去重命中，无 Read 错误回归。
    // 终止开关模式：如果存根消息在外部混淆了模型，GB 可以禁用它。
    // 第三方默认：终止开关关闭 = 去重启用。仅客户端 — 无需服务器支持，对 Bedrock/Vertex/Foundry 安全。
    const dedupKillswitch = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_read_dedup_killswitch',
      false,
    )
    const existingState = dedupKillswitch
      ? undefined
      : readFileState.get(fullFilePath)
    // 仅对来自先前 Read 的条目进行去重（offset 总是由 Read 设置）。
    // Edit/Write 存储 offset=undefined — 它们的 readFileState 条目反映编辑后的 mtime，
    // 因此与之匹配去重会错误地将模型指向编辑前的 Read 内容。
    if (
      existingState &&
      !existingState.isPartialView &&
      existingState.offset !== undefined
    ) {
      const rangeMatch =
        existingState.offset === offset && existingState.limit === limit
      if (rangeMatch) {
        try {
          const mtimeMs = await getFileModificationTimeAsync(fullFilePath)
          if (mtimeMs === existingState.timestamp) {
            const analyticsExt = getFileExtensionForAnalytics(fullFilePath)
            logEvent('tengu_file_read_dedup', {
              ...(analyticsExt !== undefined && { ext: analyticsExt }),
            })
            return {
              data: {
                type: 'file_unchanged' as const,
                file: { filePath: file_path },
              },
            }
          }
        } catch {
          // stat 失败 — 回退到完整读取
        }
      }
    }

    // 从此文件路径发现技能（即发即弃，非阻塞）
    // 在简单模式下跳过 — 无可用技能
    const cwd = getCwd()
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd)
      if (newSkillDirs.length > 0) {
        // 存储发现的目录以供附件显示
        for (const dir of newSkillDirs) {
          context.dynamicSkillDirTriggers?.add(dir)
        }
        // 不要 await - 让技能加载在后台进行
        addSkillDirectories(newSkillDirs).catch(() => {})
      }

      // 激活路径模式匹配此文件的条件技能
      activateConditionalSkillsForPaths([fullFilePath], cwd)
    }

    try {
      return await callInner(
        file_path,
        fullFilePath,
        fullFilePath,
        ext,
        offset,
        limit,
        pages,
        maxSizeBytes,
        maxTokens,
        readFileState,
        context,
        parentMessage?.message.id,
      )
    } catch (error) {
      // 处理文件未找到：建议相似文件
      const code = getErrnoCode(error)
      if (code === 'ENOENT') {
        // macOS 截屏可能在 AM/PM 前使用窄空格或普通空格 — 
        // 在放弃之前尝试替代路径。
        const altPath = getAlternateScreenshotPath(fullFilePath)
        if (altPath) {
          try {
            return await callInner(
              file_path,
              fullFilePath,
              altPath,
              ext,
              offset,
              limit,
              pages,
              maxSizeBytes,
              maxTokens,
              readFileState,
              context,
              parentMessage?.message.id,
            )
          } catch (altError) {
            if (!isENOENT(altError)) {
              throw altError
            }
            // 替代路径也不存在 — 回退到友好错误提示
          }
        }

        const similarFilename = findSimilarFile(fullFilePath)
        const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
        let message = `文件不存在。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`
        if (cwdSuggestion) {
          message += ` 您是指 ${cwdSuggestion} 吗?`
        } else if (similarFilename) {
          message += ` 您是指 ${similarFilename} 吗?`
        }
        throw new Error(message)
      }
      throw error
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    switch (data.type) {
      case 'image': {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                data: data.file.base64,
                media_type: data.file.type,
              },
            },
          ],
        }
      }
      case 'notebook':
        return mapNotebookCellsToToolResult(data.file.cells, toolUseID)
      case 'pdf':
        // 仅返回 PDF 元数据 - 实际内容作为补充的 DocumentBlockParam 发送
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `已读取 PDF 文件：${data.file.filePath}（${formatFileSize(data.file.originalSize)}）`,
        }
      case 'parts':
        // 提取的页面图像被读取并作为图像块在 mapToolResultToAPIMessage 中发送
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `已提取 PDF 页面：从 ${data.file.filePath} 提取了 ${data.file.count} 页（${formatFileSize(data.file.originalSize)}）`,
        }
      case 'file_unchanged':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: FILE_UNCHANGED_STUB,
        }
      case 'text': {
        let content: string

        if (data.file.content) {
          content =
            memoryFileFreshnessPrefix(data) +
            formatFileLines(data.file) +
            (shouldIncludeFileReadMitigation()
              ? CYBER_RISK_MITIGATION_REMINDER
              : '')
        } else {
          // 确定适当的警告消息
          content =
            data.file.totalLines === 0
              ? '<system-reminder>警告：文件存在但其内容为空。</system-reminder>'
              : `<system-reminder>警告：文件存在但其行数少于提供的偏移量（${data.file.startLine}）。该文件共有 ${data.file.totalLines} 行。</system-reminder>`
        }

        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content,
        }
      }
    }
  },
} satisfies ToolDef<InputSchema, Output>)

function pickLineFormatInstruction(): string {
  return LINE_FORMAT_INSTRUCTION
}

/** 为文件内容添加行号。 */
function formatFileLines(file: { content: string; startLine: number }): string {
  return addLineNumbers(file)
}

export const CYBER_RISK_MITIGATION_REMINDER =
  '\n\n<system-reminder>\n当你读取文件时，你应当考虑该文件是否会被视为恶意软件。你可以且应当提供对该恶意软件的分析，说明其行为。但你必须拒绝改进或增强该代码。你仍然可以分析现有代码、编写报告或回答关于代码行为的问题。\n</system-reminder>\n'

// 应跳过网络风险缓解措施的模型
const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6'])

function shouldIncludeFileReadMitigation(): boolean {
  const shortName = getCanonicalName(getMainLoopModel())
  return !MITIGATION_EXEMPT_MODELS.has(shortName)
}

/**
 * 从 call() 到 mapToolResultToToolResultBlockParam 的侧信道：
 * 自动记忆文件的 mtime，以 `data` 对象的身份作为键。避免向输出模式中添加仅用于展示的字段
 * （该字段会流入 SDK 类型），并避免在映射器中进行同步 fs 操作。WeakMap 在渲染后 `data` 对象不可达时自动进行垃圾回收。
 */
const memoryFileMtimes = new WeakMap<object, number>()

function memoryFileFreshnessPrefix(data: object): string {
  const mtimeMs = memoryFileMtimes.get(data)
  if (mtimeMs === undefined) return ''
  return memoryFreshnessNote(mtimeMs)
}

async function validateContentTokens(
  content: string,
  ext: string,
  maxTokens?: number,
): Promise<void> {
  const effectiveMaxTokens =
    maxTokens ?? getDefaultFileReadingLimits().maxTokens

  const tokenEstimate = roughTokenCountEstimationForFileType(content, ext)
  if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4) return

  const tokenCount = await countTokensWithAPI(content)
  const effectiveCount = tokenCount ?? tokenEstimate

  if (effectiveCount > effectiveMaxTokens) {
    throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens)
  }
}

type ImageResult = {
  type: 'image'
  file: {
    base64: string
    type: Base64ImageSource['media_type']
    originalSize: number
    dimensions?: ImageDimensions
  }
}

function createImageResponse(
  buffer: Buffer,
  mediaType: string,
  originalSize: number,
  dimensions?: ImageDimensions,
): ImageResult {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: `image/${mediaType}` as Base64ImageSource['media_type'],
      originalSize,
      dimensions,
    },
  }
}

/**
 * call 的内部实现，分离出来以便在外部 call 中处理 ENOENT 错误。
 */
async function callInner(
  file_path: string,
  fullFilePath: string,
  resolvedFilePath: string,
  ext: string,
  offset: number,
  limit: number | undefined,
  pages: string | undefined,
  maxSizeBytes: number,
  maxTokens: number,
  readFileState: ToolUseContext['readFileState'],
  context: ToolUseContext,
  messageId: string | undefined,
): Promise<{
  data: Output
  newMessages?: ReturnType<typeof createUserMessage>[]
}> {
  // --- 笔记本 ---
  if (ext === 'ipynb') {
    const cells = await readNotebook(resolvedFilePath)
    const cellsJson = jsonStringify(cells)

    const cellsJsonBytes = Buffer.byteLength(cellsJson)
    if (cellsJsonBytes > maxSizeBytes) {
      throw new Error(
        `笔记本内容（${formatFileSize(cellsJsonBytes)}）超过了最大允许大小（${formatFileSize(maxSizeBytes)}）。` +
          `使用 ${BASH_TOOL_NAME} 配合 jq 读取特定部分：\n` +
          `  cat "${file_path}" | jq '.cells[:20]' # 前 20 个单元格\n` +
          `  cat "${file_path}" | jq '.cells[100:120]' # 第 100 至 120 个单元格\n` +
          `  cat "${file_path}" | jq '.cells | length' # 统计单元格总数\n` +
          `  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # 所有代码源`,
      )
    }

    await validateContentTokens(cellsJson, ext, maxTokens)

    // 通过异步 stat 获取 mtime（单次调用，无需预先存在性检查）
    const stats = await getFsImplementation().stat(resolvedFilePath)
    readFileState.set(fullFilePath, {
      content: cellsJson,
      timestamp: Math.floor(stats.mtimeMs),
      offset,
      limit,
    })
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    const data = {
      type: 'notebook' as const,
      file: { filePath: file_path, cells },
    }

    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: cellsJson,
    })

    return { data }
  }

  // --- 图片（单次读取，无重复读取）---
  if (IMAGE_EXTENSIONS.has(ext)) {
    // 图片有其自己的大小限制（token 预算 + 压缩）— 
    // 不应用文本的 maxSizeBytes 上限。
    const data = await readImageWithTokenBudget(resolvedFilePath, maxTokens)
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: data.file.base64,
    })

    const metadataText = data.file.dimensions
      ? createImageMetadataText(data.file.dimensions)
      : null

    return {
      data,
      ...(metadataText && {
        newMessages: [
          createUserMessage({ content: metadataText, isMeta: true }),
        ],
      }),
    }
  }

  // --- PDF ---
  if (isPDFExtension(ext)) {
    if (pages) {
      const parsedRange = parsePDFPageRange(pages)
      const extractResult = await extractPDFPages(
        resolvedFilePath,
        parsedRange ?? undefined,
      )
      if (!extractResult.success) {
        throw new Error(extractResult.error.message)
      }
      logEvent('tengu_pdf_page_extraction', {
        success: true,
        pageCount: extractResult.data.file.count,
        fileSize: extractResult.data.file.originalSize,
        hasPageRange: true,
      })
      logFileOperation({
        operation: 'read',
        tool: 'FileReadTool',
        filePath: fullFilePath,
        content: `PDF 页面 ${pages}`,
      })
      const entries = await readdir(extractResult.data.file.outputDir)
      const imageFiles = entries.filter(f => f.endsWith('.jpg')).sort()
      const imageBlocks = await Promise.all(
        imageFiles.map(async f => {
          const imgPath = path.join(extractResult.data.file.outputDir, f)
          const imgBuffer = await readFileAsync(imgPath)
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imgBuffer,
            imgBuffer.length,
            'jpeg',
          )
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type:
                `image/${resized.mediaType}` as Base64ImageSource['media_type'],
              data: resized.buffer.toString('base64'),
            },
          }
        }),
      )
      return {
        data: extractResult.data,
        ...(imageBlocks.length > 0 && {
          newMessages: [
            createUserMessage({ content: imageBlocks, isMeta: true }),
          ],
        }),
      }
    }

    const pageCount = await getPDFPageCount(resolvedFilePath)
    if (pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      throw new Error(
        `此 PDF 共有 ${pageCount} 页，页数过多，无法一次性读取。` +
          `请使用 pages 参数指定要读取的页面范围（例如 pages: "1-5"）。` +
          `每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页。`,
      )
    }

    const fs = getFsImplementation()
    const stats = await fs.stat(resolvedFilePath)
    const shouldExtractPages =
      !isPDFSupported() || stats.size > PDF_EXTRACT_SIZE_THRESHOLD

    if (shouldExtractPages) {
      const extractResult = await extractPDFPages(resolvedFilePath)
      if (extractResult.success) {
        logEvent('tengu_pdf_page_extraction', {
          success: true,
          pageCount: extractResult.data.file.count,
          fileSize: extractResult.data.file.originalSize,
        })
      } else {
        logEvent('tengu_pdf_page_extraction', {
          success: false,
          available: extractResult.error.reason !== 'unavailable',
          fileSize: stats.size,
        })
      }
    }

    if (!isPDFSupported()) {
      throw new Error(
        '读取完整 PDF 的功能在当前模型上不受支持。请使用更新的模型（Sonnet 3.5 v2 或更高版本），' +
          `或者使用 pages 参数指定要读取的页面范围（例如 pages: "1-5"，每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页）。` +
          '页面提取功能需要安装 poppler-utils：在 macOS 上执行 `brew install poppler`，在 Debian/Ubuntu 上执行 `apt-get install poppler-utils`。',
      )
    }

    const readResult = await readPDF(resolvedFilePath)
    if (!readResult.success) {
      throw new Error(readResult.error.message)
    }
    const pdfData = readResult.data
    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: pdfData.file.base64,
    })

    return {
      data: pdfData,
      newMessages: [
        createUserMessage({
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfData.file.base64,
              },
            },
          ],
          isMeta: true,
        }),
      ],
    }
  }

  // --- 文本文件（通过 readFileInRange 进行单次异步读取）---
  const lineOffset = offset === 0 ? 0 : offset - 1
  const { content, lineCount, totalLines, totalBytes, readBytes, mtimeMs } =
    await readFileInRange(
      resolvedFilePath,
      lineOffset,
      limit,
      limit === undefined ? maxSizeBytes : undefined,
      context.abortController.signal,
    )

  await validateContentTokens(content, ext, maxTokens)

  readFileState.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit,
  })
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

  // 在迭代前进行快照 — 回调中途取消订阅的监听器会直接修改活动数组并跳过下一个监听器。
  for (const listener of fileReadListeners.slice()) {
    listener(resolvedFilePath, content)
  }

  const data = {
    type: 'text' as const,
    file: {
      filePath: file_path,
      content,
      numLines: lineCount,
      startLine: offset,
      totalLines,
    },
  }
  if (isAutoMemFile(fullFilePath)) {
    memoryFileMtimes.set(data, mtimeMs)
  }

  logFileOperation({
    operation: 'read',
    tool: 'FileReadTool',
    filePath: fullFilePath,
    content,
  })

  const sessionFileType = detectSessionFileType(fullFilePath)
  const analyticsExt = getFileExtensionForAnalytics(fullFilePath)
  logEvent('tengu_session_file_read', {
    totalLines,
    readLines: lineCount,
    totalBytes,
    readBytes,
    offset,
    ...(limit !== undefined && { limit }),
    ...(analyticsExt !== undefined && { ext: analyticsExt }),
    ...(messageId !== undefined && {
      messageID:
        messageId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    is_session_memory: sessionFileType === 'session_memory',
    is_session_transcript: sessionFileType === 'session_transcript',
  })

  return { data }
}

/**
 * 读取图片文件，并在需要时应用基于 token 的压缩。
 * 读取文件一次，然后应用标准缩放。如果结果超出 token 限制，则对同一缓冲区应用激进压缩。
 *
 * @param filePath - 图片文件的路径
 * @param maxTokens - 图片的最大 token 预算
 * @returns 应用了适当压缩的图片数据
 */
export async function readImageWithTokenBudget(
  filePath: string,
  maxTokens: number = getDefaultFileReadingLimits().maxTokens,
  maxBytes?: number,
): Promise<ImageResult> {
  // 读取文件一次 — 受 maxBytes 限制以避免大文件导致 OOM
  const imageBuffer = await getFsImplementation().readFileBytes(
    filePath,
    maxBytes,
  )
  const originalSize = imageBuffer.length

  if (originalSize === 0) {
    throw new Error(`图片文件为空：${filePath}`)
  }

  const detectedMediaType = detectImageFormatFromBuffer(imageBuffer)
  const detectedFormat = detectedMediaType.split('/')[1] || 'png'

  // 尝试标准缩放
  let result: ImageResult
  try {
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      originalSize,
      detectedFormat,
    )
    result = createImageResponse(
      resized.buffer,
      resized.mediaType,
      originalSize,
      resized.dimensions,
    )
  } catch (e) {
    if (e instanceof ImageResizeError) throw e
    logError(e)
    result = createImageResponse(imageBuffer, detectedFormat, originalSize)
  }

  // 检查是否在 token 预算内
  const estimatedTokens = Math.ceil(result.file.base64.length * 0.125)
  if (estimatedTokens > maxTokens) {
    // 对相同的缓冲区进行激进压缩（不重新读取）
    try {
      const compressed = await compressImageBufferWithTokenLimit(
        imageBuffer,
        maxTokens,
        detectedMediaType,
      )
      return {
        type: 'image',
        file: {
          base64: compressed.base64,
          type: compressed.mediaType,
          originalSize,
        },
      }
    } catch (e) {
      logError(e)
      // 回退：从相同的缓冲区生成高压缩版本
      try {
        const sharpModule = await import('sharp')
        const sharp =
          (
            sharpModule as {
              default?: typeof sharpModule
            } & typeof sharpModule
          ).default || sharpModule

        const fallbackBuffer = await sharp(imageBuffer)
          .resize(400, 400, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 20 })
          .toBuffer()

        return createImageResponse(fallbackBuffer, 'jpeg', originalSize)
      } catch (error) {
        logError(error)
        return createImageResponse(imageBuffer, detectedFormat, originalSize)
      }
    }
  }

  return result
}