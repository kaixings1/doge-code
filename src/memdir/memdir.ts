import { feature } from 'bun:bundle'
import { join } from 'path'
import { getFsImplementation } from '../utils/fsOperations.js'
import { getAutoMemPath, isAutoMemoryEnabled } from './paths.js'

 
const teamMemPaths = feature('TEAMMEM')
  ? (require('./teamMemPaths.js') as typeof import('./teamMemPaths.js'))
  : null

import { getKairosActive, getOriginalCwd } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
 
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { GREP_TOOL_NAME } from '../tools/GrepTool/prompt.js'
import { isReplModeEnabled } from '../tools/REPLTool/constants.js'
import { logForDebugging } from '../utils/debug.js'
import { hasEmbeddedSearchTools } from '../utils/embeddedTools.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { formatFileSize } from '../utils/format.js'
import { getProjectDir } from '../utils/sessionStorage.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TRUSTING_RECALL_SECTION,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
  WHEN_TO_ACCESS_SECTION,
} from './memoryTypes.js'

export const ENTRYPOINT_NAME = 'MEMORY.md'
export const MAX_ENTRYPOINT_LINES = 200
// 每行约 125 字符，200 行约 25KB。目前处于 p97 水平；捕获超出行上限的长行索引
//（p100 观察到：197KB，少于 200 行）。
export const MAX_ENTRYPOINT_BYTES = 25_000
const AUTO_MEM_DISPLAY_NAME = 'auto memory'

export type EntrypointTruncation = {
  content: string
  lineCount: number
  byteCount: number
  wasLineTruncated: boolean
  wasByteTruncated: boolean
}

/**
 * 将 MEMORY.md 内容截断到行数上限和字节上限，并附加指明哪个上限被触发的警告。
 * 先按行截断（自然边界），然后在达到字节上限前的最后一个换行符处截断，
 * 这样不会在行中间切断。
 *
 * 由 buildMemoryPrompt 和 claudemd 的 getMemoryFiles 共享（之前重复了仅行数的逻辑）。
 */
export function truncateEntrypointContent(raw: string): EntrypointTruncation {
  const trimmed = raw.trim()
  const contentLines = trimmed.split('\n')
  const lineCount = contentLines.length
  const byteCount = trimmed.length

  const wasLineTruncated = lineCount > MAX_ENTRYPOINT_LINES
  // 检查原始字节数 — 长行是字节上限针对的失败模式，
  // 因此截断后的大小会低估警告的严重性。
  const wasByteTruncated = byteCount > MAX_ENTRYPOINT_BYTES

  if (!wasLineTruncated && !wasByteTruncated) {
    return {
      content: trimmed,
      lineCount,
      byteCount,
      wasLineTruncated,
      wasByteTruncated,
    }
  }

  let truncated = wasLineTruncated
    ? contentLines.slice(0, MAX_ENTRYPOINT_LINES).join('\n')
    : trimmed

  if (truncated.length > MAX_ENTRYPOINT_BYTES) {
    const cutAt = truncated.lastIndexOf('\n', MAX_ENTRYPOINT_BYTES)
    truncated = truncated.slice(0, cutAt > 0 ? cutAt : MAX_ENTRYPOINT_BYTES)
  }

  const reason =
    wasByteTruncated && !wasLineTruncated
      ? `${formatFileSize(byteCount)} (limit: ${formatFileSize(MAX_ENTRYPOINT_BYTES)}) — index entries are too long`
      : wasLineTruncated && !wasByteTruncated
        ? `${lineCount} lines (limit: ${MAX_ENTRYPOINT_LINES})`
        : `${lineCount} lines and ${formatFileSize(byteCount)}`

  return {
    content:
      truncated +
      `\n\n> 警告：${ENTRYPOINT_NAME} 为 ${reason}。仅加载了其中一部分。保持索引条目在一行以内（约 200 字符以内）；将详细信息移至主题文件中。`,
    lineCount,
    byteCount,
    wasLineTruncated,
    wasByteTruncated,
  }
}

 
const teamMemPrompts = feature('TEAMMEM')
  ? (require('./teamMemPrompts.js') as typeof import('./teamMemPrompts.js'))
  : null
 

