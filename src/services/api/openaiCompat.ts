
import { APIError, APIConnectionError } from '@anthropic-ai/sdk'
import { sleep } from '../../utils/sleep.js'
// 引入调试日志工具（实际写入文件或控制台，取决于项目配置）
import { logForDebugging } from "../../utils/debug.js"
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage } from 'src/types/message.js'

type AnyBlock = Record<string, unknown>

// OpenAI 兼容配置
type OpenAICompatConfig = {
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

// OpenAI 工具调用结构
type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// OpenAI 对话消息
type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
  reasoning_content?: string | null
}

// 转换后的 OpenAI 请求体
export type OpenAIChatRequest = {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: unknown
    }
  }>
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } }
  max_tokens?: number
}

// OpenAI 流式响应中的单个 chunk
type OpenAIStreamChunk = {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: {
      role?: 'assistant'
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * 将 Anthropic 的消息内容（可能是字符串或内容块数组）转换为纯文本
 * 用于构建 OpenAI 消息时需要提取的用户/助手文本
 */
function contentToText(content: BetaMessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map(block => {
      if (block.type === 'text') return typeof block.text === 'string' ? block.text : ''
      if (block.type === 'tool_result') {
        return typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content)
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 确保 content 以内容块数组的形式返回（若为字符串则包装为 text 块）
 */
function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

/**
 * 将 Anthropic 工具定义转换为 OpenAI 工具定义格式
 * 如果无工具或转换后为空，返回 undefined
 */
function getToolDefinitions(tools?: BetaToolUnion[]): OpenAIChatRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const mapped = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      function: {
        name,
        description:
          typeof record.description === 'string' ? record.description : undefined,
        parameters: record.input_schema,
      },
    }]
  })
  return mapped.length > 0 ? mapped : undefined
}

/**
 * 将 Anthropic 格式的请求转换为 OpenAI 兼容的请求体
 * 会处理 system prompt、多模态内容、工具调用等字段的映射
 */
export function convertAnthropicRequestToOpenAI(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): OpenAIChatRequest {
  logForDebugging('[openaiCompat] 开始将 Anthropic 请求转换为 OpenAI 格式', { level: 'debug' })
  // 支持通过环境变量覆盖模型名称
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  logForDebugging(`[openaiCompat] 目标模型: ${targetModel} (原始: ${input.model}, 环境覆盖: ${configuredModel ?? '无'})`, { level: 'debug' })
  const messages: OpenAIChatMessage[] = []

  // 处理 system prompt（可能是字符串或内容块数组）
  if (input.system) {
    const systemText = Array.isArray(input.system)
      ? input.system.map(block => block.text ?? '').join('\n')
      : input.system
    if (systemText) {
      messages.push({ role: 'system', content: systemText })
      logForDebugging(`[openaiCompat] 添加 system 消息 (长度: ${systemText.length})`, { level: 'debug' })
    }
  }

  // 逐条转换消息
  for (const message of input.messages) {
    logForDebugging(`[openaiCompat] 处理消息 role=${message.role}`, { level: 'debug' })
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)

      // 提取 tool_result 块，转换为 OpenAI 的 tool 消息
      const toolResults = blocks.filter(block => block.type === 'tool_result')
      for (const result of toolResults) {
        const toolUseId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        const content = result.content
        messages.push({
          role: 'tool',
          tool_call_id: toolUseId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        })
        logForDebugging(`[openaiCompat] 添加 tool 消息 (tool_use_id=${toolUseId}, content长度=${typeof content === 'string' ? content.length : 'object'})`, { level: 'debug' })
      }

      // 将剩余的非工具结果内容拼接为用户消息
      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) {
        messages.push({ role: 'user', content: text })
        logForDebugging(`[openaiCompat] 添加 user 消息 (长度: ${text.length})`, { level: 'debug' })
      }
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      const text = blocks
        .filter(block => block.type === 'text')
        .map(block => (typeof block.text === 'string' ? block.text : ''))
        .join('')

      // 提取 reasoning_content：优先从内容块中找 thinking/ reasoning 类型的块，
      // 其次从 message 的附加字段中读取（桥接层流解析时可能已在顶层保存）
      let reasoningContent: string | null = null
      const thinkingBlock = blocks.find(
        b => b.type === 'thinking' || b.type === 'reasoning',
      )
      if (thinkingBlock && typeof thinkingBlock.thinking === 'string') {
        reasoningContent = thinkingBlock.thinking
      } else if (thinkingBlock && typeof thinkingBlock.reasoning === 'string') {
        reasoningContent = thinkingBlock.reasoning
      } else if (thinkingBlock && typeof thinkingBlock.text === 'string') {
        reasoningContent = thinkingBlock.text
      }
      // 兜底：如果 message 顶层有 reasoning_content 字段（来自 OpenAI 原生消息直传）
      if (!reasoningContent) {
        const msg = message as unknown as Record<string, unknown>
        if (typeof msg.reasoning_content === 'string') {
          reasoningContent = msg.reasoning_content
        }
      }

      const toolCalls = blocks
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: String(block.id),
          type: 'function' as const,
          function: {
            name: String(block.name),
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input ?? {}),
          },
        }))

      // 注意：不保留 reasoning_content。
      // 某些 thinking 模式 API（如 DeepSeek）要求 assistant 消息中如果带 reasoning_content，
      // 必须伴随实际的 thinking 令牌一起返回，但历史消息中的 reasoning_content 只是上次推理结果，
      // 再次发送会触发 "The reasoning_content in the thinking mode must be passed back" 错误。
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
      logForDebugging(`[openaiCompat] 添加 assistant 消息 (text长度=${text.length}, toolCalls数量=${toolCalls.length}, reasoning_content=${reasoningContent ? '有' : '无'})`, { level: 'debug' })
    }
  }

  const result: OpenAIChatRequest = {
    model: targetModel,
    messages,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    ...(getToolDefinitions(input.tools)
      ? { tools: getToolDefinitions(input.tools) }
      : {}),
    ...(input.tool_choice?.type === 'tool'
      ? {
          tool_choice: {
            type: 'function' as const,
            function: { name: input.tool_choice.name },
          },
        }
      : input.tool_choice?.type === 'auto'
        ? { tool_choice: 'auto' as const }
        : {}),
  }
  logForDebugging(`[openaiCompat] 转换完成: 模型: ${targetModel}，总消息数=${messages.length}, 工具数=${result.tools?.length ?? 0}`, { level: 'debug' })
  return result
}

/**
 * 向 OpenAI 兼容端点发起流式 POST 请求，返回可读流读取器
 * 内置了错误处理，对 429/529/5xx 抛出 APIError，以便上游进行重试
 */
