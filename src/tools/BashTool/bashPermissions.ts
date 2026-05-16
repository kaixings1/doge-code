import { feature } from 'bun:bundle'
import { APIUserAbortError } from '@anthropic-ai/sdk'
import type { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { ToolPermissionContext, ToolUseContext } from '../../Tool.js'
import type { PendingClassifierCheck } from '../../types/permissions.js'
import { count } from '../../utils/array.js'
import {
  checkSemantics,
  nodeTypeId,
  type ParseForSecurityResult,
  parseForSecurityFromAst,
  type Redirect,
  type SimpleCommand,
} from '../../utils/bash/ast.js'
import {
  type CommandPrefixResult,
  extractOutputRedirections,
  getCommandSubcommandPrefix,
  splitCommand_DEPRECATED,
} from '../../utils/bash/commands.js'
import { parseCommandRaw } from '../../utils/bash/parser.js'
import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { AbortError } from '../../utils/errors.js'
import type {
  ClassifierBehavior,
  ClassifierResult,
} from '../../utils/permissions/bashClassifier.js'
import {
  classifyBashCommand,
  getBashPromptAllowDescriptions,
  getBashPromptAskDescriptions,
  getBashPromptDenyDescriptions,
  isClassifierPermissionsEnabled,
} from '../../utils/permissions/bashClassifier.js'
import type {
  PermissionDecisionReason,
  PermissionResult,
} from '../../utils/permissions/PermissionResult.js'
import type {
  PermissionRule,
  PermissionRuleValue,
} from '../../utils/permissions/PermissionRule.js'
import { extractRules } from '../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import { permissionRuleValueToString } from '../../utils/permissions/permissionRuleParser.js'
import {
  createPermissionRequestMessage,
  getRuleByContentsForTool,
} from '../../utils/permissions/permissions.js'
import {
  parsePermissionRule,
  type ShellPermissionRule,
  matchWildcardPattern as sharedMatchWildcardPattern,
  permissionRuleExtractPrefix as sharedPermissionRuleExtractPrefix,
  suggestionForExactCommand as sharedSuggestionForExactCommand,
  suggestionForPrefix as sharedSuggestionForPrefix,
} from '../../utils/permissions/shellRuleMatching.js'
import { getPlatform } from '../../utils/platform.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { windowsPathToPosixPath } from '../../utils/windowsPaths.js'
import { BashTool } from './BashTool.js'
import { checkCommandOperatorPermissions } from './bashCommandHelpers.js'
import {
  bashCommandIsSafeAsync_DEPRECATED,
  stripSafeHeredocSubstitutions,
} from './bashSecurity.js'
import { checkPermissionMode } from './modeValidation.js'
import { checkPathConstraints } from './pathValidation.js'
import { checkSedConstraints } from './sedValidation.js'
import { shouldUseSandbox } from './shouldUseSandbox.js'

// DCE 边界：Bun 的 feature() 求值器有每个函数的复杂度预算。
// bashToolHasPermission 刚好在边界上。`import { X as Y }` 别名
// 在 import 块内会计入这个预算；当超出阈值时，Bun 无法证明
// feature('BASH_CLASSIFIER') 是常量，会静默地将三元表达式求值为 `false`，
// 从而丢失所有 pendingClassifierCheck 的展开。请使用顶层 const 重绑定
// 替代。（另见下方 checkSemanticsDeny 上的注释。）
const bashCommandIsSafeAsync = bashCommandIsSafeAsync_DEPRECATED
const splitCommand = splitCommand_DEPRECATED

// 环境变量赋值前缀（VAR=value）。在三个 while 循环中共享，
// 这些循环在提取命令名称之前跳过安全的环境变量。
const ENV_VAR_ASSIGN_RE = /^[A-Za-z_]\w*=/

// CC-643：对于复杂的复合命令，splitCommand_DEPRECATED 可能生成非常大的
// subcommands 数组（可能呈指数级增长；#21405 的 ReDoS 修复可能不完整）。
// 每个子命令随后执行 tree-sitter 解析 + ~20 个验证器 + logEvent (bashSecurity.ts)，
// 在带记忆的元数据下，产生的微任务链会饿死事件循环 —— REPL 在 100% CPU 下冻结，
// strace 显示 /proc/self/stat 读取频率约 127Hz，没有 epoll_wait。
// 50 是宽裕的限制：合法的用户命令不会拆分得那么宽。超过上限时我们
// 回退到 'ask'（安全默认值 —— 我们无法证明安全性，因此提示用户）。
export const MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50

// GH#11380：限制复合命令中建议的每个子命令规则数量。
// 超过此限制后，"是，并且不再询问 X, Y, Z…" 标签会退化为
// "类似命令"，且一次提示保存 10+ 条规则更可能是噪音而非意图。
// 用户在一个 && 链中连接这么多写命令的情况很少见；
// 他们总可以先批准一次，再手动添加规则。
export const MAX_SUGGESTED_RULES_FOR_COMPOUND = 5

/**
 * [仅 ANT] 记录分类器评估结果用于分析。
 * 这帮助我们了解哪些分类器规则正在被评估，
 * 以及分类器如何对命令做出决策。
 */
function logClassifierResultForAnts(
  command: string,
  behavior: ClassifierBehavior,
  descriptions: string[],
  result: ClassifierResult,
): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  logEvent('tengu_internal_bash_classifier_result', {
    behavior:
      behavior as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    descriptions: jsonStringify(
      descriptions,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    matches: result.matches,
    matchedDescription: (result.matchedDescription ??
      '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    confidence:
      result.confidence as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    reason:
      result.reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    // 注意：命令包含代码/文件路径——这是仅限 ANT 的，因此没问题
    command:
      command as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

/**
 * 从原始命令字符串中提取稳定的命令前缀（命令 + 子命令）。
 * 仅当开头的环境变量赋值在 SAFE_ENV_VARS（或 ant 用户的
 * ANT_ONLY_SAFE_ENV_VARS）中时才跳过它们。如果遇到非安全的环境变量，
 * 或第二个令牌看起来不像子命令（小写字母数字，如 "commit"、"run"），
 * 则返回 null（回退到精确匹配）。
 *
 * 示例：
 *   'git commit -m "fix typo"' → 'git commit'
 *   'NODE_ENV=prod npm run build' → 'npm run'（NODE_ENV 是安全的）
 *   'MY_VAR=val npm run build' → null（MY_VAR 不安全）
 *   'ls -la' → null（标志，不是子命令）
 *   'cat file.txt' → null（文件名，不是子命令）
 *   'chmod 755 file' → null（数字，不是子命令）
 */
export function getSimpleCommandPrefix(command: string): string | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  // 跳过开头的环境变量赋值（VAR=value），但仅当它们在 SAFE_ENV_VARS
  //（或 ant 用户的 ANT_ONLY_SAFE_ENV_VARS）中时。如果遇到非安全的环境变量，
  // 返回 null 以回退到精确匹配。这防止生成如 Bash(npm run:*) 这样的前缀规则，
  // 这些规则在允许规则检查时永远无法匹配，因为 stripSafeWrappers 只剥离安全变量。
  let i = 0
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i]!)) {
    const varName = tokens[i]!.split('=')[0]!
    const isAntOnlySafe =
      process.env.USER_TYPE === 'ant' && ANT_ONLY_SAFE_ENV_VARS.has(varName)
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null
    }
    i++
  }

  const remaining = tokens.slice(i)
  if (remaining.length < 2) return null
  const subcmd = remaining[1]!
  // 第二个令牌必须看起来像子命令（例如 "commit"、"run"、"compose"），
  // 而不是标志（-rf）、文件名（file.txt）、路径（/tmp）、URL 或数字（755）。
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(subcmd)) return null
  return remaining.slice(0, 2).join(' ')
}

// 像 `bash:*` 或 `sh:*` 这样的裸前缀建议会通过 `-c` 允许任意代码。
// 像 `env:*` 或 `sudo:*` 这样的包装器建议也会如此：
// `env` 不在 SAFE_WRAPPER_PATTERNS 中，因此 `env bash -c "evil"`
// 会原样通过 stripSafeWrappers，并在前缀规则匹配器中匹配 startsWith("env ") 检查。
// Shell 列表镜像了 src/utils/shell/prefix.ts 中的 DANGEROUS_SHELL_PREFIXES，
// 后者保护了旧的 Haiku 提取器。
const BARE_SHELL_PREFIXES = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'csh',
  'tcsh',
  'ksh',
  'dash',
  'cmd',
  'powershell',
  'pwsh',
  // 将其参数作为命令执行的包装器
  'env',
  'xargs',
  // 安全：checkSemantics (ast.ts) 剥离这些包装器以检查被包装的命令。
  // 建议 `Bash(nice:*)` 相当于 `Bash(*)` —— 用户会在提示后添加它，
  // 然后 `nice rm -rf /` 通过语义检查，而 deny/cd+git 关卡看到的是 'nice'
  //（下面的 SAFE_WRAPPER_PATTERNS 在此修复之前不会剥离裸 `nice`）。
  // 阻止这些被建议。
  'nice',
  'stdbuf',
  'nohup',
  'timeout',
  'time',
  // 权限提升 —— 来自 `sudo -u foo ...` 的 `sudo:*` 会自动批准
  // 任何未来的 sudo 调用
  'sudo',
  'doas',
  'pkexec',
])

/**
 * 仅 UI 回退：当 getSimpleCommandPrefix 拒绝时，仅提取第一个词。
 * 在外部构建中 TREE_SITTER_BASH 关闭，因此 BashPermissionRequest 中的
 * 异步 tree-sitter 细化从未触发 —— 没有这个，管道和复合命令
 *（`python3 file.py 2>&1 | tail -20`）会原样倒入可编辑字段。
 *
 * 有意未被 suggestionForExactCommand 使用：后端建议的 `Bash(rm:*)`
 * 范围太广无法自动生成，但作为可编辑的起点，这正是用户期望的
 *（Slack C07VBSHV7EV/p1772670433193449）。
 *
 * 重用与 getSimpleCommandPrefix 相同的 SAFE_ENV_VARS 关卡 ——
 * 像 `Bash(python3:*)` 这样的规则在检查时永远无法匹配
 * `RUN=/path python3 ...`，因为 stripSafeWrappers 不会剥离 RUN。
 */
export function getFirstWordPrefix(command: string): string | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean)

  let i = 0
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i]!)) {
    const varName = tokens[i]!.split('=')[0]!
    const isAntOnlySafe =
      process.env.USER_TYPE === 'ant' && ANT_ONLY_SAFE_ENV_VARS.has(varName)
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null
    }
    i++
  }

  const cmd = tokens[i]
  if (!cmd) return null
  // 与 getSimpleCommandPrefix 中的子命令正则表达式相同的形状检查：
  // 拒绝路径（./script.sh, /usr/bin/python）、标志、数字、文件名。
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(cmd)) return null
  if (BARE_SHELL_PREFIXES.has(cmd)) return null
  return cmd
}

function suggestionForExactCommand(command: string): PermissionUpdate[] {
  // Heredoc 命令包含每次调用都会变化的多行内容，
  // 使精确匹配规则无用（它们永远不会再次匹配）。
  // 提取 heredoc 操作符前的稳定前缀，改为建议前缀规则。
  const heredocPrefix = extractPrefixBeforeHeredoc(command)
  if (heredocPrefix) {
    return sharedSuggestionForPrefix(BashTool.name, heredocPrefix)
  }

  // 没有 heredoc 的多行命令也不适合作为精确匹配规则。
  // 保存完整的多行文本可能产生中间包含 `:*` 的模式，
  // 这会导致权限验证失败并损坏设置文件。改用第一行作为前缀规则。
  if (command.includes('\n')) {
    const firstLine = command.split('\n')[0]!.trim()
    if (firstLine) {
      return sharedSuggestionForPrefix(BashTool.name, firstLine)
    }
  }

  // 单行命令：提取一个双词前缀用于可重用规则。
  // 没有这个，保存的精确匹配规则永远不会匹配未来带不同参数的调用。
  const prefix = getSimpleCommandPrefix(command)
  if (prefix) {
    return sharedSuggestionForPrefix(BashTool.name, prefix)
  }

  return sharedSuggestionForExactCommand(BashTool.name, command)
}

/**
 * 如果命令包含 heredoc（<<），提取其前的命令前缀。
 * 返回 heredoc 操作符之前的第一个单词作为稳定前缀，
 * 如果命令不包含 heredoc 则返回 null。
 *
 * 示例：
 *   'git commit -m "$(cat <<\'EOF\'\n...\nEOF\n)"' → 'git commit'
 *   'cat <<EOF\nhello\nEOF' → 'cat'
 *   'echo hello' → null（无 heredoc）
 */
