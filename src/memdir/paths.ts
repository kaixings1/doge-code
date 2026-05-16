import memoize from 'lodash-es/memoize.js'
import { homedir } from 'os'
import { isAbsolute, join, normalize, sep } from 'path'
import {
  getIsNonInteractiveSession,
  getProjectRoot,
} from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  getClaudeConfigHomeDir,
  isEnvDefinedFalsy,
  isEnvTruthy,
} from '../utils/envUtils.js'
import { findCanonicalGitRoot } from '../utils/git.js'
import { sanitizePath } from '../utils/path.js'
import {
  getInitialSettings,
  getSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * 自动记忆功能是否启用（memdir、agent 记忆、过去会话搜索）。
 * 默认启用。优先级链（优先采用先定义的）：
 *   1. CLAUDE_CODE_DISABLE_AUTO_MEMORY 环境变量（1/true → 关闭，0/false → 开启）
 *   2. CLAUDE_CODE_SIMPLE（--bare）→ 关闭
 *   3. 无持久化存储的 CCR → 关闭（无 CLAUDE_CODE_REMOTE_MEMORY_DIR）
 *   4. settings.json 中的 autoMemoryEnabled（支持项目级选择性退出）
 *   5. 默认：启用
 */
export function isAutoMemoryEnabled(): boolean {
  const envVal = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  if (isEnvTruthy(envVal)) {
    return false
  }
  if (isEnvDefinedFalsy(envVal)) {
    return true
  }
  // --bare / SIMPLE：prompts.ts 已通过其 SIMPLE 提前返回从系统提示词中
  // 移除了记忆部分；此守卫阻止另一半功能
  //（extractMemories 轮次结束分支、autoDream、/remember、/dream、team 同步）。
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return false
  }
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    !process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR
  ) {
    return false
  }
  const settings = getInitialSettings()
  if (settings.autoMemoryEnabled !== undefined) {
    return settings.autoMemoryEnabled
  }
  return true
}

/**
 * 提取记忆的后台代理是否会在本次会话中运行。
 *
 * 主代理的提示词始终包含完整的保存指令，不受此守卫影响 —
 * 当主代理写入记忆时，后台代理跳过该范围（extractMemories.ts 中的 hasMemoryWritesSince）；
 * 当主代理未写入时，后台代理捕获遗漏的任何内容。
 *
 * 调用者还必须通过 feature('EXTRACT_MEMORIES') 进行守卫 — 该检查不能
 * 放在此辅助函数内部，因为 feature() 仅在直接用于 `if` 条件时
 * 才会进行 tree-shaking。
 */
export function isExtractModeActive(): boolean {
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', false)) {
    return false
  }
  return (
    !getIsNonInteractiveSession() ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_thimble', false)
  )
}

/**
 * 返回持久化记忆存储的基目录。
 * 解析顺序：
 *   1. CLAUDE_CODE_REMOTE_MEMORY_DIR 环境变量（显式覆盖，在 CCR 中设置）
 *   2. ~/.claude（默认配置主目录）
 */
export function getMemoryBaseDir(): string {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR
  }
  return getClaudeConfigHomeDir()
}

const AUTO_MEM_DIRNAME = 'memory'
const AUTO_MEM_ENTRYPOINT_NAME = 'MEMORY.md'

/**
 * Normalize and validate a candidate auto-memory directory path.
 *
 * SECURITY: Rejects paths that would be dangerous as a read-allowlist root
 * or that normalize() doesn't fully resolve:
 * - relative (!isAbsolute): "../foo" — would be interpreted relative to CWD
 * - root/near-root (length < 3): "/" → "" after strip; "/a" too short
 * - Windows drive-root (C: regex): "C:\" → "C:" after strip
 * - UNC paths (\\server\share): network paths — opaque trust boundary
 * - null byte: survives normalize(), can truncate in syscalls
 *
 * 返回规范化后的路径，末尾恰好有一个分隔符，
 * 如果路径未设置/空/被拒绝，则返回 undefined。
 */