export async function createOpenAICompatStream(
  config: { apiKey: string; baseURL: string; headers?: Record<string, string>; fetch?: typeof fetch },
  request: any,
  signal: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const url = config.baseURL;
  console.error('[DEBUG] 请求 URL:', url);
  logForDebugging('[openaiCompat] 准备请求 URL: ' + url, { level: 'debug' })
  logForDebugging(`[openaiCompat] 请求体: ${JSON.stringify({ ...request, stream: true })}`, { level: 'debug' })
  const response = await (config.fetch ?? globalThis.fetch)(
    url,
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify({ ...request, stream: true }),
    },
  );

  if (!response.ok || !response.body) {
    let responseText = ''
    try {
      responseText = await response.text()
    } catch {
      responseText = ''
    }
    logForDebugging(`[openaiCompat] 响应错误: status=${response.status}, body=${responseText}`, { level: 'debug' })

    // 对可重试的状态码（429/529/5xx）抛出 APIError，以便 withRetry 能识别并进行指数退避重试
    if (response.status === 429 || response.status === 529 || response.status >= 500) {
      let errorBody: object | undefined
      try {
        errorBody = JSON.parse(responseText)
      } catch {
        errorBody = { message: responseText }
      }
      const respHeaders = new Headers(response.headers as HeadersInit)
      throw new APIError(
        response.status,
        errorBody,
        'OpenAI compat request failed with status ' + response.status + (responseText ? ': ' + responseText : ''),
        respHeaders,
      )
    }

    throw new Error(
      'OpenAI compat request failed with status ' + response.status + (responseText ? ': ' + responseText : ''),
    )
  }

  logForDebugging(`[openaiCompat] 请求成功, 状态码=${response.status}, 准备读取流`, { level: 'debug' })
  return response.body.getReader()
}

/**
 * 解析 SSE 流缓冲区，返回完整的事件数组和未完成的部分
 * 按双换行分隔，最后一个不完整的块存入 remainder
 */
function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

/**
 * 将 OpenAI 的 finish_reason 映射为 Anthropic 的 stop_reason
 */