function extractPrefixBeforeHeredoc(command: string): string | null {
  if (!command.includes('<<')) return null

  const idx = command.indexOf('<<')
  if (idx <= 0) return null

  const before = command.substring(0, idx).trim()
  if (!before) return null

  const prefix = getSimpleCommandPrefix(before)
  if (prefix) return prefix

  // 回退：跳过安全环境变量赋值，取最多 2 个令牌。
  // 这保留了标志令牌（例如 "python3 -c" 保持为 "python3 -c"，
  // 而不仅仅是 "python3"），并跳过像 "NODE_ENV=test" 这样的安全环境变量前缀。
  // 如果遇到非安全环境变量，返回 null 以避免生成永远无法匹配的前缀规则
  //（与 getSimpleCommandPrefix 相同的基本原理）。
  const tokens = before.split(/\s+/).filter(Boolean)
  let i = 0
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i]!)) {
    const varName = tokens[i]!.split('=')[0]!
    const isAntOnlySafe =
      process.env.USER_TYPE === 'ant' && ANT_ONLY_SAFE_ENV_VARS.has(varName)
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null
    }
    i++
  }
  if (i >= tokens.length) return null
  return tokens.slice(i, i + 2).join(' ') || null
}

function suggestionForPrefix(prefix: string): PermissionUpdate[] {
  return sharedSuggestionForPrefix(BashTool.name, prefix)
}

/**
 * 从旧版 :* 语法中提取前缀（例如 "npm:*" -> "npm"）
 * 委托给共享实现。
 */
export const permissionRuleExtractPrefix = sharedPermissionRuleExtractPrefix

/**
 * 将命令与通配符模式进行匹配（Bash 区分大小写）。
 * 委托给共享实现。
 */
export function matchWildcardPattern(
  pattern: string,
  command: string,
): boolean {
  return sharedMatchWildcardPattern(pattern, command)
}

/**
 * 将权限规则解析为结构化规则对象。
 * 委托给共享实现。
 */
export const bashPermissionRule: (
  permissionRule: string,
) => ShellPermissionRule = parsePermissionRule

/**
 * 可以从命令中安全剥离的环境变量白名单。
 * 这些变量不能执行代码或加载库。
 *
 * 安全：以下变量绝不能添加到白名单中：
 * - PATH, LD_PRELOAD, LD_LIBRARY_PATH, DYLD_*（执行/库加载）
 * - PYTHONPATH, NODE_PATH, CLASSPATH, RUBYLIB（模块加载）
 * - GOFLAGS, RUSTFLAGS, NODE_OPTIONS（可能包含代码执行标志）
 * - HOME, TMPDIR, SHELL, BASH_ENV（影响系统行为）
 */
const SAFE_ENV_VARS = new Set([
  // Go —— 仅构建/运行时设置
  'GOEXPERIMENT', // 实验特性
  'GOOS', // 目标操作系统
  'GOARCH', // 目标架构
  'CGO_ENABLED', // 启用/禁用 CGO
  'GO111MODULE', // 模块模式

  // Rust —— 仅日志/调试
  'RUST_BACKTRACE', // 回溯详细程度
  'RUST_LOG', // 日志过滤器

  // Node —— 仅环境名称（不是 NODE_OPTIONS！）
  'NODE_ENV',

  // Python —— 仅行为标志（不是 PYTHONPATH！）
  'PYTHONUNBUFFERED', // 禁用缓冲
  'PYTHONDONTWRITEBYTECODE', // 不生成 .pyc 文件

  // Pytest —— 测试配置
  'PYTEST_DISABLE_PLUGIN_AUTOLOAD', // 禁用插件加载
  'PYTEST_DEBUG', // 调试输出

  // API 密钥和认证
  'DOGE_API_KEY', // API 认证

  // 区域设置和字符编码
  'LANG', // 默认区域
  'LANGUAGE', // 语言偏好列表
  'LC_ALL', // 覆盖所有区域设置
  'LC_CTYPE', // 字符分类
  'LC_TIME', // 时间格式
  'CHARSET', // 字符集偏好

  // 终端和显示
  'TERM', // 终端类型
  'COLORTERM', // 彩色终端指示器
  'NO_COLOR', // 禁用彩色输出（通用标准）
  'FORCE_COLOR', // 强制彩色输出
  'TZ', // 时区

  // 各种工具的配色配置
  'LS_COLORS', // ls 颜色（GNU）
  'LSCOLORS', // ls 颜色（BSD/macOS）
  'GREP_COLOR', // grep 匹配颜色（已弃用）
  'GREP_COLORS', // grep 配色方案
  'GCC_COLORS', // GCC 诊断颜色

  // 显示格式化
  'TIME_STYLE', // ls 时间显示格式
  'BLOCK_SIZE', // du/df 块大小
  'BLOCKSIZE', // 替代块大小
])

/**
 * 仅 ANT 用户可用：可以从命令中安全剥离的环境变量。
 * 仅在 USER_TYPE === 'ant' 时启用。
 *
 * 安全：这些环境变量在权限规则匹配之前被剥离，这意味着
 * `DOCKER_HOST=tcp://evil.com docker ps` 会在剥离后匹配
 * `Bash(docker ps:*)` 规则。这有意仅限 ANT 使用（在第 ~380 行门控），
 * 绝不能对外部用户发布。DOCKER_HOST 重定向 Docker 守护进程端点——
 * 剥离它会通过向权限检查隐藏网络端点来破坏基于前缀的权限限制。
 * KUBECONFIG 也类似地控制 kubectl 与哪个集群通信。
 * 这些是为接受风险的内部高级用户提供的便利剥离。
 *
 * 基于对 30 天 tengu_internal_bash_tool_use_permission_request 事件的分析。
 */
const ANT_ONLY_SAFE_ENV_VARS = new Set([
  // Kubernetes and container config (config file pointers, not execution)
  'KUBECONFIG', // kubectl config file path — controls which cluster kubectl uses
  'DOCKER_HOST', // Docker daemon socket/endpoint — controls which daemon docker talks to

  // Cloud provider project/profile selection (just names/identifiers)
  'AWS_PROFILE', // AWS profile name selection
  'CLOUDSDK_CORE_PROJECT', // GCP project ID
  'CLUSTER', // generic cluster name

  // Anthropic internal cluster selection (just names/identifiers)
  'COO_CLUSTER', // coo cluster name
  'COO_CLUSTER_NAME', // coo cluster name (alternate)
  'COO_NAMESPACE', // coo namespace
  'COO_LAUNCH_YAML_DRY_RUN', // dry run mode

  // Feature flags (boolean/string flags only)
  'SKIP_NODE_VERSION_CHECK', // skip version check
  'EXPECTTEST_ACCEPT', // accept test expectations
  'CI', // CI environment indicator
  'GIT_LFS_SKIP_SMUDGE', // skip LFS downloads

  // GPU/Device selection (just device IDs)
  'CUDA_VISIBLE_DEVICES', // GPU device selection
  'JAX_PLATFORMS', // JAX platform selection

  // Display/terminal settings
  'COLUMNS', // terminal width
  'TMUX', // TMUX socket info

  // Test/debug configuration
  'POSTGRESQL_VERSION', // postgres version string
  'FIRESTORE_EMULATOR_HOST', // emulator host:port
  'HARNESS_QUIET', // quiet mode flag
  'TEST_CROSSCHECK_LISTS_MATCH_UPDATE', // test update flag
  'DBT_PER_DEVELOPER_ENVIRONMENTS', // DBT config
  'STATSIG_FORD_DB_CHECKS', // statsig DB check flag

  // Build configuration
  'ANT_ENVIRONMENT', // Anthropic environment name
  'ANT_SERVICE', // Anthropic service name
  'MONOREPO_ROOT_DIR', // monorepo root path

  // Version selectors
  'PYENV_VERSION', // Python version selection

  // Credentials (approved subset - these don't change exfil risk)
  'PGPASSWORD', // Postgres password
  'GH_TOKEN', // GitHub token
  'GROWTHBOOK_API_KEY', // self-hosted growthbook
])

/**
 * 从命令中剥离整行注释。
 * 处理 Claude 在 bash 命令中添加注释的情况，例如：
 *   "# Check the logs directory\nls /home/user/logs"
 * 应剥离为："ls /home/user/logs"
 *
 * 仅剥离整行注释（整行都是注释的行），
 * 不处理出现在命令同一行后的内联注释。
 */
function stripCommentLines(command: string): string {
  const lines = command.split('\n')
  const nonCommentLines = lines.filter(line => {
    const trimmed = line.trim()
    // Keep lines that are not empty and don't start with #
    return trimmed !== '' && !trimmed.startsWith('#')
  })

  // 如果所有行都是注释/空行，返回原始内容
  if (nonCommentLines.length === 0) {
    return command
  }

  return nonCommentLines.join('\n')
}

export function stripSafeWrappers(command: string): string {
  // 安全：使用 [ \t]+ 而不是 \s+ —— \s 匹配 \n/\r，这些在 bash 中是命令分
  // 隔符。跨换行符匹配会从一行剥离包装器，而将下一行的不同命令留给 bash 执行。
  //
  // 安全：`(?:--[ \t]+)?` 消耗包装器自身的 `--`，因此
  // `nohup -- rm -- -/../foo` 剥离为 `rm -- -/../foo`（而不是 `-- rm ...`，
  // 后者会以 `--` 作为未知 baseCmd 跳过路径验证）。
  const SAFE_WRAPPER_PATTERNS = [
    // timeout：枚举 GNU 长标志 —— 无值（--foreground、--preserve-status、--verbose），
    // 有值（= 连接和空格分隔形式：--kill-after=5、--kill-after 5、--signal=TERM、
    // --signal TERM）。短标志：-v（无参）、-k/-s 带分离或连接的值。
    // 安全：标志值使用白名单 [A-Za-z0-9_.+-]（信号是 TERM/KILL/9，持续时间是 5/5s/10.5）。
    // 以前 [^ \t]+ 匹配了 $ ( ) ` | ; & —— `timeout -k$(id) 10 ls` 被剥离为 `ls`，
    // 匹配了 Bash(ls:*)，而 bash 在 timeout 运行之前就在单词拆分期间展开了 $(id)。
    // 对比下面已经使用白名单的 ENV_VAR_PATTERN。
    /^timeout[ \t]+(?:(?:--(?:foreground|preserve-status|verbose)|--(?:kill-after|signal)=[A-Za-z0-9_.+-]+|--(?:kill-after|signal)[ \t]+[A-Za-z0-9_.+-]+|-v|-[ks][ \t]+[A-Za-z0-9_.+-]+|-[ks][A-Za-z0-9_.+-]+)[ \t]+)*(?:--[ \t]+)?\d+(?:\.\d+)?[smhd]?[ \t]+/,
    /^time[ \t]+(?:--[ \t]+)?/,
    // 安全：与 checkSemantics 包装器剥离（ast.ts ~:1990-2080）和
    // stripWrappersFromArgv（pathValidation.ts ~:1260）保持同步。
    // 以前此模式要求 `-n N`；checkSemantics 已经处理了裸 `nice` 和旧版 `-N`。
    // 不对称意味着 checkSemantics 将被包装的命令暴露给语义检查，
    // 但 deny 规则匹配和 cd+git 关卡看到的是包装器名称。
    // 带有 Bash(rm:*) deny 的 `nice rm -rf /` 变成了 ask 而非 deny；
    // `cd evil && nice git status` 跳过了裸仓库 RCE 关卡。
    // PR #21503 修复了 stripWrappersFromArgv；而这里被遗漏了。
    // 现在匹配：`nice cmd`、`nice -n N cmd`、`nice -N cmd`
    //（checkSemantics 剥离的所有形式）。
    /^nice(?:[ \t]+-n[ \t]+-?\d+|[ \t]+-\d+)?[ \t]+(?:--[ \t]+)?/,
    // stdbuf：仅连接短标志（-o0, -eL）。checkSemantics 处理更多情况
    //（空格分隔、长标志 --output=MODE），但我们在这上面会失败关闭，
    // 所以不过度剥离是安全的。主要需求：`stdbuf -o0 cmd`。
    /^stdbuf(?:[ \t]+-[ioe][LN0-9]+)+[ \t]+(?:--[ \t]+)?/,
    /^nohup[ \t]+(?:--[ \t]+)?/,
  ] as const

  // 环境变量模式：
  // ^([A-Za-z_][A-Za-z0-9_]*)  - 变量名（标准标识符）
  // =                           - 等号
  // ([A-Za-z0-9_./:-]+)         - 值：仅字母数字 + 安全标点
  // [ \t]+                      - 值后必需的水平空白
  //
  // 安全：仅匹配未加引号的带安全字符的值（不含 $()、`、$var、;|&）。
  //
  // 安全：尾部空白必须是 [ \t]+（仅水平），不能是 \s+。
  // \s 匹配 \n/\r。如果 reconstructCommand 在 `TZ=UTC` 和 `echo` 之间
  // 发出未加引号的换行符，\s+ 会跨行匹配并剥离 `TZ=UTC<NL>`，
  // 留下 `echo curl evil.com` 去匹配 Bash(echo:*)。但 bash 将换行符
  // 视为命令分隔符。通过 needsQuoting 修复实现纵深防御。
  const ENV_VAR_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z0-9_./:-]+)[ \t]+/

  let stripped = command
  let previousStripped = ''

  // 阶段 1：仅剥离前导环境变量和注释。
  // 在 bash 中，命令前的环境变量赋值（VAR=val cmd）是真正的
  // shell 级赋值。为权限匹配剥离这些是安全的。
  while (stripped !== previousStripped) {
    previousStripped = stripped
    stripped = stripCommentLines(stripped)

    const envVarMatch = stripped.match(ENV_VAR_PATTERN)
    if (envVarMatch) {
      const varName = envVarMatch[1]!
      const isAntOnlySafe =
        process.env.USER_TYPE === 'ant' && ANT_ONLY_SAFE_ENV_VARS.has(varName)
      if (SAFE_ENV_VARS.has(varName) || isAntOnlySafe) {
        stripped = stripped.replace(ENV_VAR_PATTERN, '')
      }
    }
  }

  // 阶段 2：仅剥离包装器命令和注释。不要剥离环境变量。
  // 包装器命令（timeout、time、nice、nohup）使用 execvp 运行它们的
  // 参数，因此包装器后的 VAR=val 被视为要执行的命令，
  // 而不是环境变量赋值。在此剥离环境变量会造成解析器看到的
  // 与实际执行的内容不匹配。（HackerOne #3543050）
  previousStripped = ''
  while (stripped !== previousStripped) {
    previousStripped = stripped
    stripped = stripCommentLines(stripped)

    for (const pattern of SAFE_WRAPPER_PATTERNS) {
      stripped = stripped.replace(pattern, '')
    }
  }

  return stripped.trim()
}

