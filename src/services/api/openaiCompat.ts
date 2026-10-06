import { APIError } from '@anthropic-ai/sdk'
// 引入调试日志工具（实际写入文件或控制台，取决于项目配置）
import { logForDebugging } from "../../utils/debug.js"
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageDeltaEvent,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage } from '../../types/message.js'

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
  const toolNames = result.tools?.map(t => t.function.name) ?? []
  logForDebugging(
    `[openaiCompat] 转换完成: model=${targetModel}, 消息数=${messages.length}, 工具数=${toolNames.length}, 工具列表=[${toolNames.join(', ')}], tool_choice=${JSON.stringify(result.tool_choice ?? 'auto')}`,
    { level: 'debug' },
  )
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
  const requestBody = { ...request, stream: true }
  const requestMessages: OpenAIChatMessage[] = requestBody.messages ?? []
  const requestTools: Array<{ function?: { name?: string } }> = requestBody.tools ?? []
  logForDebugging(
    `[openaiCompat] 请求体摘要: model=${requestBody.model}, 消息数=${requestMessages.length}, 工具数=${requestTools.length}, 消息(role:长度)=[${requestMessages
      .map(m => `${m.role}:${typeof m.content === 'string' ? m.content.length : 0}`)
      .join(', ')}]`,
    { level: 'debug' },
  )
  // 附加的工具清单：排查"拼接了什么工具"时最关键，工具名体积可控，默认落盘
  if (requestTools.length > 0) {
    logForDebugging(
      `[openaiCompat] 本次请求附加工具: [${requestTools.map(t => t.function?.name ?? '?').join(', ')}]`,
      { level: 'debug' },
    )
  }
  // system prompt 是排查"注入了什么"的重点，长度默认落盘
  const systemMessage = requestMessages.find(m => m.role === 'system')
  if (systemMessage && typeof systemMessage.content === 'string') {
    logForDebugging(
      `[openaiCompat] system prompt 长度=${systemMessage.content.length}`,
      { level: 'debug' },
    )
  }
  // 排查"发了什么"只需要知道最新用户输入的长度与构成。
  // 直接落盘原文会让每个被合并进最后一轮的合成注入块（<system-reminder>、
  // 技能列表、/clear 的 local-command 回显）整段刷进 debug 日志，
  // 淹没真正的人话输入。默认只记长度与标记，逐字核对请开 DOGE_DEBUG_DUMP_REQUEST=1。
  const lastUserMessage = requestMessages.filter(m => m.role === 'user').at(-1)
  if (lastUserMessage && typeof lastUserMessage.content === 'string') {
    const text = lastUserMessage.content
    const markers = [
      '<system-reminder>',
      'local-command-caveat',
      '<command-name>',
      'local-command-stdout',
    ].filter(m => text.includes(m))
    const suffix = markers.length > 0 ? `, 含注入块=[${markers.join(', ')}]` : ''
    logForDebugging(
      `[openaiCompat] 最后一条 user 消息: 长度=${text.length}${suffix}`,
      { level: 'debug' },
    )
  }
  // 完整 JSON 请求体：体积可达数十 KB，默认关闭。
  // 需要逐字核对实际发出的数据包时，用 DOGE_DEBUG_DUMP_REQUEST=1 启动。
  if (process.env.DOGE_DEBUG_DUMP_REQUEST === '1') {
    logForDebugging(
      `[openaiCompat] 完整请求体 JSON: ${JSON.stringify(requestBody)}`,
      { level: 'debug' },
    )
  }
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
      body: JSON.stringify(requestBody),
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
        'OpenAI 兼容请求失败，状态码 ' +
          response.status +
          (responseText ? ': ' + responseText : ''),
        respHeaders,
      )
    }

    throw new Error(
      'OpenAI 兼容请求失败，状态码 ' +
        response.status +
        (responseText ? ': ' + responseText : ''),
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
 * 从 SSE chunk 预览文本中剥离 usage 对象，仅供日志打印。
 *
 * 背景：stepfun 等中转站的每个 chunk 都带完整 usage（含嵌套的
 * prompt_tokens_details/completion_tokens_details），实测使日志体积膨胀到
 * 实际文本的 20~40 倍，淹没真正需要对比的正文。usage 数值在流末的
 * 「流结束, 最终 token 用量」日志里已有汇总，逐 chunk 打印无诊断价值。
 *
 * 用括号配对 + 字符串状态机扫描，而非正则：usage 值含嵌套对象
 * （`"usage":{...,"prompt_tokens_details":{"cached_tokens":0}}`），
 * `\{[^{}]*\}` 这类简单正则会因嵌套花括号而失配。
 */
export function stripUsageFromPreview(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('"usage":', i)) {
      let j = i + '"usage":'.length
      while (j < text.length && /\s/.test(text[j]!)) j++
      if (text[j] === '{') {
        let depth = 0
        let inStr = false
        let escaped = false
        for (; j < text.length; j++) {
          const c = text[j]!
          if (inStr) {
            if (escaped) escaped = false
            else if (c === '\\') escaped = true
            else if (c === '"') inStr = false
            continue
          }
          if (c === '"') inStr = true
          else if (c === '{') depth++
          else if (c === '}') {
            depth--
            if (depth === 0) { j++; break }
          }
        }
        out += '"usage":<omitted>'
        i = j
        continue
      }
    }
    out += text[i]
    i++
  }
  return out
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
        {
          type: 'message_start',
          message: { model, content: [], usage: { input_tokens: 0, output_tokens: 0 } },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fullContent } },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: completionTokens },
        },
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
  // 【补丁③】共享 pending 状态，供 wrapper 处理工具调用 XML
  const pendingState: { xml: string | null; enteredAt?: number } = { xml: null }
  const inner = createAnthropicStreamFromOpenAIInner(input, pendingState)
  const result = yield* wrapPendingToolXml(inner, pendingState, input.model)
  return result as BetaMessage
}
async function* createAnthropicStreamFromOpenAIInner(
  input: {
    reader: ReadableStreamDefaultReader<Uint8Array>
    model: string
  },
  pendingState: { xml: string | null; enteredAt?: number },
): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
	// 文本缓冲相关
	let textBuffer = ''                       // 待发送的文本
	let textBufferIndex: number | null = null // 文本缓冲对应的 Anthropic 内容块索
	
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false                // 是否已收到 message_start
  let nextContentIndex = 0          // 下一个 Anthropic 内容块索引
  let promptTokens = 0
  let completionTokens = 0
  let responseBytes = 0
  // 高频流式日志的节流累计器（见下方 chunk/SSE 日志点）
  let chunkCount = 0
  let sseEventCount = 0
  let lastChunkLogAt = 0
  let lastSseLogAt = 0

  // 原生事件路径的索引映射：上游 index -> Anthropic index，以及块类型
  const nativeIdxMap = new Map<number, number>()
  const nativeBlockType = new Map<number, 'text' | 'tool_use'>()
  const nativeToolUseInfo = new Map<number, { id: string; name: string }>()
  let nativeMessageDeltaSent = false

	let lastFlushTime = Date.now()
  let inTable = false          // 是否处于 Markdown 表格上下文中
  let inChoiceList = false      // 【补丁②】是否处于"逐项勾选清单"上下文（1./- /□ 开头的篇章），清单内不做 - 硬分

  // choices 路径的状态
  let activeBlockType: 'text' | 'thinking' | null = null
  let activeBlockIndex: number | null = null
  const toolIdxMap = new Map<number, number>()               // 上游 tool_calls index -> Anthropic index
  const toolState = new Map<number, { id: string; name: string; arguments: string }>()
  // 延迟转正缓冲：上游流式下，合法 tool_call 的 name 只出现在首个分片，
  // 后续分片 name 为空。若某 index 直到流结束都没出现过非空 name，则它不是
  // 工具调用 —— 部分上游（实测 deepseek-v4.1-flash 经本地网关）会把正文文本
  // 塞进匿名 tool_calls.arguments、且 delta.content 恒空，导致正文区空白。
  // 这里先只累积、不发出 tool_use 块；确认有 name 才转正，否则收尾时降级为文本。
  const deferredToolCalls = new Map<number, { id: string; arguments: string }>()

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

  /**
   * 【补丁①】markdown 分段截断点定位（v2：修正 `## ` 标记丢弃与列表缩进）
   * "加回车"等于"截断发送"：把断点之前的内容立即发送，之后的继续累积。
   *
   * 返回 { pos, drop }：
   *   pos  —— 断点位置：pos 之前的内容作为前缀立即 yield
   *   drop —— 从 pos 处开始要丢弃的字符数（纯标记如 `## ` 不入内容，减少字符）
   *
   * 规则（都满足时取最早出现的 pos；pos=0 且 drop=0 时视为无有效断点返回 null）：
   *  1) 冒号后一位（发送冒号及其之前），排除连续冒号
   *  2) `# 标题`（2 个及以上井号（`##`、`###`、`####`、`#####`、`######`…）后跟空格，
   *     前后带空格均同样处理）→ 断点在这些井号前，并把「前导可选空格+井号串+后随空白」整体丢弃，
   *     标题正文单独成段，标记本身不发送（约减少 3~7 字符）
   *  3) `- 英文` 列表项（允许前导缩进空格/换行）→ 断点在减号 `-` 前（保留内容，不丢弃）
   *  4) `---` 分隔线 → 断点在第一个 `-` 前（不丢弃）
   */
  function findContentSplitIndex(text) {
    if (!text) return null
    let best = null

    // 规则1：冒号后一位（排除连续冒号），head 末尾含冒号
    for (let i = 0; i < text.length - 1; i++) {
      const c = text[i]
      if ((c === ':' || c === '\uFF1A') && text[i + 1] !== ':' && text[i + 1] !== '\uFF1A') {
        best = { pos: i + 1, drop: 0 }
        break
      }
    }

    // 规则2：双井号标题 → 把 `## 标题` 里的 `##` 及附近空格吞掉，标题正文另起一段
    //   匹配：0~1 个可选紧邻空格 + `##` + 至少一个空白/换行（确保是 `## 空格` 形式）
    const m2 = text.match(/ ?#{2,}[ \t\n]+/)
    if (m2 && m2.index != null) {
      // pos 指向 `##` 起点（断于标题标记前），drop = 前导空格+`##`+后随空白 的总长
      const pos = m2.index
      const drop = m2[0].length
      if (best === null || pos <= best.pos) best = { pos, drop }
    }

    // 规则3：行首（可带缩进换行）`- ` + 英文字母 → 断点在 `-` 前（不丢失内容）
    const m3 = text.match(/(^|\n)[ \t]*-[ \t]+[A-Za-z]/)
    if (m3 && m3.index != null) {
      const prefixLen = (m3[1] ? m3[1].length : 0) + m3[0].indexOf('-')
      const pos = m3.index + prefixLen
      if (best === null || pos < best.pos) best = { pos, drop: 0 }
    }

    // 规则4：三连字符分隔线 `---` → 断点在第一个 `-` 前（不丢失内容）
    //   要求 `---` 后跟随空白/换行（避免把它当普通 `- ` 列表项）
    const m4 = text.match(/(^|\n)[ \t]*-{3,}(?=[ \t]*\n)/)
    if (m4 && m4.index != null) {
      const itemLen = (m4[1] ? m4[1].length : 0) + m4[0].indexOf('-')
      const pos = m4.index + itemLen
      if (best === null || pos < best.pos) best = { pos, drop: 0 }
    }

    // pos 为 0 且 drop 也为 0（断点在开头且无标记可吞）→ 无实际分隔，交原句分离逻辑
    if (!best) return null
    const drop = typeof best.drop === 'number' ? best.drop : 0
    if (best.pos === 0 && drop === 0) return null
    return { pos: best.pos, drop }
  }

  async function* flushBufferedText() {
    // 更新表格状态：检测缓冲中是否包含表格特征（以 | 开头的行且未遇到空行）
    if (!inTable && /(^|\n)\|.*\|/.test(textBuffer) && !textBuffer.includes('\n\n')) {
      inTable = true
    } else if (inTable && textBuffer.includes('\n\n')) {
      inTable = false
    }
    // 【补丁②】逐项勾选清单状态：出现"1./- /□/☐/- [ ]/A. "开头的连续篇章视为清单；
    //   清单内不按 `- ` 或句号硬分，避免把一个选项劈成两半，直至遇到空行才整体发送。
    if (!inChoiceList && !inTable) {
      const choiceHead = /(?:^|\n)[ \t]*(?:\d+[.、]|[-*•] [^ ]|[-*•] \[[ xX]\]|[□][^ ]|[A-Za-z][.、])/
      const first = textBuffer.match(choiceHead)
      if (first) {
        const after = textBuffer.slice(first.index + first[0].length)
        const second = after.match(/(?:^|\n)[ \t]*(?:\d+[.、]|[-*•] [^ ]|[-*•] \[[ xX]\]|[□][^ ]|[A-Za-z][.、])/)
        if (second) inChoiceList = true
      }
    }
    if (inChoiceList) {
      // 出现连续两个换行 / 或遇到 markdown 标题行时，结束清单
      if (textBuffer.includes('\n\n') || /(^|\n)#{1,6}\s/.test(textBuffer)) {
        inChoiceList = false
      }
    }
	  if (textBufferIndex === null) {
		  if (textBuffer.length > 0) {
			  const idx = nextContentIndex++
			  yield {
				type: 'content_block_start',
				index: idx,
				content_block: { type: 'text', text: '' },
			  } as BetaRawMessageStreamEvent
			  yield {
				type: 'content_block_delta',
				index: idx,
				delta: { type: 'text_delta', text: textBuffer },
			  } as BetaRawMessageStreamEvent
			  yield {
				type: 'content_block_stop',
				index: idx,
			  } as BetaRawMessageStreamEvent
			  textBuffer = ''
			  lastFlushTime = Date.now()
		  }
		  return;
	  }
    const sentenceEndRegex = /[。！？.!?：:]/;
    while (textBuffer.length > 0) {
      if (inTable || inChoiceList) {
        // 表格 / 清单保护模式：不按句号切分，也不按 `- ` 硬分，
        // 仅当遇到双换行或长度/时间超限时发送全部（清单和表格一样，需整体保真）
        const hasDoubleNewline = textBuffer.endsWith('\n\n')
        const exceedsMaxLength = textBuffer.length >= 200
        const exceedsTime = Date.now() - lastFlushTime >= 200
        if (hasDoubleNewline || exceedsMaxLength || exceedsTime) {
          if (textBuffer.trim().length > 0) {
            yield {
              type: 'content_block_delta',
              index: textBufferIndex!,
              delta: { type: 'text_delta', text: textBuffer },
            } as BetaRawMessageStreamEvent
            lastFlushTime = Date.now()
          }
          textBuffer = ''
          inTable = false    // 发送后假设表格/清单结束
          inChoiceList = false
        }
        break
      } else {
        // 【补丁①】markdown 截断点优先提前发送
        const split = findContentSplitIndex(textBuffer)
        if (split !== null) {
          const head = textBuffer.slice(0, split.pos)
          if (head.trim().length > 0) {
            yield {
              type: 'content_block_delta',
              index: textBufferIndex!,
              delta: { type: 'text_delta', text: head },
            } as BetaRawMessageStreamEvent
            lastFlushTime = Date.now()
          }
          // 断点之后剩余 = pos 之后去掉 drop 个标记字符（如 `## `），继续累积供下次 flush
          textBuffer = textBuffer.slice(split.pos + split.drop)
          break
        }
        const match = textBuffer.match(sentenceEndRegex)
        if (match && match.index !== undefined) {
          const endPos = match.index + match[0].length
          const sentence = textBuffer.slice(0, endPos)
          if (sentence.trim().length > 0) {
            yield {
              type: 'content_block_delta',
              index: textBufferIndex!,
              delta: { type: 'text_delta', text: sentence },
            } as BetaRawMessageStreamEvent
            lastFlushTime = Date.now()
          }
          textBuffer = textBuffer.slice(endPos)
        } else {
          // 没有句子结束符，遇到单个换行即刷新，让界面逐行更新
          const hasNewline = textBuffer.includes('\n')
          const exceedsMaxLength = textBuffer.length >= 200
          const exceedsTime = Date.now() - lastFlushTime >= 200
          if (hasNewline || exceedsMaxLength || exceedsTime) {
            if (textBuffer.trim().length > 0) {
              yield {
                type: 'content_block_delta',
                index: textBufferIndex!,
                delta: { type: 'text_delta', text: textBuffer },
              } as BetaRawMessageStreamEvent
              lastFlushTime = Date.now()
            }
            textBuffer = ''
          }
          break
        }
      }
    }
  }
	
  while (true) {
    const { done, value } = await input.reader.read()
    if (done) {
      logForDebugging(`[openaiCompat] 流读取完成, 总响应字节数=${responseBytes}`, { level: 'debug' })
      break
    }
    // 只解码一次并复用：TextDecoder 在 { stream: true } 下是有状态的，
    // 对同一 chunk 解码两次会让第二次拿到空串/残片，破坏 SSE 解析。
    const chunkText = value?.byteLength ? decoder.decode(value, { stream: true }) : ''
    if (value?.byteLength) {
      responseBytes += value.byteLength
      // 日志瘦身（v2）：逐 chunk 打印会淹没日志（实测单次响应数百条）。
      // 改为累计统计 + 节流：首个 chunk 打印带正文预演的详情，之后每 100 个
      // chunk 或每 5s 打印一行累计摘要，既不丢总览又避免刷屏。
      chunkCount++
      const nowChunk = Date.now()
      if (chunkCount === 1 || chunkCount % 100 === 0 || nowChunk - lastChunkLogAt >= 5000) {
        // 每个 SSE chunk 都带完整 usage 对象（stepfun 等中转站的 include_usage），
        // 实测使日志体积膨胀到实际文本的 20~40 倍，淹没真正的正文差异。故打印前剥离 usage。
        const preview = chunkCount === 1 ? stripUsageFromPreview(chunkText).slice(0, 800) : ''
        logForDebugging(`[openaiCompat] chunk 累计=${chunkCount}, 累计字节=${responseBytes}, 本次字节=${value.byteLength}${preview ? `, 首块预览: ${preview}${chunkText.length > 800 ? '...(已截断)' : ''}` : ''}`, { level: 'debug' })
        lastChunkLogAt = nowChunk
      }
    }
    buffer += chunkText
    const sse = parseSSEChunk(buffer)
    if (sse.events.length) {
      sseEventCount += sse.events.length
      const nowEv = Date.now()
      if (sseEventCount <= sse.events.length || nowEv - lastSseLogAt >= 5000) {
        logForDebugging(`[openaiCompat] 累计解析 ${sseEventCount} 个完整 SSE 事件（本次 +${sse.events.length}）`, { level: 'debug' })
        lastSseLogAt = nowEv
      }
    }
    buffer = sse.remainder

    for (const rawEvent of sse.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          if (data === '[DONE]') {
              if (textBuffer && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: textBuffer },
                } as BetaRawMessageStreamEvent
                lastFlushTime = Date.now()
              }
              textBuffer = ''
              textBufferIndex = null
            // 收尾降级（[DONE] 路径）：未转正的匿名 tool_calls 实为正文，见 finish_reason 分支同款处理
            if (deferredToolCalls.size > 0) {
              for (const [, held] of deferredToolCalls) {
                if (held.arguments) {
                  await closeActiveBlock()
                  if (textBuffer && textBufferIndex !== null) {
                    yield { type: 'content_block_delta', index: textBufferIndex, delta: { type: 'text_delta', text: textBuffer } } as BetaRawMessageStreamEvent
                    textBuffer = ''
                    textBufferIndex = null
                  }
                  const idx = nextContentIndex++
                  yield { type: 'content_block_start', index: idx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
                  yield { type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: held.arguments } } as BetaRawMessageStreamEvent
                  yield { type: 'content_block_stop', index: idx } as BetaRawMessageStreamEvent
                  logForDebugging(`[openaiCompat] ([DONE]) 检测到匿名 tool_calls，已降级为文本输出，长度=${held.arguments.length}`, { level: 'debug' })
                }
              }
              deferredToolCalls.clear()
            }
            await closeActiveBlock()
            for (const ai of toolIdxMap.values()) {
              yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
            }
            if (!nativeMessageDeltaSent && started) {
              if (textBuffer && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: textBuffer },
                } as BetaRawMessageStreamEvent
                textBuffer = ''
                textBufferIndex = null
                lastFlushTime = Date.now()
              }
              yield {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: completionTokens },
              } as BetaRawMessageStreamEvent
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
              yield {
                type: 'message_start',
                message:
                  msg ??
                  ({
                    id: 'anthropic-native',
                    type: 'message',
                    role: 'assistant',
                    model: input.model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  } as BetaMessage),
              } as BetaRawMessageStreamEvent
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
                yield {
                  type: 'content_block_start',
                  index: anthropicIdx,
                  content_block: block as BetaRawMessageStreamEvent['content_block'],
                } as BetaRawMessageStreamEvent
              } else {
                // thinking / text 一律视为 text 块
                nativeBlockType.set(anthropicIdx, 'text')
                yield {
                  type: 'content_block_start',
                  index: anthropicIdx,
                  content_block: { type: 'text', text: '' },
                } as BetaRawMessageStreamEvent
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
                  yield {
                  type: 'content_block_start',
                  index: anthropicIdx,
                  content_block: { type: 'tool_use', id, name },
                } as BetaRawMessageStreamEvent
                } else {
                  yield {
                    type: 'content_block_start',
                    index: anthropicIdx,
                    content_block: { type: 'text', text: '' },
                  } as BetaRawMessageStreamEvent
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

              yield {
                type: 'content_block_delta',
                index: anthropicIdx,
                delta: outputDelta as BetaRawMessageStreamEvent['delta'],
              } as BetaRawMessageStreamEvent
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
							if (textBuffer && textBufferIndex !== null) {
								yield {
									type: 'content_block_delta',
									index: textBufferIndex,
									delta: { type: 'text_delta', text: textBuffer },
								} as BetaRawMessageStreamEvent
								textBuffer = ''
								textBufferIndex = null
							}
              yield {
                type: 'message_delta',
                delta: event.delta as unknown as BetaRawMessageDeltaEvent['delta'],
                usage: { output_tokens: completionTokens },
              } as BetaRawMessageStreamEvent
              break
            }

            case 'message_stop': {
              yield* closeAllNativeBlocks()
              if (!nativeMessageDeltaSent) {
                yield {
                  type: 'message_delta',
                  delta: { stop_reason: 'end_turn', stop_sequence: null },
                  usage: { output_tokens: completionTokens },
                } as BetaRawMessageStreamEvent
              }
              _lastResponseBytes = responseBytes
              yield { type: 'message_stop' } as BetaRawMessageStreamEvent
              return {
                id: 'anthropic-native',
                type: 'message',
                role: 'assistant',
                model: input.model,
                content: [],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                  input_tokens: promptTokens,
                  output_tokens: completionTokens,
                },
              } as BetaMessage
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
          yield {
            type: 'message_start',
            message: {
              id: chunk.id ?? 'openai-compat',
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: promptTokens, output_tokens: 0 },
            } as BetaMessage,
          } as BetaRawMessageStreamEvent
        }

        // 增量（DeepSeek、StepFun 等模型的推理输出）
        // 单独走 thinking 通道，产出 thinking_delta，不混入正文 text_delta。
        {
          const raw = delta as Record<string, unknown>
          const r = raw?.reasoning_content
          const t = raw?.thinking
          const thinkingText = (typeof r === 'string' ? r : '') + (typeof t === 'string' ? t : '')
          if (thinkingText.length > 0) {
            if (activeBlockType !== 'thinking') {
              if (textBuffer && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: textBuffer },
                } as BetaRawMessageStreamEvent
                textBuffer = ''
                textBufferIndex = null
                lastFlushTime = Date.now()
              }
              yield* closeActiveBlock()
              activeBlockIndex = nextContentIndex++
              yield {
                type: 'content_block_start',
                index: activeBlockIndex,
                content_block: { type: 'thinking', thinking: '' },
              } as BetaRawMessageStreamEvent
              activeBlockType = 'thinking'
              if (textBuffer && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: textBuffer },
                } as BetaRawMessageStreamEvent
                lastFlushTime = Date.now()
              }
              textBuffer = ''
              textBufferIndex = null
            }
            yield {
              type: 'content_block_delta',
              index: activeBlockIndex!,
              delta: { type: 'thinking_delta', thinking: thinkingText },
            } as BetaRawMessageStreamEvent
            lastFlushTime = Date.now()
          }
        }
        // 文本增量
        if (delta?.content) {
          const text = delta.content as string
// \u3010\u8865\u4E01\u2462\u3011pending \u6001\uFF1A\u65B0\u6587\u672C\u76F4\u63A5\u8FFD\u52A0\u5230 pending\uFF0C\u4E0D\u8D70\u5E38\u89C4\u901A\u9053
          if (pendingState.xml !== null) {
            pendingState.xml += text
            const tooLong = pendingState.xml.length > 2 * 1024
            const tooOld =
              pendingState.enteredAt !== undefined &&
              Date.now() - pendingState.enteredAt > 3000
            if (tooLong || tooOld) {
              // \u8BEF\u4F24\u4FDD\u62A4\uFF1A\u8D85\u957F/\u8D85\u65F6\u89C6\u4E3A\u666E\u901A\u6587\u672C\uFF0C\u9000\u51FA pending
              textBuffer += pendingState.xml
              pendingState.xml = null
              pendingState.enteredAt = undefined
            } else {
              continue
            }
          }
          // 如果当前活动块不是文本块，需要切换到新的文本块
          if (activeBlockType !== 'text') {
            // 如果有残留缓冲（属于上一个文本块），先 flush 它
            if (textBuffer && textBufferIndex !== null) {
              yield {
                type: 'content_block_delta',
                index: textBufferIndex,
                delta: { type: 'text_delta', text: textBuffer },
              } as BetaRawMessageStreamEvent
              textBuffer = ''
              textBufferIndex = null
              lastFlushTime = Date.now()
            }
            // 关闭旧块（可能是工具块等）
            yield* closeActiveBlock()
            // 开启新文本块
            activeBlockIndex = nextContentIndex++
            yield {
              type: 'content_block_start',
              index: activeBlockIndex,
              content_block: { type: 'text', text: '' },
            } as BetaRawMessageStreamEvent
            activeBlockType = 'text'
            textBufferIndex = activeBlockIndex
            textBuffer = ''
          } else {
            // 如果缓冲索引与当前活动块不一致（异常情况），先 flush 并重置
            if (textBufferIndex !== activeBlockIndex) {
              if (textBuffer && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: textBuffer },
                } as BetaRawMessageStreamEvent
                lastFlushTime = Date.now()
              }
              textBufferIndex = activeBlockIndex
              textBuffer = ''
            }
          }

