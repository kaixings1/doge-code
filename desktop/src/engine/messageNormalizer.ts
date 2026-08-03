/**
 * engine/messageNormalizer.ts — 消息规范化器（文档 02 §4.2）
 *
 * 将内部消息格式转换为 Anthropic / OpenAI 所需格式，合并连续相同角色消息。
 */
export type InternalRole = "system" | "user" | "assistant" | "tool";
export type InternalContent = string | Array<Record<string, unknown>>;

export interface InternalMessage {
  role: InternalRole;
  content: InternalContent;
  toolUseId?: string;
}

export type APIMessage = { role: string; content: unknown; [k: string]: unknown };

export class MessageNormalizer {
  normalize(messages: InternalMessage[], provider: "anthropic" | "openai" | "google" | "azure" | "bedrock" | "vertexai" | "copilot" | "groq" | "openrouter" | "local" | "xai"): APIMessage[] {
    return provider === "anthropic"
      ? this.normalizeForAnthropic(messages)
      : this.normalizeForOpenAI(messages);
  }

  private normalizeForAnthropic(messages: InternalMessage[]): APIMessage[] {
    const result: APIMessage[] = [];
    for (const msg of messages) {
      if (msg.role === "system") continue; // Anthropic system 单独处理
      if (msg.role === "user") {
        result.push({ role: "user", content: this.asStringOrArray(msg.content) });
      } else if (msg.role === "assistant") {
        result.push({ role: "assistant", content: this.asStringOrArray(msg.content) });
      } else if (msg.role === "tool" && msg.toolUseId) {
        result.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: msg.toolUseId, content: this.asString(msg.content) }],
        });
      }
    }
    return this.mergeConsecutive(result);
  }

  private normalizeForOpenAI(messages: InternalMessage[]): APIMessage[] {
    const result: APIMessage[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({ role: "system", content: this.asString(msg.content) });
      } else if (msg.role === "user") {
        result.push({ role: "user", content: this.asString(msg.content) });
      } else if (msg.role === "assistant") {
        const blocks = Array.isArray(msg.content) ? (msg.content as Array<Record<string, unknown>>) : [];
        const textParts: string[] = [];
        const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
        for (const block of blocks) {
          if (block.type === "text" && typeof block.text === "string") {
            textParts.push(block.text);
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id as string,
              type: "function",
              function: {
                name: block.name as string,
                arguments: JSON.stringify(block.input ?? {}),
              },
            });
          }
        }
        const openAIMsg: APIMessage = {
          role: "assistant",
          content: textParts.length > 0 ? textParts.join("") : "",
        };
        if (toolCalls.length > 0) {
          openAIMsg.tool_calls = toolCalls;
        }
        result.push(openAIMsg);
      } else if (msg.role === "tool" && msg.toolUseId) {
        result.push({ role: "tool", tool_call_id: msg.toolUseId, content: this.asString(msg.content) });
      }
    }
    return result;
  }

  private asString(c: InternalContent): string {
    if (typeof c === "string") return c;
    try {
      return JSON.stringify(c);
    } catch {
      return String(c);
    }
  }

  private asStringOrArray(c: InternalContent): unknown {
    return typeof c === "string" ? c : c;
  }

  private mergeConsecutive(messages: APIMessage[]): APIMessage[] {
    if (messages.length <= 1) return messages;
    const out: APIMessage[] = [messages[0]];
    for (let i = 1; i < messages.length; i++) {
      const prev = out[out.length - 1];
      const curr = messages[i];
      if (prev.role === curr.role) {
        prev.content = `${this.asString(prev.content as InternalContent)}\n${this.asString(curr.content as InternalContent)}`;
      } else {
        out.push(curr);
      }
    }
    return out;
  }
}