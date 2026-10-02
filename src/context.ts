import { feature } from 'bun:bundle'
import { memoize } from './vendor/lodash.js'
import {
  getAdditionalDirectoriesForClaudeMd,
  setCachedClaudeMdContent,
} from './bootstrap/state.js'
import { getLocalISODate } from './constants/common.js'
import {
  filterInjectedMemoryFiles,
  getClaudeMds,
  getMemoryFiles,
} from './utils/claudemd.js'
import { getGlossary as loadGlossary } from './utils/glossary.js'
import { isBareMode, isEnvTruthy } from './utils/envUtils.js'
import { execFileNoThrow } from './utils/execFileNoThrow.js'
import { getBranch, getDefaultBranch, getIsGit, gitExe } from './utils/git.js'
import { getSessionEpoch } from './bootstrap/state.js'
import { shouldIncludeGitInstructions } from './utils/gitSettings.js'
import { logError } from './utils/log.js'
import { resolveWindowsShellKind } from './utils/shell/shellToolUtils.js'

const MAX_STATUS_CHARS = 2000

// System prompt injection for cache breaking (ant-only, ephemeral debugging state)
let systemPromptInjection: string | null = null

export function getSystemPromptInjection(): string | null {
  return systemPromptInjection
}

export function setSystemPromptInjection(value: string | null): void {
  systemPromptInjection = value
  // Clear context caches immediately when injection changes
  getUserContext.cache.clear?.()
  getSystemContext.cache.clear?.()
}

export const getGitStatus = memoize(async (): Promise<string | null> => {
  if (process.env.NODE_ENV === 'test') {
    // Avoid cycles in tests
    return null
  }

  const startTime = Date.now()

  const isGitStart = Date.now()
  const isGit = await getIsGit()

  if (!isGit) {
    return null
  }

  try {
    const gitCmdsStart = Date.now()
    const [branch, mainBranch, status, log, userName] = await Promise.all([
      getBranch(),
      getDefaultBranch(),
      execFileNoThrow(gitExe(), ['--no-optional-locks', 'status', '--short'], {
        preserveOutputOnError: false,
      }).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(
        gitExe(),
        ['--no-optional-locks', 'log', '--oneline', '-n', '5'],
        {
          preserveOutputOnError: false,
        },
      ).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(gitExe(), ['config', 'user.name'], {
        preserveOutputOnError: false,
      }).then(({ stdout }) => stdout.trim()),
    ])

    // Check if status exceeds character limit
    const truncatedStatus =
      status.length > MAX_STATUS_CHARS
        ? status.substring(0, MAX_STATUS_CHARS) +
          '\n... (已截断，因为超过了 2k 字符。如果你需要更多信息，请使用 Bash 工具运行 "git status")'
        : status

    return [
      `这是对话开始时的 git 状态。注意，这个状态是时间快照，在对话期间不会更新。`,
      `当前分支: ${branch}`,
      `主分支 (你通常会用它来提交 PR): ${mainBranch}`,
      ...(userName ? [`Git 用户: ${userName}`] : []),
      `状态:\n${truncatedStatus || '(干净)'}`,
      `最近的提交:\n${log}`,
    ].join('\n\n')
  } catch (error) {
    logError(error)
    return null
  }
})

/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
export const getSystemContext = memoize(
  async (): Promise<{
    [k: string]: string
  }> => {
    const startTime = Date.now()

    // Skip git status in CCR (unnecessary overhead on resume) or when git instructions are disabled
    const gitStatus =
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
      !shouldIncludeGitInstructions()
        ? null
        : await getGitStatus()

    // Include system prompt injection if set (for cache breaking, ant-only)
    const injection = feature('BREAK_CACHE_COMMAND')
      ? getSystemPromptInjection()
      : null

    // 检测平台信息（Windows/Linux/Mac）
    const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
    // 统一判定入口：与实际执行层（BashTool 归一化 + Shell.exec）同一事实来源。
    // 关键：未声明环境变量时执行层默认用 cmd.exe，此处的命令格式提示必须与之一致，
    // 否则会指示模型用 Unix 命令而实际由 cmd 执行，导致 ls/grep/pwd 报 not recognized。
    const resolvedShellKind = resolveWindowsShellKind()
    const displayShell = resolvedShellKind === 'bash' ? 'bash' : resolvedShellKind === 'powershell' ? 'PowerShell' : 'cmd.exe'

    let shellFormatInstruction: string
    if (process.platform !== 'win32') {
      shellFormatInstruction = '请返回 Unix shell 格式的命令'
    } else if (resolvedShellKind === 'bash') {
      shellFormatInstruction = '请返回 Unix shell 格式的命令（使用 ls、cat、grep 等），但使用 Windows 路径（如 D:/doge-code/file.txt）'
    } else if (resolvedShellKind === 'powershell') {
      shellFormatInstruction = '请返回 PowerShell 格式的命令'
    } else {
      shellFormatInstruction = '请返回 Windows cmd 格式的命令（使用 dir、type、del、findstr 等，避免 bash 特有语法）'
    }

    const shellInfo = `运行平台: ${platform}\n默认 Shell: ${displayShell}\n命令格式: ${shellFormatInstruction}`

    const glossary = await loadGlossary()

    return {
      ...(gitStatus && { gitStatus }),
      platformShell: shellInfo,
      ...(feature('BREAK_CACHE_COMMAND') && injection
        ? {
            cacheBreaker: `[CACHE_BREAKER: ${injection}]`,
          }
        : {}),
      ...glossary,
      sessionEpoch: `当前对话 epoch: ${getSessionEpoch()}（每次压缩后递增）`,
      planningAwareness: `项目架构定义在 PLANNING.md，任务追踪在 TASK.md。开始新任务前先读取两者。`,
    }
  },
)

/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
export const getUserContext = memoize(
  async (): Promise<{
    [k: string]: string
  }> => {
    const startTime = Date.now()

    // CLAUDE_CODE_DISABLE_CLAUDE_MDS: hard off, always.
    // --bare: skip auto-discovery (cwd walk), BUT honor explicit --add-dir.
    // --bare means "skip what I didn't ask for", not "ignore what I asked for".
    const shouldDisableClaudeMd =
      isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS) ||
      (isBareMode() && getAdditionalDirectoriesForClaudeMd().length === 0)
    // Await the async I/O (readFile/readdir directory walk) so the event
    // loop yields naturally at the first fs.readFile.
    const claudeMd = shouldDisableClaudeMd
      ? null
      : getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))
    // Cache for the auto-mode classifier (yoloClassifier.ts reads this
    // instead of importing claudemd.ts directly, which would create a
    // cycle through permissions/filesystem → permissions → yoloClassifier).
    setCachedClaudeMdContent(claudeMd || null)

    return {
      ...(claudeMd && { claudeMd }),
      currentDate: `今天的日期是: ${getLocalISODate()}.`,
    }
  },
)

