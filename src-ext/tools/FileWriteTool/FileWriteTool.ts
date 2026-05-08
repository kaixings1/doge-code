import { dirname, sep } from 'path'
import { logEvent } from '../../services/analytics/index.js'
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { diagnosticTracker } from '../../services/diagnosticTracking.js'
import { clearDeliveredDiagnosticsForFile } from '../../services/lsp/LSPDiagnosticRegistry.js'
import { getLspServerManager } from '../../services/lsp/manager.js'
import { notifyVscodeFileUpdated } from '../../services/mcp/vscodeSdkMcp.js'
import { checkTeamMemSecrets } from '../../services/teamMemorySync/teamMemSecretGuard.js'
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths,
} from '../../skills/loadSkillsDir.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { countLinesChanged, getPatchForDisplay } from '../../utils/diff.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isENOENT } from '../../utils/errors.js'
import { getFileModificationTime, writeTextContent } from '../../utils/file.js'
import {
  fileHistoryEnabled,
  fileHistoryTrackEdit,
} from '../../utils/fileHistory.js'
import { logFileOperation } from '../../utils/fileOperationAnalytics.js'
import { readFileSyncWithMetadata } from '../../utils/fileRead.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import {
  fetchSingleFileGitDiff,
  type ToolUseDiff,
} from '../../utils/gitDiff.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { expandPath } from '../../utils/path.js'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { FILE_UNEXPECTEDLY_MODIFIED_ERROR } from '../FileEditTool/constants.js'
import { gitDiffSchema, hunkSchema } from '../FileEditTool/types.js'
import { FILE_WRITE_TOOL_NAME, getWriteToolDescription } from './prompt.js'
import {
  getToolUseSummary,
  isResultTruncated,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  userFacingName,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z
      .string()
      .describe('要写入的文件的绝对路径（必须为绝对路径，不可为相对路径）'),
    content: z.string().describe('要写入文件的内容'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    type: z
      .enum(['create', 'update'])
      .describe('是创建了新文件还是更新了现有文件'),
    filePath: z.string().describe('被写入文件的路径'),
    content: z.string().describe('写入文件的内容'),
    structuredPatch: z
      .array(hunkSchema())
      .describe('展示变更的差异补丁'),
    originalFile: z
      .string()
      .nullable()
      .describe('写入前文件的原始内容（对于新文件则为 null）'),
    gitDiff: gitDiffSchema().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>
export type FileWriteToolInput = InputSchema

export const FileWriteTool = buildTool({
  name: FILE_WRITE_TOOL_NAME,
  searchHint: '创建或覆盖文件',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return '将文件写入本地文件系统。'
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在写入 ${summary}` : '正在写入文件'
  },
  async prompt() {
    return getWriteToolDescription()
  },
  renderToolUseMessage,
  isResultTruncated,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    return `${input.file_path}: ${input.content}`
  },
  getPath(input): string {
    return input.file_path
  },
  backfillObservableInput(input) {
    // hooks.mdx 要求 file_path 为绝对路径；展开路径以防通过 ~ 或相对路径绕过钩子白名单
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path)
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkWritePermissionForTool(
      FileWriteTool,
      input,
      appState.toolPermissionContext,
    )
  },
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  extractSearchText() {
    // 对话记录渲染会展示内容（创建时通过 HighlightedCode）或结构化差异（更新时）。
    // 启发式规则的 'content' 允许键即使在更新模式下也会索引原始内容字符串——但该内容并不会被展示。
    // 低估风险：tool_use 本身已索引 file_path。
    return ''
  },
  async validateInput({ file_path, content }, toolUseContext: ToolUseContext) {
    const fullFilePath = expandPath(file_path)

    // 拒绝写入包含机密的团队记忆文件
    const secretError = checkTeamMemSecrets(fullFilePath, content)
    if (secretError) {
      return { result: false, message: secretError, errorCode: 0 }
    }

    // 根据权限设置检查路径是否应被忽略
    const appState = toolUseContext.getAppState()
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      'edit',
      'deny',
    )
    if (denyRule !== null) {
      return {
        result: false,
        message:
          '文件所在的目录根据您的权限设置已被拒绝访问。',
        errorCode: 1,
      }
    }

    // 安全性：跳过 UNC 路径的文件系统操作以防止 NTLM 凭据泄漏。
    // 在 Windows 上，对 UNC 路径调用 fs.existsSync() 会触发 SMB 认证，可能向恶意服务器泄漏凭据。
    // 让权限检查处理 UNC 路径。
    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()
    let fileMtimeMs: number
    try {
      const fileStat = await fs.stat(fullFilePath)
      fileMtimeMs = fileStat.mtimeMs
    } catch (e) {
      if (isENOENT(e)) {
        return { result: true }
      }
      throw e
    }

    const readTimestamp = toolUseContext.readFileState.get(fullFilePath)
    if (!readTimestamp || readTimestamp.isPartialView) {
      return {
        result: false,
        message:
          '尚未读取该文件。请先读取文件内容再进行写入。',
        errorCode: 2,
      }
    }

    // 复用上面的 stat 中的 mtime，避免通过 getFileModificationTime 冗余调用 statSync。
    // 上述 readTimestamp 守卫确保当文件存在时始终会进入此分支。
    const lastWriteTime = Math.floor(fileMtimeMs)
    if (lastWriteTime > readTimestamp.timestamp) {
      return {
        result: false,
        message:
          '文件自读取后已被修改（可能是用户或 linter 所为）。请重新读取后再尝试写入。',
        errorCode: 3,
      }
    }

    return { result: true }
  },
  async call(
    { file_path, content },
    { readFileState, updateFileHistoryState, dynamicSkillDirTriggers },
    _,
    parentMessage,
  ) {
    const fullFilePath = expandPath(file_path)
    const dir = dirname(fullFilePath)

    // 从该文件路径发现技能（触发即忘，非阻塞）
    const cwd = getCwd()
    const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd)
    if (newSkillDirs.length > 0) {
      // 存储已发现的目录用于附件显示
      for (const dir of newSkillDirs) {
        dynamicSkillDirTriggers?.add(dir)
      }
      // 无需等待——让技能加载在后台进行
      addSkillDirectories(newSkillDirs).catch(() => {})
    }

    // 激活路径模式与该文件匹配的条件技能
    activateConditionalSkillsForPaths([fullFilePath], cwd)

    await diagnosticTracker.beforeFileEdited(fullFilePath)

    // 在原子性读取-修改-写入关键区段之前确保父目录存在。
    // 必须位于以下临界区之外（在陈旧性检查和 writeTextContent 之间的让步会让并发编辑交错执行），
    // 并且在写入之前（在 ENOENT 传播回来之前，懒惰 mkdir 会在 writeFileSyncAndFlush_DEPRECATED 内部触发虚假的 tengu_atomic_write_error）。
    await getFsImplementation().mkdir(dir)
    if (fileHistoryEnabled()) {
      // 备份捕获编辑前的内容——在陈旧性检查前调用是安全的（基于内容哈希的幂等 v1 备份；若稍后陈旧性检查失败，我们仅留下未使用的备份，而非损坏的状态）。
      await fileHistoryTrackEdit(
        updateFileHistoryState,
        fullFilePath,
        parentMessage.uuid,
      )
    }

    // 加载当前状态并确认自上次读取以来无变更。
    // 请避免在此处与写入磁盘之间进行异步操作，以保持原子性。
    let meta: ReturnType<typeof readFileSyncWithMetadata> | null
    try {
      meta = readFileSyncWithMetadata(fullFilePath)
    } catch (e) {
      if (isENOENT(e)) {
        meta = null
      } else {
        throw e
      }
    }

    if (meta !== null) {
      const lastWriteTime = getFileModificationTime(fullFilePath)
      const lastRead = readFileState.get(fullFilePath)
      if (!lastRead || lastWriteTime > lastRead.timestamp) {
        // 时间戳表明有修改，但在 Windows 上时间戳可能因云同步、杀毒软件等而无内容变化。
        // 对于完整读取，比较内容作为回退以避免误报。
        const isFullRead =
          lastRead &&
          lastRead.offset === undefined &&
          lastRead.limit === undefined
        // meta.content 经过 CRLF 规范化——与 readFileState 的规范化形式匹配。
        if (!isFullRead || meta.content !== lastRead.content) {
          throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
        }
      }
    }

    const enc = meta?.encoding ?? 'utf8'
    const oldContent = meta?.content ?? null

    // 写入是完全内容替换——模型在 `content` 中发送了显式的行尾符并意在保留。不重写它们。
    // 此前我们会保留旧文件的行尾符（或对新建文件通过 ripgrep 采样仓库），这会静默损坏例如 Linux 上带 \r 的 bash 脚本（当覆盖 CRLF 文件时）或当 cwd 中的二进制文件污染仓库样本时。
    writeTextContent(fullFilePath, content, enc, 'LF')

    // 通知 LSP 服务器文件修改（didChange）和保存（didSave）
    const lspManager = getLspServerManager()
    if (lspManager) {
      // 清除先前已传递的诊断信息，以便显示新的诊断
      clearDeliveredDiagnosticsForFile(`file://${fullFilePath}`)
      // didChange：内容已修改
      lspManager.changeFile(fullFilePath, content).catch((err: Error) => {
        logForDebugging(
          `LSP：通知服务器文件变更失败 ${fullFilePath}: ${err.message}`,
        )
        logError(err)
      })
      // didSave：文件已保存到磁盘（触发 TypeScript 服务器的诊断）
      lspManager.saveFile(fullFilePath).catch((err: Error) => {
        logForDebugging(
          `LSP：通知服务器文件保存失败 ${fullFilePath}: ${err.message}`,
        )
        logError(err)
      })
    }

    // 通知 VSCode 文件变更以用于差异视图
    notifyVscodeFileUpdated(fullFilePath, oldContent, content)

    // 更新读取时间戳，以使过时的写入失效
    readFileState.set(fullFilePath, {
      content,
      timestamp: getFileModificationTime(fullFilePath),
      offset: undefined,
      limit: undefined,
    })

    // 记录写入 CLAUDE.md 的日志
    if (fullFilePath.endsWith(`${sep}CLAUDE.md`)) {
      logEvent('tengu_write_claudemd', {})
    }

    let gitDiff: ToolUseDiff | undefined
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_quartz_lantern', false)
    ) {
      const startTime = Date.now()
      const diff = await fetchSingleFileGitDiff(fullFilePath)
      if (diff) gitDiff = diff
      logEvent('tengu_tool_use_diff_computed', {
        isWriteTool: true,
        durationMs: Date.now() - startTime,
        hasDiff: !!diff,
      })
    }

    if (oldContent) {
      const patch = getPatchForDisplay({
        filePath: file_path,
        fileContents: oldContent,
        edits: [
          {
            old_string: oldContent,
            new_string: content,
            replace_all: false,
          },
        ],
      })

      const data = {
        type: 'update' as const,
        filePath: file_path,
        content,
        structuredPatch: patch,
        originalFile: oldContent,
        ...(gitDiff && { gitDiff }),
      }
      // 追踪文件更新的新增和删除行数，在返回结果前执行
      countLinesChanged(patch)

      logFileOperation({
        operation: 'write',
        tool: 'FileWriteTool',
        filePath: fullFilePath,
        type: 'update',
      })

      return {
        data,
      }
    }

    const data = {
      type: 'create' as const,
      filePath: file_path,
      content,
      structuredPatch: [],
      originalFile: null,
      ...(gitDiff && { gitDiff }),
    }

    // 对于新文件的创建，将所有行计为新增，在返回结果前执行
    countLinesChanged([], content)

    logFileOperation({
      operation: 'write',
      tool: 'FileWriteTool',
      filePath: fullFilePath,
      type: 'create',
    })

    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam({ filePath, type }, toolUseID) {
    switch (type) {
      case 'create':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `文件成功创建于：${filePath}`,
        }
      case 'update':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `文件 ${filePath} 已成功更新。`,
        }
    }
  },
} satisfies ToolDef<InputSchema, Output>)