// 安全：timeout 标志值的白名单（信号是 TERM/KILL/9，
// 持续时间是 5/5s/10.5）。拒绝 $ ( ) ` | ; & 以及之前通过
// [^ \t]+ 匹配的换行符 —— `timeout -k$(id) 10 ls` 绝不能剥离。
const TIMEOUT_FLAG_VALUE_RE = /^[A-Za-z0-9_.+-]+$/

/**
 * 解析 timeout 的 GNU 标志（长标志 + 短标志、= 连接 + 空格分隔）并
 * 返回 DURATION 令牌的 argv 索引，如果标志无法解析则返回 -1。
 * 枚举：--foreground/--preserve-status/--verbose（无值），
 * --kill-after/--signal（有值，= 连接和空格分隔两种形式），-v（无值），
 * -k/-s（有值，连接和空格分隔两种形式）。
 *
 * 从 stripWrappersFromArgv 提取，以使 bashToolHasPermission 保持在
 * Bun 的 feature() DCE 复杂度阈值以下 —— 内联此函数会破坏
 * 分类器测试中的 feature('BASH_CLASSIFIER') 求值。
 */
function skipTimeoutFlags(a: readonly string[]): number {
  let i = 1
  while (i < a.length) {
    const arg = a[i]!
    const next = a[i + 1]
    if (
      arg === '--foreground' ||
      arg === '--preserve-status' ||
      arg === '--verbose'
    )
      i++
    else if (/^--(?:kill-after|signal)=[A-Za-z0-9_.+-]+$/.test(arg)) i++
    else if (
      (arg === '--kill-after' || arg === '--signal') &&
      next &&
      TIMEOUT_FLAG_VALUE_RE.test(next)
    )
      i += 2
    else if (arg === '--') {
      i++
      break
    } // 选项结束标记
    else if (arg.startsWith('--')) return -1
    else if (arg === '-v') i++
    else if (
      (arg === '-k' || arg === '-s') &&
      next &&
      TIMEOUT_FLAG_VALUE_RE.test(next)
    )
      i += 2
    else if (/^-[ks][A-Za-z0-9_.+-]+$/.test(arg)) i++
    else if (arg.startsWith('-')) return -1
    else break
  }
  return i
}

/**
 * stripSafeWrappers 的 Argv 级别对应函数。从 AST 派生的 argv 中
 * 剥离相同的包装器命令（timeout、time、nice、nohup）。
 * 环境变量已经分离到 SimpleCommand.envVars 中，因此无需剥离环境变量。
 *
 * 与上面的 SAFE_WRAPPER_PATTERNS 保持同步 —— 如果你在那里添加了包装器，
 * 请也在此处添加。
 */
export function stripWrappersFromArgv(argv: string[]): string[] {
  // 安全：消耗包装器选项后的可选 `--`，与包装器的行为相匹配。
  // 否则 `['nohup','--','rm','--','-/../foo']` 会产生 `--`
  // 作为 baseCmd 并跳过路径验证。参见 SAFE_WRAPPER_PATTERNS 注释。
  let a = argv
  for (;;) {
    if (a[0] === 'time' || a[0] === 'nohup') {
      a = a.slice(a[1] === '--' ? 2 : 1)
    } else if (a[0] === 'timeout') {
      const i = skipTimeoutFlags(a)
      if (i < 0 || !a[i] || !/^\d+(?:\.\d+)?[smhd]?$/.test(a[i]!)) return a
      a = a.slice(i + 1)
    } else if (
      a[0] === 'nice' &&
      a[1] === '-n' &&
      a[2] &&
      /^-?\d+$/.test(a[2])
    ) {
      a = a.slice(a[3] === '--' ? 4 : 3)
    } else {
      return a
    }
  }
}

/**
 * 会使*不同的二进制文件*运行的环境变量（注入或解析劫持）。
 * 仅为启发式 —— export-&& 形式可以绕过此检查，且 excludedCommands
 * 无论如何都不是安全边界。
 */
export const BINARY_HIJACK_VARS = /^(LD_|DYLD_|PATH$)/

/**
 * 从命令中剥离所有前导环境变量前缀，无论变量名是否在白名单中。
 *
 * 用于 deny/ask 规则匹配：当用户拒绝了 `claude` 或 `rm` 时，
 * 即使命令带有任意环境变量前缀如 `FOO=bar claude`，也应保持阻止。
 * stripSafeWrappers 中的白名单限制对于允许规则是正确的
 *（防止 `DOCKER_HOST=evil docker ps` 自动匹配 `Bash(docker ps:*)`），
 * 但拒绝规则必须更难被绕过。
 *
 * 也用于 sandbox.excludedCommands 匹配（不是安全边界 ——
 * 权限提示才是），使用 BINARY_HIJACK_VARS 作为黑名单。
 *
 * 安全：使用比 stripSafeWrappers 更宽泛的值模式。值模式
 * 仅排除实际的 shell 注入字符（$、反引号、;、|、&、括号、
 * 重定向、引号、反斜杠）和空白。像 =、+、@、~、, 这样的字符
 * 在未加引号的环境变量赋值位置是无害的，必须被匹配以防止
 * 通过例如 `FOO=a=b denied_command` 的简单绕过。
 *
 * @param blocklist - 可选的正则表达式，针对每个变量名测试；匹配的变量
 *   不会被剥离（且剥离在此停止）。对 deny 规则省略此参数；
 *   对 excludedCommands 传递 BINARY_HIJACK_VARS。
 */
