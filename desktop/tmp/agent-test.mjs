// src/main/agentOrchestrator.ts
import { BrowserWindow } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

// src/main/apiClient.ts
function parseSSEChunk(buffer2) {
  const normalized = buffer2.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remainder = parts.pop() ?? "";
  return { events: parts, remainder };
}
function mapFinishReason(reason) {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end_turn";
}
function sanitizeToolSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const REMOVE_KEYS = /* @__PURE__ */ new Set([
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "default",
    "$schema",
    "additionalProperties"
  ]);
  const removed = [];
  const kept = [];
  const cleaned = {};
  for (const [key, value] of Object.entries(schema)) {
    if (REMOVE_KEYS.has(key)) {
      removed.push(key);
      continue;
    }
    kept.push(key);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      cleaned[key] = sanitizeToolSchema(value);
    } else {
      cleaned[key] = value;
    }
  }
  if (removed.length > 0) {
    console.log(`[SANITIZE] removed=${JSON.stringify(removed)} kept=${JSON.stringify(kept)}`);
  }
  return cleaned;
}
function buildOpenAIRequest(request) {
  console.log("[APICLIENT] request.tools raw:", JSON.stringify(request.tools || []).slice(0, 500));
  const messages = [];
  for (const m of request.messages || []) {
    const msg = m;
    let content;
    if (msg.content === null || msg.content === void 0) {
      content = null;
    } else if (Array.isArray(msg.content)) {
      const blocks = msg.content;
      content = blocks.filter((b) => b.type === "text" || b.type === "tool_result").map((b) => {
        const cleaned = { type: b.type };
        if (typeof b.text === "string") cleaned.text = b.text;
        if (typeof b.content === "string") cleaned.content = b.content;
        if (typeof b.tool_use_id === "string") cleaned.tool_use_id = b.tool_use_id;
        return cleaned;
      });
    } else if (typeof msg.content === "string") {
      content = msg.content;
    } else {
      content = String(msg.content);
    }
    const chatMsg = {
      role: String(msg.role || "user"),
      content
    };
    if (msg.tool_calls) {
      chatMsg.tool_calls = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      chatMsg.tool_call_id = msg.tool_call_id;
    }
    messages.push(chatMsg);
  }
  const tools = (request.tools || []).map((t) => {
    const wrapper = t;
    const fn = wrapper.function || {};
    const rawSchema = fn.parameters;
    const cleanedSchema = rawSchema ? sanitizeToolSchema(rawSchema) : null;
    const toolDef = {
      type: "function",
      function: {
        name: String(fn.name || ""),
        description: typeof fn.description === "string" ? fn.description : void 0,
        ...cleanedSchema !== null ? { parameters: cleanedSchema } : {}
      }
    };
    return toolDef;
  });
  console.log(`[TOOLS-FINAL] toolCount=${tools.length}, names=${tools.map((t) => t.function.name).join(",")}`);
  const toolsSnapshot = JSON.stringify(tools);
  console.log(`[TOOLS-BODY] (first 5000): ${toolsSnapshot.slice(0, 5e3)}`);
  return {
    model: request.model,
    messages,
    stream: true,
    max_tokens: request.max_tokens,
    temperature: request.temperature ?? 0,
    ...tools.length > 0 ? { tools } : {}
  };
}
function tryParseNonStreamingResponse(buffer2, model) {
  try {
    const parsed = JSON.parse(buffer2);
    const content = parsed.choices?.[0]?.message?.content ?? parsed.content?.[0]?.text ?? "";
    if (!content) return null;
    const promptTokens = parsed.usage?.prompt_tokens ?? 0;
    const completionTokens = parsed.usage?.completion_tokens ?? 0;
    return {
      events: [
        { type: "message_start", message: { model, content: [], usage: { input_tokens: 0, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: content } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: completionTokens } },
        { type: "message_stop" }
      ],
      resultMessage: {
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: content }],
        stop_reason: "end_turn",
        usage: { input_tokens: promptTokens, output_tokens: completionTokens }
      },
      promptTokens,
      completionTokens
    };
  } catch {
    return null;
  }
}
function createDesktopApiClient(config) {
  const { apiKey, baseUrl, provider } = config;
  const isAnthropic = provider === "anthropic";
  const trimmed = baseUrl.replace(/\/+$/, "");
  const url = isAnthropic ? trimmed.endsWith("/messages") ? trimmed : `${trimmed}/messages` : trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (isAnthropic) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return {
    async sendMessage(request) {
      let body;
      if (isAnthropic) {
        body = {
          model: request.model,
          max_tokens: request.max_tokens,
          stream: true,
          system: request.system,
          messages: request.messages.map((m) => {
            const msg = m;
            if (msg.role === "tool") {
              const toolUseId = msg.toolUseId;
              return {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: typeof toolUseId === "string" ? toolUseId : void 0,
                    content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
                  }
                ]
              };
            }
            const content = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? msg.content : JSON.stringify(msg.content);
            return { role: msg.role, content };
          })
        };
        if (request.tools && request.tools.length > 0) {
          body.tools = request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema
          }));
        }
      } else {
        body = buildOpenAIRequest(request);
      }
      let response = null;
      let lastError = "";
      const bodyJson = JSON.stringify(body);
      console.log(`[MAIN] request body (first 3000): ${bodyJson.slice(0, 3e3)}`);
      let retryBody = bodyJson;
      let strippedTools = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        response = await fetch(url, { method: "POST", headers, body: retryBody });
        if (response.ok) break;
        const text = await response.text().catch(() => "");
        lastError = `API \u8BF7\u6C42\u5931\u8D25 (${response.status}): ${text || response.statusText}`;
        if (response.status === 429) {
          const waitMs = Math.min((attempt + 1) * 5e3, 6e4);
          console.warn(`[MAIN] 429 \u901F\u7387\u9650\u5236\uFF0C\u7B49\u5F85 ${waitMs}ms \u540E\u91CD\u8BD5 (${attempt + 1}/5)...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if (response.status >= 500) {
          console.warn(`[MAIN] ${response.status} \u670D\u52A1\u5668\u9519\u8BEF\uFF0C\u91CD\u8BD5 (${attempt + 1}/5)...`);
          await new Promise((resolve) => setTimeout(resolve, 3e3 * (attempt + 1)));
        } else if (response.status === 400 && !strippedTools) {
          const cleanBody = { ...body };
          delete cleanBody.tools;
          retryBody = JSON.stringify(cleanBody);
          strippedTools = true;
          console.warn(`[MAIN] 400 \u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF\uFF0C\u53BB\u6389 tools \u91CD\u8BD5 (${attempt + 1}/5)...`);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        } else {
          console.error(`[MAIN] API error: ${response.status}, body: ${text?.slice(0, 200)}`);
          throw new Error(lastError);
        }
      }
      if (!response || !response.ok) {
        throw new Error(lastError || "API \u8BF7\u6C42\u5931\u8D25");
      }
      console.log(`[MAIN] API response: ${response.status}, content-type: ${response.headers.get("content-type")}`);
      async function* stream() {
        if (!response.body) {
          const fullText = await response.text();
          const maybeParsed = tryParseNonStreamingResponse(fullText, request.model);
          if (maybeParsed) {
            for (const ev of maybeParsed.events) {
              yield ev;
            }
            return;
          }
          throw new Error(`API \u8FD4\u56DE\u975E\u6D41\u5F0F\u54CD\u5E94\u4F46\u65E0\u6CD5\u89E3\u6790: ${fullText.slice(0, 500)}`);
        }
        let streamReader;
        try {
          if (response.body) {
            streamReader = response.body.getReader();
          }
          const decoder = new TextDecoder();
          let textBuffer = "";
          let buffer2 = "";
          let messageStarted2 = false;
          let blockIndex = 0;
          const toolCallAccum = /* @__PURE__ */ new Map();
          if (!streamReader) {
            const fullText = await response.text();
            const maybeParsed = tryParseNonStreamingResponse(fullText, request.model);
            if (maybeParsed) {
              for (const ev of maybeParsed.events) {
                yield ev;
              }
              return;
            }
            throw new Error(`API \u8FD4\u56DE\u975E\u6D41\u5F0F\u54CD\u5E94\u4F46\u65E0\u6CD5\u89E3\u6790: ${fullText.slice(0, 500)}`);
          }
          while (true) {
            const { done, value } = await streamReader.read();
            if (done) break;
            buffer2 += decoder.decode(value, { stream: true });
            const sse = parseSSEChunk(buffer2);
            buffer2 = sse.remainder;
            for (const rawEvent of sse.events) {
              const dataLines = rawEvent.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
              for (const data of dataLines) {
                if (!data || data === "[DONE]") {
                  if (data === "[DONE]") {
                    if (!messageStarted2) {
                      yield { type: "message_start", message: { model: request.model } };
                    }
                    if (toolCallAccum.size > 0) {
                      for (const [idx] of toolCallAccum) {
                        yield { type: "content_block_stop", index: idx };
                      }
                      toolCallAccum.clear();
                    }
                    yield { type: "message_stop" };
                    return;
                  }
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (process.env.DOGE_DEBUG_SSE === "1") {
                    console.log(`[SSE] ${JSON.stringify(parsed).slice(0, 2e3)}`);
                  }
                  if (isAnthropic) {
                    yield parsed;
                    messageStarted2 = true;
                  } else {
                    const chunk = parsed;
                    const choice = chunk.choices?.[0];
                    const delta = choice ? choice.delta : void 0;
                    if (choice && (delta || choice.finish_reason)) {
                      if (!messageStarted2) {
                        yield {
                          type: "message_start",
                          message: {
                            model: chunk.model || request.model,
                            content: [],
                            usage: { input_tokens: chunk.usage?.prompt_tokens ?? 0, output_tokens: 0 }
                          }
                        };
                        messageStarted2 = true;
                      }
                      if (delta && "thinking" in delta) {
                        const t = delta.thinking;
                        yield { type: "content_block_start", index: blockIndex, content_block: { type: "text", text: "" } };
                        yield { type: "content_block_delta", index: blockIndex, delta: { type: "text_delta", text: t } };
                        yield { type: "content_block_stop", index: blockIndex };
                        blockIndex++;
                      }
                      if (delta && delta.content != null) {
                        const text = delta.content;
                        if (text !== "") {
                          if (!textBuffer) {
                            textBuffer = text;
                            yield { type: "content_block_start", index: blockIndex, content_block: { type: "text", text: "" } };
                            yield { type: "content_block_delta", index: blockIndex, delta: { type: "text_delta", text } };
                          } else {
                            const prevBuffer = textBuffer;
                            textBuffer += text;
                            if (text.startsWith(prevBuffer)) {
                              const deltaText = text.slice(prevBuffer.length);
                              if (deltaText) yield { type: "content_block_delta", index: blockIndex, delta: { type: "text_delta", text: deltaText } };
                            } else {
                              yield { type: "content_block_delta", index: blockIndex, delta: { type: "text_delta", text } };
                            }
                          }
                        }
                      }
                      if (delta && Array.isArray(delta.tool_calls)) {
                        for (const tc of delta.tool_calls) {
                          const idx = tc.index ?? 0;
                          const func = tc.function;
                          const name = func?.name;
                          const args = func?.arguments;
                          if (process.env.DOGE_DEBUG_SSE === "1") {
                            console.log(`[TOOL-OAI] tool_use idx=${idx} id=${tc.id} name=${name} args=${args?.slice(0, 500)}`);
                          }
                          const isFirst = !toolCallAccum.has(idx);
                          if (isFirst) {
                            toolCallAccum.set(idx, { id: tc.id, name: name || "", args: "" });
                            yield { type: "content_block_start", index: idx, content_block: { type: "tool_use", id: tc.id, name } };
                          }
                          if (args) {
                            const entry = toolCallAccum.get(idx);
                            const newArgs = args;
                            if (newArgs.startsWith(entry.args) && newArgs.length > entry.args.length) {
                              const delta2 = newArgs.slice(entry.args.length);
                              entry.args = newArgs;
                              yield { type: "content_block_delta", index: idx, delta: { type: "input_json_delta", partial_json: delta2 } };
                            } else if (newArgs.startsWith(entry.args)) {
                              entry.args = newArgs;
                            } else {
                              entry.args += newArgs;
                              yield { type: "content_block_delta", index: idx, delta: { type: "input_json_delta", partial_json: newArgs } };
                            }
                          }
                        }
                      }
                      if (choice.finish_reason) {
                        const stopReason = mapFinishReason(choice.finish_reason);
                        if (process.env.DOGE_DEBUG_SSE === "1") {
                          console.log(`[TOOL-OAI] finish_reason=${choice.finish_reason} mapped=${stopReason} toolCallAccum.size=${toolCallAccum.size}`);
                        }
                        if (toolCallAccum.size > 0) {
                          for (const [idx] of toolCallAccum) {
                            yield { type: "content_block_stop", index: idx };
                          }
                          toolCallAccum.clear();
                        }
                        yield { type: "message_delta", delta: { stop_reason: stopReason }, usage: chunk.usage };
                      }
                    }
                    if (chunk.usage && messageStarted2) {
                      yield { type: "message_delta", delta: { usage: chunk.usage } };
                    }
                  }
                } catch {
                }
              }
            }
          }
        } finally {
          if (streamReader) {
            streamReader.releaseLock();
          }
        }
        if (!messageStarted && buffer.trim()) {
          const maybeParsed = tryParseNonStreamingResponse(buffer.trim(), request.model);
          if (maybeParsed) {
            for (const ev of maybeParsed.events) {
              yield ev;
            }
            return;
          }
        }
        if (messageStarted) {
          yield { type: "message_stop" };
        }
      }
      return stream();
    }
  };
}

// src/main/agentOrchestrator.ts
var DEFAULT_AGENT_ROLES = [
  {
    id: "architect",
    name: "\u67B6\u6784\u5E08",
    description: "\u4ECE\u6574\u4F53\u67B6\u6784\u89D2\u5EA6\u5206\u6790\uFF0C\u8BBE\u8BA1\u6A21\u5757\u5212\u5206\u4E0E\u6570\u636E\u6D41",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u8F6F\u4EF6\u67B6\u6784\u5E08\u3002\u8BF7\u4ECE\u67B6\u6784\u5C42\u9762\u5206\u6790\u4EFB\u52A1\uFF1A\u6A21\u5757\u5212\u5206\u3001\u6570\u636E\u6D41\u3001\u63A5\u53E3\u8BBE\u8BA1\u3001\u6269\u5C55\u6027\u3001\u98CE\u9669\u70B9\u3002\u8F93\u51FA\u7ED3\u6784\u5316\u7684\u67B6\u6784\u5206\u6790\uFF0C\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "reviewer",
    name: "\u5BA1\u67E5\u5458",
    description: "\u4EE5\u6279\u5224\u89C6\u89D2\u5BA1\u67E5\u65B9\u6848\uFF0C\u627E\u51FA\u7F3A\u9677\u4E0E\u9057\u6F0F",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u4E25\u683C\u7684\u4EE3\u7801\u5BA1\u67E5\u4E13\u5BB6\u3002\u8BF7\u6279\u5224\u6027\u5730\u5206\u6790\u4EFB\u52A1\uFF1A\u627E\u51FA\u6F5C\u5728 bug\u3001\u8FB9\u754C\u6761\u4EF6\u9057\u6F0F\u3001\u5B89\u5168\u98CE\u9669\u3001\u6027\u80FD\u95EE\u9898\u3002\u76F4\u63A5\u6307\u51FA\u95EE\u9898\uFF0C\u4E0D\u8981\u5BA2\u5957\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "implementer",
    name: "\u5B9E\u65BD\u8005",
    description: "\u7ED9\u51FA\u5177\u4F53\u53EF\u843D\u5730\u7684\u5B9E\u65BD\u6B65\u9AA4",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u5B9E\u6218\u6D3E\u5DE5\u7A0B\u5E08\u3002\u8BF7\u7ED9\u51FA\u4EFB\u52A1\u7684\u5177\u4F53\u5B9E\u65BD\u65B9\u6848\uFF1A\u6B65\u9AA4\u3001\u5173\u952E\u4EE3\u7801\u601D\u8DEF\u3001\u9A8C\u8BC1\u65B9\u5F0F\u3002\u8981\u5177\u4F53\u53EF\u6267\u884C\uFF0C\u907F\u514D\u7A7A\u8BDD\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "security",
    name: "\u5B89\u5168\u5BA1\u8BA1\u5458",
    description: "\u4EE5\u5B89\u5168\u89C6\u89D2\u5BA1\u67E5\uFF0C\u627E\u51FA\u6F0F\u6D1E\u4E0E\u98CE\u9669",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u5E94\u7528\u5B89\u5168\u4E13\u5BB6\u3002\u8BF7\u4ECE\u5B89\u5168\u89D2\u5EA6\u5BA1\u67E5\u4EFB\u52A1\u5185\u5BB9\uFF1A\u627E\u51FA\u6CE8\u5165\u3001\u8D8A\u6743\u3001\u654F\u611F\u4FE1\u606F\u6CC4\u9732\u3001\u4E0D\u5B89\u5168\u4F9D\u8D56\u7B49\u98CE\u9669\uFF0C\u5E76\u7ED9\u51FA\u4FEE\u590D\u5EFA\u8BAE\u3002\u53EA\u62A5\u544A\u771F\u5B9E\u98CE\u9669\uFF0C\u4E0D\u5938\u5927\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "tester",
    name: "\u6D4B\u8BD5\u8BBE\u8BA1\u5458",
    description: "\u8BBE\u8BA1\u8986\u76D6\u8FB9\u754C\u4E0E\u5F02\u5E38\u573A\u666F\u7684\u6D4B\u8BD5\u65B9\u6848",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u6D4B\u8BD5\u5DE5\u7A0B\u5E08\u3002\u8BF7\u4E3A\u4EFB\u52A1\u5185\u5BB9\u8BBE\u8BA1\u6D4B\u8BD5\u65B9\u6848\uFF1A\u6838\u5FC3\u7528\u4F8B\u3001\u8FB9\u754C\u6761\u4EF6\u3001\u5F02\u5E38\u573A\u666F\u3001\u56DE\u5F52\u98CE\u9669\u70B9\u3002\u7ED9\u51FA\u53EF\u6267\u884C\u7684\u5177\u4F53\u6D4B\u8BD5\u601D\u8DEF\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "perf",
    name: "\u6027\u80FD\u4F18\u5316\u5458",
    description: "\u627E\u51FA\u6027\u80FD\u74F6\u9888\u5E76\u7ED9\u51FA\u4F18\u5316\u65B9\u6848",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u6027\u80FD\u5DE5\u7A0B\u5E08\u3002\u8BF7\u4ECE\u6027\u80FD\u89D2\u5EA6\u5BA1\u67E5\uFF1A\u7B97\u6CD5\u590D\u6742\u5EA6\u3001IO \u74F6\u9888\u3001\u5185\u5B58\u4F7F\u7528\u3001\u5E76\u53D1\u95EE\u9898\u3002\u7ED9\u51FA\u53EF\u5EA6\u91CF\u7684\u4F18\u5316\u5EFA\u8BAE\u548C\u9884\u671F\u6536\u76CA\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  },
  {
    id: "doc",
    name: "\u6587\u6863\u7F16\u5199\u5458",
    description: "\u5C06\u65B9\u6848\u6574\u7406\u4E3A\u6E05\u6670\u7684\u6587\u6863",
    systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u6280\u672F\u6587\u6863\u4F5C\u8005\u3002\u8BF7\u5C06\u4EFB\u52A1\u76F8\u5173\u7684\u7ED3\u8BBA\u6574\u7406\u4E3A\u7ED3\u6784\u5316\u3001\u6613\u8BFB\u7684\u6587\u6863\uFF1A\u6982\u8FF0\u3001\u8981\u70B9\u3001\u793A\u4F8B\u3001\u6CE8\u610F\u4E8B\u9879\u3002\u8BED\u8A00\u7B80\u6D01\u51C6\u786E\u3002\u63A7\u5236\u5728 400 \u5B57\u4EE5\u5185\u3002"
  }
];
function loadCustomAgentRoles(projectRoot) {
  const agentsDir = path.join(projectRoot, ".doge", "agents");
  if (!fs.existsSync(agentsDir)) return [];
  const custom = [];
  let entries;
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !(entry.name.endsWith(".json") || entry.name.endsWith(".jsonc"))) continue;
    try {
      const raw = fs.readFileSync(path.join(agentsDir, entry.name), "utf-8");
      const data = JSON.parse(raw);
      if (!data.id || !data.name || !data.systemPrompt) continue;
      custom.push({
        id: data.id,
        name: data.name,
        description: data.description || "",
        systemPrompt: data.systemPrompt,
        model: data.model
      });
    } catch {
      console.warn(`[AGENT] \u8DF3\u8FC7\u65E0\u6548\u89D2\u8272\u6587\u4EF6: ${entry.name}`);
    }
  }
  return custom;
}
function loadAllRoles(projectRoot) {
  const custom = loadCustomAgentRoles(projectRoot);
  const byId = /* @__PURE__ */ new Map();
  for (const r of DEFAULT_AGENT_ROLES) byId.set(r.id, r);
  for (const r of custom) byId.set(r.id, r);
  return Array.from(byId.values());
}
var AgentOrchestrator = class {
  active = /* @__PURE__ */ new Map();
  idCounter = 0;
  /**
   * 并行编排：所有角色同时执行，返回聚合结果
   */
  async orchestrate(apiConfig, params) {
    const orchestrationId = `orch-${Date.now()}-${(this.idCounter++).toString(36)}`;
    const flag = { cancelled: false };
    this.active.set(orchestrationId, flag);
    const startedAt = Date.now();
    const timeoutMs = params.timeoutMs || 12e4;
    const maxTokens = params.maxTokens || 4e3;
    const sendProgress = (progress) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("doge:agent-progress", progress);
      });
    };
    sendProgress({ orchestrationId, completedCount: 0, totalCount: params.roles.length, runningRoles: params.roles.map((r) => r.name), status: "running" });
    const mode = params.mode || "parallel";
    const runRole = async (role, userPrompt, phase) => {
      const roleStart = Date.now();
      if (flag.cancelled) {
        return { roleId: role.id, name: role.name, content: "", durationMs: 0, status: "cancelled", error: "\u5DF2\u53D6\u6D88", inputTokens: 0, outputTokens: 0 };
      }
      try {
        const client = createDesktopApiClient(apiConfig);
        const messages = [{ role: "user", content: userPrompt }];
        const request = {
          model: role.model || params.defaultModel,
          system: role.systemPrompt,
          messages,
          max_tokens: maxTokens,
          tools: []
        };
        let text = "";
        let inputTokens = 0;
        let outputTokens = 0;
        const consume = async () => {
          const stream = await client.sendMessage(request);
          for await (const ev of stream) {
            if (flag.cancelled) break;
            const e = ev;
            if (e.type === "content_block_delta") {
              const delta = e.delta ?? {};
              if (delta.type === "text_delta" && typeof delta.text === "string") {
                text += delta.text;
              }
            } else if (e.type === "message_start") {
              const msg = e.message ?? {};
              const usage = msg.usage ?? {};
              inputTokens = usage.input_tokens || 0;
            } else if (e.type === "message_delta") {
              const delta = e.delta ?? {};
              const usage = delta.usage ?? {};
              if (usage.output_tokens) outputTokens = usage.output_tokens;
            }
          }
        };
        await Promise.race([
          consume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Agent \u8D85\u65F6 (${timeoutMs / 1e3}s)`)), timeoutMs))
        ]);
        const durationMs = Date.now() - roleStart;
        if (flag.cancelled) {
          return { roleId: role.id, name: role.name, content: text, durationMs, status: "cancelled", error: "\u5DF2\u53D6\u6D88", inputTokens, outputTokens };
        }
        return { roleId: role.id, name: role.name, content: text, durationMs, status: "completed", inputTokens, outputTokens };
      } catch (e) {
        const durationMs = Date.now() - roleStart;
        const isTimeout = e instanceof Error && e.message.includes("\u8D85\u65F6");
        return {
          roleId: role.id,
          name: role.name,
          content: "",
          durationMs,
          status: isTimeout ? "timeout" : "failed",
          error: e instanceof Error ? e.message : String(e),
          inputTokens: 0,
          outputTokens: 0
        };
      }
    };
    const round1Outputs = await Promise.all(params.roles.map((r) => runRole(r, params.task, 1)));
    let outputs = round1Outputs;
    if (mode === "discuss") {
      sendProgress({
        orchestrationId,
        completedCount: round1Outputs.length,
        totalCount: params.roles.length,
        runningRoles: ["(\u4EA4\u53C9\u8BC4\u5BA1\u4E2D)"],
        status: "running"
      });
      const summary = round1Outputs.filter((o) => o.status === "completed" && o.content.trim()).map((o) => `## ${o.name}\uFF08${o.roleId}\uFF09\u7684\u89C2\u70B9
${o.content.trim()}`).join("\n\n---\n\n");
      const reviewPrompt = `\u4EE5\u4E0B\u662F\u5176\u4ED6 Agent \u5BF9\u540C\u4E00\u4EFB\u52A1\u7684\u7B2C\u4E00\u8F6E\u5206\u6790\u3002\u8BF7\u4ED4\u7EC6\u9605\u8BFB\u5B83\u4EEC\u7684\u89C2\u70B9\uFF0C\u6307\u51FA\u5176\u4E2D\u4F60\u8BA4\u4E3A\u6709\u7F3A\u9677\u3001\u9057\u6F0F\u6216\u5206\u6B67\u7684\u5730\u65B9\uFF0C\u7136\u540E\u7ED9\u51FA\u4F60\u7684\u6700\u7EC8\u7EFC\u5408\u7ED3\u8BBA\uFF08\u5982\u4E0E\u67D0\u89C2\u70B9\u4E00\u81F4\u8BF7\u660E\u786E\u8BA4\u540C\uFF09\u3002

${summary || "(\u5176\u4ED6 Agent \u5747\u672A\u4EA7\u51FA\u6709\u6548\u7ED3\u679C)"}`;
      outputs = await Promise.all(params.roles.map((r) => runRole(r, reviewPrompt, 2)));
    }
    const finishedAt = Date.now();
    this.active.delete(orchestrationId);
    const finalStatus = flag.cancelled ? "cancelled" : "completed";
    const result = {
      orchestrationId,
      task: params.task,
      status: finalStatus,
      outputs,
      mode,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      successCount: outputs.filter((o) => o.status === "completed").length,
      failedCount: outputs.filter((o) => o.status !== "completed").length
    };
    if (mode === "discuss") {
      result.round1Outputs = round1Outputs;
    }
    sendProgress({
      orchestrationId,
      completedCount: outputs.length,
      totalCount: params.roles.length,
      runningRoles: [],
      status: finalStatus
    });
    return result;
  }
  cancel(orchestrationId) {
    const flag = this.active.get(orchestrationId);
    if (!flag) return false;
    flag.cancelled = true;
    return true;
  }
  hasActive() {
    return this.active.size > 0;
  }
};
function createAgentOrchestrator() {
  return new AgentOrchestrator();
}
export {
  AgentOrchestrator,
  DEFAULT_AGENT_ROLES,
  createAgentOrchestrator,
  loadAllRoles,
  loadCustomAgentRoles
};