/**
 * 附加到每个记忆目录提示行的共享指引文本。
 * 添加是因为 Claude 在写入前会浪费回合执行 `ls`/`mkdir -p`。
 * 框架通过 ensureMemoryDirExists() 保证目录已存在。
 */
export const DIR_EXISTS_GUIDANCE =
  '此目录已存在 — 请直接使用 Write 工具写入（不要执行 mkdir 或检查其是否存在）。'
export const DIRS_EXIST_GUIDANCE =
  '两个目录都已存在 — 请直接使用 Write 工具写入（不要执行 mkdir 或检查它们是否存在）。'

/**
 * 确保记忆目录存在。幂等 — 从 loadMemoryPrompt 调用
 *（通过 systemPromptSection 缓存，每个会话一次），以便模型始终
 * 可以写入而无需先检查存在性。FsOperations.mkdir 默认是递归的
 * 并已处理 EEXIST，因此完整的父链
 *（~/.claude/projects/<slug>/memory/）一次调用即可创建，
 * 正常路径无需 try/catch。
 */
export async function ensureMemoryDirExists(memoryDir: string): Promise<void> {
  const fs = getFsImplementation()
  try {
    await fs.mkdir(memoryDir)
  } catch (e) {
    // fs.mkdir 已在内部处理 EEXIST。到达此处的任何内容都是
    // 真正的问题（EACCES/EPERM/EROFS）— 记录日志以便 --debug 显示原因。
    // 提示词构建无论如何都会继续；模型的 Write 会暴露真正的
    // 权限错误（并且 FileWriteTool 会自行对父目录执行 mkdir）。
    const code =
      e instanceof Error && 'code' in e && typeof e.code === 'string'
        ? e.code
        : undefined
    logForDebugging(
      `ensureMemoryDirExists failed for ${memoryDir}: ${code ?? String(e)}`,
      { level: 'debug' },
    )
  }
}

/**
 * 异步记录记忆目录的文件/子目录计数。
 * 即发即弃 — 不阻塞提示词构建。
 */
function logMemoryDirCounts(
  memoryDir: string,
  baseMetadata: Record<
    string,
    | number
    | boolean
    | AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  >,
): void {
  const fs = getFsImplementation()
  void fs.readdir(memoryDir).then(
    dirents => {
      let fileCount = 0
      let subdirCount = 0
      for (const d of dirents) {
        if (d.isFile()) {
          fileCount++
        } else if (d.isDirectory()) {
          subdirCount++
        }
      }
      logEvent('tengu_memdir_loaded', {
        ...baseMetadata,
        total_file_count: fileCount,
        total_subdir_count: subdirCount,
      })
    },
    () => {
      // 目录不可读 — 记录不带计数的日志
      logEvent('tengu_memdir_loaded', baseMetadata)
    },
  )
}

/**
 * 构建类型化记忆的行为指令（不含 MEMORY.md 内容）。
 * 将记忆限制为封闭的四类型分类法（user / feedback / project / reference）—
 * 可以从当前项目状态（代码模式、架构、git 历史）推导出的内容被明确排除。
 *
 * 仅个人变体：无 `## Memory scope` 章节，类型块中无 <scope> 标签，
 * 并且从示例中剥离了 team/private 限定词。
 *
 * 由 buildMemoryPrompt（代理记忆，包含内容）和
 * loadMemoryPrompt（系统提示词，内容改为通过用户上下文注入）共同使用。
 */
