/**
 * 共享分析配置
 *
 * 所有分析系统（Datadog、1P）通用的分析禁用判断逻辑
 */

import { isEnvTruthy } from '../../utils/envUtils.js'
import { isTelemetryDisabled } from '../../utils/privacyLevel.js'

/**
 * 检查分析操作是否应被禁用
 *
 * 分析功能在以下情况下禁用：
 * - 测试环境（NODE_ENV === 'test'）
 * - 第三方云提供商（Bedrock/Vertex）
 * - 隐私级别为 no-telemetry 或 essential-traffic
 */
export function isAnalyticsDisabled(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    isTelemetryDisabled()
  )
}

/**
 * 检查反馈调查是否应被抑制。
 *
 * 与 isAnalyticsDisabled() 不同，此函数不会因第三方提供商
 * （Bedrock/Vertex/Foundry）而阻断。调查是本地 UI 提示，不包含
 * 转录数据 —— 企业客户通过 OTEL 收集响应。
 */
export function isFeedbackSurveyDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || isTelemetryDisabled()
}
