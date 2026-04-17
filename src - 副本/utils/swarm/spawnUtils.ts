/**
 * Shared utilities for spawning teammates across different backends.
 */

import {
  getChromeFlagOverride,
  getFlagSettingsPath,
  getInlinePlugins,
  getMainLoopModelOverride,
  getSessionBypassPermissionsMode,
} from '../../bootstrap/state.js'
import { quote } from '../bash/shellQuote.js'
import { isInBundledMode } from '../bundledMode.js'
import type { PermissionMode } from '../permissions/PermissionMode.js'
import { getTeammateModeFromSnapshot } from './backends/teammateModeSnapshot.js'
import { TEAMMATE_COMMAND_ENV_VAR } from './constants.js'

/**
 * Gets the command to use for spawning teammate processes.
 * Uses TEAMMATE_COMMAND_ENV_VAR if set, otherwise falls back to the
 * current process executable path.
 */
export function getTeammateCommand(): string {
  if (process.env[TEAMMATE_COMMAND_ENV_VAR]) {
    return process.env[TEAMMATE_COMMAND_ENV_VAR]
  }
  return isInBundledMode() ? process.execPath : process.argv[1]!
}

/**
 * Builds CLI flags to propagate from the current session to spawned teammates.
 * This ensures teammates inherit important settings like permission mode,
 * model selection, and plugin configuration from their parent.
 *
 * @param options.planModeRequired - If true, don't inherit bypass permissions (plan mode takes precedence)
 * @param options.permissionMode - Permission mode to propagate
 */
export function buildInheritedCliFlags(options?: {
  planModeRequired?: boolean
  permissionMode?: PermissionMode
}): string {
  const flags: string[] = []
  const { planModeRequired, permissionMode } = options || {}

  // 将权限模式传播给队友，但如果需要计划模式则不传播
  // 为了安全起见，计划模式优先于旁路权限
  if (planModeRequired) {
    // 需要计划模式时不继承旁路权限
  } else if (
    permissionMode === 'bypassPermissions' ||
    getSessionBypassPermissionsMode()
  ) {
    flags.push('--dangerously-skip-permissions')
  } else if (permissionMode === 'acceptEdits') {
    flags.push('--permission-mode acceptEdits')
  }

  // 如果通过 CLI 显式设置了 --model，则传播
  const modelOverride = getMainLoopModelOverride()
  if (modelOverride) {
    flags.push(`--model ${quote([modelOverride])}`)
  }

  // 如果通过 CLI 设置了 --settings，则传播
  const settingsPath = getFlagSettingsPath()
  if (settingsPath) {
    flags.push(`--settings ${quote([settingsPath])}`)
  }

  // 为每个内联插件传播 --plugin-dir
  const inlinePlugins = getInlinePlugins()
  for (const pluginDir of inlinePlugins) {
    flags.push(`--plugin-dir ${quote([pluginDir])}`)
  }

  // 传播 --teammate-mode，以便 tmux 队友使用与负责人相同的模式
  const sessionMode = getTeammateModeFromSnapshot()
  flags.push(`--teammate-mode ${sessionMode}`)

  // 如果在 CLI 上显式设置了 --chrome / --no-chrome，则传播
  const chromeFlagOverride = getChromeFlagOverride()
  if (chromeFlagOverride === true) {
    flags.push('--chrome')
  } else if (chromeFlagOverride === false) {
    flags.push('--no-chrome')
  }

  return flags.join(' ')
}

/**
 * 必须显式转发到 tmux 生成的队友的环境变量。
 * Tmux 可能会启动一个新的登录 shell，该 shell 不会继承父进程的 env，
 * 因此我们转发当前进程中设置的任何变量。
 */
const TEAMMATE_ENV_VARS = [
  // API 提供商选择 — 没有这些，队友会默认为 firstParty
  // 并发送请求到错误的端点（GitHub issue #23561）
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  // 自定义 API 端点
  'ANTHROPIC_BASE_URL',
  // 配置目录覆盖
  'CLAUDE_CONFIG_DIR',
  // CCR 标记 — 队友需要此标记以用于 CCR 感知代码路径。Auth 会
  // 通过 /home/claude/.claude/remote/.oauth_token 自行找到方法；
  // FD env 变量无济于事（管道 FD 不会跨越 tmux）。
  'CLAUDE_CODE_REMOTE',
  // 自动内存门控（memdir/paths.ts）检查 REMOTE && !MEMORY_DIR 以
  // 在临时 CCR 文件系统上禁用内存。仅转发 REMOTE 会
  // 在父进程开启内存时将队友切换为关闭内存。
  'CLAUDE_CODE_REMOTE_MEMORY_DIR',
  // 上游代理 — 父进程的 MITM 中继可从队友访问
  //（同一容器网络）。转发代理变量以便队友通过中继路由
  // 客户配置的流量以进行凭据注入。没有这些，队友将完全绕过代理。
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
] as const

/**
 * 为队友生成命令构建 `env KEY=VALUE ...` 字符串。
 * 始终包含 CLAUDECODE=1 和 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1，
 * 以及当前进程中设置的任何提供商/配置环境变量。
 */
export function buildInheritedEnvVars(): string {
  const envVars = ['CLAUDECODE=1', 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1']

  for (const key of TEAMMATE_ENV_VARS) {
    const value = process.env[key]
    if (value !== undefined && value !== '') {
      envVars.push(`${key}=${quote([value])}`)
    }
  }

  return envVars.join(' ')
}
