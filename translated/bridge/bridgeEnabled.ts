import { feature } from 'bun:bundle'
import {
  checkGate_CACHED_OR_BLOCKING,
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../services/analytics/growthbook.js'
// Namespace import breaks the bridgeEnabled → auth → config → bridgeEnabled
// cycle — authModule.foo is a live binding, so by the time the helpers below
// call it, auth.js is fully loaded. Previously used require() for the same
// deferral, but require() hits a CJS cache that diverges from the ESM
// namespace after mock.module() (daemon/auth.test.ts), breaking spyOn.
import * as authModule from '../utils/auth.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { lt } from '../utils/semver.js'

/**
 * Runtime check for bridge mode entitlement.
 *
 * Remote Control requires a claude.ai subscription (the bridge auths to CCR
 * with the claude.ai OAuth token). isClaudeAISubscriber() excludes
 * Bedrock/Vertex/Foundry, apiKeyHelper/gateway deployments, env-var API keys,
 * and Console API logins — none of which have the OAuth token CCR needs.
 * See github.com/deshaw/anthropic-issues/issues/24.
 *
 * The `feature('BRIDGE_MODE')` guard ensures the GrowthBook string literal
 * is only referenced when bridge mode is enabled at build time.
 */
export function isBridgeEnabled(): boolean {
  // Positive ternary pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
    : false
}

/**
 * Blocking entitlement check for Remote Control.
 *
 * Returns cached `true` immediately (fast path). If the disk cache says
 * `false` or is missing, awaits GrowthBook init and fetches the fresh
 * server value (slow path, max ~5s), then writes it to disk.
 *
 * Use at entitlement gates where a stale `false` would unfairly block access.
 * For user-facing error paths, prefer `getBridgeDisabledReason()` which gives
 * a specific diagnostic. For render-body UI visibility checks, use
 * `isBridgeEnabled()` instead.
 */
export async function isBridgeEnabledBlocking(): Promise<boolean> {
  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))
    : false
}

/**
 * Diagnostic message for why Remote Control is unavailable, or null if
 * it's enabled. Call this instead of a bare `isBridgeEnabledBlocking()`
 * check when you need to show the user an actionable error.
 *
 * The GrowthBook gate targets on organizationUUID, which comes from
 * config.oauthAccount — populated by /api/oauth/profile during login.
 * That endpoint requires the user:profile scope. Tokens without it
 * (setup-token, CLAUDE_CODE_OAUTH_TOKEN env var, or pre-scope-expansion
 * logins) leave oauthAccount unpopulated, so the gate falls back to
 * false and users see a dead-end "not enabled" message with no hint
 * that re-login would fix it. See CC-1165 / gh-33105.
 */
export async function getBridgeDisabledReason(): Promise<string | null> {
  if (feature('BRIDGE_MODE')) {
    if (!isClaudeAISubscriber()) {
      return 'Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.'
    }
    if (!hasProfileScope()) {
      return 'Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token` or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons. Run `claude auth login` to use Remote Control.'
    }
    if (!getOauthAccountInfo()?.organizationUuid) {
      return 'Unable to determine your organization for Remote Control eligibility. Run `claude auth login` to refresh your account information.'
    }
    if (!(await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))) {
      return 'Remote Control is not yet enabled for your account.'
    }
    return null
  }
  return 'Remote Control is not available in this build.'
}

// 尝试/捕获：main.tsx:5698 调用 isBridgeEnabled() 时正在定义 Commander 程序，
// 在 enableConfigs() 运行之前。isClaudeAISubscriber() → getGlobalConfig() 抛出 "配置在允许前被访问" 异常。
// 预配置阶段，无论如何都不会存在 OAuth 令牌 —— 返回 false 是正确的。与已有的 swallow getFeatureValue_CACHED_MAY_BE_STALE
// 行为相同（growthbook.ts:775-780）。

function isClaudeAISubscriber(): boolean {
  try {
    return authModule.isClaudeAISubscriber()
  } catch {
    return false
  }
}
function hasProfileScope(): boolean {
  try {
    return authModule.hasProfileScope()
  } catch {
    return false
  }
}
function getOauthAccountInfo(): ReturnType<
  typeof authModule.getOauthAccountInfo