// \u7D2F\u79EF\u65B0\u6587\u672C
          textBuffer += text
          // \u3010\u8865\u4E01\u2462\u3011\u68C0\u6D4B\u5DE5\u5177\u8C03\u7528 XML \u7279\u5F81\uFF0C\u8FDB\u5165 pending \u7F13\u51B2
          let skipFlush = false
          if (pendingState.xml === null) {
            const m = textBuffer.match(/(?:^|\n)[ \t]*(<function\s*=\s*[A-Za-z_][\w]*\s*>)/)
            if (m && m.index !== undefined) {
              const xmlStart = m.index + m[0].indexOf('<function')
              const head = textBuffer.slice(0, xmlStart)
              if (head.trim() && textBufferIndex !== null) {
                yield {
                  type: 'content_block_delta',
                  index: textBufferIndex,
                  delta: { type: 'text_delta', text: head },
                } as BetaRawMessageStreamEvent
              }
              pendingState.xml = textBuffer.slice(xmlStart)
              pendingState.enteredAt = Date.now()
              textBuffer = ''
              skipFlush = true
            }
          }
          // \u8C03\u7528\u7EDF\u4E00\u7684\u53E5\u5B50\u5207\u5206\u53D1\u9001\u51FD\u6570\uFF08pending \u6001\u4E0B\u8DF3\u8FC7\uFF0C\u4F46\u4E0D\u4E2D\u65AD tool_calls/finish_reason \u7684\u5904\u7406\uFF09
          if (!skipFlush) yield* flushBufferedText()
        } 
          
        // 工具调用增量
        const rawToolCalls = (delta as Record<string, unknown>).tool_calls
        if (delta && Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
          // 延迟转正：区分「合法 tool_call」与「上游把正文塞进匿名 tool_calls」。
          // 合法 tool_call 的非空 name 只在首个分片出现，后续分片 name 恒为空；
          // 而畸形响应里该 index 直到流结束都不会出现任何 name。故此处不立即发块，
          // 先累积匿名 arguments，见到 name 才转正为 tool_use，否则收尾时降级为文本。
          for (const tc of rawToolCalls as any[]) {
            {
              const oi = tc.index ?? 0
              const hasName = typeof tc.function?.name === 'string' && tc.function.name.length > 0
              const argsFragment: string = typeof tc.function?.arguments === 'string' ? tc.function.arguments : ''
              // 完全空的占位条目：跳过
              if (!tc.id && !hasName && !argsFragment) continue
              // 已转正的合法 tool_call：走下方既有续传逻辑
              if (toolState.has(oi)) {
                if (!tc.id && !hasName && !argsFragment) continue
              } else if (!hasName) {
                // 尚未转正：先累积匿名分片，不发块，交由收尾或 name 到来决定归属
                if (argsFragment) {
                  const buf = deferredToolCalls.get(oi) ?? { id: tc.id ?? ('toolu_' + oi), arguments: '' }
                  buf.arguments += argsFragment
                  if (tc.id) buf.id = tc.id
                  deferredToolCalls.set(oi, buf)
                }
                continue
              }
              let ai = toolIdxMap.get(oi)
              if (ai === undefined) {
                ai = nextContentIndex++
                toolIdxMap.set(oi, ai)
                const state = { id: tc.id ?? `toolu_${oi}`, name: tc.function?.name ?? '', arguments: '' }
                toolState.set(oi, state)
                yield {
                  type: 'content_block_start',
                  index: ai,
                  content_block: { type: 'tool_use', id: state.id, name: state.name },
                } as BetaRawMessageStreamEvent
                // 补发「转正之前」已到的匿名分片：它们是本工具调用 arguments 的前缀
                const held = deferredToolCalls.get(oi)
                if (held && held.arguments) {
                  state.arguments = held.arguments
                  yield {
                    type: 'content_block_delta',
                    index: ai,
                    delta: { type: 'input_json_delta', partial_json: held.arguments },
                  } as BetaRawMessageStreamEvent
                }
                deferredToolCalls.delete(oi)
              }
              const state = toolState.get(oi)
              if (state) {
                if (tc.id) state.id = tc.id
                if (hasName) state.name = tc.function.name
                if (tc.function?.arguments) {
                  const newArgs = tc.function.arguments
                  // 区分两种模式：
                  // 1) 模型每帧发送完整 arguments（startsWith 匹配）→ 只发增量部分
                  // 2) 模型发送增量碎片（不匹配）→ 直接拼接并发送完整碎片
                  if (newArgs.startsWith(state.arguments) && newArgs.length > state.arguments.length) {
                    // 全量重发模式：只发新增的增量部分
                    const delta = newArgs.slice(state.arguments.length)
                    state.arguments = newArgs
                    yield {
                      type: 'content_block_delta',
                      index: ai,
                      delta: { type: 'input_json_delta', partial_json: delta },
                    } as BetaRawMessageStreamEvent
                  } else if (newArgs.startsWith(state.arguments)) {
                    // 全量重发且内容完全相同（delta 为空）：仍需要产生一个 delta 事件
                    // 让 StreamProcessor 能解析到完整的 JSON
                    state.arguments = newArgs
                    yield {
                      type: 'content_block_delta',
                      index: ai,
                      delta: { type: 'input_json_delta', partial_json: newArgs },
                    } as BetaRawMessageStreamEvent
                  } else {
                    // 碎片模式：拼接累积
                    state.arguments += newArgs
                    yield {
                      type: 'content_block_delta',
                      index: ai,
                      delta: { type: 'input_json_delta', partial_json: newArgs },
                    } as BetaRawMessageStreamEvent
                  }
                }
              }
            }
          }

        }
        // finish_reason 出现时，结束消息
        //if (choice && Object.prototype.hasOwnProperty.call(choice, 'finish_reason')) {
        if (choice?.finish_reason) {
          // 收尾降级：仍有未转正的匿名 tool_calls —— 它们是上游把正文错编进
          // arguments 的产物（delta.content 恒空、name 恒空）。判据「该 index 从未
          // 见过非空 name」在流结束时可可靠判定。此时把内容当正文发出，避免正文区空白。
          if (deferredToolCalls.size > 0) {
            for (const [, held] of deferredToolCalls) {
              if (held.arguments) {
                yield* closeActiveBlock()
                if (textBuffer && textBufferIndex !== null) {
                  yield { type: 'content_block_delta', index: textBufferIndex, delta: { type: 'text_delta', text: textBuffer } } as BetaRawMessageStreamEvent
                  textBuffer = ''
                  textBufferIndex = null
                }
                const idx = nextContentIndex++
                yield { type: 'content_block_start', index: idx, content_block: { type: 'text', text: '' } } as BetaRawMessageStreamEvent
                yield { type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: held.arguments } } as BetaRawMessageStreamEvent
                yield { type: 'content_block_stop', index: idx } as BetaRawMessageStreamEvent
                logForDebugging(`[openaiCompat] 检测到匿名 tool_calls（index 无 name），已降级为文本输出，长度=${held.arguments.length}`, { level: 'debug' })
              }
            }
            deferredToolCalls.clear()
          }
          // 先强制 flush 残留文本缓冲
          if (textBuffer && textBufferIndex !== null) {
            yield {
              type: 'content_block_delta',
              index: textBufferIndex,
              delta: { type: 'text_delta', text: textBuffer },
            } as BetaRawMessageStreamEvent
            textBuffer = ''
            textBufferIndex = null
            lastFlushTime = Date.now()
          }
          // 然后关闭活动块
          yield* closeActiveBlock()
          for (const ai of toolIdxMap.values()) {
            yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
          }
          completionTokens = chunk.usage?.completion_tokens ?? completionTokens
          yield {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: completionTokens },
          } as BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as BetaRawMessageStreamEvent
          _lastResponseBytes = responseBytes
          return {
            id: 'openai-compat',
            type: 'message',
            role: 'assistant',
            model: input.model,
            content: [],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens },
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
        yield ev as unknown as BetaRawMessageStreamEvent
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

