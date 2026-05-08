import { feature } from 'bun:bundle'
import {
  checkGate_CACHED_OR_BLOCKING,
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../services/analytics/growthbook.js'
// 命名空间导入会打破 bridgeEnabled → auth → config → bridgeEnable
// 循环 — authModule.foo 是一个实时绑定，所以当下面的辅助函数
// call it, auth.js is fully loaded. Previously used require() for the same
// deferral, but require() hits a CJS cache that diverges from the ESM
// namespace after mock.module() (daemon/auth.test.ts), breaking spyOn.
import * as authModule from '../utils/auth.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { lt } from '../utils/semver.js'

/**
 * 运行时检查桥模式权限。
 *
 * 远程控件需要 claude.ai 订阅（桥使用 claude.ai OAuth 令牌向 CCR 进行身份验证）。isClaudeAISubscriber() 排除
 * Bedrock/Vertex/Foundry，apiKeyHelper/gateway 部署，环境变量 API 密钥，
 * 和控制台 API 登录时——这些都没有 CCR 需要的 OAuth 令牌。
 * 参见 github.com/deshaw/anthropic-issues/issues/24。
 *
 * `feature('BRIDGE_MODE')` 防护确保 GrowthBook 字符串字面量仅在构建时启用桥模式时被引用。
 */
export function isBridgeEnabled(): boolean {
  // 肯定三元模式 — 参见 docs/feature-gating.md。
  // 否定模式 (if (!feature(...)) return) 不会从外部构建中消除
  // 内联字符串字面量。
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
      return '远程控制需要 claude.ai 订阅。运行 `claude auth login` 使用你的 claude.ai 账户登录。'
    }
    if (!hasProfileScope()) {
      return '远程控制需要完整权限的登录令牌。出于安全原因，长期令牌（来自 `claude setup-token` 或 CLAUDE_CODE_OAUTH_TOKEN）仅限于推理用途。运行 `claude auth login` 以使用远程控制。'
    }
    if (!getOauthAccountInfo()?.organizationUuid) {
      return '无法确定你的组织的远程控制资格。运行 `claude auth login` 刷新你的账户信息。'
    }
    if (!(await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))) {
      return '远程控制尚未在你的账户中启用。'
    }
    return null
  }
  return '此构建中不提供远程控制功能。'
}

function isClaudeAISubscriber(): boolean {
  return true
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
    return authModule.getOauthAccountInfo()
  } catch {
    return undefined
  }
}

/**
 * Runtime check for the env-less (v2) REPL bridge path.
 * Returns true when the GrowthBook flag `tengu_bridge_repl_v2` is enabled.
 *
 * This gates which implementation initReplBridge uses — NOT whether bridge
 * is available at all (see isBridgeEnabled above). Daemon/print paths stay
 * on the env-based implementation regardless of this gate.
 */
export function isEnvLessBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_bridge_repl_v2', false)
    : false
}

/**
 * Kill-switch for the `cse_*` → `session_*` client-side retag shim.
 *
 * The shim exists because compat/convert.go:27 validates TagSession and the
 * claude.ai frontend routes on `session_*`, while v2 worker endpoints hand out
 * `cse_*`. Once the server tags by environment_kind and the frontend accepts
 * `cse_*` directly, flip this to false to make toCompatSessionId a no-op.
 * Defaults to true — the shim stays active until explicitly disabled.
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
 * Returns an error message if the current CLI version is below the
 * minimum required for the v1 (env-based) Remote Control path, or null if the
 * version is fine. The v2 (env-less) path uses checkEnvLessBridgeMinVersion()
 * in envLessBridgeConfig.ts instead — the two implementations have independent
 * version floors.
 *
 * Uses cached (non-blocking) GrowthBook config. If GrowthBook hasn't
 * loaded yet, the default '0.0.0' means the check passes — a safe fallback.
 */
export function checkBridgeMinVersion(): string | null {
  // 肯定模式——参见 docs/feature-gating.md。
  // 否定模式 (if (!feature(...)) return) 不会从外部构建中消除
  // 内联字符串字面量。
  if (feature('BRIDGE_MODE')) {
    const config = getDynamicConfig_CACHED_MAY_BE_STALE<{
      minVersion: string
    }>('tengu_bridge_min_version', { minVersion: '0.0.0' })
    if (config.minVersion && lt(MACRO.VERSION, config.minVersion)) {
      return `你的 Claude Code 版本 (${MACRO.VERSION}) 太旧，无法使用远程控制。\n需要版本 ${config.minVersion} 或更高。运行 \`claude update\` 进行更新。`
    }
  }
  return null
}

/**
 * Default for remoteControlAtStartup when the user hasn't explicitly set it.
 * When the CCR_AUTO_CONNECT build flag is present (ant-only) and the
 * tengu_cobalt_harbor GrowthBook gate is on, all sessions connect to CCR by
 * default — the user can still opt out by setting remoteControlAtStartup=false
 * in config (explicit settings always win over this default).
 *
 * Defined here rather than in config.ts to avoid a direct
 * config.ts → growthbook.ts import cycle (growthbook.ts → user.ts → config.ts).
 */
export function getCcrAutoConnectDefault(): boolean {
  return feature('CCR_AUTO_CONNECT')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_harbor', false)
    : false
}

/**
 * Opt-in CCR mirror mode — every local session spawns an outbound-only
 * Remote Control session that receives forwarded events. Separate from
 * getCcrAutoConnectDefault (bidirectional Remote Control). Env var wins for
 * local opt-in; GrowthBook controls rollout.
 */
export function isCcrMirrorEnabled(): boolean {
  return feature('CCR_MIRROR')
    ? isEnvTruthy(process.env.CLAUDE_CODE_CCR_MIRROR) ||
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_mirror', false)
    : false
}
