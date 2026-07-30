/**
 * desktop/src/main/apiClient.ts — 桌面端 API 客户端
 * 将内部 APIRequest 格式转换为 Anthropic/OpenAI 兼容的格式并发送请求，处理 SSE 流式响应。
 */

import type { APIRequest } from '../../../src/engine/requestBuilder.js'

// ─── 类型定义 ───

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

// ─── 清理工具参数 schema：移除 OpenAI 兼容端点不接受的字段 ───

function sanitizeToolSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema
  const REMOVE_KEYS = new Set([
    'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems',
    'exclusiveMinimum', 'exclusiveMaximum', 'default',
    '$schema', 'additionalProperties',
  ])
  const removed: string[] = []
  const kept: string[] = []
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (REMOVE_KEYS.has(key)) {
      removed.push(key)
      continue
    }
    kept.push(key)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = sanitizeToolSchema(value as Record<string, unknown>)
    } else {
      cleaned[key] = value
    }
  }
  if (removed.length > 0) {
    console.log(`[SANITIZE] removed=${JSON.stringify(removed)} kept=${JSON.stringify(kept)}`)
  }
  return cleaned
}

// ─── 构建 OpenAI Chat Completions 请求体 ───

function buildOpenAIRequest(request: APIRequest): OpenAIChatRequest {
  console.log('[APICLIENT] request.tools raw:', JSON.stringify(request.tools || []).slice(0, 500))
  const messages: OpenAIChatMessage[] = []

  for (const m of request.messages || []) {
    const msg = m as Record<string, unknown>

    // 清理 content：确保为 string 或简单 array
    let content: OpenAIChatMessage['content']
    if (msg.content === null || msg.content === undefined) {
      content = null
    } else if (Array.isArray(msg.content)) {
      // 过滤 content blocks，保留 text 和 tool_result 类型
      const blocks = msg.content as Array<Record<string, unknown>>
      content = blocks
        .filter(b => b.type === 'text' || b.type === 'tool_result')
        .map(b => {
          const cleaned: Record<string, unknown> = { type: b.type }
          if (typeof b.text === 'string') cleaned.text = b.text
          if (typeof b.content === 'string') cleaned.content = b.content
          if (typeof b.tool_use_id === 'string') cleaned.tool_use_id = b.tool_use_id
          return cleaned
        })
    } else if (typeof msg.content === 'string') {
      content = msg.content
    } else {
      content = String(msg.content)
    }

    const chatMsg: OpenAIChatMessage = {
      role: String(msg.role || 'user') as OpenAIChatMessage['role'],
      content,
    }
    if (msg.tool_calls) {
      chatMsg.tool_calls = msg.tool_calls as OpenAIChatMessage['tool_calls']
    }
    if (msg.tool_call_id) {
      chatMsg.tool_call_id = msg.tool_call_id as OpenAIChatMessage['tool_call_id']
    }
    messages.push(chatMsg)
  }

  // 清理工具定义
  // 注意 request.tools 结构: [{type:'function', function:{name, description, parameters}}]
  const tools = (request.tools || []).map(t => {
    const wrapper = t as { type?: unknown; function?: Record<string, unknown> }
    const fn = wrapper.function || {}
    const rawSchema = fn.parameters as Record<string, unknown> | null | undefined
    const cleanedSchema = rawSchema ? sanitizeToolSchema(rawSchema) : null
    const toolDef: OpenAIChatRequest['tools'][0] = {
      type: 'function',
      function: {
        name: String(fn.name || ''),
        description: typeof fn.description === 'string' ? fn.description : undefined,
        ...(cleanedSchema !== null ? { parameters: cleanedSchema } : {}),
      },
    }
    return toolDef
  })

  console.log(`[TOOLS-FINAL] toolCount=${tools.length}, names=${tools.map(t => t.function.name).join(',')}`)
  const toolsSnapshot = JSON.stringify(tools)
  console.log(`[TOOLS-BODY] (first 5000): ${toolsSnapshot.slice(0, 5000)}`)

  return {
    model: request.model,
    messages,
    stream: true,
    max_tokens: request.max_tokens,
    temperature: request.temperature ?? 0,
    ...(tools.length > 0 ? { tools } : {}),
  }
}