// ================================================================
// 【补丁③】工具调用 XML 兜底补全
//   场景：模型把 `<function=Name><parameter=K>V` 渲染进了正文，
//   上游协议层认为已发 tool_call 并断流。此时原文永远不会补全，
//   只能靠"流中断"这一信号在 wrapper 层兜底合成 tool_use 块。
// ================================================================

function parsePendingToolXml(
  xml: string,
): { name: string; args: Record<string, unknown> } | null {
  if (!xml) return null
  const fnM = xml.match(/<function\s*=\s*([A-Za-z_][\w]*)\s*>/)
  if (!fnM || fnM.index === undefined) return null
  const name = fnM[1]
  const body = xml.slice(fnM.index + fnM[0].length)

  // \u884C\u9996\u6A21\u5F0F\uFF1A\u53EA\u8BA4\u884C\u9996\uFF08\u53EF\u5E26 0~2 \u7A7A\u683C\u7F29\u8FDB\uFF09\u7684 <parameter=KEY>\uFF0C
  // \u907F\u514D\u628A\u53C2\u6570\u503C\u5185\u90E8\u7684 <parameter=...> \u5B57\u9762\u91CF\uFF08\u5982\u4EE3\u7801/\u6B63\u5219\uFF09\u8BEF\u5224\u4E3A\u4E0B\u4E00\u4E2A\u53C2\u6570\u8FB9\u754C\u3002
  const paramRe = /(?:^|\n)[ \t]{0,2}<parameter\s*=\s*([A-Za-z_][\w]*)\s*>/g
  const hits: Array<{ key: string; tagStart: number; tagEnd: number }> = []
  let pm: RegExpExecArray | null
  while ((pm = paramRe.exec(body)) !== null) {
    // pm.index \u73B0\u5728\u6307\u5411\u884C\u9996\uFF08\u542B\u524D\u7F6E \n \u6216\u4E32\u9996\uFF09\uFF0C\u9700\u8981\u81EA\u5DF1\u7B97 < \u7684\u4F4D\u7F6E
    const lt = pm.index + pm[0].indexOf('<parameter')
    hits.push({ key: pm[1], tagStart: lt, tagEnd: pm.index + pm[0].length })
  }

  const args: Record<string, unknown> = {}
  if (hits.length === 0) return { name, args }

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const nextTagStart = i + 1 < hits.length ? hits[i + 1].tagStart : body.length
    const raw = stripToolXmlTags(body.slice(hit.tagEnd, nextTagStart))
    args[hit.key] = coerceToolArgValue(dedentParamValue(raw))
  }
  return { name, args }
}

