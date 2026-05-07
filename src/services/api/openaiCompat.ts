import { APIError } from '@anthropic-ai/sdk'
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

type AnyBlock = Record<string, unknown>

type OpenAICompatConfig = {
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

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

function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

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

export function convertAnthropicRequestToOpenAI(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
  temperature?: number
  max_tokens?: number
}): OpenAIChatRequest {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const messages: OpenAIChatMessage[] = []

  if (input.system) {
    const systemText = Array.isArray(input.system)
      ? input.system.map(block => block.text ?? '').join('\n')
      : input.system
    if (systemText) messages.push({ role: 'system', content: systemText })
  }

  for (const message of input.messages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)

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

      const text = contentToText(
        blocks.filter(block => block.type !== 'tool_result') as unknown as BetaMessageParam['content'],
      )
      if (text) messages.push({ role: 'user', content: text })
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

      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    }
  }

  return {
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
}

export async function createOpenAICompatStream(
  config: { apiKey: string; baseURL: string; headers?: Record<string, string>; fetch?: typeof fetch },
  request: any,
  signal: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const url = config.baseURL;
  console.error('[DEBUG] 请求 URL:', url);
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

    // 429/529/5xx -> APIError, so withRetry can recognize and do exponential backoff
    // APIError constructor: (status, error, message, headers, type?)
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

  return response.body.getReader()
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

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
  let started = false
  let nextContentIndex = 0
  let promptTokens = 0
  let completionTokens = 0
  let responseBytes = 0

  // map upstream index to local anthropic index, and block type
  const nativeIdxMap = new Map<number, number>()
  const nativeBlockType = new Map<number, 'text' | 'tool_use'>()
  const nativeToolUseInfo = new Map<number, { id: string; name: string }>()
  let nativeMessageDeltaSent = false

  // choices path state
  let activeBlockType: 'text' | null = null
  let activeBlockIndex: number | null = null
  const toolIdxMap = new Map<number, number>()
  const toolState = new Map<number, { id: string; name: string; arguments: string }>()

  async function* closeActiveBlock() {
    if (activeBlockType && activeBlockIndex !== null) {
      yield { type: 'content_block_stop', index: activeBlockIndex } as BetaRawMessageStreamEvent
      activeBlockType = null
      activeBlockIndex = null
    }
  }

  async function* closeAllNativeBlocks() {
    for (const [idx] of nativeBlockType) {
      yield { type: 'content_block_stop', index: idx } as BetaRawMessageStreamEvent
    }
    nativeBlockType.clear()
    nativeIdxMap.clear()
  }

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) break
    if (value?.byteLength) responseBytes += value.byteLength
    buffer += decoder.decode(value, { stream: true })
    const sse = parseSSEChunk(buffer)
    buffer = sse.remainder

    for (const rawEvent of sse.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') continue
        let event: Record<string, unknown>
        try { event = JSON.parse(data) as Record<string, unknown> } catch { continue }
        if (!event || typeof event !== 'object') continue

        const hasChoices = Array.isArray(event.choices) && event.choices.length > 0

        // ===============================
        // native event path (no choices field)
        // ===============================
        if (!hasChoices) {
          const evType = event.type as string
          if (!evType) continue

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
                // thinking / text -> text
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

              // skip signature_delta
              if (originalType === 'signature_delta') continue

              // thinking_delta -> text_delta
              let outputDelta = delta
              if (originalType === 'thinking_delta') {
                outputDelta = { type: 'text_delta', text: delta.thinking }
              }

              if (anthropicIdx === undefined) {
                // missing content_block_start, synthesize one (default text)
                anthropicIdx = nextContentIndex++
                nativeIdxMap.set(upstreamIdx, anthropicIdx)
                const guessType = originalType === 'input_json_delta' ? 'tool_use' : 'text'
                nativeBlockType.set(anthropicIdx, guessType)
                if (guessType === 'tool_use') {
                  const id = (delta?.id as string) || `toolu_${anthropicIdx}`
                  const name = (delta?.name as string) || ''
                  nativeToolUseInfo.set(anthropicIdx, { id, name })
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'tool_use', id, name, input: '' } } as BetaRawMessageStreamEvent
                } else {
                  yield { type: 'content_block_start', index: anthropicIdx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
                }
              }

              // tool_use id/name update
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
              }
              break
            }

            case 'message_delta': {
              const u = event.usage as Record<string, unknown>
              if (u?.output_tokens) completionTokens = u.output_tokens as number
              nativeMessageDeltaSent = true
              yield { type: 'message_delta', delta: event.delta as any, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
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
        // OpenAI choices path
        // ===============================
        const chunk = event as unknown as OpenAIStreamChunk
        const choice = chunk.choices[0]
        const delta = choice ? (choice.delta as Record<string, unknown>) : void 0

        if (!started) {
          started = true
          promptTokens = chunk.usage?.prompt_tokens ?? 0
          yield { type: 'message_start', message: { id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: promptTokens, output_tokens: 0 } } } as BetaRawMessageStreamEvent
        }

        // thinking delta -> pretend as text delta
        if (delta && (delta as any).thinking !== undefined) {
          const t = (delta as any).thinking as string
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

        // content delta
        if (delta?.content) {
          const text = delta.content as string
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

        // tool_calls
        if (delta && Array.isArray((delta as any).tool_calls)) {
          yield* closeActiveBlock()
          for (const tc of (delta as any).tool_calls as any[]) {
            const oi = tc.index ?? 0
            let ai = toolIdxMap.get(oi)
            if (ai === undefined) {
              ai = nextContentIndex++
              toolIdxMap.set(oi, ai)
              const state = { id: tc.id ?? `toolu_${oi}`, name: tc.function?.name ?? '', arguments: '' }
              toolState.set(oi, state)
              yield { type: 'content_block_start', index: ai, content_block: { type: 'tool_use', id: state.id, name: state.name, input: '' } } as BetaRawMessageStreamEvent
            }
            const state = toolState.get(oi)
            if (state) {
              if (tc.id) state.id = tc.id
              if (tc.function?.name) state.name = tc.function.name
              if (tc.function?.arguments) {
                state.arguments += tc.function.arguments
                yield { type: 'content_block_delta', index: ai, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } } as BetaRawMessageStreamEvent
              }
            }
          }
        }

        // finish_reason
        if (choice?.finish_reason) {
          yield* closeActiveBlock()
          for (const ai of toolIdxMap.values()) {
            yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
          }
          completionTokens = chunk.usage?.completion_tokens ?? completionTokens
          _lastResponseBytes = responseBytes
          yield { type: 'message_delta', delta: { stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null }, usage: { output_tokens: completionTokens } } as BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as BetaRawMessageStreamEvent
          return {
            id: chunk.id ?? 'openai-compat', type: 'message', role: 'assistant', model: input.model, content: [],
            stop_reason: mapFinishReason(choice.finish_reason), stop_sequence: null,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens }
          } as BetaMessage
        }
      }
    }
  }

  yield* closeActiveBlock()
  for (const ai of toolIdxMap.values()) {
    yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
  }
  yield* closeAllNativeBlocks()
  _lastResponseBytes = responseBytes
  throw new Error(`[openaiCompat] stream ended unexpectedly before message_stop for model=${input.model}`)
}

// DOGE: track response bytes for OpenAI compat JSON path
let _lastResponseBytes = 0
export function getLastResponseBytes(): number {
  return _lastResponseBytes
}

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