function mapFinishReason(reason: string | null | undefined): BetaMessage['stop_reason'] {
  if (reason === 'tool_calls') return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

export async function* createAnthropicStreamFromOpenAI(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false                // 是否已收到 message_start
  let nextContentIndex = 0          // 下一个 Anthropic 内容块索引
  let promptTokens = 0
  let completionTokens = 0
  let responseBytes = 0

  // 原生事件路径的索引映射：上游 index -> Anthropic index，以及块类型
  const nativeIdxMap = new Map<number, number>()
  const nativeBlockType = new Map<number, 'text' | 'tool_use'>()
  const nativeToolUseInfo = new Map<number, { id: string; name: string }>()
  let nativeMessageDeltaSent = false

  // choices 路径的状态
  let activeBlockType: 'text' | null = null
  let activeBlockIndex: number | null = null

  // 冒号结尾检测：服务器可能在冒号后 premature [DONE]，等待 20 秒确认
  let colonDeadline: number | null = null
  const COLON_GRACE_MS = 20000
  const toolIdxMap = new Map<number, number>()               // 上游 tool_calls index -> Anthropic index
  const toolState = new Map<number, { id: string; name: string; arguments: string }>()

  logForDebugging(`[openaiCompat] 开始将 OpenAI 流转换为 Anthropic 事件, model=${input.model}`, { level: 'debug' })
  /**
   * 关闭当前活动的文本块（如有）
   */
  async function* closeActiveBlock() {
    if (activeBlockType && activeBlockIndex !== null) {
      logForDebugging(`[openaiCompat] 关闭文本块 index=${activeBlockIndex}`, { level: 'debug' })
      yield { type: 'content_block_stop', index: activeBlockIndex } as BetaRawMessageStreamEvent
      activeBlockType = null
      activeBlockIndex = null
    }
  }

  /**
   * 关闭所有原生路径中尚未关闭的内容块
   */
  async function* closeAllNativeBlocks() {
    for (const [idx] of nativeBlockType) {
      logForDebugging(`[openaiCompat] 关闭原生块 index=${idx}`, { level: 'debug' })
      yield { type: 'content_block_stop', index: idx } as BetaRawMessageStreamEvent
    }
    nativeBlockType.clear()
    nativeIdxMap.clear()
  }
  logForDebugging('[openaiCompat] 开始将 OpenAI 流转换为 Anthropic 事件', { level: 'debug' })

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) {
      logForDebugging(`[openaiCompat] 流读取完成, 总响应字节数=${responseBytes}`, { level: 'debug' })
      break
    }
    if (value?.byteLength) {
      responseBytes += value.byteLength
      const partialText = decoder.decode(value, { stream: true })
      logForDebugging(`[openaiCompat] 读取到 chunk, 字节长度=${value.byteLength}, 部分文本预览: ${partialText.slice(0, 200)}${partialText.length > 200 ? '...' : ''}`, { level: 'debug' })
    }
    buffer += decoder.decode(value, { stream: true })
    const sse = parseSSEChunk(buffer)
    if (sse.events.length) {
      logForDebugging(`[openaiCompat] 解析出 ${sse.events.length} 个完整 SSE 事件`, { level: 'debug' })
    }
    buffer = sse.remainder

    for (const rawEvent of sse.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          if (data === '[DONE]')
          {
            // 如果有冒号等待计时器，先等待确认期
            if (colonDeadline !== null) {
              const waitMs = Math.max(0, colonDeadline - Date.now())
              logForDebugging(`[openaiCompat] 收到 [DONE] 但有冒号等待计时器，等待 ${waitMs}ms 确认`, { level: 'debug' })
              await sleep(waitMs)
              colonDeadline = null
              // 等待期间如果有新数据到达，会被 while(true) 循环继续读取
              // 如果 20 秒内无新数据，说明服务器确实 premature [DONE]
              // 此时抛出 APIConnectionError，让外层 withRetry 触发重试
              logForDebugging(`[openaiCompat] 冒号等待期结束，无新数据到达，抛出通讯中断错误`, { level: 'debug' })
              throw new APIConnectionError({
                message: '[openaiCompat] 服务器 premature [DONE]（冒号结尾后 20 秒无新数据），将自动重试继续工作',
                cause: new Error('premature_done'),
              })
            }
            logForDebugging('[openaiCompat] 收到 [DONE] 事件，开始收尾', { level: 'debug' })
            await closeActiveBlock()
            for (const ai of toolIdxMap.values()) {
              logForDebugging(`[openaiCompat] 关闭工具块 index=${ai}`, { level: 'debug' })
              yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
            }
            if (!nativeMessageDeltaSent && started) {
              logForDebugging('[openaiCompat] 发送 message_delta (end_turn)', { level: 'debug' })
              yield { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
            }
            yield { type: 'message_stop' } as BetaRawMessageStreamEvent
            _lastResponseBytes = responseBytes
            logForDebugging(`[openaiCompat] 流结束, 最终 token 用量: input=${promptTokens}, output=${completionTokens}, 字节=${responseBytes}`, { level: 'debug' })
            return {
              id: 'openai-compat',
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: promptTokens, output_tokens: completionTokens }
            } as unknown as BetaMessage
          }
          continue
        }
        let event: Record<string, unknown>
        try {
          event = JSON.parse(data) as Record<string, unknown>
        } catch (e) {
          logForDebugging(`[openaiCompat] 无法解析事件数据: ${data.slice(0, 200)}`, { level: 'debug' })
          continue
        }
        if (!event || typeof event !== 'object') continue
        logForDebugging(`[openaiCompat] 收到事件: ${JSON.stringify(event).slice(0, 500)}`, { level: 'debug' })

        const hasChoices = Array.isArray(event.choices) && event.choices.length > 0

        // ===============================
        // 原生 Anthropic 事件路径（无 choices 字段）
        // ===============================
        if (!hasChoices) {
          const evType = event.type as string
          if (!evType) {
            logForDebugging(`[openaiCompat] 事件缺少 type 字段, 原始内容: ${JSON.stringify(event).slice(0, 200)}`, { level: 'debug' })
            continue
          }
          logForDebugging(`[openaiCompat] 原生事件类型: ${evType}`, { level: 'debug' })

          switch (evType) {
            case 'message_start': {
              started = true
              const msg = event.message as Record<string, unknown>
              if (msg && !msg.model) msg.model = input.model
              const u = event.usage as Record<string, unknown>
              if (u?.input_tokens) promptTokens = u.input_tokens as number
              logForDebugging(`[openaiCompat] message_start, 输入 token 数=${promptTokens}`, { level: 'debug' })
              yield { type: 'message_start', message: msg ?? { id: 'anthropic-native', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } } as BetaRawMessageStreamEvent
              break
            }

            case 'content_block_start': {
              const upstreamIdx = Number(event.index) || 0
              let anthropicIdx = nativeIdxMap.get(upstreamIdx)
              if (anthropicIdx === undefined) {
                anthropicIdx = nextContentIndex++
                nativeIdxMap.set(upstreamIdx, anthropicIdx)
                logForDebugging(`[openaiCompat] 分配原生块索引: upstream ${upstreamIdx} -> Anthropic ${anthropicIdx}`, { level: 'debug' })
              }
              const block = event.content_block as Record<string, unknown>
              if (block?.type === 'tool_use') {
                nativeBlockType.set(anthropicIdx, 'tool_use')
                nativeToolUseInfo.set(anthropicIdx, {
                  id: (block.id as string) || '',
                  name: (block.name as string) || '',
                })
                logForDebugging(`[openaiCompat] 原生 tool_use 开始: index=${anthropicIdx}, name=${block.name}, id=${block.id}`, { level: 'debug' })
                yield { type: 'content_block_start', index: anthropicIdx, content_block: block as BetaRawMessageStreamEvent['content_block'] } as BetaRawMessageStreamEvent
              } else {
                // thinking / text 一律视为 text 块
                nativeBlockType.set(anthropicIdx, 'text')
                logForDebugging(`[openaiCompat] 原生文本块开始: index=${anthropicIdx}`, { level: 'debug' })
                yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
              }
              break
            }

            case 'content_block_delta': {
              const upstreamIdx = Number(event.index) || 0
              let anthropicIdx = nativeIdxMap.get(upstreamIdx)
              const delta = event.delta as Record<string, unknown>
              const originalType = delta?.type

              // 跳过签名增量
              if (originalType === 'signature_delta') {
                logForDebugging(`[openaiCompat] 跳过 signature_delta (index=${upstreamIdx})`, { level: 'debug' })
                continue
              }

              // thinking_delta -> text_delta
              let outputDelta = delta
              if (originalType === 'thinking_delta') {
                outputDelta = { type: 'text_delta', text: delta.thinking }
                logForDebugging(`[openaiCompat] 转换 thinking_delta 为 text_delta, 文本长度=${String(delta.thinking).length}`, { level: 'debug' })
              }

              if (anthropicIdx === undefined) {
                // 缺失 content_block_start，自动合成一个（默认为 text）
                anthropicIdx = nextContentIndex++
                nativeIdxMap.set(upstreamIdx, anthropicIdx)
                const guessType = originalType === 'input_json_delta' ? 'tool_use' : 'text'
                nativeBlockType.set(anthropicIdx, guessType)
                logForDebugging(`[openaiCompat] 自动合成 ${guessType} 块 (upstream ${upstreamIdx} -> Anthropic ${anthropicIdx})`, { level: 'debug' })
                if (guessType === 'tool_use') {
                  const id = (delta?.id as string) || `toolu_${anthropicIdx}`
                  const name = (delta?.name as string) || ''
                  nativeToolUseInfo.set(anthropicIdx, { id, name })
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'tool_use', id, name, input: '' } } as BetaRawMessageStreamEvent
                } else {
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
                }
              }

              // 更新 tool_use 的 id/name
              if (nativeBlockType.get(anthropicIdx) === 'tool_use') {
                if (delta?.id || delta?.name) {
                  const info = nativeToolUseInfo.get(anthropicIdx) ?? { id: '', name: '' }
                  if (delta.id) info.id = delta.id as string
                  if (delta.name) info.name = delta.name as string
                  nativeToolUseInfo.set(anthropicIdx, info)
                  logForDebugging(`[openaiCompat] 更新 tool_use 元数据: index=${anthropicIdx}, id=${info.id}, name=${info.name}`, { level: 'debug' })
                }
              }

              logForDebugging(`[openaiCompat] content_block_delta: index=${anthropicIdx}, delta类型=${outputDelta.type}`, { level: 'debug' })
              yield { type: 'content_block_delta', index: anthropicIdx, delta: outputDelta as BetaRawMessageStreamEvent['delta'] } as BetaRawMessageStreamEvent
              break
            }

            case 'content_block_stop': {
              const upstreamIdx = Number(event.index) || 0
              const anthropicIdx = nativeIdxMap.get(upstreamIdx)
              if (anthropicIdx !== undefined) {
                logForDebugging(`[openaiCompat] content_block_stop: upstream ${upstreamIdx} -> Anthropic ${anthropicIdx}`, { level: 'debug' })
                nativeBlockType.delete(anthropicIdx)
                nativeIdxMap.delete(upstreamIdx)
                yield { type: 'content_block_stop', index: anthropicIdx } as BetaRawMessageStreamEvent
              } else {
                logForDebugging(`[openaiCompat] 警告: content_block_stop 找不到映射 upstream ${upstreamIdx}`, { level: 'debug' })
              }
              break
            }

            case 'message_delta': {
              const u = event.usage as Record<string, unknown>
              if (u?.output_tokens) completionTokens = u.output_tokens as number
              nativeMessageDeltaSent = true
              logForDebugging(`[openaiCompat] message_delta: stop_reason=${(event.delta as any)?.stop_reason}, output_tokens=${completionTokens}`, { level: 'debug' })
              yield { type: 'message_delta', delta: event.delta as any, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
              break
            }

            case 'message_stop': {
              logForDebugging('[openaiCompat] 原生 message_stop, 清理并返回', { level: 'debug' })
              yield* closeAllNativeBlocks()
              if (!nativeMessageDeltaSent) {
                logForDebugging('[openaiCompat] 发送补充的 message_delta (原生路径)', { level: 'debug' })
                yield { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
              }
              _lastResponseBytes = responseBytes
              yield { type: 'message_stop' } as BetaRawMessageStreamEvent
              return { id: 'anthropic-native', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: promptTokens, output_tokens: completionTokens } } as BetaMessage
            }
          }
          continue
        }

        // ===============================
        // OpenAI choices 路径
        // ===============================
        //logForDebugging('[openaiCompat] 进入 OpenAI choices 路径处理', { level: 'debug' })
        const chunk = event as unknown as OpenAIStreamChunk
        const choice = chunk.choices[0]
        const delta = choice ? (choice.delta as Record<string, unknown>) : void 0

        // 如果尚未开始，发送 message_start
        if (!started) {
          started = true
          promptTokens = chunk.usage?.prompt_tokens ?? 0
          logForDebugging(`[openaiCompat] 自动发送 message_start, 输入 token 数=${promptTokens}, chunk.id=${chunk.id}`, { level: 'debug' })
          yield { type: 'message_start', message: { id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: promptTokens, output_tokens: 0 } } } as BetaRawMessageStreamEvent
        }

        // 将 thinking 增量当作文本增量处理
        if (delta && (delta as any).thinking !== undefined) {
          const t = (delta as any).thinking as string
          logForDebugging(`[openaiCompat] 检测到 thinking 增量, 长度=${t.length}`, { level: 'debug' })
          if (activeBlockType !== 'text') {
            yield* closeActiveBlock()
            activeBlockIndex = nextContentIndex++
            logForDebugging(`[openaiCompat] 创建新文本块 index=${activeBlockIndex} 用于 thinking`, { level: 'debug' })
            yield { type: 'content_block_start', index: activeBlockIndex, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
          }
          if (activeBlockIndex !== null) {
            yield { type: 'content_block_delta', index: activeBlockIndex, delta: { type: 'text_delta', text: t } } as BetaRawMessageStreamEvent
          }
        }

        // 文本增量
        if (delta?.content) {
          const text = delta.content as string
          //logForDebugging(`[openaiCompat] 文本增量, 长度=${text.length}`, { level: 'debug' })
          // 检测冒号结尾：可能是服务器 premature [DONE] 的信号
          if (text.endsWith(':') || text.endsWith('：')) {
            colonDeadline = Date.now() + COLON_GRACE_MS
            logForDebugging(`[openaiCompat] 检测到冒号结尾，启动 ${COLON_GRACE_MS}ms 等待期`, { level: 'debug' })
          } else if (text.endsWith('\n')) {
            // 收到换行后取消冒号等待（说明文本继续）
            colonDeadline = null
          }
          if (activeBlockType !== 'text') {
            yield* closeActiveBlock()
            activeBlockIndex = nextContentIndex++
            logForDebugging(`[openaiCompat] 创建新文本块 index=${activeBlockIndex} 用于普通文本`, { level: 'debug' })
            yield { type: 'content_block_start', index: activeBlockIndex, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
          }
          if (activeBlockIndex !== null) {
            yield { type: 'content_block_delta', index: activeBlockIndex, delta: { type: 'text_delta', text } } as BetaRawMessageStreamEvent
          }
        }

        // 工具调用增量
        if (delta && Array.isArray((delta as any).tool_calls)) {
          logForDebugging(`[openaiCompat] 检测到 ${(delta as any).tool_calls.length} 个工具调用增量`, { level: 'debug' })
          yield* closeActiveBlock()
          for (const tc of (delta as any).tool_calls as any[]) {
            const oi = tc.index ?? 0
            let ai = toolIdxMap.get(oi)
            if (ai === undefined) {
              ai = nextContentIndex++
              toolIdxMap.set(oi, ai)
              const state = { id: tc.id ?? `toolu_${oi}`, name: tc.function?.name ?? '', arguments: '' }
              toolState.set(oi, state)
              logForDebugging(`[openaiCompat] 新工具块: upstream index=${oi} -> Anthropic index=${ai}, name=${state.name}, id=${state.id}`, { level: 'debug' })
              yield { type: 'content_block_start', index: ai, content_block: { type: 'tool_use', id: state.id, name: state.name, input: '' } } as BetaRawMessageStreamEvent
            }
            const state = toolState.get(oi)
            if (state) {
              if (tc.id) state.id = tc.id
              if (tc.function?.name) state.name = tc.function.name
              if (tc.function?.arguments) {
                state.arguments += tc.function.arguments
                logForDebugging(`[openaiCompat] 工具参数增量: index=${oi}, 累积参数长度=${state.arguments.length}`, { level: 'debug' })
                yield { type: 'content_block_delta', index: ai, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } } as BetaRawMessageStreamEvent
              }
            }
          }
        }

        // finish_reason 出现时，结束消息
        //if (choice && Object.prototype.hasOwnProperty.call(choice, 'finish_reason')) {
        if (choice?.finish_reason) {
          logForDebugging(`[openaiCompat] 收到 finish_reason=${choice.finish_reason}, 准备结束消息`, { level: 'debug' })
          yield* closeActiveBlock()
          for (const ai of toolIdxMap.values()) {
            logForDebugging(`[openaiCompat] 关闭工具块 index=${ai}`, { level: 'debug' })
            yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
          }
          completionTokens = chunk.usage?.completion_tokens ?? completionTokens
          _lastResponseBytes = responseBytes
          yield { type: 'message_delta', delta: { stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as BetaRawMessageStreamEvent
          logForDebugging(`[openaiCompat] 消息结束, 最终 output_tokens=${completionTokens}`, { level: 'debug' })
          return {
            id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [],
            stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens }
          } as BetaMessage
        }
      }
    }
  }
  // ================================================================
  // 非流式响应兜底：当服务端返回完整 JSON（非 SSE 流式格式）时，
  // 从 buffer 中解析并合成为 Anthropic 流事件。
  // 这解决了非流式服务器（如 open-claw-zero-token）的兼容问题。
  // ================================================================
  if (!started && buffer.trim()) {
    const maybeParsed = tryParseNonStreamingResponse(buffer.trim(), input.model)
    if (maybeParsed) {
      started = true
      promptTokens = maybeParsed.promptTokens
      completionTokens = maybeParsed.completionTokens
      for (const ev of maybeParsed.events) {
        yield ev
      }
      _lastResponseBytes = responseBytes
      yield { type: 'message_stop' } as BetaRawMessageStreamEvent
      return maybeParsed.resultMessage as BetaMessage
    }
  }
  // 流意外结束时的清理
  logForDebugging(`[openaiCompat] 流意外结束 - started=${started}, promptTokens=${promptTokens}, completionTokens=${completionTokens}, responseBytes=${responseBytes}, buffer=${buffer.slice(0, 200)}`, { level: 'debug' })
  logForDebugging(`[openaiCompat] nativeIdxMap size=${nativeIdxMap.size}, nativeBlockType size=${nativeBlockType.size}`, { level: 'debug' })
  yield* closeActiveBlock()
  for (const ai of toolIdxMap.values()) {
    logForDebugging(`[openaiCompat] 清理工具块 index=${ai}`, { level: 'debug' })
    yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
  }
  yield* closeAllNativeBlocks()
  _lastResponseBytes = responseBytes
  throw new Error(`[openaiCompat] stream ended unexpectedly before message_stop for model=${input.model}`)
  if (!started) {
    logForDebugging(`[openaiCompat] 致命错误: 未收到 message_start 事件`, { level: 'error' })
    throw new Error(`[openaiCompat] 流式响应格式错误: 未收到 message_start 事件。请确认服务端返回的是 Anthropic 格式的流式响应，而不是 OpenAI 格式。当前模型: ${input.model}`)
  }
  throw new Error(`[openaiCompat] 流式响应格式错误: 在收到 message_stop 之前流已结束。请确认服务端返回的是完整的 Anthropic 格式流式响应。当前模型: ${input.model}`)
}