/**
 * \u5265\u79BB\u53C2\u6570\u503C\u91CC\u6B8B\u7559\u7684\u5DE5\u5177\u8C03\u7528 XML \u95ED\u5408\u6807\u7B7E\u3002
 * \u53EA\u5265\u95ED\u5408\u6807\u7B7E\u2014\u2014\u4E0D\u52A8 <parameter= / <function= \u8FD9\u7C7B\u5F00\u6807\u7B7E\uFF0C
 * \u56E0\u4E3A\u90A3\u4E9B\u53EF\u80FD\u662F\u503C\u5185\u90E8\u7684\u4EE3\u7801\u5B57\u9762\u91CF\u3002
 * \u8986\u76D6\u5404\u5BB6\u98CE\u683C\u53D8\u4F53\uFF1AClaude\uFF08tool_call/invoke/antml:*\uFF09\u3001OpenAI\uFF08function_call\uFF09\u7B49\u3002
 */
function stripToolXmlTags(s: string): string {
  return s
    .replace(
      /<\/(?:parameter|function|function_call|tool_call|tool_use|invoke|antml:invoke|antml:parameter|antml:function_calls)\s*>/gi,
      '',
    )
    .trim()
}

function coerceToolArgValue(raw: string): unknown {
  const t = raw.trim()
  if (t === '') return ''
  const lower = t.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false
  if (lower === 'null' || lower === 'none') return null
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+\.\d+$/.test(t)) return Number(t)
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t)
    } catch {
      /* fallthrough */
    }
  }
  return t
}

