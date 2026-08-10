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

/** 消息角色交替校验结果（吸收自 aider ensure_alternating_roles） */
export interface RoleValidationResult {
  valid: boolean
  /** 修复后的消息列表（仅当 valid=false 时有意义） */
  fixed: InternalMessage[]
  /** 问题描述 */
  issues: string[]
}

export class MessageNormalizer {
  /**
   * validateRoles — 确保消息序列中 user/assistant/tool 角色交替出现。
   *
   * 吸收自 aider 的 ensure_alternating_roles() 和 sanity_check_messages()。
   * 当检测到连续相同角色时，自动合并内容到前一条消息。
   */
  static validateRoles(messages: InternalMessage[]): RoleValidationResult {
    const issues: string[] = []
    const fixed: InternalMessage[] = []
    let lastRole: InternalRole | null = null

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const role = msg.role

      // 跳过 system（system 消息不参与交替检查）
      if (role === 'system') {
        fixed.push(msg)
        continue
      }

      // 检查连续相同角色
      if (lastRole === role) {
        issues.push(`连续 ${role} 消息（索引 ${i - 1} -> ${i}）`)
        // 合并到前一条消息
        if (fixed.length > 0) {
          const prev = fixed[fixed.length - 1]
          if (typeof prev.content === 'string' && typeof msg.content === 'string') {
            prev.content = `${prev.content}\n${msg.content}`
          } else if (Array.isArray(prev.content) && Array.isArray(msg.content)) {
            prev.content = [...prev.content, ...msg.content]
          }
        }
      } else {
        fixed.push({ ...msg })
      }

      lastRole = role
    }

    return {
      valid: issues.length === 0,
      fixed,
      issues,
    }
  }

  normalize(messages: InternalMessage[], provider: "anthropic" | "openai" | "google" | "azure" | "bedrock" | "vertexai" | "copilot" | "groq" | "openrouter" | "local" | "xai"): APIMessage[] {
    const validation = MessageNormalizer.validateRoles(messages)
    if (!validation.valid) {
      console.warn('[MessageNormalizer] 检测到连续相同角色消息，已自动合并:', validation.issues.join('; '))
    }
    const sourceMessages = validation.valid ? messages : validation.fixed
    return provider === "anthropic"
      ? this.normalizeForAnthropic(sourceMessages)
      : this.normalizeForOpenAI(sourceMessages);
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