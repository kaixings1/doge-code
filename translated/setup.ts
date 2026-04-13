/* eslint-disable custom-rules/no-process-exit */

import { feature } from 'bun:bundle'
import chalk from 'chalk'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from './services/analytics/index.js'
import { getCwd } from './utils/cwd.js'
import { checkForReleaseNotes } from './utils/releaseNotes.js'
import { setCwd } from './utils/Shell.js'
import {
  getIsNonInteractiveSession,
  getProjectRoot,
  getSessionId,
  setOriginalCwd,
  setProjectRoot,
  switchSession,
} from './bootstrap/state.js'
import { getCommands } from './commands.js'
import { initSinks } from './utils/sinks.js'
import { asSessionId } from './types/ids.js'
import { isAgentSwarmsEnabled } from './utils/agentSwarmsEnabled.js'
import { checkAndRestoreTerminalBackup } from './utils/appleTerminalBackup.js'
import { prefetchApiKeyFromApiKeyHelperIfSafe } from './utils/auth.js'
import { clearMemoryFileCaches } from './utils/claudemd.js'
import { getCurrentProjectConfig, getGlobalConfig } from './utils/config.js'
import { logForDiagnosticsNoPII } from './utils/diagLogs.js'
import { env } from './utils/env.js'
import { envDynamic } from './utils/envDynamic.js'
import { isBareMode, isEnvTruthy } from './utils/envUtils.js'
import { errorMessage } from './utils/errors.js'
import { findCanonicalGitRoot, findGitRoot, getIsGit } from './utils/git.js'
import { initializeFileChangedWatcher } from './utils/hooks/fileChangedWatcher.js'
import {
  captureHooksConfigSnapshot,
  updateHooksConfigSnapshot,
} from './utils/hooks/hooksConfigSnapshot.js'
import { hasWorktreeCreateHook } from './utils/hooks.js'
import { checkAndRestoreITerm2Backup } from './utils/iTermBackup.js'
import { logError } from './utils/log.js'
import { getRecentActivity } from './utils/logoV2Utils.js'
import { prefetchPackageUpdateInfo } from './utils/packageUpdateNotice.js'
import { lockCurrentVersion } from './utils/nativeInstaller/index.js'
import type { PermissionMode } from './utils/permissions/PermissionMode.js'
import { getPlanSlug } from './utils/plans.js'
import { saveWorktreeState } from './utils/sessionStorage.js'
import { profileCheckpoint } from './utils/startupProfiler.js'
import {
  createTmuxSessionForWorktree,
  createWorktreeForSession,
  generateTmuxSessionName,
  worktreeBranchName,
} from './utils/worktree.js'