/**
 * 保守 dedent：仅当所有非空行都有公共前导空白时才整体去掉该公共缩进。
 * 避免破坏本来就是"相对缩进有意义"的代码块。
 */
function dedentParamValue(s: string): string {
  const lines = s.split('\n')
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    const m = line.match(/^[ \t]*/)
    if (m) minIndent = Math.min(minIndent, m[0].length)
  }
  if (!isFinite(minIndent) || minIndent === 0) return lines.join('\n')
  return lines.map(l => (l.trim() === '' ? '' : l.slice(minIndent))).join('\n')
}

async function* emitPendingToolUseAsAnthropic(
  state: { xml: string | null; enteredAt?: number },
  indexRef: { value: number },
): AsyncGenerator<BetaRawMessageStreamEvent, boolean, void> {
  if (state.xml === null) return false
  const raw = state.xml
  state.xml = null

  const parsed = parsePendingToolXml(raw)
  if (!parsed) {
    // 解析失败 → 降级为文本，绝不吞内容
    if (raw.trim()) {
      const ai = indexRef.value++
      yield {
        type: 'content_block_start',
        index: ai,
        content_block: { type: 'text', text: '' },
      } as BetaRawMessageStreamEvent
      yield {
        type: 'content_block_delta',
        index: ai,
        delta: { type: 'text_delta', text: raw },
      } as BetaRawMessageStreamEvent
      yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
    }
    return false
  }

  const ai = indexRef.value++
  yield {
    type: 'content_block_start',
    index: ai,
    content_block: { type: 'tool_use', id: `toolu_pending_${ai}`, name: parsed.name },
  } as BetaRawMessageStreamEvent
  yield {
    type: 'content_block_delta',
    index: ai,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify(parsed.args) },
  } as BetaRawMessageStreamEvent
  yield { type: 'content_block_stop', index: ai } as BetaRawMessageStreamEvent
  return true
}

