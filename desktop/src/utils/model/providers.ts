import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'

/** API 提供方类型 */
export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

/**
 * 获取当前使用的 API 提供方。
 * 通过检查环境变量优先级：Bedrock > Vertex > Foundry > 第一方。
 */
export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : 'firstParty'
}
export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}
/**
 * 检查 ANTHROPIC_BASE_URL 是否为第一方 Anthropic API 地址。
 * 若未设置（使用默认 API）或指向 api.anthropic.com（蚂蚁用户额外允许 api-staging.anthropic.com），则返回 true。
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const parsed = new URL(baseUrl)
    // 使用 hostname 而非 host，排除端口号干扰
    const hostname = parsed.hostname
    const allowedHosts = ['api.anthropic.com']
    
    // 规范化 USER_TYPE 比较，去除首尾空格并转为小写
    if (process.env.USER_TYPE?.trim().toLowerCase() === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(hostname)
  } catch {
    return false
  }
}