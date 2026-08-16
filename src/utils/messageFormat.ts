/**
 * 通用消息格式检测与转换。
 * 吸收自 headroomlabs-ai/headroom — 零依赖 TypeScript。
 *
 * 支持 4 种格式：
 *   - OpenAI:    { role, content, tool_calls?, tool_call_id? }
 *   - Anthropic:  { role, content (string | ContentBlock[]) } 含 tool_use/tool_result 块
 *   - Vercel AI SDK: { role, content (string | Part[]) } 含 tool-call/tool-result 部分
 *   - Google Gemini: { role, parts[] } 含 functionCall/functionResponse
 *
 * 所有转换均以 OpenAI 格式作为中间格式。
 */

export type MessageFormat = "openai" | "anthropic" | "vercel" | "gemini"

export interface OpenAIMessage {
  role: string
  content: string | any[] | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface AssistantMessage extends OpenAIMessage {
  role: "assistant"
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

/**
 * 检测消息数组所属的格式。
 * 使用每种格式独有的结构标记进行判断。
 */
export function detectFormat(messages: any[]): MessageFormat {
  for (const msg of messages) {
    // Gemini: 使用 `parts` 而非 `content`
    if ("parts" in msg && !("content" in msg)) return "gemini"
    // Gemini: role 为 "model" 而非 "assistant"
    if (msg.role === "model") return "gemini"
    // OpenAI: assistant 消息上有 tool_calls
    if (msg.tool_calls && msg.role === "assistant") return "openai"
    // OpenAI: tool 角色且带 tool_call_id
    if (msg.role === "tool" && "tool_call_id" in msg && typeof msg.content === "string") return "openai"
    // 检查 content 块中的格式特有标记
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        // Vercel: 连字符类型
        if (part.type === "tool-call" || part.type === "tool-result") return "vercel"
        // Anthropic: 下划线类型
        if (part.type === "tool_use" || part.type === "tool_result") return "anthropic"
        // Anthropic: 带 source.type 的图片
        if (part.type === "image" && part.source?.type) return "anthropic"
      }
    }
    // 默认: OpenAI（简单的 {role, content: string} 是合法的 OpenAI 格式）
    return "openai"
  }
  return "openai"
}

// ============================================================
// Anthropic → OpenAI
// ============================================================

export function anthropicToOpenAI(messages: any[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content })
        continue
      }
      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((b: any) => b.type === "text")
        const toolResults = msg.content.filter((b: any) => b.type === "tool_result")

        if (textBlocks.length > 0) {
          result.push({
            role: "user",
            content: textBlocks.map((b: any) => b.text).join("\n"),
          })
        }
        for (const tr of toolResults) {
          const content = typeof tr.content === "string"
            ? tr.content
            : Array.isArray(tr.content)
              ? tr.content.map((b: any) => b.text ?? JSON.stringify(b)).join("\n")
              : JSON.stringify(tr.content)
          result.push({
            role: "tool",
            content,
            tool_call_id: tr.tool_use_id,
          })
        }
      }
      continue
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content })
        continue
      }
      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((b: any) => b.type === "text")
        const toolUseBlocks = msg.content.filter((b: any) => b.type === "tool_use")

        const content = textBlocks.length > 0
          ? textBlocks.map((b: any) => b.text).join("\n")
          : null

        const openaiMsg: AssistantMessage = { role: "assistant", content }
        if (toolUseBlocks.length > 0) {
          openaiMsg.tool_calls = toolUseBlocks.map((b: any): ToolCall => ({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input),
            },
          }))
        }
        result.push(openaiMsg)
      }
      continue
    }
  }

  return result
}

export function openAIToAnthropic(messages: OpenAIMessage[]): any[] {
  const result: any[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic 的 system 在顶层；如果出现在 messages 中，转为 user
      result.push({ role: "user", content: msg.content })
      continue
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content })
      } else if (Array.isArray(msg.content)) {
        result.push({
          role: "user",
          content: msg.content.map((p) =>
            p.type === "text" ? { type: "text", text: p.text } : { type: "text", text: "" },
          ),
        })
      }
      continue
    }

    if (msg.role === "assistant") {
      const blocks: any[] = []
      if (msg.content) blocks.push({ type: "text", text: msg.content })
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })
        }
      }
      result.push({
        role: "assistant",
        content: blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks,
      })
      continue
    }

    if (msg.role === "tool") {
      result.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content },
        ],
      })
      continue
    }
  }

  return result
}