function validateMemoryPath(
  raw: string | undefined,
  expandTilde: boolean,
): string | undefined {
  if (!raw) {
    return undefined
  }
  let candidate = raw
  // Settings.json 路径支持 ~/ 扩展（用户友好）。环境变量
  // 覆盖不支持（它由 Cowork/SDK 以编程方式设置，应始终传递绝对路径）。
  // 裸的 "~"、"~/"、"~/"、"~/.." 等不会被扩展 —
  // 它们会使 isAutoMemPath() 匹配整个 $HOME 或其父目录
  //（与 "/" 或 "C:\" 同类的危险）。
  if (
    expandTilde &&
    (candidate.startsWith('~/') || candidate.startsWith('~\\'))
  ) {
    const rest = candidate.slice(2)
    // 拒绝会扩展到 $HOME 或其祖先目录的琐碎剩余部分。
    // normalize('') = '.'，normalize('.') = '.'，normalize('foo/..') = '.'，
    // normalize('..') = '..'，normalize('foo/../..') = '..'
    const restNorm = normalize(rest || '.')
    if (restNorm === '.' || restNorm === '..') {
      return undefined
    }
    candidate = join(homedir(), rest)
  }
  // normalize() 可能保留尾部分隔符；在添加恰好一个之前先去除，
  // 以匹配 getAutoMemPath() 的尾部分隔符约定
  const normalized = normalize(candidate).replace(/[/\\]+$/, '')
  if (
    !isAbsolute(normalized) ||
    normalized.length < 3 ||
    /^[A-Za-z]:$/.test(normalized) ||
    normalized.startsWith('\\\\') ||
    normalized.startsWith('//') ||
    normalized.includes('\0')
  ) {
    return undefined
  }
  return (normalized + sep).normalize('NFC')
}

/**
 * 通过环境变量直接覆盖自动记忆目录的完整路径。
 * 设置后，getAutoMemPath()/getAutoMemEntrypoint() 直接返回此路径，
 * 而不是计算 `{base}/projects/{sanitized-cwd}/memory/`。
 *
 * 由 Cowork 使用，将记忆重定向到空间作用域的挂载点，否则
 * 每次会话的 cwd（包含 VM 进程名）会为每次会话生成
 * 不同的项目键。
 */
function getAutoMemPathOverride(): string | undefined {
  return validateMemoryPath(
    process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE,
    false,
  )
}

/**
 * Settings.json 中覆盖自动记忆目录完整路径的设置。
 * 支持 ~/ 扩展以方便用户。
 *
 * 安全：projectSettings（提交到仓库的 .claude/settings.json）被
 * 有意排除在外 — 否则恶意仓库可以设置 autoMemoryDirectory: "~/.ssh"
 * 并通过 filesystem.ts 的写入例外（在 isAutoMemPath() 匹配且
 * hasAutoMemPathOverride() 为 false 时触发）静默获取对敏感目录的写入权限。
 * 这遵循与 hasSkipDangerousModePermissionPrompt() 等相同的模式。
 */
function getAutoMemPathSetting(): string | undefined {
  const dir =
    getSettingsForSource('policySettings')?.autoMemoryDirectory ??
    getSettingsForSource('flagSettings')?.autoMemoryDirectory ??
    getSettingsForSource('localSettings')?.autoMemoryDirectory ??
    getSettingsForSource('userSettings')?.autoMemoryDirectory
  return validateMemoryPath(dir, true)
}

/**
 * 检查 CLAUDE_COWORK_MEMORY_PATH_OVERRIDE 是否设置为有效的覆盖路径。
 * 将此用作 SDK 调用者已明确选择加入自动记忆机制的信号 —
 * 例如，当自定义系统提示词替换默认提示词时，决定是否注入记忆提示词。
 */
export function hasAutoMemPathOverride(): boolean {
  return getAutoMemPathOverride() !== undefined
}

