/**
 * OpenAI 兼容端点的字段兼容矩阵
 *
 * 吸收自 claude-code-best-claude-code（CCB）的
 * src/services/providerRegistry/providerCompatMatrix.ts。
 *
 * 背景：不同中转站 / 厂商对 OpenAI 协议的支持严格程度不同。
 *   - Cerebras、Groq、Qwen 这类严格端点会**直接拒绝**未知顶层键
 *     （如 `stream_options`），整个请求 400。
 *   - DeepSeek 的 thinking 模式要求 `reasoning_content` 回传，否则报
 *     "The reasoning_content in the thinking mode must be passed back"。
 *   - 宽松端点则希望保留全部字段。
 *
 * 这里把「按端点裁剪请求体」抽成纯函数，由调用方按 baseURL 选择规则。
 * 纯函数、无 IO，便于单测与变异验证。
 */

export type CompatRule = 'cerebras' | 'groq' | 'deepseek' | 'strict-openai' | 'permissive'

export interface CompatProfile {
  /** 是否接受 chat completions 的 stream_options.include_usage */
  supportsStreamUsageOption: boolean
  /** 是否接受消息里的自定义 thinking 字段 */
  supportsThinkingField: boolean
  /**
   * assistant 历史消息中 reasoning_content 的处理方式：
   *   always-preserve      — 原样回传（DeepSeek thinking+tools 场景必需）
   *   drop-on-non-thinking — 当前模型非思考变体时移除
   *   strip                — 一律移除（严格端点最安全）
   */
  reasoningContentEcho: 'always-preserve' | 'drop-on-non-thinking' | 'strip'
}

export const COMPAT_PROFILES: Record<CompatRule, CompatProfile> = {
  cerebras: {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
  },
  groq: {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
  },
  deepseek: {
    supportsStreamUsageOption: true,
    supportsThinkingField: true,
    reasoningContentEcho: 'always-preserve',
  },
  'strict-openai': {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
  },
  permissive: {
    supportsStreamUsageOption: true,
    supportsThinkingField: true,
    reasoningContentEcho: 'drop-on-non-thinking',
  },
}

/** 模型名是否属于思考变体（用于 drop-on-non-thinking 判定）。 */
function isThinkingModel(model: unknown): boolean {
  if (typeof model !== 'string') return false
  const m = model.toLowerCase()
  return (
    m.includes('reasoner') ||
    m.includes('-thinking') ||
    m.includes('thinking-') ||
    m.includes('qwq') ||
    m.includes('-r1')
  )
}

/**
 * 按 baseURL / 模型名推断兼容规则。识别不出来时用 permissive ——
 * 宁可多带字段（中转动辄丢弃也无害），也不误删导致质量下降。
 */
export function inferCompatRule(baseURL: string | undefined, model?: string): CompatRule {
  const url = (baseURL ?? '').toLowerCase()
  const m = (model ?? '').toLowerCase()

  if (url.includes('cerebras')) return 'cerebras'
  if (url.includes('groq')) return 'groq'
  if (url.includes('deepseek')) return 'deepseek'
  if (m.includes('deepseek')) return 'deepseek'

  // 本地推理（Ollama / LM Studio / vLLM）对字段比较宽容，但通常不认 stream_options
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('11434')) {
    return 'permissive'
  }
  if (url.includes('openai.com')) return 'strict-openai'
  return 'permissive'
}

/**
 * 对出站请求体应用兼容规则。返回新对象，不修改入参。
 *
 * @param body   原始请求体（OpenAI chat completions 结构）
 * @param rule   兼容规则
 * @param model  当前请求的模型，用于 drop-on-non-thinking 判定；缺省时按"非思考模型"处理
 */
export function applyCompatRule(
  body: Record<string, unknown>,
  rule: CompatRule,
  model?: string,
): Record<string, unknown> {
  const profile = COMPAT_PROFILES[rule]
  const result: Record<string, unknown> = { ...body }

  if (!profile.supportsStreamUsageOption) {
    const so = result['stream_options']
    if (so !== null && typeof so === 'object' && !Array.isArray(so)) {
      const { include_usage: _dropped, ...rest } = so as Record<string, unknown>
      if (Object.keys(rest).length === 0) {
        delete result['stream_options']
      } else {
        result['stream_options'] = rest
      }
    }
  }

  if (!profile.supportsThinkingField && Array.isArray(result['messages'])) {
    result['messages'] = (result['messages'] as unknown[]).map(msg => {
      if (msg === null || typeof msg !== 'object') return msg
      const rec = msg as Record<string, unknown>
      if (!('thinking' in rec)) return msg
      const { thinking: _dropped, ...rest } = rec
      return rest
    })
  }

  const effectiveModel = model ?? (typeof result['model'] === 'string' ? result['model'] : undefined)
  const shouldStripReasoning =
    profile.reasoningContentEcho === 'strip' ||
    (profile.reasoningContentEcho === 'drop-on-non-thinking' && !isThinkingModel(effectiveModel))

  if (shouldStripReasoning && Array.isArray(result['messages'])) {
    result['messages'] = (result['messages'] as unknown[]).map(msg => {
      if (msg === null || typeof msg !== 'object') return msg
      const rec = msg as Record<string, unknown>
      if (!('reasoning_content' in rec)) return msg
      const { reasoning_content: _dropped, ...rest } = rec
      return rest
    })
  }

  return result
}

/**
 * DeepSeek 三种推理模式判定（供日志/诊断使用）。
 */
export function getDeepSeekReasoningMode(
  assistantMessage: Record<string, unknown>,
): 'thinking-only' | 'thinking+tools' | 'normal' {
  const hasReasoning = Boolean(assistantMessage['reasoning_content'])
  const toolCalls = assistantMessage['tool_calls']
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0
  if (hasReasoning && hasTools) return 'thinking+tools'
  if (hasReasoning) return 'thinking-only'
  return 'normal'
}