// ============================================================
// Vercel AI SDK → OpenAI
// ============================================================

export function vercelToOpenAI(messages: any[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ role: "system", content: typeof msg.content === "string" ? msg.content : String(msg.content) })
      continue
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content })
        continue
      }
      const parts = Array.isArray(msg.content) ? msg.content : []
      const textParts = parts.filter((p: any) => p.type === "text")
      const imageParts = parts.filter((p: any) => p.type === "image")

      if (imageParts.length === 0 && textParts.length > 0) {
        result.push({ role: "user", content: textParts.map((p: any) => p.text).join("") })
      } else {
        const openaiParts = parts
          .filter((p: any) => p.type === "text" || p.type === "image")
          .map((p: any) => {
            if (p.type === "text") return { type: "text" as const, text: p.text }
            if (p.type === "image") {
              const url = p.image instanceof URL ? p.image.toString() : String(p.image)
              return { type: "image_url" as const, image_url: { url } }
            }
            return { type: "text" as const, text: "" }
          })
        result.push({ role: "user", content: openaiParts })
      }
      continue
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content })
        continue
      }
      const parts = Array.isArray(msg.content) ? msg.content : []
      const textParts = parts.filter((p: any) => p.type === "text")
      const toolCallParts = parts.filter((p: any) => p.type === "tool-call")

      const content = textParts.length > 0 ? textParts.map((p: any) => p.text).join("") : null
      const openaiMsg: AssistantMessage = { role: "assistant", content }

      if (toolCallParts.length > 0) {
        openaiMsg.tool_calls = toolCallParts.map((p: any): ToolCall => ({
          id: p.toolCallId,
          type: "function",
          // AI SDK v6 使用 `input`，早期版本使用 `args`
          function: { name: p.toolName, arguments: JSON.stringify(p.input ?? p.args) },
        }))
      }
      result.push(openaiMsg)
      continue
    }

    if (msg.role === "tool") {
      const parts = Array.isArray(msg.content) ? msg.content : []
      for (const part of parts) {
        if (part.type === "tool-result") {
          // AI SDK v6 使用 `output: { type, value }`，早期版本使用 `result`
          let contentStr: string
          if (part.output !== undefined) {
            const val = part.output?.value ?? part.output
            contentStr = typeof val === "string" ? val : JSON.stringify(val)
          } else if (part.result !== undefined) {
            contentStr = typeof part.result === "string" ? part.result : JSON.stringify(part.result)
          } else {
            contentStr = ""
          }
          result.push({
            role: "tool",
            content: contentStr,
            tool_call_id: part.toolCallId,
          })
        }
      }
      continue
    }
  }

  return result
}

export function openAIToVercel(messages: OpenAIMessage[]): any[] {
  const result: any[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ role: "system", content: msg.content })
      continue
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: [{ type: "text", text: msg.content }] })
        continue
      }
      if (Array.isArray(msg.content)) {
        const parts = msg.content.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text }
          if (p.type === "image_url") return { type: "image", image: new URL(p.image_url.url) }
          return { type: "text", text: "" }
        })
        result.push({ role: "user", content: parts })
      }
      continue
    }

    if (msg.role === "assistant") {
      const parts: any[] = []
      if (msg.content) parts.push({ type: "text", text: msg.content })
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: any
          try { input = JSON.parse(tc.function.arguments) } catch { input = tc.function.arguments ?? {} }
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            input, // AI SDK v6 使用 `input`，而非 `args`
          })
        }
      }
      result.push({ role: "assistant", content: parts })
      continue
    }

    if (msg.role === "tool") {
      let parsed: any
      try { parsed = JSON.parse(msg.content) } catch { parsed = msg.content }
      // AI SDK v6 要求 output: { type: 'json' | 'text', value }
      const output = typeof parsed === "string"
        ? { type: "text" as const, value: parsed }
        : { type: "json" as const, value: parsed }
      result.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: msg.tool_call_id,
          toolName: "unknown",
          output,
        }],
      })
      continue
    }
  }

  return result
}