export function stripAllLeadingEnvVars(
  command: string,
  blocklist?: RegExp,
): string {
  // deny 规则剥离的更宽泛值模式。处理：
  //
  // - 标准赋值（FOO=bar）、追加（FOO+=bar）、数组（FOO[0]=bar）
  // - 单引号值：'[^'\n\r]*' —— bash 抑制所有展开
  // - 带反斜杠转义的双引号值："(?:\\.|[^"$`\\\n\r])*"
  //   在 bash 双引号中，只有 \$, \`, \", \\, 和 \newline 是特殊的。
  //   其他 \x 序列是无害的，因此我们在双引号内允许 \.。
  //   我们仍然排除裸 $ 和 `（没有反斜杠）以阻止展开。
  // - 未加引号的值：排除 shell 元字符，允许反斜杠转义
  // - 连接段：FOO='x'y"z" —— bash 连接相邻段
  //
  // 安全：尾部空白必须是 [ \t]+（仅水平），不能是 \s+。
  //
  // 外部的 * 每次迭代匹配一个原子单元：一个完整的带引号字符串、
  // 一个反斜杠转义对，或一个未加引号的安全字符。
  // 内部的双引号交替（?:...|...)* 由闭合的 " 界定，
  // 因此它不能与外部 * 交互进行回溯。
  //
  // 注意：$ 被排除在未加引号/双引号值类之外，以阻止
  // $(cmd)、${var} 和 $((expr)) 等危险形式。这意味着
  // FOO=$VAR 不会被剥离 —— 添加 $VAR 匹配会引入 ReDoS 风险
  //（CodeQL #671），且 $VAR 绕过是低优先级的。
  const ENV_VAR_PATTERN =
    /^([A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?)\+?=(?:'[^'\n\r]*'|"(?:\\.|[^"$`\\\n\r])*"|\\.|[^ \t\n\r$`;|&()<>\\\\'"])*[ \t]+/

  let stripped = command
  let previousStripped = ''

  while (stripped !== previousStripped) {
    previousStripped = stripped
    stripped = stripCommentLines(stripped)

    const m = stripped.match(ENV_VAR_PATTERN)
    if (!m) continue
    if (blocklist?.test(m[1]!)) break
    stripped = stripped.slice(m[0].length)
  }

  return stripped.trim()
}

function filterRulesByContentsMatchingInput(
  input: z.infer<typeof BashTool.inputSchema>,
  rules: Map<string, PermissionRule>,
  matchMode: 'exact' | 'prefix',
  {
    stripAllEnvVars = false,
    skipCompoundCheck = false,
  }: { stripAllEnvVars?: boolean; skipCompoundCheck?: boolean } = {},
): PermissionRule[] {
  // DOGE: 防御性检查 —— input 或 command 无效时返回空结果
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return []
  }
  const command = input.command.trim()

  // 去除输出重定向以进行权限匹配
  // 这允许像 Bash(python:*) 这样的规则匹配 "python script.py > output.txt"
  // 重定向目标的安全验证在 checkPathConstraints 中单独处理
  const commandWithoutRedirections =
    extractOutputRedirections(command).commandWithoutRedirections

  // 对于精确匹配，尝试原始命令（保留引号）
  // 和去除重定向后的命令（允许不带重定向的规则匹配）
  // 对于前缀匹配，只使用去除重定向后的命令
  const commandsForMatching =
    matchMode === 'exact'
      ? [command, commandWithoutRedirections]
      : [commandWithoutRedirections]

  // 去除安全包装命令（timeout、time、nice、nohup）和环境变量用于匹配
  // 这允许像 Bash(npm install:*) 这样的规则匹配 "timeout 10 npm install foo"
  // 或 "GOOS=linux go build"
  const commandsToTry = commandsForMatching.flatMap(cmd => {
    const strippedCommand = stripSafeWrappers(cmd)
    return strippedCommand !== cmd ? [cmd, strippedCommand] : [cmd]
  })

  // 安全：对于 deny/ask 规则，在去除所有前导环境变量前缀后也尝试匹配
  // 这防止了通过 `FOO=bar denied_command` 绕过，其中 FOO 不在安全列表中
  // stripSafeWrappers 中的安全列表限制是有意针对 allow 规则的（参见 HackerOne #3543050）
  // 但 deny 规则必须更难绕过 —— 被拒绝的命令应始终被拒绝，无论环境变量前缀如何
  //
  // 我们对所有候选项迭代应用两种去除操作，直到不再产生新的候选项（不动点）
  // 这处理了像 `nohup FOO=bar timeout 5 claude` 这样的交错模式：
  //   1. stripSafeWrappers 去除 `nohup` → `FOO=bar timeout 5 claude`
  //   2. stripAllLeadingEnvVars 去除 `FOO=bar` → `timeout 5 claude`
  //   3. stripSafeWrappers 去除 `timeout 5` → `claude`（deny 匹配）
  //
  // 没有迭代，单次组合会错过多层交错
  if (stripAllEnvVars) {
    const seen = new Set(commandsToTry)
    let startIdx = 0

    // 迭代直到不再产生新的候选项（不动点）
    while (startIdx < commandsToTry.length) {
      const endIdx = commandsToTry.length
      for (let i = startIdx; i < endIdx; i++) {
        const cmd = commandsToTry[i]
        if (!cmd) {
          continue
        }
        // 尝试去除环境变量
        const envStripped = stripAllLeadingEnvVars(cmd)
        if (!seen.has(envStripped)) {
          commandsToTry.push(envStripped)
          seen.add(envStripped)
        }
        // 尝试去除安全包装
        const wrapperStripped = stripSafeWrappers(cmd)
        if (!seen.has(wrapperStripped)) {
          commandsToTry.push(wrapperStripped)
          seen.add(wrapperStripped)
        }
      }
      startIdx = endIdx
    }
  }

  // 预计算每个候选项的复合命令状态，避免在规则过滤循环中重复解析
  // （否则 splitCommand 调用量会随 rules.length × commandsToTry.length 增长）
  // 复合检查仅适用于 'prefix' 模式下的前缀/通配符匹配，且仅针对 allow 规则
  // 安全：deny/ask 规则必须匹配复合命令，防止通过将拒绝的命令包装在复合表达式中绕过
  const isCompoundCommand = new Map<string, boolean>()
  if (matchMode === 'prefix' && !skipCompoundCheck) {
    for (const cmd of commandsToTry) {
      if (!isCompoundCommand.has(cmd)) {
        isCompoundCommand.set(cmd, splitCommand(cmd).length > 1)
      }
    }
  }

  return Array.from(rules.entries())
    .filter(([ruleContent]) => {
      const bashRule = bashPermissionRule(ruleContent)

      return commandsToTry.some(cmdToMatch => {
        switch (bashRule.type) {
          case 'exact':
            return bashRule.command === cmdToMatch
          case 'prefix':
            switch (matchMode) {
              // In 'exact' mode, only return true if the command exactly matches the prefix rule
              case 'exact':
                return bashRule.prefix === cmdToMatch
              case 'prefix': {
                  // 安全：不允许前缀规则匹配复合命令。
                // 例如，Bash(cd:*) 绝不能匹配 "cd /path && python3 evil.py"。
                // 在正常流程中，命令在到达此处之前已被拆分，但
                // shell 转义可以绕过第一次 splitCommand 处理 —— 例如：
                //   cd src\&\& python3 hello.py  →  splitCommand  →  ["cd src&& python3 hello.py"]
                // 这看起来像是以 "cd " 开头的单个命令。
                // 在此处重新拆分候选项可以捕获这些情况。
                if (isCompoundCommand.get(cmdToMatch)) {
                  return false
                }
                // 确保单词边界：前缀后必须跟空格或字符串结尾
                // 这防止了 "ls:*" 匹配 "lsof" 或 "lsattr"
                if (cmdToMatch === bashRule.prefix) {
                  return true
                }
                if (cmdToMatch.startsWith(bashRule.prefix + ' ')) {
                  return true
                }
                // 同时匹配裸 xargs（无标志）的 "xargs <prefix>" 形式。
                // 这允许 Bash(grep:*) 匹配 "xargs grep pattern"，
                // 以及 Bash(rm:*) 等 deny 规则阻止 "xargs rm file"。
                // 自然单词边界："xargs -n1 grep" 不以 "xargs grep " 开头，
                // 因此带标志的 xargs 调用不会被匹配。
                const xargsPrefix = 'xargs ' + bashRule.prefix
                if (cmdToMatch === xargsPrefix) {
                  return true
                }
                return cmdToMatch.startsWith(xargsPrefix + ' ')
              }
            }
            break
          case 'wildcard':
            // 安全修复：在精确匹配模式下，通配符绝不能匹配，因为
            // 我们正在检查完整的未经解析的命令。对未经解析的命令进行通配符匹配
            // 允许 "foo *" 匹配 "foo arg && curl evil.com"，因为 .* 会匹配操作符。
            // 通配符只应在拆分为单独子命令后进行匹配。
            if (matchMode === 'exact') {
              return false
            }
            // 安全：与前缀规则相同，不允许通配符规则在 prefix 模式下
            // 匹配复合命令。例如，Bash(cd *) 绝不能匹配
            // "cd /path && python3 evil.py"，即使 "cd *" 模式会匹配它。
            if (isCompoundCommand.get(cmdToMatch)) {
              return false
            }
            // 在前缀模式（拆分后）下，通配符可以安全地匹配子命令
            return matchWildcardPattern(bashRule.pattern, cmdToMatch)
        }
      })
    })
    .map(([, rule]) => rule)
}

function matchingRulesForInput(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
  matchMode: 'exact' | 'prefix',
  { skipCompoundCheck = false }: { skipCompoundCheck?: boolean } = {},
) {
  const denyRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    'deny',
  )
  // 安全：deny/ask 规则使用激进的环境变量去除，以便
  // `FOO=bar denied_command` 仍能匹配到 `denied_command` 的 deny 规则
  const matchingDenyRules = filterRulesByContentsMatchingInput(
    input,
    denyRuleByContents,
    matchMode,
    { stripAllEnvVars: true, skipCompoundCheck: true },
  )

  const askRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    'ask',
  )
  const matchingAskRules = filterRulesByContentsMatchingInput(
    input,
    askRuleByContents,
    matchMode,
    { stripAllEnvVars: true, skipCompoundCheck: true },
  )

  const allowRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    'allow',
  )
  const matchingAllowRules = filterRulesByContentsMatchingInput(
    input,
    allowRuleByContents,
    matchMode,
    { skipCompoundCheck },
  )

  return {
    matchingDenyRules,
    matchingAskRules,
    matchingAllowRules,
  }
}

/**
 * 检查子命令是否与权限规则精确匹配
 */
export const bashToolCheckExactMatchPermission = (
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult => {
  // DOGE: 防御性检查
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return {
      behavior: 'passthrough',
      message: '命令输入为空，跳过精确匹配权限检查',
    }
  }
  const command = input.command.trim()
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } =
    matchingRulesForInput(input, toolPermissionContext, 'exact')

  // 1. 精确命令被拒绝时拒绝
  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用 ${BashTool.name} 执行命令 ${command} 的权限已被拒绝。`,
      decisionReason: {
        type: 'rule',
        rule: matchingDenyRules[0],
      },
    }
  }

  // 2. 精确命令在 ask 规则中时询问
  if (matchingAskRules[0] !== undefined) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: 'rule',
        rule: matchingAskRules[0],
      },
    }
  }

  // 3. 精确命令被允许时放行
  if (matchingAllowRules[0] !== undefined) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'rule',
        rule: matchingAllowRules[0],
      },
    }
  }

  // 4. 否则，透传
  const decisionReason = {
    type: 'other' as const,
    reason: '此命令需要批准',
  }
  return {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    // 向用户建议精确匹配规则
    // 这可能会被 `checkCommandAndSuggestRules()` 中的前缀建议覆盖
    suggestions: suggestionForExactCommand(command),
  }
}

export const bashToolCheckPermission = (
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
): PermissionResult => {
  // DOGE: 防御性检查
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return {
      behavior: 'allow',
      message: '命令输入为空，跳过权限检查',
    }
  }
  const command = input.command.trim()

  // 1. 先检查精确匹配
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext,
  )

  // 1a. 精确命令有规则时拒绝/询问
  if (
    exactMatchResult.behavior === 'deny' ||
    exactMatchResult.behavior === 'ask'
  ) {
    return exactMatchResult
  }

  // 2. 查找所有匹配规则（前缀或精确）
  // 安全修复：在路径约束之前检查 Bash deny/ask 规则，以防止
  // 通过项目目录外的绝对路径绕过（HackerOne 报告）
  // 当 AST 解析后，子命令已经是原子性的 —— 跳过旧版
  // splitCommand 重新检查，该检查会将单词中间的 # 误解析为复合命令
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } =
    matchingRulesForInput(input, toolPermissionContext, 'prefix', {
      skipCompoundCheck: astCommand !== undefined,
    })

  // 2a. 命令有 deny 规则时拒绝
  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用 ${BashTool.name} 执行命令 ${command} 的权限已被拒绝。`,
      decisionReason: {
        type: 'rule',
        rule: matchingDenyRules[0],
      },
    }
  }

  // 2b. 命令有 ask 规则时询问
  if (matchingAskRules[0] !== undefined) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: 'rule',
        rule: matchingAskRules[0],
      },
    }
  }

  // 3. 检查路径约束
  // 此检查位于 deny/ask 规则之后，因此显式规则优先。
  // 安全：当 AST 派生的 argv 可用于此子命令时，传递
  // 它以使 checkPathConstraints 直接使用它，而不是用 shell-quote
  // 重新解析（shell-quote 存在单引号反斜杠错误，会导致
  // parseCommandArguments 返回 [] 并静默跳过路径验证）。
  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,
    astCommand ? [astCommand] : undefined,
  )
  if (pathResult.behavior !== 'passthrough') {
    return pathResult
  }

  // 4. 命令有精确匹配 allow 规则时放行
  if (exactMatchResult.behavior === 'allow') {
    return exactMatchResult
  }

  // 5. 命令有 allow 规则时放行
  if (matchingAllowRules[0] !== undefined) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'rule',
        rule: matchingAllowRules[0],
      },
    }
  }

  // 5b. 检查 sed 约束（在模式自动放行前阻止危险的 sed 操作）
  const sedConstraintResult = checkSedConstraints(input, toolPermissionContext)
  if (sedConstraintResult.behavior !== 'passthrough') {
    return sedConstraintResult
  }

  // 6. 检查模式特定的权限处理
  const modeResult = checkPermissionMode(input, toolPermissionContext)
  if (modeResult.behavior !== 'passthrough') {
    return modeResult
  }

  // 7. 检查只读规则
  if (BashTool.isReadOnly(input)) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: '只读命令已允许',
      },
    }
  }

  // 8. 无规则匹配时透传，将触发权限提示
  const decisionReason = {
    type: 'other' as const,
    reason: '此命令需要批准',
  }
  return {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    // 向用户建议精确匹配规则
    // 这可能会被 `checkCommandAndSuggestRules()` 中的前缀建议覆盖
    suggestions: suggestionForExactCommand(command),
  }
}

/**
 * 处理单个子命令并应用前缀检查和建议
 */
export async function checkCommandAndSuggestRules(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
  commandPrefixResult: CommandPrefixResult | null | undefined,
  compoundCommandHasCd?: boolean,
  astParseSucceeded?: boolean,
): Promise<PermissionResult> {
  // 1. 先检查精确匹配
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext,
  )
  if (exactMatchResult.behavior !== 'passthrough') {
    return exactMatchResult
  }

  // 2. 检查命令前缀
  const permissionResult = bashToolCheckPermission(
    input,
    toolPermissionContext,
    compoundCommandHasCd,
  )
  // 2a. 命令被明确拒绝/询问时返回相应结果
  if (
    permissionResult.behavior === 'deny' ||
    permissionResult.behavior === 'ask'
  ) {
    return permissionResult
  }

  // 3. 检测到命令注入时请求许可。当 AST 解析
  // 已成功时跳过 —— tree-sitter 已验证没有隐藏替换或结构技巧，
  // 因此旧版基于正则的验证器（反斜杠转义操作符等）只会增加误报。
  if (
    !astParseSucceeded &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)
  ) {
    const safetyResult = await bashCommandIsSafeAsync(input.command)

    if (safetyResult.behavior !== 'passthrough') {
      const decisionReason: PermissionDecisionReason = {
        type: 'other' as const,
        reason:
          safetyResult.behavior === 'ask' && safetyResult.message
            ? safetyResult.message
            : '此命令包含可能造成安全风险的模式，需要批准',
      }

      return {
        behavior: 'ask',
        message: createPermissionRequestMessage(BashTool.name, decisionReason),
        decisionReason,
        suggestions: [], // 不建议保存可能有危险的命令
      }
    }
  }

  // 4. 命令被允许时放行
  if (permissionResult.behavior === 'allow') {
    return permissionResult
  }

  // 5. 建议前缀（如有），否则建议精确命令
  const suggestedUpdates = commandPrefixResult?.commandPrefix
    ? suggestionForPrefix(commandPrefixResult.commandPrefix)
    : suggestionForExactCommand(input.command)

  return {
    ...permissionResult,
    suggestions: suggestedUpdates,
  }
}