// ─── 非流式响应兜底 ───

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
    const content = parsed.choices?.[0]?.message?.content ?? parsed.content?.[0]?.text ?? ''
    if (!content) return null

    const promptTokens = parsed.usage?.prompt_tokens ?? 0
    const completionTokens = parsed.usage?.completion_tokens ?? 0

    return {
      events: [
        { type: 'message_start', message: { model, content: [], usage: { input_tokens: 0, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: content } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: completionTokens } },
        { type: 'message_stop' },
      ],
      resultMessage: {
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: content }],
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
    async sendMessage(request: APIRequest): Promise<AsyncIterable<Record<string, unknown>>> {
      let body: Record<string, unknown>

      if (isAnthropic) {
        body = {
          model: request.model,
          max_tokens: request.max_tokens,
          stream: true,
          system: request.system,
          messages: request.messages.map(m => {
            const msg = m as Record<string, unknown>
            if (msg.role === 'tool') {
              const toolUseId = (msg as Record<string, unknown>).toolUseId
              return {
                role: 'user' as const,
                content: [
                  {
                    type: 'tool_result' as const,
                    tool_use_id: typeof toolUseId === 'string' ? toolUseId : undefined,
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                  },
                ],
              }
            }
            const content = typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                : JSON.stringify(msg.content)
            return { role: msg.role, content }
          }),
        }
        if (request.tools && request.tools.length > 0) {
          body.tools = request.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          }))
        }
      } else {
        body = buildOpenAIRequest(request)
      }

      // 发送请求（带基础重试 + 400 时无工具兜底）
      let response: Response | null = null
      let lastError = ''
      const bodyJson = JSON.stringify(body)
      console.log(`[MAIN] request body (first 3000): ${bodyJson.slice(0, 3000)}`)
      let retryBody = bodyJson
      let strippedTools = false
      for (let attempt = 0; attempt < 5; attempt++) {
        response = await fetch(url, { method: 'POST', headers, body: retryBody })
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
        } else if (response.status === 400 && !strippedTools) {
          const cleanBody = { ...(body as Record<string, unknown>) }
          delete cleanBody.tools
          retryBody = JSON.stringify(cleanBody)
          strippedTools = true
          console.warn(`[MAIN] 400 请求格式错误，去掉 tools 重试 (${attempt + 1}/5)...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          console.error(`[MAIN] API error: ${response.status}, body: ${text?.slice(0, 200)}`)
          throw new Error(lastError)
        }
      }
      if (!response || !response.ok) {
        throw new Error(lastError || 'API 请求失败')
      }
      console.log(`[MAIN] API response: ${response.status}, content-type: ${response.headers.get('content-type')}`)

      async function* stream(): AsyncGenerator<Record<string, unknown>> {
        // 非流式兜底：Electron fetch 可能不暴露 response.body
        if (!response!.body) {
          const fullText = await response!.text()
          const maybeParsed = tryParseNonStreamingResponse(fullText, request.model)
          if (maybeParsed) {
            for (const ev of maybeParsed.events) {
              yield ev
            }
            return
          }
          throw new Error(`API 返回非流式响应但无法解析: ${fullText.slice(0, 500)}`)
        }

        let streamReader: ReadableStreamDefaultReader | null
        try {
          if (response!.body) {
            streamReader = response!.body.getReader()
          }
          const decoder = new TextDecoder()
          let textBuffer = ''
          let buffer = ''
          let messageStarted = false
          let blockIndex = 0
          const toolCallAccum = new Map<number, { id: string; name: string; args: string }>()
          if (!streamReader) {
            const fullText = await response!.text()
            const maybeParsed = tryParseNonStreamingResponse(fullText, request.model)
            if (maybeParsed) {
              for (const ev of maybeParsed.events) {
                yield ev
              }
              return
            }
            throw new Error(`API 返回非流式响应但无法解析: ${fullText.slice(0, 500)}`)
          }

          while (true) {
            const { done, value } = await streamReader.read()
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
                    if (toolCallAccum.size > 0) {
                      for (const [idx] of toolCallAccum) {
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
                    yield parsed
                    messageStarted = true
                  } else {
                    const chunk = parsed as OpenAIStreamChunk
                    const choice = chunk.choices?.[0]
                    const delta = choice ? (choice.delta as Record<string, unknown> | undefined) : undefined

                    if (choice && (delta || choice.finish_reason)) {
                      if (!messageStarted) {
                        yield {
                          type: 'message_start',
                          message: {
                            model: chunk.model || request.model,
                            content: [],
                            usage: { input_tokens: chunk.usage?.prompt_tokens ?? 0, output_tokens: 0 },
                          },
                        }
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

                      // 文本增量 —— 累积到同一个 block，防止 API 发送完整累积文本导致重复
                      if (delta && delta.content != null) {
                        const text = delta.content as string
                        if (text !== '') {
                          if (!textBuffer) {
                            textBuffer = text
                            yield { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } }
                            yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text } }
                          } else {
                            // 防止 API 发送完整累积文本导致重复
                            const prevBuffer = textBuffer
                            textBuffer += text
                            if (text.startsWith(prevBuffer)) {
                              // API 发送了包含已累积内容的完整文本，只 yield 新增部分
                              const deltaText = text.slice(prevBuffer.length)
                              if (deltaText) yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text: deltaText } }
                            } else {
                              // text 已是增量，直接 yield
                              yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text } }
                            }
                          }
                        }
                      }

                      // 工具调用
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

                      // finish_reason
                      if (choice.finish_reason) {
                        const stopReason = mapFinishReason(choice.finish_reason as string)
                        console.log(`[TOOL-OAI] finish_reason=${choice.finish_reason} mapped=${stopReason} toolCallAccum.size=${toolCallAccum.size}`)
                        if (toolCallAccum.size > 0) {
                          for (const [idx] of toolCallAccum) {
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
                } catch {
                  /* ignore parse errors */
                }
              }
            }
          }
        } finally {
          if (streamReader) {
            streamReader.releaseLock()
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
      }
      return stream()
    },
  }
}

export type DesktopApiClient = ReturnType<typeof createDesktopApiClient>