export function buildMemoryLines(
  displayName: string,
  memoryDir: string,
  extraGuidelines?: string[],
  skipIndex = false,
): string[] {
  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每个记忆写入自己的文件（例如 `user_role.md`、`feedback_testing.md`），使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 保持记忆文件中的 name、description 和 type 字段与内容同步',
        '- 按主题语义组织记忆，而不是按时间顺序',
        '- 更新或删除错误或过时的记忆',
        '- 不要写重复的记忆。在写入新记忆之前，先检查是否有可以更新的现有记忆。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆分为两步:',
        '',
        '**第一步** — 使用以下 frontmatter 格式将记忆写入自己的文件（例如 `user_role.md`、`feedback_testing.md`）:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        `**第二步** — 在 \`${ENTRYPOINT_NAME}\` 中添加指向该文件的指针。\`${ENTRYPOINT_NAME}\` 是索引，不是记忆本身——每个条目应为一行，约 150 个字符以内：\`- [标题](file.md) — 一行简介\`。它没有 frontmatter。切勿将记忆内容直接写入 \`${ENTRYPOINT_NAME}\`。`,
        '',
        `- \`${ENTRYPOINT_NAME}\` 始终加载到你的对话上下文中——超过 ${MAX_ENTRYPOINT_LINES} 行的内容将被截断，因此请保持索引简洁`,
        '- 保持记忆文件中的 name、description 和 type 字段与内容同步',
        '- 按主题语义组织记忆，而不是按时间顺序',
        '- 更新或删除错误或过时的记忆',
        '- 不要写重复的记忆。在写入新记忆之前，先检查是否有可以更新的现有记忆。',
      ]

  const lines: string[] = [
    `# ${displayName}`,
    '',
    `你在 \`${memoryDir}\` 有一个基于文件的持久记忆系统。${DIR_EXISTS_GUIDANCE}`,
    '',
    '你应该随着时间的推移建立这个记忆系统，以便未来的对话能够全面了解用户是谁、他们希望如何与你协作、要避免或重复哪些行为，以及你为用户所做工作的背景信息。',
    '',
    '如果用户明确要求你记住某些内容，请立即将其保存为最合适的类型。如果他们要求你忘记某些内容，请找到并删除相关条目。',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
    '',
    ...WHEN_TO_ACCESS_SECTION,
    '',
    ...TRUSTING_RECALL_SECTION,
    '',
    '## 记忆与其他形式的持久化机制',
    '记忆是你在协助用户时可用的多种持久化机制之一。区别通常在于，记忆可以在未来对话中召回，不应仅用于保存仅在当前对话范围内有用的信息。',
    '- 何时使用或更新计划而不是记忆：如果你即将开始一项重要的实现任务，并希望与用户在方法上达成一致，你应该使用计划而不是将此信息保存到记忆中。同样，如果你已经在对话中有一个计划并且改变了方法，请通过更新计划来持久化此更改，而不是保存记忆。',
    '- 何时使用或更新任务而不是记忆：当需要将当前对话中的工作分解为离散的步骤或跟踪进度时，请使用任务而不是保存到记忆。任务非常适合持久化当前对话中需要完成的工作的相关信息，但记忆应保留对未来对话有用的信息。',
    '',
    ...(extraGuidelines ?? []),
    '',
  ]

  lines.push(...buildSearchingPastContextSection(memoryDir))

  return lines
}

/**
 * 构建包含 MEMORY.md 内容的类型化记忆提示词。
 * 由代理记忆使用（它没有对应的 getClaudeMds()）。
 */