/**
 * 检查命令在沙箱模式下是否应自动允许。
 * 如有应被尊重的显式 deny/ask 规则，则提前返回。
 *
 * 注意：此函数仅在沙箱和自动允许均启用时调用。
 *
 * @param input - Bash 工具输入
 * @param toolPermissionContext - 权限上下文
 * @returns PermissionResult，其中：
 *   - 存在显式规则（精确或前缀）时返回 deny/ask
 *   - 无显式规则时返回 allow（沙箱自动允许适用）
 *   - passthrough 不应出现，因为处于自动允许模式
 */
function checkSandboxAutoAllow(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  const command = input.command.trim()

  // 检查完整命令上的显式 deny/ask 规则（精确 + 前缀）
  const { matchingDenyRules, matchingAskRules } = matchingRulesForInput(
    input,
    toolPermissionContext,
    'prefix',
  )

  // 如果完整命令上有显式 deny 规则则立即返回
  if (matchingDenyRules[0] !== undefined) {
    return {
      behavior: 'deny',
      message: `使用 ${BashTool.name} 执行命令 ${command} 的权限已被拒绝。`,
      decisionReason: {
        type: 'rule',
        rule: matchingDenyRules[0],
      },
    }
  }

  // 安全：对于复合命令，检查每个子命令是否匹配 deny/ask 规则。
  // 像 Bash(rm:*) 这样的前缀规则不会匹配完整的复合命令
  // （例如，"echo hello && rm -rf /" 不以 "rm" 开头），因此我们必须
  // 单独检查每个子命令。
  // 重要：子命令 deny 检查必须在完整命令 ask 返回之前运行。
  // 否则，匹配完整命令的通配符 ask 规则（例如 Bash(*echo*)）
  // 会在子命令上的前缀 deny 规则（例如 Bash(rm:*））被检查之前
  // 返回 'ask'，将 deny 降级为 ask。
  const subcommands = splitCommand(command)
  if (subcommands.length > 1) {
    let firstAskRule: PermissionRule | undefined
    for (const sub of subcommands) {
      const subResult = matchingRulesForInput(
        { command: sub },
        toolPermissionContext,
        'prefix',
      )
      // Deny 优先 —— 立即返回
      if (subResult.matchingDenyRules[0] !== undefined) {
        return {
          behavior: 'deny',
          message: `使用 ${BashTool.name} 执行命令 ${command} 的权限已被拒绝。`,
          decisionReason: {
            type: 'rule',
            rule: subResult.matchingDenyRules[0],
          },
        }
      }
      // 暂存第一个 ask 匹配；暂不返回（所有子命令中的 deny 优先）
      firstAskRule ??= subResult.matchingAskRules[0]
    }
    if (firstAskRule) {
      return {
        behavior: 'ask',
        message: createPermissionRequestMessage(BashTool.name),
        decisionReason: {
          type: 'rule',
          rule: firstAskRule,
        },
      }
    }
  }

  // 完整命令的 ask 检查（在所有 deny 源已耗尽之后）
  if (matchingAskRules[0] !== undefined) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: 'rule',
        rule: matchingAskRules[0],
      },
    }
  }
  // 无显式规则，因此使用沙箱自动允许

  return {
    behavior: 'allow',
    updatedInput: input,
    decisionReason: {
      type: 'other',
      reason: '沙箱自动允许（autoAllowBashIfSandboxed 已启用）',
    },
  }
}

/**
 * 过滤掉 `cd ${cwd}` 前缀子命令，保持 astCommands 对齐。
 * 提取出来是为了使 bashToolHasPermission 保持在 Bun 的 feature() DCE
 * 复杂度阈值以下 —— 内联此函数会在约 10 个分类器测试中
 * 破坏 pendingClassifierCheck 的附加逻辑。
 */
function filterCdCwdSubcommands(
  rawSubcommands: string[],
  astCommands: SimpleCommand[] | undefined,
  cwd: string,
  cwdMingw: string,
): { subcommands: string[]; astCommandsByIdx: (SimpleCommand | undefined)[] } {
  const subcommands: string[] = []
  const astCommandsByIdx: (SimpleCommand | undefined)[] = []
  for (let i = 0; i < rawSubcommands.length; i++) {
    const cmd = rawSubcommands[i]!
    if (cmd === `cd ${cwd}` || cmd === `cd ${cwdMingw}`) continue
    subcommands.push(cmd)
    astCommandsByIdx.push(astCommands?.[i])
  }
  return { subcommands, astCommandsByIdx }
}

/**
 * AST too-complex 和 checkSemantics 路径的提前拒绝强制执行。
 * 如果非透传（deny/ask/allow）则返回精确匹配结果，
 * 然后检查前缀/通配符 deny 规则。如果都不匹配则返回 null，
 * 意味着调用者应回退到 ask。提取出来是为了使
 * bashToolHasPermission 保持在 Bun 的 feature() DCE 复杂度阈值以下。
 */
function checkEarlyExitDeny(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult | null {
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext,
  )
  if (exactMatchResult.behavior !== 'passthrough') {
    return exactMatchResult
  }
  const denyMatch = matchingRulesForInput(
    input,
    toolPermissionContext,
    'prefix',
  ).matchingDenyRules[0]
  if (denyMatch !== undefined) {
    return {
      behavior: 'deny',
      message: `使用 ${BashTool.name} 执行命令 ${input.command} 的权限已被拒绝。`,
      decisionReason: { type: 'rule', rule: denyMatch },
    }
  }
  return null
}

/**
 * checkSemantics 路径的拒绝强制执行。调用 checkEarlyExitDeny（精确匹配
 * + 完整命令前缀 deny），然后检查每个 SimpleCommand 的 .text
 * 跨度是否匹配前缀 deny 规则。需要逐子命令检查是因为
 * filterRulesByContentsMatchingInput 有复合命令守卫
 *（splitCommand().length > 1 → 前缀规则返回 false），这会阻止
 * `Bash(eval:*)` 匹配像 `echo foo | eval rm` 这样的完整管道。
 * 每个 SimpleCommand 跨度都是单个命令，因此守卫不会触发。
 *
 * 单独的辅助函数（未合并到 checkEarlyExitDeny 或内联在调用点）
 * 因为 bashToolHasPermission 接近 Bun 的 feature() DCE 复杂度阈值
 * —— 即使在那里增加约 5 行也会破坏 feature('BASH_CLASSIFIER')
 * 的求值并丢失 pendingClassifierCheck。
 */
function checkSemanticsDeny(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
  commands: readonly { text: string }[],
): PermissionResult | null {
  const fullCmd = checkEarlyExitDeny(input, toolPermissionContext)
  if (fullCmd !== null) return fullCmd
  for (const cmd of commands) {
    const subDeny = matchingRulesForInput(
      { ...input, command: cmd.text },
      toolPermissionContext,
      'prefix',
    ).matchingDenyRules[0]
    if (subDeny !== undefined) {
      return {
        behavior: 'deny',
        message: `使用 ${BashTool.name} 执行命令 ${input.command} 的权限已被拒绝。`,
        decisionReason: { type: 'rule', rule: subDeny },
      }
    }
  }
  return null
}

/**
 * 构建待处理的分类器检查元数据（如果分类器已启用且有 allow 描述）。
 * 如果分类器已禁用、处于自动模式或无 allow 描述存在，则返回 undefined。
 */
function buildPendingClassifierCheck(
  command: string,
  toolPermissionContext: ToolPermissionContext,
): { command: string; cwd: string; descriptions: string[] } | undefined {
  if (!isClassifierPermissionsEnabled()) {
    return undefined
  }
  // 自动模式下跳过 —— 自动模式分类器处理所有权限决策
  if (feature('TRANSCRIPT_CLASSIFIER') && toolPermissionContext.mode === 'auto')
    return undefined
  if (toolPermissionContext.mode === 'bypassPermissions') return undefined

  const allowDescriptions = getBashPromptAllowDescriptions(
    toolPermissionContext,
  )
  if (allowDescriptions.length === 0) return undefined

  return {
    command,
    cwd: getCwd(),
    descriptions: allowDescriptions,
  }
}

const speculativeChecks = new Map<string, Promise<ClassifierResult>>()

/**
 * 尽早启动推测性 bash allow 分类器检查，使其与
 * 预工具钩子、deny/ask 分类器和权限对话框设置并行运行。
 * 结果稍后可通过 consumeSpeculativeClassifierCheck 由
 * executeAsyncClassifierCheck 消费。
 */
export function peekSpeculativeClassifierCheck(
  command: string,
): Promise<ClassifierResult> | undefined {
  return speculativeChecks.get(command)
}

export function startSpeculativeClassifierCheck(
  command: string,
  toolPermissionContext: ToolPermissionContext,
  signal: AbortSignal,
  isNonInteractiveSession: boolean,
): boolean {
  // 与 buildPendingClassifierCheck 相同的守卫
  if (!isClassifierPermissionsEnabled()) return false
  if (feature('TRANSCRIPT_CLASSIFIER') && toolPermissionContext.mode === 'auto')
    return false
  if (toolPermissionContext.mode === 'bypassPermissions') return false
  const allowDescriptions = getBashPromptAllowDescriptions(
    toolPermissionContext,
  )
  if (allowDescriptions.length === 0) return false

  const cwd = getCwd()
  const promise = classifyBashCommand(
    command,
    cwd,
    allowDescriptions,
    'allow',
    signal,
    isNonInteractiveSession,
  )
  // 防止信号在此 promise 被消费前中止时出现未处理的拒绝。
  // 原始 promise（可能拒绝）仍存储在 Map 中供消费者 await。
  promise.catch(() => {})
  speculativeChecks.set(command, promise)
  return true
}

/**
 * 消费指定命令的推测性分类器检查结果。
 * 如果存在则返回 promise（并从映射中移除），否则返回 undefined。
 */
export function consumeSpeculativeClassifierCheck(
  command: string,
): Promise<ClassifierResult> | undefined {
  const promise = speculativeChecks.get(command)
  if (promise) {
    speculativeChecks.delete(command)
  }
  return promise
}

export function clearSpeculativeChecks(): void {
  speculativeChecks.clear()
}

/**
 * 等待待处理的分类器检查，如果高置信度允许则返回 PermissionDecisionReason，
 * 否则返回 undefined。
 *
 * 被 swarm 代理（tmux 和进程内）用于门控权限
 * 转发：先运行分类器，仅在分类器未自动批准时
 * 才升级到领导者。
 */
export async function awaitClassifierAutoApproval(
  pendingCheck: PendingClassifierCheck,
  signal: AbortSignal,
  isNonInteractiveSession: boolean,
): Promise<PermissionDecisionReason | undefined> {
  const { command, cwd, descriptions } = pendingCheck
  const speculativeResult = consumeSpeculativeClassifierCheck(command)
  const classifierResult = speculativeResult
    ? await speculativeResult
    : await classifyBashCommand(
        command,
        cwd,
        descriptions,
        'allow',
        signal,
        isNonInteractiveSession,
      )

  logClassifierResultForAnts(command, 'allow', descriptions, classifierResult)

  if (
    feature('BASH_CLASSIFIER') &&
    classifierResult.matches &&
    classifierResult.confidence === 'high'
  ) {
    return {
      type: 'classifier',
      classifier: 'bash_allow',
      reason: `由提示规则允许："${classifierResult.matchedDescription}"`,
    }
  }
  return undefined
}

type AsyncClassifierCheckCallbacks = {
  shouldContinue: () => boolean
  onAllow: (decisionReason: PermissionDecisionReason) => void
  onComplete?: () => void
}

/**
 * 异步执行 bash 允许分类器检查。
 * 在权限提示显示期间于后台运行。
 * 如果分类器以高置信度允许且用户尚未交互，则自动批准。
 *
 * @param pendingCheck - 来自 bashToolHasPermission 的分类器检查元数据
 * @param signal - 中止信号
 * @param isNonInteractiveSession - 是否为非交互式会话
 * @param callbacks - 用于检查是否应继续以及处理批准的回调
 */