// ============================================================
// Google Gemini → OpenAI
// ============================================================

export function geminiToOpenAI(messages: any[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    const role = msg.role === "model" ? "assistant" : "user"
    const parts: any[] = msg.parts ?? []

    if (role === "user") {
      // 检查 functionResponse 部分
      const funcResponses = parts.filter((p: any) => p.functionResponse)
      const textParts = parts.filter((p: any) => p.text !== undefined)

      if (textParts.length > 0) {
        result.push({ role: "user", content: textParts.map((p: any) => p.text).join("\n") })
      }
      for (const fr of funcResponses) {
        result.push({
          role: "tool",
          content: JSON.stringify(fr.functionResponse.response),
          tool_call_id: `gemini_${fr.functionResponse.name}`,
        })
      }
      continue
    }

    if (role === "assistant") {
      const textParts = parts.filter((p: any) => p.text !== undefined)
      const funcCalls = parts.filter((p: any) => p.functionCall)

      const content = textParts.length > 0 ? textParts.map((p: any) => p.text).join("\n") : null
      const openaiMsg: AssistantMessage = { role: "assistant", content }

      if (funcCalls.length > 0) {
        openaiMsg.tool_calls = funcCalls.map((p: any): ToolCall => ({
          id: `gemini_${p.functionCall.name}`,
          type: "function",
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args),
          },
        }))
      }
      result.push(openaiMsg)
      continue
    }
  }

  return result
}

export function openAIToGemini(messages: OpenAIMessage[]): any[] {
  const result: any[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini 的 system 在顶层；如果出现在 messages 中，转为 user
      result.push({ role: "user", parts: [{ text: msg.content }] })
      continue
    }

    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : (msg.content ?? []).filter((p) => p.type === "text").map((p: any) => p.text).join("\n")
      result.push({ role: "user", parts: [{ text }] })
      continue
    }

    if (msg.role === "assistant") {
      const parts: any[] = []
      if (msg.content) parts.push({ text: msg.content })
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) },
          })
        }
      }
      result.push({ role: "model", parts })
      continue
    }

    if (msg.role === "tool") {
      let response: any
      try { response = JSON.parse(msg.content) } catch { response = { result: msg.content } }
      result.push({
        role: "user",
        parts: [{ functionResponse: { name: msg.tool_call_id?.replace("gemini_", "") ?? "unknown", response } }],
      })
      continue
    }
  }

  return result
}

// ============================================================
// 通用转换：任意格式 → OpenAI，以及 OpenAI → 原始格式
// ============================================================

export function toOpenAI(messages: any[]): OpenAIMessage[] {
  const format = detectFormat(messages)
  switch (format) {
    case "openai": return messages as OpenAIMessage[]
    case "anthropic": return anthropicToOpenAI(messages)
    case "vercel": return vercelToOpenAI(messages)
    case "gemini": return geminiToOpenAI(messages)
  }
}

export function fromOpenAI(messages: OpenAIMessage[], targetFormat: MessageFormat): any[] {
  switch (targetFormat) {
    case "openai": return messages
    case "anthropic": return openAIToAnthropic(messages)
    case "vercel": return openAIToVercel(messages)
    case "gemini": return openAIToGemini(messages)
  }
}

// ============================================================
// 消息内省工具函数（来自 headroom hooks）
// ============================================================

/**
 * 从消息数组中提取最后一条用户消息的文本（支持任意格式）。
 */
export function extractUserQuery(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === "user") {
      if (typeof msg.content === "string") return msg.content
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find(
          (p: any) => p.type === "text" || p.text,
        )
        if (textPart) return textPart.text ?? textPart.content ?? ""
      }
    }
  }
  return ""
}

/**
 * 计算对话轮次（用户消息数量）。
 */
export function countTurns(messages: any[]): number {
  return messages.filter((m) => m.role === "user").length
}

/**
 * 从消息中提取所有工具调用名称（支持任意格式）。
 */
export function extractToolCalls(messages: any[]): string[] {
  const names: string[] = []
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        names.push(tc.function?.name ?? tc.name ?? "unknown")
      }
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool_use") names.push(part.name ?? "unknown")
        if (part.type === "tool-call") names.push(part.toolName ?? "unknown")
      }
    }
  }
  return names
}
