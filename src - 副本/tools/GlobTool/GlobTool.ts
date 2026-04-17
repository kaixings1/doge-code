import { z } from 'zod/v4'
import type { ValidationResult } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { isENOENT } from '../../utils/errors.js'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  suggestPathUnderCwd,
} from '../../utils/file.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { glob } from '../../utils/glob.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath, toRelativePath } from '../../utils/path.js'
import { checkReadPermissionForTool } from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { DESCRIPTION, GLOB_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z.string().describe('要匹配文件的 glob 模式'),
    path: z
      .string()
      .optional()
      .describe(
        '要搜索的目录。如果未指定，将使用当前工作目录。重要提示：省略此字段以使用默认目录。请勿输入 "undefined" 或 "null" - 只需省略它即可获得默认行为。如果提供，必须是一个有效的目录路径。',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    durationMs: z
      .number()
      .describe('执行搜索所用的时间（毫秒）'),
    numFiles: z.number().describe('找到的文件总数'),
    filenames: z
      .array(z.string())
      .describe('匹配模式的文件路径数组'),
    truncated: z
      .boolean()
      .describe('结果是否被截断（限制为 100 个文件）'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const GlobTool = buildTool({
  name: GLOB_TOOL_NAME,
  searchHint: '按名称模式或通配符查找文件',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在查找 ${summary}` : '正在查找文件'
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
    return input.pattern
  },
  isSearchOrReadCommand() {
    return { isSearch: true, isRead: false }
  },
  getPath({ path }): string {
    return path ? expandPath(path) : getCwd()
  },
  async preparePermissionMatcher({ pattern }) {
    return rulePattern => matchWildcardPattern(rulePattern, pattern)
  },
  async validateInput({ path }): Promise<ValidationResult> {
    // 如果提供了 path，验证其是否存在且为目录
    if (path) {
      const fs = getFsImplementation()
      const absolutePath = expandPath(path)

      // 安全性：对于 UNC 路径跳过文件系统操作，以防止 NTLM 凭据泄漏。
      if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
        return { result: true }
      }

      let stats
      try {
        stats = await fs.stat(absolutePath)
      } catch (e: unknown) {
        if (isENOENT(e)) {
          const cwdSuggestion = await suggestPathUnderCwd(absolutePath)
          let message = `目录不存在：${path}。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`
          if (cwdSuggestion) {
            message += ` 您是不是要找 ${cwdSuggestion}？`
          }
          return {
            result: false,
            message,
            errorCode: 1,
          }
        }
        throw e
      }

      if (!stats.isDirectory()) {
        return {
          result: false,
          message: `路径不是目录：${path}`,
          errorCode: 2,
        }
      }
    }

    return { result: true }
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      GlobTool,
      input,
      appState.toolPermissionContext,
    )
  },
  async prompt() {
    return DESCRIPTION
  },
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  // 复用了 Grep 的渲染（UI.tsx:65）— 显示 filenames 拼接。durationMs/numFiles 是类似 "12 毫秒内找到 3 个文件" 的外壳（少统计了，可以接受）。
  extractSearchText({ filenames }) {
    return filenames.join('\n')
  },
  async call(input, { abortController, getAppState, globLimits }) {
    const start = Date.now()
    const appState = getAppState()
    const limit = globLimits?.maxResults ?? 100
    const { files, truncated } = await glob(
      input.pattern,
      GlobTool.getPath(input),
      { limit, offset: 0 },
      abortController.signal,
      appState.toolPermissionContext,
    )
    // 将 cwd 下的路径相对化以节省 tokens（与 GrepTool 相同）
    const filenames = files.map(toRelativePath)
    const output: Output = {
      filenames,
      durationMs: Date.now() - start,
      numFiles: filenames.length,
      truncated,
    }
    return {
      data: output,
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.filenames.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: '未找到文件',
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        ...output.filenames,
        ...(output.truncated
          ? [
              '（结果已截断。请考虑使用更具体的路径或模式。）',
            ]
          : []),
      ].join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)