export async function executeAsyncClassifierCheck(
  pendingCheck: { command: string; cwd: string; descriptions: string[] },
  signal: AbortSignal,
  isNonInteractiveSession: boolean,
  callbacks: AsyncClassifierCheckCallbacks,
): Promise<void> {
  const { command, cwd, descriptions } = pendingCheck
  const speculativeResult = consumeSpeculativeClassifierCheck(command)

  let classifierResult: ClassifierResult
  try {
    classifierResult = speculativeResult
      ? await speculativeResult
      : await classifyBashCommand(
          command,
          cwd,
          descriptions,
          'allow',
          signal,
          isNonInteractiveSession,
        )
  } catch (error: unknown) {
    // 当协调器会话取消时，中止信号触发并且
    // 分类器 API 调用以 APIUserAbortError 拒绝。这是预期的，
    // 不应作为未处理的 promise 拒绝而暴露。
    if (error instanceof APIUserAbortError || error instanceof AbortError) {
      callbacks.onComplete?.()
      return
    }
    callbacks.onComplete?.()
    throw error
  }

  logClassifierResultForAnts(command, 'allow', descriptions, classifierResult)

  // 如果用户已做出决定或已与权限对话框交互
  // （例如箭头键、Tab、打字），则不要自动批准
  if (!callbacks.shouldContinue()) return

  if (
    feature('BASH_CLASSIFIER') &&
    classifierResult.matches &&
    classifierResult.confidence === 'high'
  ) {
    callbacks.onAllow({
      type: 'classifier',
      classifier: 'bash_allow',
      reason: `由提示规则允许："${classifierResult.matchedDescription}"`,
    })
  } else {
    // 无匹配——通知以便清除检查指示器
    callbacks.onComplete?.()
  }
}

/**
 * 检查是否需要请求用户权限来使用给定输入调用 BashTool 的主要实现
 */