// 记录最近一次 OpenAI 兼容请求的响应字节数（供外部监控使用）
let _lastResponseBytes = 0
export function getLastResponseBytes(): number {
  return _lastResponseBytes
}

/**
 * 将 OpenAI 的 usage 信息映射为 Anthropic 的 BetaUsage 结构
 */
export function mapOpenAIUsageToAnthropic(usage?: {
  prompt_tokens?: number
  completion_tokens?: number
}): BetaUsage | undefined {
  if (!usage) return undefined
  return {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  } as BetaUsage
}
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage } from 'src/types/message.js'

type AnyBlock = Record<string, unknown>

// OpenAI 兼容配置
type OpenAICompatConfig = {
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

// OpenAI 工具调用结构
type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// OpenAI 对话消息
type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
  reasoning_content?: string | null
}

// 转换后的 OpenAI 请求体
export type OpenAIChatRequest = {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: unknown
    }
  }>
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } }
  max_tokens?: number
}

// OpenAI 流式响应中的单个 chunk
type OpenAIStreamChunk = {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: {
      role?: 'assistant'
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * 将 Anthropic 的消息内容（可能是字符串或内容块数组）转换为纯文本
 * 用于构建 OpenAI 消息时需要提取的用户/助手文本
 */
function contentToText(content: BetaMessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map(block => {
      if (block.type === 'text') return typeof block.text === 'string' ? block.text : ''
      if (block.type === 'tool_result') {
        return typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content)
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 确保 content 以内容块数组的形式返回（若为字符串则包装为 text 块）
 */
function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

/**
 * 将 Anthropic 工具定义转换为 OpenAI 工具定义格式
 * 如果无工具或转换后为空，返回 undefined
 */
function getToolDefinitions(tools?: BetaToolUnion[]): OpenAIChatRequest['tools'] {
  if (!tools || tools.length === 0) return undefined
  const mapped = tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      function: {
        name,
        description:
          typeof record.description === 'string' ? record.description : undefined,
        parameters: record.input_schema,
      },
    }]
  })
  return mapped.length > 0 ? mapped : undefined
}

/**
 * 将 Anthropic 格式的请求转换为 OpenAI 兼容的请求体
 * 会处理 system prompt、多模态内容、工具调用等字段的映射
 */
export function convertAnthropicRequestToOpenAI(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): OpenAIChatRequest {
  // 支持通过环境变量覆盖模型名称
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const messages: OpenAIChatMessage[] = []

  // 处理 system prompt（可能是字符串或内容块数组）
  if (input.system) {
    const systemText = Array.isArray(input.system)
      ? input.system.map(block => block.text ?? '').join('\n')
      : input.system
    if (systemText) {
      messages.push({ role: 'system', content: systemText })
    }
  }

  // 逐条转换消息
  for (const message of input.messages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)

      // 提取 tool_result 块，转换为 OpenAI 的 tool 消息
      const toolResults = blocks.filter(block => block.type === 'tool_result')
      for (const result of toolResults) {
        const toolUseId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        const content = result.content
        messages.push({
          role: 'tool',
          tool_call_id: toolUseId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        })
      }

      // 将剩余的非工具结果内容拼接为用户消息
      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) {
        messages.push({ role: 'user', content: text })
      }
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []
      const text = blocks
        .filter(block => block.type === 'text')
        .map(block => (typeof block.text === 'string' ? block.text : ''))
        .join('')

      // 提取 reasoning_content：优先从内容块中找 thinking/ reasoning 类型的块，
      // 其次从 message 的附加字段中读取（桥接层流解析时可能已在顶层保存）
      let reasoningContent: string | null = null
      const thinkingBlock = blocks.find(
        b => b.type === 'thinking' || b.type === 'reasoning',
      )
      if (thinkingBlock && typeof thinkingBlock.thinking === 'string') {
        reasoningContent = thinkingBlock.thinking
      } else if (thinkingBlock && typeof thinkingBlock.reasoning === 'string') {
        reasoningContent = thinkingBlock.reasoning
      } else if (thinkingBlock && typeof thinkingBlock.text === 'string') {
        reasoningContent = thinkingBlock.text
      }
      // 兜底：如果 message 顶层有 reasoning_content 字段（来自 OpenAI 原生消息直传）
      if (!reasoningContent) {
        const msg = message as unknown as Record<string, unknown>
        if (typeof msg.reasoning_content === 'string') {
          reasoningContent = msg.reasoning_content
        }
      }

      const toolCalls = blocks
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: String(block.id),
          type: 'function' as const,
          function: {
            name: String(block.name),
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input ?? {}),
          },
        }))

      // 注意：不保留 reasoning_content。
      // 某些 thinking 模式 API（如 DeepSeek）要求 assistant 消息中如果带 reasoning_content，
      // 必须伴随实际的 thinking 令牌一起返回，但历史消息中的 reasoning_content 只是上次推理结果，
      // 再次发送会触发 "The reasoning_content in the thinking mode must be passed back" 错误。
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    }
  }

  const result: OpenAIChatRequest = {
    model: targetModel,
    messages,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    ...(getToolDefinitions(input.tools)
      ? { tools: getToolDefinitions(input.tools) }
      : {}),
    ...(input.tool_choice?.type === 'tool'
      ? {
          tool_choice: {
            type: 'function' as const,
            function: { name: input.tool_choice.name },
          },
        }
      : input.tool_choice?.type === 'auto'
        ? { tool_choice: 'auto' as const }
        : {}),
  }
  return result
}