> {
  try {
    return authModule.getOauthConfig()
  } catch {
    return undefined
  }
}

/**
 * 运行时检查无环境变量（v2）的 REPL 桥接路径。
 * 当 GrowthBook 的标志 `tengu_bridge_repl_v2` 启用时返回 true。
 *
 * 控制 initReplBridge 使用哪个实现版本 —— 不是控制桥接是否可用（参见 isBridgeEnabled 上方说明）。守护进程/打印路径
 * 仍然使用基于环境变量的实现，不受此标志影响。
 */
export function isEnvLessBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_bridge_repl_v2', false)
    : false
}

/**
 * 控制 `cse_*` → `session_*` 客户端重标记 shim 的开关。
 *
 * 该 shim 存在是因为 compat/convert.go:27 验证了 TagSession，并且 claude.ai 前端路由使用了 `session_*`，
 * 而 v2 工作器端点分发的是 `cse_*`。一旦服务器通过环境类型生成标签，且前端直接接受 `cse_*`，
 * 则可以将此开关设为 false 使 toCompatSessionId 成为无操作。
 * 默认为 true —— shim 在未被显式禁用前保持活动状态。
 */
export function isCseShimEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE(
        'tengu_bridge_repl_v2_cse_shim_enabled',
        true,
      )
    : true
}

/**
 * 当前 CLI 版本低于 v1（基于环境变量）远程控制路径所需的最低版本时返回错误信息，或在版本符合要求时返回 null。
 * v2（无环境变量）路径使用 checkEnvLessBridgeMinVersion() 在 envLessBridgeConfig.ts 中进行检查 ——
 * 两个实现有独立的版本要求。
 *
 * 使用缓存的增长板配置。如果 GrowthBook 尚未加载，'0.0.0' 默认值意味着检查通过 —— 安全的回退方案。
 */
export function checkBridgeMinVersion(): string | null {
  // 正向模式 —— 参见 docs/feature-gating.md。
  // 负向模式（如果 (!feature(...)) return）不会消除
  // 外部构建中内联字符串字面量。
  if (feature('BRIDGE_MODE')) {
    const config = getDynamicConfig_CACHED_MAY_BE_STALE<{
      minVersion: string
    }>('tengu_bridge_min_version', { minVersion: '0.0.0' })
    if (config.minVersion && lt(MACRO.VERSION, config.minVersion)) {
      return `您的 Claude Code 版本 (${MACRO.VERSION}) 太旧，无法使用远程控制功能。\n需要 ${config.minVersion} 或更高版本。请运行 \`claude update\` 来更新。`
    }
  }
  return null
}

/**
 * 当用户未显式设置时，默认的 remoteControlAtStartup 值。
 * 如果存在 CCR_AUTO_CONNECT 构建标志（仅限 ant）且 tengu_cobalt_harbor 增长板标志开启，
 * 所有会话默认连接到远程控制 —— 用户仍可选择通过设置 remoteControlAtStartup=false 来关闭此功能
 * （显式设置优先级高于此默认值）。
 *
 * 在此处定义而非 config.ts 中是为了避免 config.ts → growthbook.ts 的直接导入循环（growthbook.ts → user.ts → config.ts）。
 */
export function getCcrAutoConnectDefault(): boolean {
  return feature('CCR_AUTO_CONNECT')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_harbor', false)
    : false
}

/**
 * 启用 CCR 镜像模式 —— 每个本地会话都会创建一个仅接收转发事件的远程控制会话。
 * 与 getCcrAutoConnectDefault()（双向远程控制）分离。
 * 环境变量优先级高于<｜end▁of▁sentence｜>/* 本地可选参与；由 GrowthBook 控制发布。 */
export function isCcrMirrorEnabled(): boolean {
  return feature('CCR_MIRROR')
    ? isEnvTruthy(process.env.CLAUDE_CODE_CCR_MIRROR) ||
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_mirror', false)
    : false
}<｜end▁of▁sentence｜>