export async function bashToolHasPermission(
  input: z.infer<typeof BashTool.inputSchema>,
  context: ToolUseContext,
  getCommandSubcommandPrefixFn = getCommandSubcommandPrefix,
): Promise<PermissionResult> {
  // DOGE: 防御性检查 —— input 或 input.command 无效时直接放行（防止 REPL 崩溃）
  if (!input || typeof input.command !== 'string') {
    logForDebugging(
      'bashToolHasPermission: input 或 input.command 为空，跳过权限检查',
      { level: 'warn' },
    )
    return {
      behavior: 'allow',
      message: '命令输入为空，跳过权限检查',
    }
  }

  let appState = context.getAppState()

  // 0. 基于 AST 的安全解析。这取代了 tryParseShellCommand
  // （shell-quote 预检）和 bashCommandIsSafe 误解析门控。
  // tree-sitter 要么生成干净的 SimpleCommand[]（引号已解析，
  // 无隐藏替换），要么返回 'too-complex'——这恰恰是我们
  // 判断 splitCommand 输出是否可信任所需的信号。
  //
  // 当 tree-sitter WASM 不可用或通过环境变量禁用了注入检查时，
  // 我们回退到旧路径（~1370 行的旧版门控逻辑）。
  const injectionCheckDisabled = isEnvTruthy(
    process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK,
  )
  // GrowthBook 的 shadow 模式 killswitch——关闭时完全跳过原生解析。
  // 只计算一次；feature() 必须保持内联在下面的三元表达式中。
  const shadowEnabled = feature('TREE_SITTER_BASH_SHADOW')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_birch_trellis', true)
    : false
  // 在此处解析一次；生成的 AST 同时提供给 parseForSecurityFromAst
  // 和 bashToolCheckCommandOperatorPermissions。
  let astRoot = injectionCheckDisabled
    ? null
    : feature('TREE_SITTER_BASH_SHADOW') && !shadowEnabled
      ? null
      : await parseCommandRaw(input.command)
  let astResult: ParseForSecurityResult = astRoot
    ? parseForSecurityFromAst(input.command, astRoot)
    : { kind: 'parse-unavailable' }
  let astSubcommands: string[] | null = null
  let astRedirects: Redirect[] | undefined
  let astCommands: SimpleCommand[] | undefined
  let shadowLegacySubs: string[] | undefined

  // Shadow 测试 tree-sitter：记录其判定结果，然后强制设为 parse-unavailable，
  // 使旧版路径保持权威性。parseCommand 仍然受 TREE_SITTER_BASH（而非 SHADOW）
  // 的特性门控控制，因此旧版内部逻辑保持纯正则表达式。
  // 每次 bash 调用触发一个事件，同时捕获差异和不可用原因；
  // 模块加载失败由会话范围的 tengu_tree_sitter_load 事件单独覆盖。
  if (feature('TREE_SITTER_BASH_SHADOW')) {
    const available = astResult.kind !== 'parse-unavailable'
    let tooComplex = false
    let semanticFail = false
    let subsDiffer = false
    if (available) {
      tooComplex = astResult.kind === 'too-complex'
      semanticFail =
        astResult.kind === 'simple' && !checkSemantics(astResult.commands).ok
      const tsSubs =
        astResult.kind === 'simple'
          ? astResult.commands.map(c => c.text)
          : undefined
      const legacySubs = splitCommand(input.command)
      shadowLegacySubs = legacySubs
      subsDiffer =
        tsSubs !== undefined &&
        (tsSubs.length !== legacySubs.length ||
          tsSubs.some((s, i) => s !== legacySubs[i]))
    }
    logEvent('tengu_tree_sitter_shadow', {
      available,
      astTooComplex: tooComplex,
      astSemanticFail: semanticFail,
      subsDiffer,
      injectionCheckDisabled,
      killswitchOff: !shadowEnabled,
      cmdOverLength: input.command.length > 10000,
    })
    // 始终强制使用旧版——shadow 模式仅做观察。
    astResult = { kind: 'parse-unavailable' }
    astRoot = null
  }

  if (astResult.kind === 'too-complex') {
    // 解析成功但发现了无法静态分析的结构
    // （命令替换、展开、控制流、解析器差异）。
    // 优先遵循精确匹配的 deny/ask/allow，然后是前缀/通配符 deny。
    // 仅在未匹配到 deny 时才降级到 ask——不要将 deny 降级为 ask。
    const earlyExit = checkEarlyExitDeny(input, appState.toolPermissionContext)
    if (earlyExit !== null) return earlyExit
    const decisionReason: PermissionDecisionReason = {
      type: 'other' as const,
      reason: astResult.reason,
    }
    logEvent('tengu_bash_ast_too_complex', {
      nodeTypeId: nodeTypeId(astResult.nodeType),
    })
    return {
      behavior: 'ask',
      decisionReason,
      message: createPermissionRequestMessage(BashTool.name, decisionReason),
      suggestions: [],
      ...(feature('BASH_CLASSIFIER')
        ? {
            pendingClassifierCheck: buildPendingClassifierCheck(
              input.command,
              appState.toolPermissionContext,
            ),
          }
        : {}),
    }
  }

  if (astResult.kind === 'simple') {
    // 干净解析：检查语义级别的安全问题（zsh 内建命令、eval 等），
    // 这些命令在分词层面没问题，但本身是危险的。
    const sem = checkSemantics(astResult.commands)
    if (!sem.ok) {
      // 与 too-complex 路径相同的 deny 规则执行策略：
      // 设置了 `Bash(eval:*)` deny 的用户期望 `eval "rm"` 被阻止，而非降级。
      const earlyExit = checkSemanticsDeny(
        input,
        appState.toolPermissionContext,
        astResult.commands,
      )
      if (earlyExit !== null) return earlyExit
      const decisionReason: PermissionDecisionReason = {
        type: 'other' as const,
        reason: sem.reason,
      }
      return {
        behavior: 'ask',
        decisionReason,
        message: createPermissionRequestMessage(BashTool.name, decisionReason),
        suggestions: [],
      }
    }
    // 存储分词后的子命令供后续使用。下游代码（规则匹配、路径提取、
    // cd 检测）仍操作字符串，因此我们传递每个 SimpleCommand 的原始源码范围。
    // 下游处理（stripSafeWrappers、parseCommandArguments）会重新分词这些范围——
    // 这种重新分词存在已知 bug（stripCommentLines 错误处理引号内的换行符），
    // 但 checkSemantics 已捕获任何包含换行符的 argv 元素，所以这些 bug 在此处不会触发。
    // 将下游代码迁移为直接操作 argv 是后续提交的工作。
    astSubcommands = astResult.commands.map(c => c.text)
    astRedirects = astResult.commands.flatMap(c => c.redirects)
    astCommands = astResult.commands
  }

  // 旧版 shell-quote 预检。仅在 'parse-unavailable' 时到达
  // （tree-sitter 未加载或 TREE_SITTER_BASH 特性门控关闭）。
  // 会穿透到下面的完整旧版路径。
  if (astResult.kind === 'parse-unavailable') {
    logForDebugging(
      'bashToolHasPermission：tree-sitter 不可用，使用旧版 shell-quote 路径',
    )
    const parseResult = tryParseShellCommand(input.command)
    if (!parseResult.success) {
      const decisionReason = {
        type: 'other' as const,
        reason: `命令包含无法解析的畸形语法：${parseResult.error}`,
      }
      return {
        behavior: 'ask',
        decisionReason,
        message: createPermissionRequestMessage(BashTool.name, decisionReason),
      }
    }
  }

  // 检查沙箱自动允许（遵循显式的 deny/ask 规则）
  // 仅在沙箱和自动允许都启用时才调用
  if (
    SandboxManager.isSandboxingEnabled() &&
    SandboxManager.isAutoAllowBashIfSandboxedEnabled() &&
    shouldUseSandbox(input)
  ) {
    const sandboxAutoAllowResult = checkSandboxAutoAllow(
      input,
      appState.toolPermissionContext,
    )
    if (sandboxAutoAllowResult.behavior !== 'passthrough') {
      return sandboxAutoAllowResult
    }
  }

  // 首先检查精确匹配
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    appState.toolPermissionContext,
  )

  // 精确命令被拒绝
  if (exactMatchResult.behavior === 'deny') {
    return exactMatchResult
  }

  // 并行检查 Bash 提示 deny 和 ask 规则（两者都使用 Haiku）。
  // Deny 优先于 ask，两者都优先于 allow 规则。
  // 在 auto 模式下跳过——auto 模式分类器处理所有权限决策
  if (
    isClassifierPermissionsEnabled() &&
    !(
      feature('TRANSCRIPT_CLASSIFIER') &&
      appState.toolPermissionContext.mode === 'auto'
    )
  ) {
    const denyDescriptions = getBashPromptDenyDescriptions(
      appState.toolPermissionContext,
    )
    const askDescriptions = getBashPromptAskDescriptions(
      appState.toolPermissionContext,
    )
    const hasDeny = denyDescriptions.length > 0
    const hasAsk = askDescriptions.length > 0

    if (hasDeny || hasAsk) {
      const [denyResult, askResult] = await Promise.all([
        hasDeny
          ? classifyBashCommand(
              input.command,
              getCwd(),
              denyDescriptions,
              'deny',
              context.abortController.signal,
              context.options.isNonInteractiveSession,
            )
          : null,
        hasAsk
          ? classifyBashCommand(
              input.command,
              getCwd(),
              askDescriptions,
              'ask',
              context.abortController.signal,
              context.options.isNonInteractiveSession,
            )
          : null,
      ])

      if (context.abortController.signal.aborted) {
        throw new AbortError()
      }

      if (denyResult) {
        logClassifierResultForAnts(
          input.command,
          'deny',
          denyDescriptions,
          denyResult,
        )
      }
      if (askResult) {
        logClassifierResultForAnts(
          input.command,
          'ask',
          askDescriptions,
          askResult,
        )
      }

      // Deny 优先
      if (denyResult?.matches && denyResult.confidence === 'high') {
        return {
          behavior: 'deny',
          message: `被 Bash 提示规则拒绝："${denyResult.matchedDescription}"`,
          decisionReason: {
            type: 'other',
            reason: `被 Bash 提示规则拒绝："${denyResult.matchedDescription}"`,
          },
        }
      }

      if (askResult?.matches && askResult.confidence === 'high') {
        // 跳过 Haiku 调用——UI 在本地计算前缀并允许用户编辑。
        // 当测试覆盖时仍调用注入的函数。
        let suggestions: PermissionUpdate[]
        if (getCommandSubcommandPrefixFn === getCommandSubcommandPrefix) {
          suggestions = suggestionForExactCommand(input.command)
        } else {
          const commandPrefixResult = await getCommandSubcommandPrefixFn(
            input.command,
            context.abortController.signal,
            context.options.isNonInteractiveSession,
          )
          if (context.abortController.signal.aborted) {
            throw new AbortError()
          }
          suggestions = commandPrefixResult?.commandPrefix
            ? suggestionForPrefix(commandPrefixResult.commandPrefix)
            : suggestionForExactCommand(input.command)
        }
        return {
          behavior: 'ask',
          message: createPermissionRequestMessage(BashTool.name),
          decisionReason: {
            type: 'other',
            reason: `由 Bash 提示规则要求："${askResult.matchedDescription}"`,
          },
          suggestions,
          ...(feature('BASH_CLASSIFIER')
            ? {
                pendingClassifierCheck: buildPendingClassifierCheck(
                  input.command,
                  appState.toolPermissionContext,
                ),
              }
            : {}),
        }
      }
    }
  }

  // 检查非子命令的 Bash 操作符，如 `>`、`|` 等。
  // 这必须在危险路径检查之前进行，以便管道命令由操作符逻辑处理（生成"多个操作"消息）
  const commandOperatorResult = await checkCommandOperatorPermissions(
    input,
    (i: z.infer<typeof BashTool.inputSchema>) =>
      bashToolHasPermission(i, context, getCommandSubcommandPrefixFn),
    { isNormalizedCdCommand, isNormalizedGitCommand },
    astRoot,
  )
  if (commandOperatorResult.behavior !== 'passthrough') {
    // 安全修复：当管道段处理返回 'allow' 时，我们仍必须验证原始命令。
    // 管道段处理在检查每个段之前会剥离重定向，因此像：
    //   echo 'x' | xargs printf '%s' >> /tmp/file
    // 这样的命令，两个段都可能被允许（echo 和 xargs printf），但 >> 重定向
    // 会绕过验证。我们必须检查：
    // 1. 输出重定向的路径约束
    // 2. 重定向目标中的危险模式（反引号等）的命令安全性
    if (commandOperatorResult.behavior === 'allow') {
      // 检查原始命令中的危险模式（反引号、$() 等）
      // 捕获像这样的案例：echo x | xargs echo > `pwd`/evil.txt
      // 其中反引号在重定向目标中（已从各段中剥离）
      // 基于 AST 门控：当 astSubcommands 非空时，tree-sitter 已验证结构
      //（重定向目标中的反引号/$() 会返回 too-complex）。
      // 匹配 ~1481、~1706、~1755 处的门控。
      // 避免误报：`find -exec {} \; | grep x` 触发了反斜杠-;。
      // bashCommandIsSafe 运行完整的旧版正则表达式组（约 20 种模式）——
      // 仅在我们实际使用结果时才调用它。
      const safetyResult =
        astSubcommands === null
          ? await bashCommandIsSafeAsync(input.command)
          : null
      if (
        safetyResult !== null &&
        safetyResult.behavior !== 'passthrough' &&
        safetyResult.behavior !== 'allow'
      ) {
        // 附加待处理分类器检查——可能在用户响应前自动批准
        appState = context.getAppState()
        return {
          behavior: 'ask',
          message: createPermissionRequestMessage(BashTool.name, {
            type: 'other',
            reason:
              safetyResult.message ??
              '命令包含需要批准的模式',
          }),
          decisionReason: {
            type: 'other',
            reason:
              safetyResult.message ??
              '命令包含需要批准的模式',
          },
          ...(feature('BASH_CLASSIFIER')
            ? {
                pendingClassifierCheck: buildPendingClassifierCheck(
                  input.command,
                  appState.toolPermissionContext,
                ),
              }
            : {}),
        }
      }

      appState = context.getAppState()
      // 安全：从完整命令计算 compoundCommandHasCd，而非硬编码 false。
      // 管道处理路径此前在此处传递了 `false`，禁用了
      // pathValidation.ts:821 处的 cd+重定向检查。将 `| echo done`
      // 追加到 `cd .claude && echo x > settings.json` 会以
      // compoundCommandHasCd=false 路由经过此路径，使重定向写入
      // .claude/settings.json 而不触发 cd+重定向阻止逻辑。
      const pathResult = checkPathConstraints(
        input,
        getCwd(),
        appState.toolPermissionContext,
        commandHasAnyCd(input.command),
        astRedirects,
        astCommands,
      )
      if (pathResult.behavior !== 'passthrough') {
        return pathResult
      }
    }

    // 当管道段返回 'ask'（各段未被规则允许）时，
    // 附加待处理分类器检查——可能在用户响应前自动批准。
    if (commandOperatorResult.behavior === 'ask') {
      appState = context.getAppState()
      return {
        ...commandOperatorResult,
        ...(feature('BASH_CLASSIFIER')
          ? {
              pendingClassifierCheck: buildPendingClassifierCheck(
                input.command,
                appState.toolPermissionContext,
              ),
            }
          : {}),
      }
    }

    return commandOperatorResult
  }

  // 安全：旧版误解析门控。仅在 tree-sitter 模块未加载时运行。
  // 超时/中止通过 too-complex 关闭失败（已在上面提前返回），不路由至此。
  // 当 AST 解析成功时，astSubcommands 非空且我们已验证结构；
  // 此块完全跳过。AST 的 'too-complex' 结果涵盖了
  // isBashSecurityCheckForMisparsing 覆盖的所有内容——两者回答相同的
  // 问题："splitCommand 对此输入的输出是否可信任？"
  if (
    astSubcommands === null &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)
  ) {
    const originalCommandSafetyResult = await bashCommandIsSafeAsync(
      input.command,
    )
    if (
      originalCommandSafetyResult.behavior === 'ask' &&
      originalCommandSafetyResult.isBashSecurityCheckForMisparsing
    ) {
      // 包含安全 heredoc 模式（$(cat <<'EOF'...EOF)）的复合命令
      // 会在未拆分的命令上触发 $() 检查。剥离安全的 heredoc
      // 并重新检查剩余部分——如果存在其他误解析模式
      // （例如反斜杠转义的操作符），它们仍必须阻止。
      const remainder = stripSafeHeredocSubstitutions(input.command)
      const remainderResult =
        remainder !== null ? await bashCommandIsSafeAsync(remainder) : null
      if (
        remainder === null ||
        (remainderResult?.behavior === 'ask' &&
          remainderResult.isBashSecurityCheckForMisparsing)
      ) {
        // 如果精确命令有显式的 allow 权限则允许——用户已做出有意识的选择
        // 来允许此特定命令。
        appState = context.getAppState()
        const exactMatchResult = bashToolCheckExactMatchPermission(
          input,
          appState.toolPermissionContext,
        )
        if (exactMatchResult.behavior === 'allow') {
          return exactMatchResult
        }
        // 附加待处理分类器检查——可能在用户响应前自动批准
        const decisionReason: PermissionDecisionReason = {
          type: 'other' as const,
          reason: originalCommandSafetyResult.message,
        }
        return {
          behavior: 'ask',
          message: createPermissionRequestMessage(
            BashTool.name,
            decisionReason,
          ),
          decisionReason,
          suggestions: [], // 不建议保存可能有危险的命令
          ...(feature('BASH_CLASSIFIER')
            ? {
                pendingClassifierCheck: buildPendingClassifierCheck(
                  input.command,
                  appState.toolPermissionContext,
                ),
              }
            : {}),
        }
      }
    }
  }

  // 拆分为子命令。优先使用 AST 提取的范围；
  // 仅在 tree-sitter 不可用时回退到 splitCommand。
  // cd-cwd 过滤器会剥离模型喜欢追加的 `cd ${cwd}` 前缀。
  const cwd = getCwd()
  const cwdMingw =
    getPlatform() === 'windows' ? windowsPathToPosixPath(cwd) : cwd
  const rawSubcommands =
    astSubcommands ?? shadowLegacySubs ?? splitCommand(input.command)
  const { subcommands, astCommandsByIdx } = filterCdCwdSubcommands(
    rawSubcommands,
    astCommands,
    cwd,
    cwdMingw,
  )

  // CC-643: 限制子命令扇出。只有旧版 splitCommand 路径可能爆炸式增长——
  // AST 路径返回有界列表（astSubcommands !== null）或对无法表示的结构
  // 短路返回 'too-complex'。
  if (
    astSubcommands === null &&
    subcommands.length > MAX_SUBCOMMANDS_FOR_SECURITY_CHECK
  ) {
    logForDebugging(
      `bashPermissions: ${subcommands.length} subcommands exceeds cap (${MAX_SUBCOMMANDS_FOR_SECURITY_CHECK}) — returning ask`,
      { level: 'debug' },
    )
    const decisionReason = {
      type: 'other' as const,
      reason: `命令拆分为 ${subcommands.length} 个子命令，数量过多无法逐一进行安全检查`,
    }
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(BashTool.name, decisionReason),
      decisionReason,
    }
  }

  // 如果有多个 `cd` 命令则请求批准
  const cdCommands = subcommands.filter(subCommand =>
    isNormalizedCdCommand(subCommand),
  )
  if (cdCommands.length > 1) {
    const decisionReason = {
      type: 'other' as const,
      reason:
        '一条命令中包含多个目录切换操作，为清晰起见需要批准',
    }
    return {
      behavior: 'ask',
      decisionReason,
      message: createPermissionRequestMessage(BashTool.name, decisionReason),
    }
  }

  // 跟踪复合命令是否包含 cd 以进行安全验证
  // 这防止通过以下方式绕过路径检查：cd .claude/ && mv test.txt settings.json
  const compoundCommandHasCd = cdCommands.length > 0

  // 安全：阻止同时包含 cd 和 git 的复合命令
  // 这防止通过以下方式逃逸沙箱：cd /malicious/dir && git status
  // 其中恶意目录包含带有 core.fsmonitor 的裸 git 仓库。
  // 此检查必须在此处（子命令级权限检查之前）进行，
  // 因为 bashToolCheckPermission 通过 BashTool.isReadOnly() 独立检查每个子命令，
  // 这仅从 "git status" 单独推导出 compoundCommandHasCd=false，绕过了 readOnlyValidation.ts 检查。
  if (compoundCommandHasCd) {
    const hasGitCommand = subcommands.some(cmd =>
      isNormalizedGitCommand(cmd.trim()),
    )
    if (hasGitCommand) {
      const decisionReason = {
        type: 'other' as const,
        reason:
          '包含 cd 和 git 的复合命令需要批准以防止裸仓库攻击',
      }
      return {
        behavior: 'ask',
        decisionReason,
        message: createPermissionRequestMessage(BashTool.name, decisionReason),
      }
    }
  }

  appState = context.getAppState() // 重新计算最新状态，以防用户按了 shift+tab

  // 安全修复：在路径约束之前检查 Bash deny/ask 规则
  // 这确保像 Bash(ls:*) 这样的显式 deny 规则优先于
  // 对项目外路径返回 'ask' 的路径约束检查。
  // 没有此排序，项目外的绝对路径（例如 ls /home）会绕过 deny 规则，
  // 因为 checkPathConstraints 会先返回 'ask'。
  //
  // 注意：bashToolCheckPermission 内部调用 checkPathConstraints，后者处理
  // 每个子命令的输出重定向验证。但是，由于 splitCommand 在我们到达此处之前
  // 就剥离了重定向，我们必须在检查 deny 规则之后但在返回结果之前
  // 验证原始命令上的输出重定向。
  const subcommandPermissionDecisions = subcommands.map((command, i) =>
    bashToolCheckPermission(
      { command },
      appState.toolPermissionContext,
      compoundCommandHasCd,
      astCommandsByIdx[i],
    ),
  )

  // 如果有子命令被拒绝则拒绝
  const deniedSubresult = subcommandPermissionDecisions.find(
    _ => _.behavior === 'deny',
  )
  if (deniedSubresult !== undefined) {
    return {
      behavior: 'deny',
      message: `使用 ${BashTool.name} 执行命令 ${input.command} 的权限已被拒绝。`,
      decisionReason: {
        type: 'subcommandResults',
        reasons: new Map(
          subcommandPermissionDecisions.map((result, i) => [
            subcommands[i]!,
            result,
          ]),
        ),
      },
    }
  }

  // 在原始命令上验证输出重定向（在 splitCommand 剥离它们之前）
  // 这必须在检查 deny 规则之后但在返回结果之前。
  // 像 "> /etc/passwd" 这样的输出重定向会被 splitCommand 剥离，
  // 因此逐子命令的 checkPathConstraints 调用不会看到它们。
  // 我们在此处对原始输入进行验证。
  // 安全：当 AST 数据可用时，传递 AST 派生的重定向，以便
  // checkPathConstraints 直接使用它们，而不是用 shell-quote 重新解析
  //（shell-quote 存在已知的单引号反斜杠误解析 bug，可静默隐藏重定向操作符）。
  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    appState.toolPermissionContext,
    compoundCommandHasCd,
    astRedirects,
    astCommands,
  )
  if (pathResult.behavior === 'deny') {
    return pathResult
  }

  const askSubresult = subcommandPermissionDecisions.find(
    _ => _.behavior === 'ask',
  )
  const nonAllowCount = count(
    subcommandPermissionDecisions,
    _ => _.behavior !== 'allow',
  )

  // 安全 (GH#28784)：仅在没有子命令独立产生 'ask' 时，
  // 才在路径约束 'ask' 上短路。checkPathConstraints 在完整输入上
  // 重新运行路径命令循环，因此 `cd <项目外目录> && python3 foo.py`
  // 会产生仅有 Read(<dir>/**) 建议的 ask——UI 将其渲染为
  // "是的，允许从 <dir>/ 读取"，选择该选项会静默批准 python3。
  // 当子命令有自己的 ask（例如 cd 子命令自身的路径约束 ask）时，
  // 继续执行：要么下面的 askSubresult 短路触发（单个非 allow 子命令），
  // 要么合并流程收集每个非 allow 子命令的 Bash 规则建议。
  // bashToolCheckPermission 内部的逐子命令 checkPathConstraints 调用
  // 已捕获该路径中 cd 目标的 Read 规则。
  //
  // 当没有子命令 ask（全部 allow，或全部 passthrough 如 `printf > file`）时，
  // pathResult 是唯一的 ask——返回它以使重定向检查生效。
  if (pathResult.behavior === 'ask' && askSubresult === undefined) {
    return pathResult
  }

  // 如果有子命令需要批准则请求（例如边界外的 ls/cd）。
  // 仅在恰好一个子命令需要批准时短路——如果多个子命令需要
  //（例如 cd-项目外 ask + python3 passthrough），继续执行合并流程，
  // 以便提示显示所有子命令的 Bash 规则建议，而不是仅第一个 ask 的 Read 规则（GH#28784）。
  if (askSubresult !== undefined && nonAllowCount === 1) {
    return {
      ...askSubresult,
      ...(feature('BASH_CLASSIFIER')
        ? {
            pendingClassifierCheck: buildPendingClassifierCheck(
              input.command,
              appState.toolPermissionContext,
            ),
          }
        : {}),
    }
  }

  // 如果精确命令已被允许则允许
  if (exactMatchResult.behavior === 'allow') {
    return exactMatchResult
  }

  // 如果所有子命令都通过精确或前缀匹配被允许，则允许该命令——
  // 但仅在没有命令注入可能时。当 AST 解析成功时，每个子命令
  // 已确定为安全（无隐藏替换，无结构技巧）；逐子命令的重新检查是冗余的。
  // 在旧版路径上时，对每个子命令重新运行 bashCommandIsSafeAsync。
  let hasPossibleCommandInjection = false
  if (
    astSubcommands === null &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)
  ) {
    // CC-643: 将差异遥测批量化为单个 logEvent。逐子命令的 logEvent
    // 曾是热路径系统调用驱动（每次调用 → 通过 process.memoryUsage()
    // 访问 /proc/self/stat）。聚合计数保留了信号。
    let divergenceCount = 0
    const onDivergence = () => {
      divergenceCount++
    }
    const results = await Promise.all(
      subcommands.map(c => bashCommandIsSafeAsync(c, onDivergence)),
    )
    hasPossibleCommandInjection = results.some(
      r => r.behavior !== 'passthrough',
    )
    if (divergenceCount > 0) {
      logEvent('tengu_tree_sitter_security_divergence', {
        quoteContextDivergence: true,
        count: divergenceCount,
      })
    }
  }
  if (
    subcommandPermissionDecisions.every(_ => _.behavior === 'allow') &&
    !hasPossibleCommandInjection
  ) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'subcommandResults',
        reasons: new Map(
          subcommandPermissionDecisions.map((result, i) => [
            subcommands[i]!,
            result,
          ]),
        ),
      },
    }
  }

  // 查询 Haiku 获取命令前缀
  // 跳过 Haiku 调用——UI 在本地计算前缀并允许用户编辑。
  // 当注入自定义函数时（测试中）仍调用。
  let commandSubcommandPrefix: Awaited<
    ReturnType<typeof getCommandSubcommandPrefixFn>
  > = null
  if (getCommandSubcommandPrefixFn !== getCommandSubcommandPrefix) {
    commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
      input.command,
      context.abortController.signal,
      context.options.isNonInteractiveSession,
    )
    if (context.abortController.signal.aborted) {
      throw new AbortError()
    }
  }

  // 如果只有一个命令，无需处理子命令
  appState = context.getAppState() // 重新计算最新状态，以防用户按了 shift+tab
  if (subcommands.length === 1) {
    const result = await checkCommandAndSuggestRules(
      { command: subcommands[0]! },
      appState.toolPermissionContext,
      commandSubcommandPrefix,
      compoundCommandHasCd,
      astSubcommands !== null,
    )
    // 如果命令未被允许，附加待处理分类器检查。
    // 此时，'ask' 只能来自 bashCommandIsSafe（checkCommandAndSuggestRules 内部的安全检查），
    // 而非显式的 ask 规则——这些规则已在步骤 13（askSubresult 检查）中被过滤掉。
    // 分类器可以绕过安全检查。
    if (result.behavior === 'ask' || result.behavior === 'passthrough') {
      return {
        ...result,
        ...(feature('BASH_CLASSIFIER')
          ? {
              pendingClassifierCheck: buildPendingClassifierCheck(
                input.command,
                appState.toolPermissionContext,
              ),
            }
          : {}),
      }
    }
    return result
  }

  // 检查子命令权限结果
  const subcommandResults: Map<string, PermissionResult> = new Map()
  for (const subcommand of subcommands) {
    subcommandResults.set(
      subcommand,
      await checkCommandAndSuggestRules(
        {
          // 透传输入参数如 `sandbox`
          ...input,
          command: subcommand,
        },
        appState.toolPermissionContext,
        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        compoundCommandHasCd,
        astSubcommands !== null,
      ),
    )
  }

  // 如果所有子命令都被允许则允许
  // 注意这与 6b 不同，因为我们在检查命令注入结果。
  if (
    subcommands.every(subcommand => {
      const permissionResult = subcommandResults.get(subcommand)
      return permissionResult?.behavior === 'allow'
    })
  ) {
    // 保留 subcommandResults 作为 PermissionResult 用于 decisionReason
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'subcommandResults',
        reasons: subcommandResults,
      },
    }
  }

  // 否则，请求权限
  const collectedRules: Map<string, PermissionRuleValue> = new Map()

  for (const [subcommand, permissionResult] of subcommandResults) {
    if (
      permissionResult.behavior === 'ask' ||
      permissionResult.behavior === 'passthrough'
    ) {
      const updates =
        'suggestions' in permissionResult
          ? permissionResult.suggestions
          : undefined

      const rules = extractRules(updates)
      for (const rule of rules) {
        // 使用字符串表示作为键以去重
        const ruleKey = permissionRuleValueToString(rule)
        collectedRules.set(ruleKey, rule)
      }

      // GH#28784 后续：安全检查 ask（复合 cd+写入、进程替换等）
      // 不带建议。在像 `cd ~/out && rm -rf x` 这样的复合命令中，
      // 意味着只收集了 cd 的 Read 规则，UI 将提示标记为
      // "是的，允许从 <dir>/ 读取"——从未提及 rm。
      // 合成一个 Bash(exact) 规则，以便 UI 显示链式命令。
      // 跳过显式的 ask 规则（decisionReason.type 'rule'），
      // 其中用户故意想要每次审查。
      if (
        permissionResult.behavior === 'ask' &&
        rules.length === 0 &&
        permissionResult.decisionReason?.type !== 'rule'
      ) {
        for (const rule of extractRules(
          suggestionForExactCommand(subcommand),
        )) {
          const ruleKey = permissionRuleValueToString(rule)
          collectedRules.set(ruleKey, rule)
        }
      }
      // 注意：我们只收集规则，不收集其他更新类型（如模式更改）
      // 这对于主要需要规则建议的 bash 子命令来说是合适的
    }
  }

  const decisionReason = {
    type: 'subcommandResults' as const,
    reasons: subcommandResults,
  }

  // GH#11380：上限设为 MAX_SUGGESTED_RULES_FOR_COMPOUND。Map 保持插入顺序
  //（子命令顺序），因此切片保留最左边的 N 个。
  const cappedRules = Array.from(collectedRules.values()).slice(
    0,
    MAX_SUGGESTED_RULES_FOR_COMPOUND,
  )
  const suggestedUpdates: PermissionUpdate[] | undefined =
    cappedRules.length > 0
      ? [
          {
            type: 'addRules',
            rules: cappedRules,
            behavior: 'allow',
            destination: 'localSettings',
          },
        ]
      : undefined

  // 附加待处理分类器检查——可能在用户响应前自动批准。
  // 如果有任何子命令是 'ask'（例如路径约束或 ask 规则），
  // 行为为 'ask'——在 GH#28784 修复之前，ask 子结果总是上面短路，
  // 因此此路径只看到 'passthrough' 子命令并硬编码了该行为。
  return {
    behavior: askSubresult !== undefined ? 'ask' : 'passthrough',
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    suggestions: suggestedUpdates,
    ...(feature('BASH_CLASSIFIER')
      ? {
          pendingClassifierCheck: buildPendingClassifierCheck(
            input.command,
            appState.toolPermissionContext,
          ),
        }
      : {}),
  }
}