export function buildMemoryPrompt(params: {
  displayName: string
  memoryDir: string
  extraGuidelines?: string[]
}): string {
  const { displayName, memoryDir, extraGuidelines } = params
  const fs = getFsImplementation()
  const entrypoint = memoryDir + ENTRYPOINT_NAME

  // 目录创建是调用者的责任（loadMemoryPrompt / loadAgentMemoryPrompt）。
  // 构建器只读取，它们不执行 mkdir。

  // 读取现有记忆入口点（同步：提示词构建是同步的）
  let entrypointContent = ''
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs
    entrypointContent = fs.readFileSync(entrypoint, { encoding: 'utf-8' })
  } catch {
    // 尚无记忆文件
  }

  const lines = buildMemoryLines(displayName, memoryDir, extraGuidelines)

  if (entrypointContent.trim()) {
    const t = truncateEntrypointContent(entrypointContent)
    const memoryType = displayName === AUTO_MEM_DISPLAY_NAME ? 'auto' : 'agent'
    logMemoryDirCounts(memoryDir, {
      content_length: t.byteCount,
      line_count: t.lineCount,
      was_truncated: t.wasLineTruncated,
      was_byte_truncated: t.wasByteTruncated,
      memory_type:
        memoryType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    lines.push(`## ${ENTRYPOINT_NAME}`, '', t.content)
  } else {
    lines.push(
      `## ${ENTRYPOINT_NAME}`,
      '',
      `你的 ${ENTRYPOINT_NAME} 目前为空。当你保存新记忆时，它们将出现在这里。`,
    )
  }

  return lines.join('\n')
}

/**
 * 辅助模式每日日志提示词。受 feature('KAIROS') 门控。
 *
 * 辅助会话实际上是永久性的，因此代理仅以追加方式将记忆写入按日期命名的日志文件，
 * 而不是将 MEMORY.md 维护为实时索引。
 * 单独的夜间 /dream 技能将日志提炼为主题文件 + MEMORY.md。
 * MEMORY.md 仍然加载到上下文中（通过 claudemd.ts）作为精炼后的索引 —
 * 此提示词仅更改新记忆的写入位置。
 */
function buildAssistantDailyLogPrompt(skipIndex = false): string {
  const memoryDir = getAutoMemPath()
  // 将路径描述为模式，而不是嵌入今天的字面路径：
  // 此提示词由 systemPromptSection('memory', ...) 缓存，在日期变更时
  // 不 会失效。模型从 date_change 附件（午夜过渡时追加在末尾）
  // 而非用户上下文消息中获取当前日期 — 后者被有意保持陈旧以
  // 在午夜前后保留提示词缓存前缀。
  const logPathPattern = join(memoryDir, 'logs', 'YYYY', 'MM', 'YYYY-MM-DD.md')

  const lines: string[] = [
    '# 自动记忆',
    '',
    `你在以下位置有一个基于文件的持久记忆系统：\`${memoryDir}\``,
    '',
    '此会话是长期的。在工作时，通过将内容**追加**到今日的日志文件来记录任何值得记住的内容：',
    '',
    `\`${logPathPattern}\``,
    '',
    '将 `YYYY-MM-DD` 替换为今天的日期（来自你上下文中的 `currentDate`）。当会话跨越午夜时，开始追加到新日期的文件。',
    '',
    '将每个条目写为带时间戳的简短要点。首次写入时如果文件（和父目录）不存在则创建它们。不要重写或重新组织日志——它是只追加的。单独的夜间进程会将这些日志提炼到 `MEMORY.md` 和主题文件中。',
    '',
    '## 记录什么内容',
    '- 用户的更正和偏好设置（"使用 bun，而不是 npm"；"不要总结差异"）',
    '- 关于用户、其角色或目标的事实',
    '- 无法从代码中推导出的项目上下文（截止日期、事件、决策及其理由）',
    '- 外部系统的指针（仪表板、Linear 项目、Slack 频道）',
    '- 用户明确要求你记住的任何内容',
    '',
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...(skipIndex
      ? []
      : [
          `## ${ENTRYPOINT_NAME}`,
          `\`${ENTRYPOINT_NAME}\` 是精炼的索引（每晚从你的日志中维护），并会自动加载到你的上下文中。阅读它以了解情况，但不要直接编辑它——改为将新信息记录在今天的日志中。`,
          '',
        ]),
    ...buildSearchingPastContextSection(memoryDir),
  ]

  return lines.join('\n')
}

/**
 * 如果功能门控已启用，构建"搜索过去的上下文"章节。
 */
export function buildSearchingPastContextSection(autoMemDir: string): string[] {
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_coral_fern', false)) {
    return []
  }
  const projectDir = getProjectDir(getOriginalCwd())
  // Ant-native 构建将 grep 别名为嵌入式 ugrep 并移除专用的 Grep 工具，
  // 因此在此处给模型一个真正的 shell 调用。
  // 在 REPL 模式下，Grep 和 Bash 都隐藏不允许直接使用 — 模型从 REPL 脚本
  // 内部调用它们，因此 grep shell 形式本就是它会在脚本中写入的内容。
  const embedded = hasEmbeddedSearchTools() || isReplModeEnabled()
  const memSearch = embedded
    ? `grep -rn "<search term>" ${autoMemDir} --include="*.md"`
    : `${GREP_TOOL_NAME} with pattern="<search term>" path="${autoMemDir}" glob="*.md"`
  const transcriptSearch = embedded
    ? `grep -rn "<search term>" ${projectDir}/ --include="*.jsonl"`
    : `${GREP_TOOL_NAME} with pattern="<search term>" path="${projectDir}/" glob="*.jsonl"`
  return [
    '## 搜索过去的上下文',
    '',
    '在寻找过去上下文时:',
    '1. 搜索记忆目录中的主题文件:',
    '```',
    memSearch,
    '```',
    '2. 会话转录日志（最后手段——文件较大，速度较慢）:',
    '```',
    transcriptSearch,
    '```',
    '使用精确的搜索词（错误消息、文件路径、函数名），而不是宽泛的关键字。',
    '',
  ]
}