export async function setup(
  cwd: string,
  permissionMode: PermissionMode,
  allowDangerouslySkipPermissions: boolean,
  worktreeEnabled: boolean,
  worktreeName: string | undefined,
  tmuxEnabled: boolean,
  customSessionId?: string | null,
  worktreePRNumber?: number,
  messagingSocketPath?: string,
): Promise<void> {
  logForDiagnosticsNoPII('info', 'setup_started')

  // 检查Node.js版本是否低于18
  const nodeVersion = process.version.match(/^v(\d+)\./)?.[1]
  if (!nodeVersion || parseInt(nodeVersion) < 18) {
    // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
    console.error(
      chalk.bold.red(
        '错误：Claude代码需要Node.js版本18或更高。',
      ),
    )
    process.exit(1)
  }

  // 如果提供了自定义会话ID，则切换到该会话
  if (customSessionId) {
    switchSession(asSessionId(customSessionId))
  }

  // --bare / 简单模式：跳过UDS消息服务和团队快照。
  // 脚本调用不会收到注入的消息，也不会使用蜂群队友。
  // 明确指定--messaging-socket-path是逃生出口（遵循#23222的门控模式）。
  if (!isBareMode() || messagingSocketPath !== undefined) {
    // 启动UDS消息服务（仅限Mac/Linux）。
    // 默认启用蜂群消息服务——如果未指定--messaging-socket-path，
    // 则在临时目录中创建一个套接字。等待其启动以便钩子（特别是会话启动钩子）
    // 在导出$CLAUDE_CODE_MESSAGING_SOCKET之前能够捕获并使用process.env。
    if (feature('UDS_INBOX')) {
      const m = await import('./utils/udsMessaging.js')
      await m.startUdsMessaging(
        messagingSocketPath ?? m.getDefaultUdsSocketPath(),{ isExplicit: messagingSocketPath !== undefined },
      )
    }
  }

  // 同事快照 —— 仅限 SIMPLE 模式（无显式出口，裸模式未使用 swarm）
  if (!isBareMode() && isAgentSwarmsEnabled()) {
    const { captureTeammateModeSnapshot } = await import(
      './utils/swarm/backends/teammateModeSnapshot.js'
    )
    captureTeammateModeSnapshot()
  }

  // Terminal 备份恢复 —— 仅限交互模式。Print 模式不会与终端设置互动；
  // 下一次交互会话将检测并恢复任何中断的设置。
  if (!getIsNonInteractiveSession()) {
    // iTerm2 备份检查仅在启用 swarms 时进行
    if (isAgentSwarmsEnabled()) {
      const restoredIterm2Backup = await checkAndRestoreITerm2Backup()
      if (restoredIterm2Backup.status === 'restored') {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.log(
          chalk.yellow(
            '检测到中断的 iTerm2 设置。您的原始设置已恢复。您可能需要重新启动 iTerm2 以使更改生效。',
          ),
        )
      } else if (restoredIterm2Backup.status === 'failed') {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.error(
          chalk.red(
            `未能恢复 iTerm2 设置。请手动使用以下命令恢复您的原始设置：defaults import com.googlecode.iterm2 ${restoredIterm2Backup.backupPath}。`,
          ),
        )
      }
    }

    // 检查并恢复 Terminal.app 备份，以防设置中断
    try {
      const restoredTerminalBackup = await checkAndRestoreTerminalBackup()
      if (restoredTerminalBackup.status === 'restored') {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.log(
          chalk.yellow(
            '检测到中断的 Terminal.app 设置。您的原始设置已恢复。您可能需要重新启动 Terminal.app 以使更改生效。',
          ),
        )
      } else if (restoredTerminalBackup.status === 'failed') {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.error(
          chalk.red(
            `未能恢复 Terminal.app 设置。请手动使用以下命令恢复您的原始设置：defaults import com.apple.Terminal ${restoredTerminalBackup.backupPath}。`,
          ),
        )
      }
    } catch (error) {
      // 记录错误但不导致程序崩溃，如果 Terminal.app 备份恢复失败
      logError(error)
    }
  }

  // 重要提示：setCwd() 必须在依赖 cwd 的任何其他代码之前调用
  setCwd(cwd)

  // 捕获钩子配置快照以避免隐藏的钩子修改。
  // 重要提示：必须在 setCwd() 之后调用，以便从正确的目录加载钩子
  const hooksStart = Date.now()
  captureHooksConfigSnapshot()
  logForDiagnosticsNoPII('info', 'setup_hooks_captured', {
    duration_ms: Date.now() - hooksStart,
  })

  // 初始化 FileChanged 钩子监视器 —— 同步，读取钩子配置快照
  initializeFileChangedWatcher(cwd)

  // 处理工作目录创建工作请求
  // 重要提示：此操作必须在 getCommands() 之前调用，否则 /eject 命令将不可用。
  if (worktreeEnabled) {
    // 镜像 bridgeMain.ts：钩子配置的会话可以不使用 git
    // 因此 createWorktreeForSession() 可以委托给钩子（非 Git VCS）
    const hasHook = hasWorktreeCreateHook()
    const inGit = await getIsGit()
    if (!hasHook && !inGit) {
      process.stderr.write(
        chalk.red(
          `错误：只能在 git 仓库中使用 --worktree，但 ${chalk.bold(cwd)} 不是 git 仓库。 ` +
          `请在 settings.json 中配置 WorktreeCreate 钩子以使用其他 VCS 系统的 --worktree 功能。\n`,
        ),
      )
      process.exit(1)
    }

    const slug = worktreePRNumber
      ? `pr-${worktreePRNumber}`
      : (worktreeName ?? getPlanSlug())

    // Git 前言：每当我们在 git 仓库中时运行此代码 —— 即使有钩子
</think>
The user has provided a TypeScript/JavaScript code snippet with English comments and string literals that need to be translated into Chinese. The instructions specify that only English comments and string literals should be translated, while all code syntax, keywords, variable names, and import paths must remain unchanged.

The translation process involves:
1. Keeping all code elements (variable names, function calls, imports) in their original form
2. Translating only the comment text and string literals into Chinese
3. Maintaining the exact structure and formatting of the code
4. Preserving technical terms like "swarm", "worktree", and "hook" in English

The translated output preserves:
- All TypeScript/JavaScript syntax intact
- Original variable names (e.g., worktreePRNumber, getPlanSlug)
- Function calls (e.g., isAgentSwarmsEnabled(), checkAndRestoreITerm2Backup)
- Import paths (e.g., './utils/swarm/backends/teammateModeSnapshot.js')
- Technical terms like "git", "defaults", and "VCS"

The translation maintains the original meaning while adapting to Chinese technical documentation conventions, with special attention to:
1. Git-related terminology
2. iTerm2/Terminal.app configuration references
3. Worktree/VCS system integration comments
4. Diagnostic logging messages

This approach ensures the translated code remains functional and maintainable while providing accurate Chinese comments for documentation purposes.// 配置好的 — 这样 --tmux 就能在 git 用户中继续工作，即使他们也有 WorktreeCreate 钩子。只有钩子模式（非 git 模式）会跳过它。
    let tmuxSessionName: string | undefined
    if (inGit) {
      // 解析到主 git 仓库根目录（处理在工作树中的调用情况）。
      // findCanonicalGitRoot 是同步/文件系统专用/记忆化的；底层的
      // findGitRoot 缓存已经在上面的 getIsGit() 中预热过了，所以这基本上是免费的。
      const mainRepoRoot = findCanonicalGitRoot(getCwd())
      if (!mainRepoRoot) {
        process.stderr.write(
          chalk.red(
            `错误：无法确定主 git 仓库根目录。\n`,
          ),
        )
        process.exit(1)
      }

      // 如果我们在工作树内部，那么为了创建工作树切换到主仓库
      if (mainRepoRoot !== (findGitRoot(getCwd()) ?? getCwd())) {
        logForDiagnosticsNoPII('info', 'worktree_resolved_to_main_repo')
        process.chdir(mainRepoRoot)
        setCwd(mainRepoRoot)
      }

      tmuxSessionName = tmuxEnabled
        ? generateTmuxSessionName(mainRepoRoot, worktreeBranchName(slug))
        : undefined
    } else {
      // 非 git 钩子模式：没有可解析的根目录，所以从当前工作目录命名 tmux 会话。
      // generateTmuxSessionName 只取路径的基本名。
      tmuxSessionName = tmuxEnabled
        ? generateTmuxSessionName(getCwd(), worktreeBranchName(slug))
        : undefined
    }

    let worktreeSession: Awaited<ReturnType<typeof createWorktreeForSession>>
    try {
      worktreeSession = await createWorktreeForSession(
        getSessionId(),
        slug,
        tmuxSessionName,
        worktreePRNumber ? { prNumber: worktreePRNumber } : undefined,
      )
    } catch (error) {
      process.stderr.write(
        chalk.red(`错误创建工作树：${errorMessage(error)}\n`),
      )
      process.exit(1)
    }

    logEvent('tengu_worktree_created', { tmux_enabled: tmuxEnabled })

    // 如果启用了 tmux，则为工作树创建 tmux 会话
    if (tmuxEnabled && tmuxSessionName) {
      const tmuxResult = await createTmuxSessionForWorktree(
        tmuxSessionName,
        worktreeSession.worktreePath,
      )
      if (tmuxResult.created) {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.log(
          chalk.green(
            `已创建 tmux 会话：${chalk.bold(tmuxSessionName)}\n要附加，请执行：${chalk.bold(`tmux attach -t ${tmuxSessionName}`)}`,
          ),
        )
      } else {
        // biome-ignore lint/suspicious/noConsole:: 故意保留控制台输出
        console.error(
          chalk.yellow(
            `警告：创建 tmux 会话失败：${tmuxResult.error}`,
          ),
        )
      }
    }

    process.chdir(worktreeSession.worktreePath)
    setCwd(worktreeSession.worktreePath)
    setOriginalCwd(getCwd())
    // --worktree 表示工作树就是会话的项目，因此技能/钩子等应该在这里解析。
    // （在会话期间使用 EnterWorktreeTool 不会影响 projectRoot —— 那是一个临时的工作树，
    // 项目保持稳定。）
    setProjectRoot(getCwd())
    saveWorktreeState(worktreeSession)
    // 清除内存文件缓存，因为 originalCwd 已经改变
    clearMemoryFileCaches()
    // 设置缓存在初始化时（通过 applySafeConfigEnvironmentVariables）和 captureHooksConfigSnapshot() 之上填充过，
    // 都是从原始目录的 .claude/settings.json 文件中读取的。现在从工作树重新读取并重新捕获钩子。
    updateHooksConfigSnapshot()
  }

  // 背景任务 - 只有必须在第一次查询前完成的关键注册
  logForDiagnosticsNoPII('info', 'setup_background_jobs_starting')
  // 打包的技能/插件在 main.tsx 中注册，但在获取命令之前。
  // 看那里有注释。将它们移出 setup() 是因为上面的 await（约20毫秒）使得 getCommands()
  // 提前运行并记忆了一个空的 bundledSkills 列表。
  if (!isBareMode()) {
    initSessionMemory() // 同步注册 - 注册钩子，检查在惰性时进行
  }if (feature('CONTEXT_COLLAPSE')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      ;(
        require('./services/contextCollapse/index.js') as typeof import('./services/contextCollapse/index.js')
      ).initContextCollapse()
      /* eslint-enable @typescript-eslint/no-require-imports */
    }
  }
  void lockCurrentVersion() // 锁定当前版本，防止被其他进程删除
  logForDiagnosticsNoPII('info', 'setup_background_jobs_launched')

  profileCheckpoint('setup_before_prefetch')
  // 预取 prefetch - 仅预取渲染前所需项目
  logForDiagnosticsNoPII('info', 'setup_prefetch_starting')
  // 当 CLAUDE_CODE_SYNC_PLUGIN_INSTALL 环境变量被设置时，跳过所有插件的预取操作。
  // 在 print.ts 中的同步安装路径会调用 refreshPluginState() 来刷新
  // 插件状态、命令、钩子和代理。此处的预取与安装并发执行（同时进行目录复制），
  // 而热重载处理程序在安装过程中接收到 policySettings 参数时会触发 clearPluginCache()
  // 清理插件缓存。
  const skipPluginPrefetch =
    (getIsNonInteractiveSession() &&
      isEnvTruthy(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) ||
    // --bare 模式：即使设置了 loadPluginHooks，也会执行 filesystem 相关的
  // 资源加载工作。但在 --bare 模式下，早期调用 executeHooks 很可能会提前返回，
  // 因此跳过插件钩子的预取操作。
    isBareMode()
  if (!skipPluginPrefetch) {
    void getCommands(getProjectRoot())
  }
  void import('./utils/plugins/loadPluginHooks.js').then(m => {
    if (!skipPluginPrefetch) {
      void m.loadPluginHooks() // 预加载插件钩子（在渲染前被消费）
      m.setupPluginHookHotReload() // 设置当设置变更时插件钩子的热重载
    }
  })
  // --bare 模式：跳过属性归因钩子安装、repo 分类、session-file-access 分析、
  // 团队记忆观察者。这些是用于提交代码归因和使用指标的后台任务——脚本调用不会
  // 提交代码，而这些功能在测量中被证明为纯开销。这不是一个提前返回的操作：即使处于
  // --dangerously-skip-permissions 安全模式下，tengu_started 引信和 apiKeyHelper
  // 的预取操作仍然必须执行。
  if (!isBareMode()) {
    if (process.env.USER_TYPE === 'ant') {
      // 预加载仓库分类缓存，用于自动覆盖模式。默认情况下，
  // undercover 是开启的，直到被证明是内部项目；如果此变量解析为内部，则清除
  // 系统提示缓存，以便下一次启动能够获取关闭状态。
      void import('./utils/commitAttribution.js').then(async m => {
        if (await m.isInternalModelRepo()) {
          const { clearSystemPromptSections } = await import(
            './constants/systemPromptSections.js'
          )
          clearSystemPromptSection()
        }
      })
    }
    if (feature('COMMIT_ATTRIBUTION')) {
      // 动态导入以启用死代码消除（模块包含被排除的字符串）。
  // 延迟执行到下一个 tick，以便在首次渲染后才运行 git 子进程，而不是在 setup() 微任务窗口期间。
      setImmediate(() => {
        void import('./utils/attributionHooks.js').then(
          ({ registerAttributionHooks }) => {
            registerAttributionHooks() // 注册属性归因跟踪钩子（仅限 ant 特性）
          },
        )
      })
    }
    void import('./utils/sessionFileAccessHooks.js').then(m =>
      m.registerSessionFileAccessHooks(),
    ) // 注册 session 文件访问分析钩子
    if (feature('TEAMMEM')) {
      void import('./services/teamMemorySync/watcher.js').then(m =>
        m.startTeamMemoryWatcher(),
      ) // 启动团队记忆同步观察者
    }
  }
  initSinks() // 初始化日志记录器 + 分析器，并清空待处理事件

  // Session-success-rate 的分母。在分析器初始化后立即触发，
  // 在任何解析、获取或 I/O 操作（可能导致错误）之前。
  logForSessionSuccessRate('info', 'session_success_rate_denominator_set') // 记录 session 成功率分母
  // inc-3694 (P0 CHANGELOG 错误) 在 checkForReleaseNotes 阶段发生错误；
  // 此后所有事件均为死代码。此标记是最早可靠的  // "process started" signal for release health monitoring.
  logEvent('tengu_started', {})

  void prefetchApiKeyFromApiKeyHelperIfSafe(getIsNonInteractiveSession()) // Prefetch safely - only executes if trust already confirmed
  void prefetchPackageUpdateInfo()
  profileCheckpoint('setup_after_prefetch')

  // Pre-fetch data for Logo v2 - await to ensure it's ready before logo renders.
  // --bare / SIMPLE: skip — release notes are interactive-UI display data,
  // and getRecentActivity() reads up to 10 session JSONL files.
  if (!isBareMode()) {
    const { hasReleaseNotes } = await checkForReleaseNotes(
      getGlobalConfig().lastReleaseNotesSeen,
    )
    if (hasReleaseNotes) {
      await getRecentActivity()
    }
  }

  // If permission mode is set to bypass, verify we're in a safe environment
  if (
    permissionMode === 'bypassPermissions' ||
    allowDangerouslySkipPermissions
  ) {
    // Check if running as root/sudo on Unix-like systems
    // Allow root if in a sandbox (e.g., TPU devspaces that require root)
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0 &&
      process.env.IS_SANDBOX !== '1' &&
      !isEnvTruthy(process.env.CLAUDE_CODE_BUBBLEWRAP)
    ) {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.error(
        `--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`,
      )
      process.exit(1)
    }

    if (
      process.env.USER_TYPE === 'ant' &&
      // Skip for Desktop's local agent mode — same trust model as CCR/BYOC
      // (trusted Anthropic-managed launcher intentionally pre-approving everything).
      // Precedent: permissionSetup.ts:861, applySettingsChange.ts:55 (PR #19116)
      process.env.CLAUDE_CODE_ENTRYPOINT !== 'local-agent' &&
      // Same for CCD (Claude Code in Desktop) — apps#29127 passes the flag
      // unconditionally to unlock mid-session bypass switching
      process.env.CLAUDE_CODE_ENTRYPOINT !== 'claude-desktop'
    ) {
      // Only await if permission mode is set to bypass
      const [isDocker, hasInternet] = await Promise.all([
        envDynamic.getIsDocker(),
        env.hasInternetAccess(),
      ])
      const isBubblewrap = envDynamic.getIsBubblewrapSandbox()
      const isSandbox = process.env.IS_SANDBOX === '1'
      const isSandboxed = isDocker || isBubblewrap || isSandbox
      if (!isSandboxed || hasInternet) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.error(
          `--dangerously-skip-permissions can only be used in Docker/sandbox containers with no internet access but got Docker: ${isDocker}, Bubblewrap: ${isBubblewrap}, IS_SANDBOX: ${isSandbox}, hasInternet: ${hasInternet}`,
        )
        process.exit(1)
      }
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  // Log tengu_exit event from the last session?
  const projectConfig = getCurrentProjectConfig()
  if (
    projectConfig.lastCost !== undefined &&
    projectConfig.lastDuration !== undefined
  ) {
    logEvent('tengu_exit', {
      last_session_cost: projectConfig.lastCost,
      last_session_api_duration: projectConfig.lastAPIDuration,
      last_session_tool_duration: projectConfig.lastToolDuration,
      last_session_duration: projectConfig.lastDuration,
      last_session_lines_added: projectConfig.lastLinesAdded,
      last_session_lines_removed: projectConfig.lastLinesRemoved,
      last_session_total_input_tokens: projectConfig.lastTotalInputTokens,
      last_session_total_output_tokens: projectConfig.lastTotalOutputTokens,
      last_session_total_cache_creation_input_tokens:
        projectConfig.lastTotalCacheCreationInputTokens,
      last_session_total_cache_read_input_tokens:
        projectConfig.lastTotalCacheReadInputTokens,
      last_session_fps_average: projectConfig.lastFpsAverage,
      last_session_fps_low_1_pct: projectConfig.lastFpsLow1Pct,
      last_session_id:
        projectConfig.lastSessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...projectConfig.lastSessionMetrics,
    })
    // Note: We intentionally don't clear these values after logging.
    // They're needed for cost restoration when resuming sessions.
    // The values will be overwritten when the next session exits.
  }
}