/**
 * 在规范化移除安全包装器（环境变量、timeout 等）和 shell 引号后，
 * 检查子命令是否为 git 命令。
 *
 * 安全：必须在匹配前进行规范化，以防止绕过，例如：
 *   'git' status    —— shell 引号对朴素正则隐藏了命令
 *   NO_COLOR=1 git status —— 环境变量前缀隐藏了命令
 */
export function isNormalizedGitCommand(command: string): boolean {
  // 快速路径：在任何解析之前捕获最常见的情况
  if (command.startsWith('git ') || command === 'git') {
    return true
  }
  const stripped = stripSafeWrappers(command)
  const parsed = tryParseShellCommand(stripped)
  if (parsed.success && parsed.tokens.length > 0) {
    // 直接 git 命令
    if (parsed.tokens[0] === 'git') {
      return true
    }
    // "xargs git ..." —— xargs 在当前目录运行 git，
    // 因此对于 cd+git 安全检查，它必须被视为 git 命令。
    // 这与 filterRulesByContentsMatchingInput 中的 xargs 前缀处理相匹配。
    if (parsed.tokens[0] === 'xargs' && parsed.tokens.includes('git')) {
      return true
    }
    return false
  }
  return /^git(?:\s|$)/.test(stripped)
}

/**
 * 在规范化移除安全包装器（环境变量、timeout 等）和 shell 引号后，
 * 检查子命令是否为 cd 命令。
 *
 * 安全：必须在匹配前进行规范化，以防止绕过，例如：
 *   FORCE_COLOR=1 cd sub —— 环境变量前缀对朴素 /^cd / 正则隐藏了 cd
 *   这镜像了 isNormalizedGitCommand 以确保对称的规范化。
 *
 * 同时匹配 pushd/popd —— 它们和 cd 一样改变当前工作目录，因此
 *   pushd /tmp/bare-repo && git status
 * 必须触发相同的 cd+git 守卫。镜像了 PowerShell 的
 * DIRECTORY_CHANGE_ALIASES（src/utils/powershell/parser.ts）。
 */
export function isNormalizedCdCommand(command: string): boolean {
  const stripped = stripSafeWrappers(command)
  const parsed = tryParseShellCommand(stripped)
  if (parsed.success && parsed.tokens.length > 0) {
    const cmd = parsed.tokens[0]
    return cmd === 'cd' || cmd === 'pushd' || cmd === 'popd'
  }
  return /^(?:cd|pushd|popd)(?:\s|$)/.test(stripped)
}

/**
 * 检查复合命令是否包含任何 cd 命令，
 * 使用处理环境变量前缀和 shell 引号的规范化检测。
 */
export function commandHasAnyCd(command: string): boolean {
  return splitCommand(command).some(subcmd =>
    isNormalizedCdCommand(subcmd.trim()),
  )
}