/**
 * 向 OpenAI 兼容端点发起流式 POST 请求，返回可读流读取器
 * 内置了错误处理，对 429/529/5xx 抛出 APIError，以便上游进行重试
 */
export async function createOpenAICompatStream(
  config: { apiKey: string; baseURL: string; headers?: Record<string, string>; fetch?: typeof fetch },
  request: any,
  signal: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const url = config.baseURL;
  logForDebugging(`[openaiCompat] 请求 URL: ${url}`, { level: 'debug' })
  const response = await (config.fetch ?? globalThis.fetch)(
    url,
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify({ ...request, stream: true }),
    },
  );
  //logForDebugging(`[openaiCompat] 请求体: ${JSON.stringify({ ...request, stream: true })}`, { level: 'debug' })

  if (!response.ok || !response.body) {
    let responseText = ''
    try {
      responseText = await response.text()
    } catch {
      responseText = ''
    }
    logForDebugging(`[openaiCompat] 响应错误: status=${response.status}, body=${responseText}`, { level: 'debug' })

    // 对可重试的状态码（429/529/5xx）抛出 APIError，以便 withRetry 能识别并进行指数退避重试
    if (response.status === 429 || response.status === 529 || response.status >= 500) {
      let errorBody: object | undefined
      try {
        errorBody = JSON.parse(responseText)
      } catch {
        errorBody = { message: responseText }
      }
      const respHeaders = new Headers(response.headers as HeadersInit)
      throw new APIError(
        response.status,
        errorBody,
        'OpenAI compat request failed with status ' + response.status + (responseText ? ': ' + responseText : ''),
        respHeaders,
      )
    }

    throw new Error(
      'OpenAI compat request failed with status ' + response.status + (responseText ? ': ' + responseText : ''),
    )
  }

  logForDebugging(`[openaiCompat] 请求成功, 状态码=${response.status}, 准备读取流`, { level: 'debug' })
  return response.body.getReader()
}