/**
 * 加载统一的记忆提示词以包含在系统提示词中。
 * 根据启用的记忆系统进行分发：
 *   - auto + team：组合提示词（两个目录）
 *   - 仅 auto：记忆行（单个目录）
 * Team memory 需要 auto memory（由 isTeamMemoryEnabled 强制执行），
 * 因此没有仅 team 的分支。
 *
 * 当 auto memory 禁用时返回 null。
 */
export async function loadMemoryPrompt(): Promise<string | null> {
  const autoEnabled = isAutoMemoryEnabled()

  const skipIndex = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_moth_copse',
    false,
  )

  // KAIROS 每日日志模式优先于 TEAMMEM：仅追加的日志范式
  // 与 team 同步不兼容（team 同步期望一个双方都读写的共享 MEMORY.md）。
  // 这里对 `autoEnabled` 进行门控意味着 !autoEnabled 情况会落入
  // 下面的 tengu_memdir_disabled 遥测块，与非 KAIROS 路径一致。
  if (feature('KAIROS') && autoEnabled && getKairosActive()) {
    logMemoryDirCounts(getAutoMemPath(), {
      memory_type:
        'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return buildAssistantDailyLogPrompt(skipIndex)
  }

  // Cowork 通过环境变量注入记忆策略文本；传递给所有构建器。
  const coworkExtraGuidelines =
    process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES
  const extraGuidelines =
    coworkExtraGuidelines && coworkExtraGuidelines.trim().length > 0
      ? [coworkExtraGuidelines]
      : undefined

  if (feature('TEAMMEM')) {
    if (teamMemPaths!.isTeamMemoryEnabled()) {
      const autoDir = getAutoMemPath()
      const teamDir = teamMemPaths!.getTeamMemPath()
      // 框架保证这些目录存在，以便模型可以无需检查直接写入。
      // 提示词文本反映了这一点（"已存在"）。
      // 仅创建 teamDir 就足够了：getTeamMemPath() 定义为
      // join(getAutoMemPath(), 'team')，因此递归地 mkdir team 目录
      // 会作为副作用创建 auto 目录。如果 team 目录将来移出 auto 目录，
      // 请在此处为 autoDir 添加第二个 ensureMemoryDirExists 调用。
      await ensureMemoryDirExists(teamDir)
      logMemoryDirCounts(autoDir, {
        memory_type:
          'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      logMemoryDirCounts(teamDir, {
        memory_type:
          'team' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return teamMemPrompts!.buildCombinedMemoryPrompt(
        extraGuidelines,
        skipIndex,
      )
    }
  }

  if (autoEnabled) {
    const autoDir = getAutoMemPath()
    // 框架保证目录存在，以便模型可以无需检查直接写入。
    // 提示词文本反映了这一点（"已存在"）。
    await ensureMemoryDirExists(autoDir)
    logMemoryDirCounts(autoDir, {
      memory_type:
        'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return buildMemoryLines(
      'auto memory',
      autoDir,
      extraGuidelines,
      skipIndex,
    ).join('\n')
  }

  logEvent('tengu_memdir_disabled', {
    disabled_by_env_var: isEnvTruthy(
      process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY,
    ),
    disabled_by_setting:
      !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY) &&
      getInitialSettings().autoMemoryEnabled === false,
  })
  // 直接基于 GB 标志进行门控，而不是 isTeamMemoryEnabled() — 该函数
  // 首先检查 isAutoMemoryEnabled()，而在此分支中它肯定为 false。
  // 我们想知道"此用户是否曾在 team-memory 试验组中。"
  if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_herring_clock', false)) {
    logEvent('tengu_team_memdir_disabled', {})
  }
  return null
}