async function* wrapPendingToolXml(
  inner: AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void>,
  state: { xml: string | null; enteredAt?: number },
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const indexRef = { value: 100 }  // 从 100 起，避开内层 index（通常 < 20）

  while (true) {
    let r: IteratorResult<BetaRawMessageStreamEvent, BetaMessage>
    try {
      r = await inner.next()
    } catch (e) {
      // 流异常中断（TCP 断）：若 pending 里有工具调用，兜底补全后优雅返回
      if (state.xml !== null) {
        const emitted = yield* emitPendingToolUseAsAnthropic(state, indexRef)
        if (emitted) {
          yield {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { output_tokens: 0 },
          } as BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as BetaRawMessageStreamEvent
          return {
            id: 'openai-compat',
            type: 'message',
            role: 'assistant',
            model,
            content: [],
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          } as unknown as BetaMessage
        }
      }
      throw e
    }

    if (r.done) return r.value

    const ev = r.value

    // 关键拦截点：message_delta 到达 = 内层 closeActiveBlock 已执行完，
    // 此时补插 tool_use 块 + 改写 stop_reason，顺序天然正确。
    if (ev && (ev as { type?: string }).type === 'message_delta' && state.xml !== null) {
      const emitted = yield* emitPendingToolUseAsAnthropic(state, indexRef)
      if (emitted) {
        const orig = ev as unknown as { delta?: Record<string, unknown> }
        yield {
          ...(ev as object),
          delta: { ...(orig.delta ?? {}), stop_reason: 'tool_use' },
        } as BetaRawMessageStreamEvent
        continue
      }
    }

    yield ev as BetaRawMessageStreamEvent
  }
}