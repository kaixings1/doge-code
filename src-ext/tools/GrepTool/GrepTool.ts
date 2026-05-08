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
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath, toRelativePath } from '../../utils/path.js'
import {
  checkReadPermissionForTool,
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { getGlobExclusionsForPluginCache } from '../../utils/plugins/orphanedPluginFilter.js'
import { ripGrep } from '../../utils/ripgrep.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'
import { semanticNumber } from '../../utils/semanticNumber.js'
import { plural } from '../../utils/stringUtils.js'
import { GREP_TOOL_NAME, getDescription } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z
      .string()
      .describe('要在文件内容中搜索的正则表达式模式'),
    path: z
      .string()
      .optional()
      .describe(
        '要搜索的文件或目录（对应 rg PATH）。默认为当前工作目录。',
      ),
    glob: z
      .string()
      .optional()
      .describe(
        '用于筛选文件的 glob 模式（例如 "*.js"、"*.{ts,tsx}"）—— 对应 rg --glob',
      ),
    output_mode: z
      .enum(['content', 'files_with_matches', 'count'])
      .optional()
      .describe(
        '输出模式："content" 显示匹配行（支持 -A/-B/-C 上下文、-n 行号、head_limit），"files_with_matches" 仅显示文件路径（支持 head_limit），"count" 显示匹配计数（支持 head_limit）。默认为 "files_with_matches"。',
      ),
    '-B': semanticNumber(z.number().optional()).describe(
      '每个匹配前要显示的行数（rg -B）。仅当 output_mode 为 "content" 时有效，否则忽略。',
    ),
    '-A': semanticNumber(z.number().optional()).describe(
      '每个匹配后要显示的行数（rg -A）。仅当 output_mode 为 "content" 时有效，否则忽略。',
    ),
    '-C': semanticNumber(z.number().optional()).describe('context 的别名。'),
    context: semanticNumber(z.number().optional()).describe(
      '每个匹配前后要显示的行数（rg -C）。仅当 output_mode 为 "content" 时有效，否则忽略。',
    ),
    '-n': semanticBoolean(z.boolean().optional()).describe(
      '在输出中显示行号（rg -n）。仅当 output_mode 为 "content" 时有效，否则忽略。默认为 true。',
    ),
    '-i': semanticBoolean(z.boolean().optional()).describe(
      '不区分大小写搜索（rg -i）',
    ),
    type: z
      .string()
      .optional()
      .describe(
        '要搜索的文件类型（rg --type）。常见类型：js、py、rust、go、java 等。对于标准文件类型，比 include 更高效。',
      ),
    head_limit: semanticNumber(z.number().optional()).describe(
      '将输出限制为前 N 行/条目，等效于 "| head -N"。适用于所有输出模式：content（限制输出行数）、files_with_matches（限制文件路径数）、count（限制计数条目数）。未指定时默认为 250。传入 0 表示不限制（慎用——大量结果会浪费上下文）。',
    ),
    offset: semanticNumber(z.number().optional()).describe(
      '在应用 head_limit 之前跳过前 N 行/条目，等效于 "| tail -n +N | head -N"。适用于所有输出模式。默认为 0。',
    ),
    multiline: semanticBoolean(z.boolean().optional()).describe(
      '启用多行模式，此时 . 可匹配换行符，模式可跨行（rg -U --multiline-dotall）。默认：false。',
    ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

// 要从搜索中排除的版本控制系统目录
// 这些目录会被自动排除，因为它们会在搜索结果中产生噪音
const VCS_DIRECTORIES_TO_EXCLUDE = [
  '.git',
  '.svn',
  '.hg',
  '.bzr',
  '.jj',
  '.sl',
] as const

// 未指定 head_limit 时 grep 结果的默认上限。无限制的 content 模式 grep
// 可能填满 20KB 的持久化阈值（每个重度 grep 会话约 6-24K tokens）。
// 250 对于探索性搜索足够宽裕，同时避免上下文膨胀。
// 显式传入 head_limit=0 可取消限制。
const DEFAULT_HEAD_LIMIT = 250

function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset: number = 0,
): { items: T[]; appliedLimit: number | undefined } {
  // 显式传入 0 = 无限制的逃生出口
  if (limit === 0) {
    return { items: items.slice(offset), appliedLimit: undefined }
  }
  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT
  const sliced = items.slice(offset, offset + effectiveLimit)
  // 仅在实际发生截断时才报告 appliedLimit，以便模型知晓可能还有更多结果，从而可通过 offset 分页。
  const wasTruncated = items.length - offset > effectiveLimit
  return {
    items: sliced,
    appliedLimit: wasTruncated ? effectiveLimit : undefined,
  }
}

// 格式化用于工具结果显示的限制/偏移信息。
// appliedLimit 仅在发生截断时才设置（参见 applyHeadLimit），
// 因此即使设置了 appliedOffset，appliedLimit 也可能为 undefined —— 按需构建各部分，
// 避免用户可见输出中出现 "limit: undefined"。
function formatLimitInfo(
  appliedLimit: number | undefined,
  appliedOffset: number | undefined,
): string {
  const parts: string[] = []
  if (appliedLimit !== undefined) parts.push(`限制：${appliedLimit}`)
  if (appliedOffset) parts.push(`偏移：${appliedOffset}`)
  return parts.join('，')
}

const outputSchema = lazySchema(() =>
  z.object({
    mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
    numFiles: z.number(),
    filenames: z.array(z.string()),
    content: z.string().optional(),
    numLines: z.number().optional(), // 针对 content 模式
    numMatches: z.number().optional(), // 针对 count 模式
    appliedLimit: z.number().optional(), // 实际应用的限制（如有）
    appliedOffset: z.number().optional(), // 实际应用的偏移
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

export const GrepTool = buildTool({
  name: GREP_TOOL_NAME,
  searchHint: '使用正则搜索文件内容 (ripgrep)',
  // 20K 字符 - 工具结果持久化阈值
  maxResultSizeChars: 20_000,
  strict: true,
  async description() {
    return getDescription()
  },
  userFacingName() {
    return '搜索'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在搜索 ${summary}` : '正在搜索'
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
    return input.path ? `${input.pattern} 在 ${input.path} 中` : input.pattern
  },
  isSearchOrReadCommand() {
    return { isSearch: true, isRead: false }
  },
  getPath({ path }): string {
    return path || getCwd()
  },
  async preparePermissionMatcher({ pattern }) {
    return rulePattern => matchWildcardPattern(rulePattern, pattern)
  },
  async validateInput({ path }): Promise<ValidationResult> {
    // 如果提供了路径，验证其是否存在
    if (path) {
      const fs = getFsImplementation()
      const absolutePath = expandPath(path)

      // 安全性：对于 UNC 路径跳过文件系统操作，防止 NTLM 凭据泄漏。
      if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
        return { result: true }
      }

      try {
        await fs.stat(absolutePath)
      } catch (e: unknown) {
        if (isENOENT(e)) {
          const cwdSuggestion = await suggestPathUnderCwd(absolutePath)
          let message = `路径不存在：${path}。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`
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
    }

    return { result: true }
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      GrepTool,
      input,
      appState.toolPermissionContext,
    )
  },
  async prompt() {
    return getDescription()
  },
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  // SearchResultSummary 显示内容（mode=content）或 filenames.join。
  // numFiles/numLines/numMatches 为装饰性信息（"找到 3 个文件"）—— 可略过（计数偏少，不会虚报）。Glob 通过 UI.tsx:65 复用此方法。
  extractSearchText({ mode, content, filenames }) {
    if (mode === 'content' && content) return content
    return filenames.join('\n')
  },
  mapToolResultToToolResultBlockParam(
    {
      mode = 'files_with_matches',
      numFiles,
      filenames,
      content,
      numLines: _numLines,
      numMatches,
      appliedLimit,
      appliedOffset,
    },
    toolUseID,
  ) {
    if (mode === 'content') {
      const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
      const resultContent = content || '未找到匹配项'
      const finalContent = limitInfo
        ? `${resultContent}\n\n[显示分页结果 = ${limitInfo}]`
        : resultContent
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: finalContent,
      }
    }

    if (mode === 'count') {
      const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
      const rawContent = content || '未找到匹配项'
      const matches = numMatches ?? 0
      const files = numFiles ?? 0
      const summary = `\n\n共在 ${files} 个文件中找到 ${matches} 处匹配。${limitInfo ? `分页信息 = ${limitInfo}` : ''}`
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: rawContent + summary,
      }
    }

    // files_with_matches 模式
    const limitInfo = formatLimitInfo(appliedLimit, appliedOffset)
    if (numFiles === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: '未找到文件',
      }
    }
    // head_limit 已在 call() 方法中应用，因此直接显示所有文件名
    const result = `找到 ${numFiles} 个文件${limitInfo ? ` ${limitInfo}` : ''}\n${filenames.join('\n')}`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
  async call(
    {
      pattern,
      path,
      glob,
      type,
      output_mode = 'files_with_matches',
      '-B': context_before,
      '-A': context_after,
      '-C': context_c,
      context,
      '-n': show_line_numbers = true,
      '-i': case_insensitive = false,
      head_limit,
      offset = 0,
      multiline = false,
    },
    { abortController, getAppState },
  ) {
    const absolutePath = path ? expandPath(path) : getCwd()
    const args = ['--hidden']

    // 排除 VCS 目录，避免版本控制元数据产生的噪音
    for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
      args.push('--glob', `!${dir}`)
    }

    // 限制行长度，防止 base64 或压缩内容扰乱输出
    args.push('--max-columns', '500')

    // 仅在显式请求时应用多行标志
    if (multiline) {
      args.push('-U', '--multiline-dotall')
    }

    // 添加可选标志
    if (case_insensitive) {
      args.push('-i')
    }

    // 添加输出模式标志
    if (output_mode === 'files_with_matches') {
      args.push('-l')
    } else if (output_mode === 'count') {
      args.push('-c')
    }

    // 如果请求显示行号
    if (show_line_numbers && output_mode === 'content') {
      args.push('-n')
    }

    // 添加上下文标志（-C/context 优先于 context_before/context_after）
    if (output_mode === 'content') {
      if (context !== undefined) {
        args.push('-C', context.toString())
      } else if (context_c !== undefined) {
        args.push('-C', context_c.toString())
      } else {
        if (context_before !== undefined) {
          args.push('-B', context_before.toString())
        }
        if (context_after !== undefined) {
          args.push('-A', context_after.toString())
        }
      }
    }

    // 如果模式以短横线开头，使用 -e 标志将其指定为模式
    // 以防止 ripgrep 将其解释为命令行选项
    if (pattern.startsWith('-')) {
      args.push('-e', pattern)
    } else {
      args.push(pattern)
    }

    // 如果指定了类型过滤器
    if (type) {
      args.push('--type', type)
    }

    if (glob) {
      // 按逗号和空格分割，但保留带花括号的模式
      const globPatterns: string[] = []
      const rawPatterns = glob.split(/\s+/)

      for (const rawPattern of rawPatterns) {
        // 如果模式包含花括号，不再进一步分割
        if (rawPattern.includes('{') && rawPattern.includes('}')) {
          globPatterns.push(rawPattern)
        } else {
          // 对不含花括号的模式按逗号分割
          globPatterns.push(...rawPattern.split(',').filter(Boolean))
        }
      }

      for (const globPattern of globPatterns.filter(Boolean)) {
        args.push('--glob', globPattern)
      }
    }

    // 添加忽略模式
    const appState = getAppState()
    const ignorePatterns = normalizePatternsToPath(
      getFileReadIgnorePatterns(appState.toolPermissionContext),
      getCwd(),
    )
    for (const ignorePattern of ignorePatterns) {
      // 注意：ripgrep 仅相对于工作目录应用 gitignore 模式
      // 因此对于非绝对路径，需要添加 '**' 前缀
      // 参见：https://github.com/BurntSushi/ripgrep/discussions/2156#discussioncomment-2316335
      //
      // 同时需要用 `!` 取反以排除该模式
      const rgIgnorePattern = ignorePattern.startsWith('/')
        ? `!${ignorePattern}`
        : `!**/${ignorePattern}`
      args.push('--glob', rgIgnorePattern)
    }

    // 排除孤立的插件版本目录
    for (const exclusion of await getGlobExclusionsForPluginCache(
      absolutePath,
    )) {
      args.push('--glob', exclusion)
    }

    // WSL 下文件读取存在严重的性能损耗（WSL2 下慢 3-5 倍）
    // 超时由 ripgrep 本身通过 execFile 超时选项处理
    // 我们不使用 AbortController 来中断超时，以免干扰 agent 循环
    // 如果 ripgrep 超时，会抛出 RipgrepTimeoutError 并向上传播
    // 以便 Claude 知晓搜索未完成（而非误以为没有匹配结果）
    const results = await ripGrep(args, absolutePath, abortController.signal)

    if (output_mode === 'content') {
      // 对于 content 模式，results 为实际内容行
      // 将绝对路径转换为相对路径以节省 tokens

      // 先应用 head_limit —— relativize 是按行处理的，
      // 避免处理将被丢弃的行（宽泛的模式可能返回 10k+ 行，而 head_limit 只保留约 30-100 行）。
      const { items: limitedResults, appliedLimit } = applyHeadLimit(
        results,
        head_limit,
        offset,
      )

      const finalLines = limitedResults.map(line => {
        // 行格式：/absolute/path:line_content 或 /absolute/path:num:content
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex)
          const rest = line.substring(colonIndex)
          return toRelativePath(filePath) + rest
        }
        return line
      })
      const output = {
        mode: 'content' as const,
        numFiles: 0, // 对 content 模式不适用
        filenames: [],
        content: finalLines.join('\n'),
        numLines: finalLines.length,
        ...(appliedLimit !== undefined && { appliedLimit }),
        ...(offset > 0 && { appliedOffset: offset }),
      }
      return { data: output }
    }

    if (output_mode === 'count') {
      // 对于 count 模式，直接透传 ripgrep 的原始输出（格式：filename:count）
      // 先应用 head_limit，避免对将被丢弃的条目做路径转换。
      const { items: limitedResults, appliedLimit } = applyHeadLimit(
        results,
        head_limit,
        offset,
      )

      // 将绝对路径转换为相对路径以节省 tokens
      const finalCountLines = limitedResults.map(line => {
        // 行格式：/absolute/path:count
        const colonIndex = line.lastIndexOf(':')
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex)
          const count = line.substring(colonIndex)
          return toRelativePath(filePath) + count
        }
        return line
      })

      // 解析 count 输出以提取总匹配数和文件数
      let totalMatches = 0
      let fileCount = 0
      for (const line of finalCountLines) {
        const colonIndex = line.lastIndexOf(':')
        if (colonIndex > 0) {
          const countStr = line.substring(colonIndex + 1)
          const count = parseInt(countStr, 10)
          if (!isNaN(count)) {
            totalMatches += count
            fileCount += 1
          }
        }
      }

      const output = {
        mode: 'count' as const,
        numFiles: fileCount,
        filenames: [],
        content: finalCountLines.join('\n'),
        numMatches: totalMatches,
        ...(appliedLimit !== undefined && { appliedLimit }),
        ...(offset > 0 && { appliedOffset: offset }),
      }
      return { data: output }
    }

    // 对于 files_with_matches 模式（默认）
    // 使用 allSettled，避免单个 ENOENT（文件在 ripgrep 扫描后、本次 stat 前被删除）导致整批操作失败。失败的 stat 排序时 mtime 视为 0。
    const stats = await Promise.allSettled(
      results.map(_ => getFsImplementation().stat(_)),
    )
    const sortedMatches = results
      // 按修改时间排序
      .map((_, i) => {
        const r = stats[i]!
        return [
          _,
          r.status === 'fulfilled' ? (r.value.mtimeMs ?? 0) : 0,
        ] as const
      })
      .sort((a, b) => {
        if (process.env.NODE_ENV === 'test') {
          // 测试环境下始终按文件名排序，确保结果确定性
          return a[0].localeCompare(b[0])
        }
        const timeComparison = b[1] - a[1]
        if (timeComparison === 0) {
          // 修改时间相同时，以文件名作为次要排序依据
          return a[0].localeCompare(b[0])
        }
        return timeComparison
      })
      .map(_ => _[0])

    // 对排序后的文件列表应用 head_limit（类似 "| head -N"）
    const { items: finalMatches, appliedLimit } = applyHeadLimit(
      sortedMatches,
      head_limit,
      offset,
    )

    // 将绝对路径转换为相对路径以节省 tokens
    const relativeMatches = finalMatches.map(toRelativePath)

    const output = {
      mode: 'files_with_matches' as const,
      filenames: relativeMatches,
      numFiles: relativeMatches.length,
      ...(appliedLimit !== undefined && { appliedLimit }),
      ...(offset > 0 && { appliedOffset: offset }),
    }

    return {
      data: output,
    }
  },
} satisfies ToolDef<InputSchema, Output>)