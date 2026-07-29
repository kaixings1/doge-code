/**
 * desktop/src/main/apiClient.ts — 桌面端 API 客户端
 *
 * 复用 src/services/api/openaiCompat.ts 的成熟实现，
 * 提供 Anthropic/OpenAI 兼容的流式 API 请求能力。
 *
 * 特性：
 * - 自动检测 Anthropic/OpenAI 格式并转换
 * - 完整的 SSE 流解析（parseSSEChunk）
 * - 429/529/5xx 错误分类（APIError）
 * - 非流式响应兜底（tryParseNonStreamingResponse）
 * - thinking_delta 支持
 * - AbortSignal 取消支持
 */

import type { APIRequest } from '../../../src/engine/requestBuilder.js'

// ─── 类型定义（与 src/services/api/openaiCompat.ts 对齐） ───

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  reasoning_content?: string | null
}

interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: Record<string, unknown>
    }
  }>
  tool_choice?: string
  max_tokens?: number
}

interface OpenAIStreamChunk {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: Record<string, unknown>
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

// ─── SSE 解析 ───

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

// ─── finish_reason 映射 ───

function mapFinishReason(reason: string | null | undefined): string {
  if (reason === 'tool_calls') return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

// ─── 请求体转换（Anthropic → OpenAI） ───

function convertAnthropicRequestToOpenAI(req: APIRequest): OpenAIChatRequest {
  const messages: OpenAIChatMessage[] = []

  // system prompt
  if (req.system) {
    messages.push({ role: 'system', content: req.system })
  }

  // 消息转换
  for (const msg of req.messages) {
    if (msg.role === 'user') {
      // 提取 tool_result → OpenAI tool 消息
      const blocks = Array.isArray(msg.content) ? msg.content as Array<Record<string, unknown>> : []
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          messages.push({
            role: 'tool',
            tool_call_id: block.tool_use_id as string | undefined,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          })
        }
      }
      // 用户文本
      const text = blocks
        .filter(b => b.type !== 'tool_result')
        .map(b => (b.type === 'text' && typeof b.text === 'string') ? b.text : '')
        .join('')
      if (text) {
        messages.push({ role: 'user', content: text })
      } else if (typeof msg.content === 'string' && msg.content) {
        messages.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'assistant') {
      let text = ''
      const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
      if (Array.isArray(msg.content)) {
        const blocks = msg.content as Array<Record<string, unknown>>
        text = blocks.filter(b => b.type === 'text').map(b => (typeof b.text === 'string' ? b.text : '')).join('')
        toolCalls.push(...blocks.filter(b => b.type === 'tool_use').map(b => ({
          id: b.id as string, type: 'function' as const,
          function: { name: b.name as string, arguments: JSON.stringify(b.input ?? {}) },
        })))
      } else if (typeof msg.content === 'string') {
        text = msg.content
      }
      messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) })
    } else if (msg.role === 'tool') {
      const toolUseId = (msg as Record<string, unknown>).toolUseId
      const toolCallId = typeof toolUseId === 'string' ? toolUseId : ''
      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })
    } else {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })
    }
  }

  // 工具转换
  const tools = req.tools?.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }))

  return {
    model: req.model,
    messages,
    stream: true,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    tools,
  }
}

// ─── 非流式响应兜底 ───

function tryParseNonStreamingResponse(
  buffer: string,
  model: string,
): { events: Array<Record<string, unknown>>; resultMessage: Record<string, unknown>; promptTokens: number; completionTokens: number } | null {
  try {
    const parsed = JSON.parse(buffer)
    const content = parsed.choices?.[0]?.message?.content ?? parsed.content?.[0]?.text ?? ''
    if (!content) return null

    const promptTokens = parsed.usage?.prompt_tokens ?? 0
    const completionTokens = parsed.usage?.completion_tokens ?? 0

    return {
      events: [
        { type: 'message_start', message: { model, content: [], usage: { input_tokens: promptTokens, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: content } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: completionTokens } },
        { type: 'message_stop' },
      ],
      resultMessage: { type: 'message', role: 'assistant', model, content: [{ type: 'text', text: content }], stop_reason: 'end_turn', usage: { input_tokens: promptTokens, output_tokens: completionTokens } },
      promptTokens,
      completionTokens,
    }
  } catch {
    return null
  }
}