/**
 * 解析 SSE 流缓冲区，返回完整的事件数组和未完成的部分
 * 按双换行分隔，最后一个不完整的块存入 remainder
 */
function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

/**
 * 尝试将非流式 JSON 响应解析为 Anthropic 流事件序列
 * 兜底方案：当服务端返回完整 JSON 而非 SSE 流时使用
 */
function tryParseNonStreamingResponse(
  buffer: string,
  model: string,
): {
  events: Array<Record<string, unknown>>
  resultMessage: Record<string, unknown>
  promptTokens: number
  completionTokens: number
} | null {
  try {
    const parsed = JSON.parse(buffer)
    const message = parsed.choices?.[0]?.message ?? {}
    // 处理 LongCat-2.0 / DeepSeek 等模型：content 和 reasoning_content 都可能存在
    const content = message.content ?? parsed.content?.[0]?.text ?? ''
    const reasoningContent = message.reasoning_content ?? ''
    // 合并 reasoning_content 和 content，确保不丢失任何部分
    const fullContent = reasoningContent && content
      ? reasoningContent + '\n\n' + content
      : (reasoningContent || content || '')
    if (!fullContent) return null

    const promptTokens = parsed.usage?.prompt_tokens ?? 0
    const completionTokens = parsed.usage?.completion_tokens ?? 0

    return {
      events: [
        { type: 'message_start', message: { model, content: [], usage: { input_tokens: 0, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fullContent } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: completionTokens } },
        { type: 'message_stop' },
      ],
      resultMessage: {
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: fullContent }],
        stop_reason: 'end_turn',
        usage: { input_tokens: promptTokens, output_tokens: completionTokens },
      },
      promptTokens,
      completionTokens,
    }
  } catch {
    return null
  }
}

/**
 * 将 OpenAI 的 finish_reason 映射为 Anthropic 的 stop_reason
 */
