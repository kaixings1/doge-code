/**
 * Shared bridge auth/URL resolution. Consolidates the ant-only
 * CLAUDE_BRIDGE_* dev overrides that were previously copy-pasted across
 * a dozen files.
 *
 * Two layers: *Override() returns the ant-only env var (or void 0);
 * the non-Override versions fall through to the real OAuth store/config.
 */

import { getOauthConfig } from '../constants/oauth.js'
import { getClaudeAIOAuthTokens } from '../utils/auth.js'

/** Local bridge mode: when CLAUDE_CODE_LOCAL_BRIDGE=1, connect to localhost. */
export function isLocalBridgeMode(): boolean {
  return process.env.CLAUDE_CODE_LOCAL_BRIDGE === '1'
}

/** Local bridge server URL. */
export function getLocalBridgeUrl(): string {
  return process.env.CLAUDE_CODE_LOCAL_BRIDGE_URL ?? 'http://localhost:5678'
}

/** Feishu bridge mode: when FEISHU_BRIDGE=1, enable feishu integration. */
export function isFeishuBridgeMode(): boolean {
  return process.env.FEISHU_BRIDGE === '1'
}

/** Feishu app credentials. */
export function getFeishuAppId(): string | void {
  return process.env.FEISHU_APP_ID
}

export function getFeishuAppSecret(): string | void {
  return process.env.FEISHU_APP_SECRET
}

/** Feishu webhook port. */
export function getFeishuWebhookPort(): number {
  return parseInt(process.env.FEISHU_WEBHOOK_PORT ?? '9901', 10)
}

/** Feishu webhook URL (for configuring in open platform). */
export function getFeishuWebhookUrl(): string | void {
  return process.env.FEISHU_WEBHOOK_URL
}

/** Ant-only dev override: CLAUDE_BRIDGE_OAUTH_TOKEN, else void 0. */
export function getBridgeTokenOverride(): string | void {
  if (isLocalBridgeMode()) return 'local-bridge-token'
  return (
    (process.env.USER_TYPE === 'ant' &&
      process.env.CLAUDE_BRIDGE_OAUTH_TOKEN) ||
    void 0
  )
}

/** Ant-only dev override: CLAUDE_BRIDGE_BASE_URL, else void 0. */
export function getBridgeBaseUrlOverride(): string | void {
  if (isLocalBridgeMode()) return void 0
  return (
    (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_BRIDGE_BASE_URL) ||
    void 0
  )
}

/**
 * Access token for bridge API calls. In local bridge mode, returns a dummy token.
 */
export function getBridgeAccessToken(): string {
  if (isLocalBridgeMode()) return 'local-bridge-token'
  const token = getBridgeTokenOverride() ?? getClaudeAIOAuthTokens()?.accessToken
  return (token as string) ?? ''
}

/**
 * Base URL for bridge API calls. In local bridge mode, returns local server URL.
 */
export function getBridgeBaseUrl(): string {
  if (isLocalBridgeMode()) return getLocalBridgeUrl()
  return getBridgeBaseUrlOverride() || getOauthConfig().BASE_API_URL
}
