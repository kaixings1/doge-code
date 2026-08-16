import { describe, it, expect } from "vitest";
import {
  detectFormat,
  toOpenAI,
  fromOpenAI,
  anthropicToOpenAI,
  openAIToAnthropic,
  vercelToOpenAI,
  openAIToVercel,
  geminiToOpenAI,
  openAIToGemini,
  extractUserQuery,
  countTurns,
  extractToolCalls,
} from "../../utils/messageFormat";

describe("detectFormat", () => {
  it("detects OpenAI format", () => {
    expect(detectFormat([{ role: "user", content: "hi" }])).toBe("openai")
    expect(detectFormat([{ role: "assistant", content: null, tool_calls: [] }])).toBe("openai")
    expect(detectFormat([{ role: "tool", content: "result", tool_call_id: "123" }])).toBe("openai")
  })

  it("detects Anthropic format", () => {
    expect(detectFormat([{ role: "user", content: [{ type: "tool_result", tool_use_id: "123" }] }])).toBe("anthropic")
    expect(detectFormat([{ role: "assistant", content: [{ type: "tool_use", id: "1", name: "test", input: {} }] }])).toBe("anthropic")
  })

  it("detects Vercel format", () => {
    expect(detectFormat([{ role: "user", content: [{ type: "tool-call", toolCallId: "123" }] }])).toBe("vercel")
  })

  it("detects Gemini format", () => {
    expect(detectFormat([{ role: "model", parts: [{ text: "hi" }] }])).toBe("gemini")
    expect(detectFormat([{ role: "user", parts: [{ text: "hi" }] }])).toBe("gemini")
  })
})

describe("anthropicToOpenAI", () => {
  it("converts string content", () => {
    const result = anthropicToOpenAI([{ role: "user", content: "hello" }])
    expect(result).toEqual([{ role: "user", content: "hello" }])
  })

  it("converts content blocks", () => {
    const result = anthropicToOpenAI([
      { role: "assistant", content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "1", name: "test", input: {} }] },
    ])
    expect(result[0].role).toBe("assistant")
    expect(result[0].content).toBe("hi")
    expect(result[0].tool_calls).toHaveLength(1)
    expect(result[0].tool_calls![0].function.name).toBe("test")
  })
})

describe("openAIToAnthropic", () => {
  it("converts back to Anthropic", () => {
    const result = openAIToAnthropic([{ role: "user", content: "hello" }])
    expect(result).toEqual([{ role: "user", content: "hello" }])
  })
})

describe("vercelToOpenAI", () => {
  it("converts Vercel tool-call parts", () => {
    const result = vercelToOpenAI([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "abc", toolName: "search", input: { q: "test" } }] },
    ])
    expect(result[0].tool_calls).toHaveLength(1)
    expect(result[0].tool_calls![0].function.name).toBe("search")
  })
})

describe("geminiToOpenAI", () => {
  it("converts Gemini model role to assistant", () => {
    const result = geminiToOpenAI([{ role: "model", parts: [{ text: "hi" }] }])
    expect(result[0].role).toBe("assistant")
    expect(result[0].content).toBe("hi")
  })
})

describe("round-trip conversions", () => {
  it("OpenAI round-trip is identity", () => {
    const msgs = [{ role: "user", content: "hello" }]
    expect(fromOpenAI(toOpenAI(msgs), "openai")).toEqual(msgs)
  })
})

describe("extractUserQuery", () => {
  it("extracts string content from last user message", () => {
    const msgs = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "last" },
    ]
    expect(extractUserQuery(msgs)).toBe("last")
  })

  it("extracts text from content blocks", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]
    expect(extractUserQuery(msgs)).toBe("hello")
  })

  it("returns empty string when no user message", () => {
    expect(extractUserQuery([{ role: "assistant", content: "hi" }])).toBe("")
  })
})

describe("countTurns", () => {
  it("counts user messages", () => {
    const msgs = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]
    expect(countTurns(msgs)).toBe(2)
  })
})

describe("extractToolCalls", () => {
  it("extracts tool call names from OpenAI format", () => {
    const msgs = [
      { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "search", arguments: "{}" } }] },
    ]
    expect(extractToolCalls(msgs)).toEqual(["search"])
  })

  it("extracts tool names from Anthropic format", () => {
    const msgs = [
      { role: "assistant", content: [{ type: "tool_use", name: "calc", id: "1", input: {} }] },
    ]
    expect(extractToolCalls(msgs)).toEqual(["calc"])
  })

  it("extracts tool names from Vercel format", () => {
    const msgs = [
      { role: "assistant", content: [{ type: "tool-call", toolName: "lookup", toolCallId: "abc" }] },
    ]
    expect(extractToolCalls(msgs)).toEqual(["lookup"])
  })
})
