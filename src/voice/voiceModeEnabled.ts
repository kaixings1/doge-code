import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  getClaudeAIOAuthTokens,
  isAnthropicAuthEnabled,
} from '../utils/auth.js'

/**
 * 语音模式的紧急开关检查。除非 `tengu_amber_quartz_disabled` GrowthBook 标志被启用（紧急关闭），
 * 否则返回 true。默认值 `false` 表示缺失/过期的磁盘缓存被视为"未禁用"——这样新安装的用户
 * 可以立即使用语音功能，无需等待 GrowthBook 初始化。此函数用于决定语音模式是否应该*可见*
 * （例如，命令注册、配置界面）。
 */
export function isVoiceGrowthBookEnabled(): boolean {
  // 正向三元表达式模式 — 参见 docs/feature-gating.md。
  // 负向模式（if (!feature(...)) return）无法从外部构建中消除内联字符串字面量。
  return feature('VOICE_MODE')
    ? !getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)
    : false
}

/**
 * 语音模式的纯认证检查。当用户拥有有效的 Anthropic OAuth 令牌时返回 true。
 * 由带记忆化的 getClaudeAIOAuthTokens 支持 — 首次调用会在 macOS 上生成 `security` 进程
 * （约 20-50 毫秒），后续调用均为缓存命中。记忆化会在令牌刷新时清除（约每小时一次），
 * 因此每次刷新预期会有一次冷启动。开销足够小，可用于使用时检查。
 */
export function hasVoiceAuth(): boolean {
  // 语音模式需要 Anthropic OAuth — 它使用 claude.ai 上的 voice_stream 端点，
  // 该端点不支持 API 密钥、Bedrock、Vertex 或 Foundry。
  if (!isAnthropicAuthEnabled()) {
    return false
  }
  // isAnthropicAuthEnabled 仅检查认证*提供者*，而非是否存在令牌。
  // 若没有此检查，语音界面会渲染，但当用户未登录时 connectVoiceStream 会静默失败。
  const tokens = getClaudeAIOAuthTokens()
  return Boolean(tokens?.accessToken)
}

/**
 * 完整的运行时检查：认证 + GrowthBook 紧急开关。调用者：`/voice`
 * （voice.ts, voice/index.ts）、ConfigTool、VoiceModeNotice —
 * 这些是命令时路径，可以接受新鲜的钥匙串读取。对于 React 渲染路径，
 * 请改用 useVoiceEnabled()（它对认证部分进行记忆化）。
 */
export function isVoiceModeEnabled(): boolean {
  return hasVoiceAuth() && isVoiceGrowthBookEnabled()
}