/**
 * 返回规范的 git 仓库根目录（如果可用），否则回退到
 * 稳定的项目根目录。使用 findCanonicalGitRoot 使得同一仓库的
 * 所有工作树共享一个自动记忆目录（anthropics/claude-code#24382）。
 */
function getAutoMemBase(): string {
  return findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot()
}

/**
 * 返回自动记忆目录路径。
 *
 * 解析顺序：
 *   1. CLAUDE_COWORK_MEMORY_PATH_OVERRIDE 环境变量（完整路径覆盖，由 Cowork 使用）
 *   2. settings.json 中的 autoMemoryDirectory（仅受信任源：policy/local/user）
 *   3. <memoryBase>/projects/<sanitized-git-root>/memory/
 *      其中 memoryBase 由 getMemoryBaseDir() 解析
 *
 * 已记忆化：渲染路径调用者（collapseReadSearchGroups → isAutoManagedMemoryFile）
 * 每次工具使用消息重新渲染时触发；每次缓存未命中代价为
 * getSettingsForSource × 4 → parseSettingsFile（realpathSync + readFileSync）。
 * 以 projectRoot 为键，以便更改其中间模拟的测试可以重新计算；
 * 环境变量 / settings.json / CLAUDE_CONFIG_DIR 在生产中
 * 在会话期间是稳定的，并由每个测试的 cache.clear 覆盖。
 */
export const getAutoMemPath = memoize(
  (): string => {
    const override = getAutoMemPathOverride() ?? getAutoMemPathSetting()
    if (override) {
      return override
    }
    const projectsDir = join(getMemoryBaseDir(), 'projects')
    return (
      join(projectsDir, sanitizePath(getAutoMemBase()), AUTO_MEM_DIRNAME) + sep
    ).normalize('NFC')
  },
  () => getProjectRoot(),
)

/**
 * 返回给定日期（默认为今天）的每日日志文件路径。
 * 格式：<autoMemPath>/logs/YYYY/MM/YYYY-MM-DD.md
 *
 * 由 assistant 模式（feature('KAIROS')）使用：代理不是将 MEMORY.md
 * 维护为实时索引，而是在工作时追加到按日期命名的日志文件中。
 * 单独的夜间 /dream 技能将这些日志提炼为主题文件 + MEMORY.md。
 */
export function getAutoMemDailyLogPath(date: Date = new Date()): string {
  const yyyy = date.getFullYear().toString()
  const mm = (date.getMonth() + 1).toString().padStart(2, '0')
  const dd = date.getDate().toString().padStart(2, '0')
  return join(getAutoMemPath(), 'logs', yyyy, mm, `${yyyy}-${mm}-${dd}.md`)
}

/**
 * 返回自动记忆入口点（自动记忆目录内的 MEMORY.md）。
 * 遵循与 getAutoMemPath() 相同的解析顺序。
 */
export function getAutoMemEntrypoint(): string {
  return join(getAutoMemPath(), AUTO_MEM_ENTRYPOINT_NAME)
}

/**
 * 检查绝对路径是否在自动记忆目录内。
 *
 * 当设置了 CLAUDE_COWORK_MEMORY_PATH_OVERRIDE 时，此函数会与环境变量
 * 覆盖目录进行匹配。注意：返回 true 在此情况下并不 意味着
 * 写入权限 — filesystem.ts 的写入例外受 !hasAutoMemPathOverride() 守卫
 *（它存在是为了绕过 DANGEROUS_DIRECTORIES）。
 *
 * settings.json 的 autoMemoryDirectory 确实 获得了写入例外：这是
 * 用户从受信任的设置源中明确选择的（projectSettings 被排除 —
 * 参见 getAutoMemPathSetting），且 hasAutoMemPathOverride() 对其
 * 保持为 false。
 */
export function isAutoMemPath(absolutePath: string): boolean {
  // 安全：进行规范化以防止通过 .. 段绕过路径遍历
  const normalizedPath = normalize(absolutePath)
  return normalizedPath.startsWith(getAutoMemPath())
}
