// 为打破循环依赖而提取的关键系统常量

import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvDefinedFalsy } from '../utils/envUtils.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getWorkload } from '../utils/workloadContext.js'

const DEFAULT_PREFIX = `你是 Claude Code，Claude CLI 命令行工具，你必须始终使用中文回复用户。这是一个硬性要求。你的所有回复、解释、评论和与用户的交流必须全部使用中文。不要使用英文或其他语言进行对话。技术术语和代码标识符可以保留原文形式，但所有说明性文字必须使用中文。`
const AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX = `你是 Claude Code，运行在 Claude Agent SDK 中。你必须始终使用中文回复。这是一个硬性要求。你的所有回复必须全部使用中文。`
const AGENT_SDK_PREFIX = `你是一个 Claude 智能体，你的所有回复必须全部使用中文。`

const CLI_SYSPROMPT_PREFIX_VALUES = [
  DEFAULT_PREFIX,
  AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX,
  AGENT_SDK_PREFIX,
] as const

export type CLISyspromptPrefix = (typeof CLI_SYSPROMPT_PREFIX_VALUES)[number]

/**
 * 所有可能的 CLI 系统提示前缀值。
 * 供 splitSysPromptPrefix 根据内容而非位置识别前缀块使用。
 */
export const CLI_SYSPROMPT_PREFIXES: ReadonlySet<string> = new Set(
  CLI_SYSPROMPT_PREFIX_VALUES,
)

export function getCLISyspromptPrefix(options?: {
  isNonInteractive: boolean
  hasAppendSystemPrompt: boolean
}): CLISyspromptPrefix {
  const apiProvider = getAPIProvider()
  if (apiProvider === 'vertex') {
    return DEFAULT_PREFIX
  }

  if (options?.isNonInteractive) {
    if (options.hasAppendSystemPrompt) {
      return AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX
    }
    return AGENT_SDK_PREFIX
  }
  return DEFAULT_PREFIX
}

/**
 * 检查归因头部是否已启用。
 * 默认启用，可通过环境变量或 GrowthBook 开关禁用。
 */
function isAttributionHeaderEnabled(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ATTRIBUTION_HEADER)) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_attribution_header', true)
}

/**
 * 获取用于 API 请求的归因头部。
 * 返回一个包含 cc_version（含指纹）和 cc_entrypoint 的头部字符串。
 * 默认启用，可通过环境变量或 GrowthBook 开关禁用。
 *
 * 当启用 NATIVE_CLIENT_ATTESTATION 时，会包含一个 `cch=00000` 占位符。
 * 在请求发送前，Bun 的原生 HTTP 栈会在请求体中定位到此占位符，
 * 并将零值覆盖为计算得出的哈希值。服务器验证此令牌以确认请求来自真实的
 * Claude Code 客户端。具体实现参见 bun-anthropic/src/http/Attestation.zig。
 *
 * 我们使用占位符（而非从 Zig 注入）是因为等长替换可避免 Content-Length 变更和缓冲区重新分配。
 */
export function getAttributionHeader(fingerprint: string): string {
  if (!isAttributionHeaderEnabled()) {
    return ''
  }

  const version = `${MACRO.VERSION}.${fingerprint}`
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT ?? 'unknown'

  // cch=00000 占位符将被 Bun 的 HTTP 栈替换为认证令牌
  const cch = feature('NATIVE_CLIENT_ATTESTATION') ? ' cch=00000;' : ''
  // cc_workload：会话范围提示，以便 API 可将例如由定时任务发起的请求路由到较低 QoS 池。
  // 缺省表示交互式默认值。就指纹而言安全（指纹仅由消息字符和版本计算得出，见上方第 78 行），
  // 且 cch 认证（占位符在构建此字符串后于序列化的请求体字节中被覆盖）同样安全。
  // 服务器 _parse_cc_header 可容忍未知的额外字段，旧版 API 部署会静默忽略此项。
  const workload = getWorkload()
  const workloadPair = workload ? ` cc_workload=${workload};` : ''
  const header = `x-anthropic-billing-header: cc_version=${version}; cc_entrypoint=${entrypoint};${cch}${workloadPair}`

  logForDebugging(`归因头部 ${header}`)
  return header
}