// ─── 配置 ───

export interface DesktopApiConfig {
  apiKey: string
  baseUrl: string
  provider: string
}

// ─── 创建 API 客户端 ───

export function createDesktopApiClient(config: DesktopApiConfig) {
  const { apiKey, baseUrl, provider } = config
  const isAnthropic = provider === 'anthropic'
  const trimmed = baseUrl.replace(/\/+$/, '')
  const url = isAnthropic
    ? (trimmed.endsWith('/messages') ? trimmed : `${trimmed}/messages`)
    : (trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (isAnthropic) {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return {
    /**
     * 发送 API 请求并返回 Anthropic 格式的流式事件
     */
    async sendMessage(request: APIRequest): Promise<AsyncIterable<Record<string, unknown>>> {
      // 构建请求体
      let body: Record<string, unknown>

      if (isAnthropic) {
        body = {
          model: request.model,
          max_tokens: request.max_tokens,
          stream: true,
          system: request.system,
          messages: request.messages.map(m => ({
            role: m.role === 'tool' ? 'user' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          })),
        }
        if (request.tools && request.tools.length > 0) {
          body.tools = request.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          }))
        }
      } else {
        const reqTools = request.tools && request.tools.length > 0
        body = {
          model: request.model,
          max_tokens: request.max_tokens,
          stream: true,
          messages: request.messages,
          ...(reqTools ? { tools: request.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          }))} : {}),
          ...(request.temperature ? { temperature: request.temperature } : {}),
        }
      }

      // 发送请求（带基础重试）
      let response: Response | null = null
      let lastError = ''
      const bodyJson = JSON.stringify(body)
      console.log(`[MAIN] request body (first 3000): ${bodyJson.slice(0, 3000)}`)
      for (let attempt = 0; attempt < 5; attempt++) {
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
        if (response.ok) break
        const text = await response.text().catch(() => '')
        lastError = `API 请求失败 (${response.status}): ${text || response.statusText}`
        if (response.status === 429) {
          const waitMs = Math.min((attempt + 1) * 5000, 60000)
          console.warn(`[MAIN] 429 速率限制，等待 ${waitMs}ms 后重试 (${attempt + 1}/5)...`)
          await new Promise(resolve => setTimeout(resolve, waitMs))
        } else if (response.status >= 500) {
          console.warn(`[MAIN] ${response.status} 服务器错误，重试 (${attempt + 1}/5)...`)
          await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)))
        } else {
          console.error(`[MAIN] API error: ${response.status}, body: ${text?.slice(0, 200)}`)
          throw new Error(lastError)
        }
      }
      if (!response || !response.ok) {
        throw new Error(lastError || 'API 请求失败')
      }
      console.log(`[MAIN] API response: ${response.status}, content-type: ${response.headers.get('content-type')}`)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let messageStarted = false
      let blockIndex = 0

      // 累积 OpenAI tool_calls 的增量，直到流结束才 emit content_block_stop
      const toolCallAccum = new Map<number, { id: string; name: string; args: string }>()

      async function* stream(): AsyncGenerator<Record<string, unknown>> {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const sse = parseSSEChunk(buffer)
            buffer = sse.remainder

            for (const rawEvent of sse.events) {
              const dataLines = rawEvent
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trim())

              for (const data of dataLines) {
                if (!data || data === '[DONE]') {
                  if (data === '[DONE]') {
                    if (!messageStarted) {
                      yield { type: 'message_start', message: { model: request.model } }
                    }
                    // 仅 flush 尚未通过 finish_reason 关闭的 tool_calls
                    if (toolCallAccum.size > 0) {
                      for (const [idx, tc] of toolCallAccum) {
                        yield { type: 'content_block_stop', index: idx }
                      }
                      toolCallAccum.clear()
                    }
                    yield { type: 'message_stop' }
                    return
                  }
                  continue
                }

                try {
                  const parsed = JSON.parse(data)
                  console.log(`[SSE] ${JSON.stringify(parsed).slice(0, 2000)}`)

                  if (isAnthropic) {
                    // Anthropic 原生格式：直接透传
                    if (typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).type === 'content_block_stop') {
                      const cb = (parsed as Record<string, unknown>).content_block
                      if (cb && typeof cb === 'object' && (cb as Record<string, unknown>).type === 'tool_use') {
                        console.log(`[TOOL] tool_use id=${(cb as Record<string, unknown>).id} name=${(cb as Record<string, unknown>).name} input=${JSON.stringify((cb as Record<string, unknown>).input).slice(0, 1000)}`)
                      }
                    }
                    yield parsed
                    messageStarted = true
                  } else {
                    // OpenAI 格式：转换为 Anthropic 事件
                    const chunk = parsed as OpenAIStreamChunk
                    const choice = chunk.choices?.[0]
                    const delta = choice ? (choice.delta as Record<string, unknown> | undefined) : undefined

                    if (choice && (delta || choice.finish_reason)) {
                      if (!messageStarted) {
                        yield { type: 'message_start', message: { model: chunk.model || request.model, content: [], usage: { input_tokens: chunk.usage?.prompt_tokens ?? 0, output_tokens: 0 } } }
                        messageStarted = true
                      }

                      // thinking 增量
                      if (delta && 'thinking' in delta) {
                        const t = delta.thinking as string
                        yield { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } }
                        yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text: t } }
                        yield { type: 'content_block_stop', index: blockIndex }
                        blockIndex++
                      }

                      // 文本增量 — 空字符串仅跳过块创建，不跳过 tool_calls 处理
                      if (delta && delta.content != null) {
                        const text = delta.content as string
                        if (text !== '') {
                          yield { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } }
                          yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text } }
                          yield { type: 'content_block_stop', index: blockIndex }
                          blockIndex++
                        }
                      }

                      // 工具调用 — 累积增量，不立即 emit content_block_stop
                      if (delta && Array.isArray(delta.tool_calls)) {
                        for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                          const idx = (tc.index as number) ?? 0
                          const func = tc.function as Record<string, unknown> | undefined
                          const name = func?.name as string | undefined
                          const args = func?.arguments as string | undefined
                          console.log(`[TOOL-OAI] tool_use idx=${idx} id=${tc.id} name=${name} args=${args?.slice(0, 500)}`)

                          const isFirst = !toolCallAccum.has(idx)
                          if (isFirst) {
                            toolCallAccum.set(idx, { id: tc.id as string, name: (name as string) || '', args: '' })
                            yield { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: tc.id as string, name: (name as string) } }
                          }

                          if (args) {
                            const entry = toolCallAccum.get(idx)!
                            if (!entry.args.endsWith(args)) {
                              const newArgs = args.slice(entry.args.length)
                              entry.args = args
                              yield { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: newArgs } }
                            }
                          }
                        }
                      }

                      // finish_reason — 工具调用完成时 flush 所有 tool_calls
                      if (choice.finish_reason) {
                        const stopReason = mapFinishReason(choice.finish_reason as string)
                        console.log(`[TOOL-OAI] finish_reason=${choice.finish_reason} mapped=${stopReason} toolCallAccum.size=${toolCallAccum.size}`)
                        if (toolCallAccum.size > 0) {
                          for (const [idx, tc] of toolCallAccum) {
                            yield { type: 'content_block_stop', index: idx }
                          }
                          toolCallAccum.clear()
                        }
                        yield { type: 'message_delta', delta: { stop_reason: stopReason }, usage: chunk.usage }
                      }
                    }

                    if (chunk.usage && messageStarted) {
                      yield { type: 'message_delta', delta: { usage: chunk.usage } }
                    }
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          }

          // 非流式响应兜底
          if (!messageStarted && buffer.trim()) {
            const maybeParsed = tryParseNonStreamingResponse(buffer.trim(), request.model)
            if (maybeParsed) {
              for (const ev of maybeParsed.events) {
                yield ev
              }
              return
            }
          }

          if (messageStarted) {
            yield { type: 'message_stop' }
          }
        } finally {
          reader.releaseLock()
        }
      }

      return stream()
    },
  }
}

export type DesktopApiClient = ReturnType<typeof createDesktopApiClient>