function mapFinishReason(reason: string | null | undefined): BetaMessage['stop_reason'] {
  if (reason === 'tool_calls') return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

export async function* createAnthropicStreamFromOpenAI(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false                // 是否已收到 message_start
  let nextContentIndex = 0          // 下一个 Anthropic 内容块索引
  let promptTokens = 0
  let completionTokens = 0
  let responseBytes = 0
  let lastContentText = ''          // 上一次收到的非空文本内容

  // 原生事件路径的索引映射：上游 index -> Anthropic index，以及块类型
  const nativeIdxMap = new Map<number, number>()
  const nativeBlockType = new Map<number, 'text' | 'tool_use'>()
  const nativeToolUseInfo = new Map<number, { id: string; name: string }>()
  let nativeMessageDeltaSent = false

  // choices 路径的状态
  let activeBlockType: 'text' | null = null
  let activeBlockIndex: number | null = null
  const toolIdxMap = new Map<number, number>()               // 上游 tool_calls index -> Anthropic index
  const toolState = new Map<number, { id: string; name: string; arguments: string }>()

  /**
   * 关闭当前活动的文本块（如有）
   */
  async function* closeActiveBlock() {
    if (activeBlockType && activeBlockIndex !== null) {
      yield { type: 'content_block_stop', index: activeBlockIndex } as BetaRawMessageStreamEvent
      activeBlockType = null
      activeBlockIndex = null
    }
  }

  /**
   * 关闭所有原生路径中尚未关闭的内容块
   */
  async function* closeAllNativeBlocks() {
    for (const [idx] of nativeBlockType) {
      yield { type: 'content_block_stop', index: idx } as BetaRawMessageStreamEvent
    }
    nativeBlockType.clear()
    nativeIdxMap.clear()
  }
  while (true) {
    const { done, value } = await input.reader.read()
    if (done) {
      logForDebugging(`[openaiCompat] 流读取完成, 总响应字节数=${responseBytes}`, { level: 'debug' })
      break
    }
    if (value?.byteLength) {
      responseBytes += value.byteLength
      const partialText = decoder.decode(value, { stream: true })
      logForDebugging(`[openaiCompat] 读取到 chunk, 字节长度=${value.byteLength}, 部分文本预览: ${partialText.slice(0, 21000)}${partialText.length > 21000 ? '...' : ''}`, { level: 'debug' })
    }
    buffer += decoder.decode(value, { stream: true })
    const sse = parseSSEChunk(buffer)
    if (sse.events.length) {
      logForDebugging(`[openaiCompat] 解析出 ${sse.events.length} 个完整 SSE 事件`, { level: 'debug' })
    }
    buffer = sse.remainder

    for (const rawEvent of sse.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          if (data === '[DONE]')
          {
            await closeActiveBlock()
            for (const ai of toolIdxMap.values()) {
              yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
            }
            if (!nativeMessageDeltaSent && started) {
              yield { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
            }
            yield { type: 'message_stop' } as BetaRawMessageStreamEvent
            _lastResponseBytes = responseBytes
            logForDebugging(`[openaiCompat] 流结束, 最终 token 用量: input=${promptTokens}, output=${completionTokens}, 字节=${responseBytes}`, { level: 'debug' })
            return {
              id: 'openai-compat',
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: promptTokens, output_tokens: completionTokens }
            } as unknown as BetaMessage
          }
          continue
        }
        let event: Record<string, unknown>
        try {
          event = JSON.parse(data) as Record<string, unknown>
        } catch (e) {
          logForDebugging(`[openaiCompat] 无法解析事件数据: ${data.slice(0, 200)}`, { level: 'debug' })
          continue
        }
        if (!event || typeof event !== 'object') continue

        const hasChoices = Array.isArray(event.choices) && event.choices.length > 0

        // ===============================
        // 原生 Anthropic 事件路径（无 choices 字段）
        // ===============================
        if (!hasChoices) {
          const evType = event.type as string
          if (!evType) {
            logForDebugging(`[openaiCompat] 事件缺少 type 字段, 原始内容: ${JSON.stringify(event).slice(0, 200)}`, { level: 'debug' })
            continue
          }

          switch (evType) {
            case 'message_start': {
              started = true
              const msg = event.message as Record<string, unknown>
              if (msg && !msg.model) msg.model = input.model
              const u = event.usage as Record<string, unknown>
              if (u?.input_tokens) promptTokens = u.input_tokens as number
              yield { type: 'message_start', message: msg ?? { id: 'anthropic-native', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } } as BetaRawMessageStreamEvent
              break
            }

            case 'content_block_start': {
              const upstreamIdx = Number(event.index) || 0
              let anthropicIdx = nativeIdxMap.get(upstreamIdx)
              if (anthropicIdx === undefined) {
                anthropicIdx = nextContentIndex++
                nativeIdxMap.set(upstreamIdx, anthropicIdx)
              }
              const block = event.content_block as Record<string, unknown>
              if (block?.type === 'tool_use') {
                nativeBlockType.set(anthropicIdx, 'tool_use')
                nativeToolUseInfo.set(anthropicIdx, {
                  id: (block.id as string) || '',
                  name: (block.name as string) || '',
                })
                yield { type: 'content_block_start', index: anthropicIdx, content_block: block as BetaRawMessageStreamEvent['content_block'] } as BetaRawMessageStreamEvent
              } else {
                // thinking / text 一律视为 text 块
                nativeBlockType.set(anthropicIdx, 'text')
                yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
              }
              break
            }

            case 'content_block_delta': {
              const upstreamIdx = Number(event.index) || 0
              let anthropicIdx = nativeIdxMap.get(upstreamIdx)
              const delta = event.delta as Record<string, unknown>
              const originalType = delta?.type

              // 跳过签名增量
              if (originalType === 'signature_delta') {
                continue
              }

              // thinking_delta -> text_delta
              let outputDelta = delta
              if (originalType === 'thinking_delta') {
                outputDelta = { type: 'text_delta', text: delta.thinking }
              }

              if (anthropicIdx === undefined) {
                // 缺失 content_block_start，自动合成一个（默认为 text）
                anthropicIdx = nextContentIndex++
                nativeIdxMap.set(upstreamIdx, anthropicIdx)
                const guessType = originalType === 'input_json_delta' ? 'tool_use' : 'text'
                nativeBlockType.set(anthropicIdx, guessType)
                if (guessType === 'tool_use') {
                  const id = (delta?.id as string) || `toolu_${anthropicIdx}`
                  const name = (delta?.name as string) || ''
                  nativeToolUseInfo.set(anthropicIdx, { id, name })
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'tool_use', id, name } } as BetaRawMessageStreamEvent
                } else {
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
                }
              }

              // 更新 tool_use 的 id/name
              if (nativeBlockType.get(anthropicIdx) === 'tool_use') {
                if (delta?.id || delta?.name) {
                  const info = nativeToolUseInfo.get(anthropicIdx) ?? { id: '', name: '' }
                  if (delta.id) info.id = delta.id as string
                  if (delta.name) info.name = delta.name as string
                  nativeToolUseInfo.set(anthropicIdx, info)
                }
              }

              yield { type: 'content_block_delta', index: anthropicIdx, delta: outputDelta as BetaRawMessageStreamEvent['delta'] } as BetaRawMessageStreamEvent
              break
            }

            case 'content_block_stop': {
              const upstreamIdx = Number(event.index) || 0
              const anthropicIdx = nativeIdxMap.get(upstreamIdx)
              if (anthropicIdx !== undefined) {
                nativeBlockType.delete(anthropicIdx)
                nativeIdxMap.delete(upstreamIdx)
                yield { type: 'content_block_stop', index: anthropicIdx } as BetaRawMessageStreamEvent
              } else {
              }
              break
            }

            case 'message_delta': {
              const u = event.usage as Record<string, unknown>
              if (u?.output_tokens) completionTokens = u.output_tokens as number
              nativeMessageDeltaSent = true
              yield { type: 'message_delta', delta: event.delta as unknown as MessageDelta, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
              break
            }

            case 'message_stop': {
              yield* closeAllNativeBlocks()
              if (!nativeMessageDeltaSent) {
                yield { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
              }
              _lastResponseBytes = responseBytes
              yield { type: 'message_stop' } as BetaRawMessageStreamEvent
              return { id: 'anthropic-native', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: promptTokens, output_tokens: completionTokens } } as BetaMessage
            }
          }
          continue
        }

        // ===============================
        // OpenAI choices 路径
        // ===============================
        //logForDebugging('[openaiCompat] 进入 OpenAI choices 路径处理', { level: 'debug' })
        const chunk = event as unknown as OpenAIStreamChunk
        const choice = chunk.choices[0]
        const delta = choice ? (choice.delta as Record<string, unknown>) : void 0

        // 如果尚未开始，发送 message_start
        if (!started) {
          started = true
          promptTokens = chunk.usage?.prompt_tokens ?? 0
          yield { type: 'message_start', message: { id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: promptTokens, output_tokens: 0 } } } as BetaRawMessageStreamEvent
        }

        // 将 thinking 增量当作文本增量处理
        if (delta && (delta as Record<string, unknown>).thinking !== undefined) {
          const t = (delta as Record<string, unknown>).thinking as string
          if (activeBlockType !== 'text') {
            yield* closeActiveBlock()
            activeBlockIndex = nextContentIndex++
            yield { type: 'content_block_start', index: activeBlockIndex, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
          }
          if (activeBlockIndex !== null) {
            yield { type: 'content_block_delta', index: activeBlockIndex, delta: { type: 'text_delta', text: t } } as BetaRawMessageStreamEvent
          }
        }

        // reasoning_content 增量（DeepSeek 等模型的推理输出）
        if (delta?.reasoning_content) {
          const text = delta.reasoning_content as string
          if (activeBlockType !== 'text') {
            yield* closeActiveBlock()
            activeBlockIndex = nextContentIndex++
            yield { type: 'content_block_start', index: activeBlockIndex, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
          }
          if (activeBlockIndex !== null) {
            yield { type: 'content_block_delta', index: activeBlockIndex, delta: { type: 'text_delta', text } } as BetaRawMessageStreamEvent
          }
        }

        // 文本增量
        if (delta?.content) {
          const text = delta.content as string
          //logForDebugging(`[openaiCompat] 文本增量, 长度=${text.length}`, { level: 'debug' })
          if (activeBlockType !== 'text') {
            yield* closeActiveBlock()
            activeBlockIndex = nextContentIndex++
            yield { type: 'content_block_start', index: activeBlockIndex, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
          }
          if (activeBlockIndex !== null) {
            yield { type: 'content_block_delta', index: activeBlockIndex, delta: { type: 'text_delta', text } } as BetaRawMessageStreamEvent
          }
          // 记录最后收到的文本内容，用于检测冒号结尾的消息
          lastContentText = text
        }

        // 工具调用增量
        const rawToolCalls = (delta as Record<string, unknown>).tool_calls
        if (delta && Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
          // 过滤掉空的 tool_call 占位条目，以及新 tool_call 的 arguments 不完整碎片
          // 兼容非标准流式格式：模型可能把 arguments 拆成多个碎片（如 "\"dir" "\""），
          // 同一 index 的续传碎片通过 toolStateMap 识别并合并，不新建块
          const toolCalls = rawToolCalls.filter((tc: any) => {
            const oi = tc.index ?? 0
            // 已有该 index 的 tool state → 续传碎片，保留
            if (toolState.has(oi)) return true
            // 带 id 或 name → 正式声明，保留
            if (tc.id || tc.function?.name) return true
            // 全新 index 且无 id/name：仅当有非空 arguments 时保留
            // （不按 JSON 完整性过滤，分片传输的 JSON 天然不完整）
            if (tc.function?.arguments && tc.function.arguments.trim().length > 0) return true
            return false
          })
          if (toolCalls.length > 0) {
            yield* closeActiveBlock()
            for (const tc of toolCalls) {
              const oi = tc.index ?? 0
              // 跳过无任何数据的占位条目
              if (toolState.has(oi)) {
                if (!tc.id && !tc.function?.name && !tc.function?.arguments) continue
              } else if (!tc.id && !tc.function?.name) {
                continue
              }
              let ai = toolIdxMap.get(oi)
              if (ai === undefined) {
                ai = nextContentIndex++
                toolIdxMap.set(oi, ai)
                const state = { id: tc.id ?? `toolu_${oi}`, name: tc.function?.name ?? '', arguments: '' }
                toolState.set(oi, state)
                yield { type: 'content_block_start', index: ai, content_block: { type: 'tool_use', id: state.id, name: state.name } } as BetaRawMessageStreamEvent
              }
              const state = toolState.get(oi)
              if (state) {
                if (tc.id) state.id = tc.id
                if (tc.function?.name) state.name = tc.function.name
                if (tc.function?.arguments) {
                  const newArgs = tc.function.arguments
                  // 区分两种模式：
                  // 1) 模型每帧发送完整 arguments（startsWith 匹配）→ 只发增量部分
                  // 2) 模型发送增量碎片（不匹配）→ 直接拼接并发送完整碎片
                  if (newArgs.startsWith(state.arguments) && newArgs.length > state.arguments.length) {
                    // 全量重发模式：只发新增的增量部分
                    const delta = newArgs.slice(state.arguments.length)
                    state.arguments = newArgs
                    yield { type: 'content_block_delta', index: ai, delta: { type: 'input_json_delta', partial_json: delta } } as BetaRawMessageStreamEvent
                  } else if (newArgs.startsWith(state.arguments)) {
                    // 全量重发且内容完全相同（delta 为空）：仍需要产生一个 delta 事件
                    // 让 StreamProcessor 能解析到完整的 JSON
                    state.arguments = newArgs
                    yield { type: 'content_block_delta', index: ai, delta: { type: 'input_json_delta', partial_json: newArgs } } as BetaRawMessageStreamEvent
                  } else {
                    // 碎片模式：拼接累积
                    state.arguments += newArgs
                    yield { type: 'content_block_delta', index: ai, delta: { type: 'input_json_delta', partial_json: newArgs } } as BetaRawMessageStreamEvent
                  }
                }
              }
            }
          }

        }
        // finish_reason 出现时，结束消息
        //if (choice && Object.prototype.hasOwnProperty.call(choice, 'finish_reason')) {
        if (choice?.finish_reason) {
          yield* closeActiveBlock()
          for (const ai of toolIdxMap.values()) {
            yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
          }
          completionTokens = chunk.usage?.completion_tokens ?? completionTokens
          _lastResponseBytes = responseBytes
          yield { type: 'message_delta', delta: { stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as BetaRawMessageStreamEvent
          logForDebugging(`[openaiCompat] 消息结束, 最终 output_tokens=${completionTokens}`, { level: 'debug' })
          return {
            id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [],
            stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens }
          } as BetaMessage
        }

        // 检测冒号结尾的消息（服务器主动发送 "[DONE]" 前的中断信号）
        // 当收到类似"现在执行xxx："的消息（最后是冒号），又收到了 [DONE]，
        // 20秒后无新数据时，自动回复服务器一个消息告诉服务器通讯中断了，继续先前的工作
        if (lastContentText.endsWith('：') || lastContentText.endsWith(':')) {
          // 抛出通讯中断错误，触发 withRetry 的重试机制
          const error = new APIConnectionError(
            `[openaiCompat] 服务器主动发送 [DONE] 导致通讯中断，lastContent="${lastContentText.slice(-50)}"，将自动重试继续工作`,
            { cause: new Error('server_done_interrupt') },
          )
          logForDebugging(`[openaiCompat] 检测到冒号结尾的消息后收到 [DONE]，抛出通讯中断错误`, { level: 'debug' })
          throw error
        }
      }
    }
  }
  // ================================================================
  // 非流式响应兜底：当服务端返回完整 JSON（非 SSE 流式格式）时，
  // 从 buffer 中解析并合成为 Anthropic 流事件。
  // 这解决了非流式服务器（如 open-claw-zero-token）的兼容问题。
  // ================================================================
  if (!started && buffer.trim()) {
    const maybeParsed = tryParseNonStreamingResponse(buffer.trim(), input.model)
    if (maybeParsed) {
      started = true
      promptTokens = maybeParsed.promptTokens
      completionTokens = maybeParsed.completionTokens
      for (const ev of maybeParsed.events) {
        yield ev
      }
      _lastResponseBytes = responseBytes
      yield { type: 'message_stop' } as BetaRawMessageStreamEvent
      return maybeParsed.resultMessage as BetaMessage
    }
  }
  // 流意外结束时的清理
  logForDebugging(`[openaiCompat] 流意外结束 - started=${started}, promptTokens=${promptTokens}, completionTokens=${completionTokens}, responseBytes=${responseBytes}, buffer=${buffer.slice(0, 200)}`, { level: 'debug' })
  yield* closeActiveBlock()
  for (const ai of toolIdxMap.values()) {
    yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
  }
  yield* closeAllNativeBlocks()
  _lastResponseBytes = responseBytes
  throw new Error(`[openaiCompat] stream ended unexpectedly before message_stop for model=${input.model}`)
}

// 记录最近一次 OpenAI 兼容请求的响应字节数（供外部监控使用）

/**
 * 将 OpenAI 的 usage 信息映射为 Anthropic 的 BetaUsage 结构
 */
export function mapOpenAIUsageToAnthropic(usage?: {
  prompt_tokens?: number
  completion_tokens?: number
}): BetaUsage | undefined {
  if (!usage) return undefined
  return {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  } as BetaUsage
}
