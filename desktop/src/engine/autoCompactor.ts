/**
 * engine/autoCompactor.ts — 自动压缩器（文档 02 §8.1）
 *
 * 策略：summary / truncate / selective（策略模式，对应文档 01 §7.2）。
 */
import type { InternalMessage } from "./messageNormalizer.ts";

export interface CompactOptions {
  preserveRecentCount: number;
  preserveSystemMessages: boolean;
  preserveToolResults?: boolean;
}

export interface CompactStrategy {
  name: string;
  compact(messages: InternalMessage[], options: CompactOptions): Promise<InternalMessage[]>;
}

/**
 * LLM 驱动的会话摘要策略（对齐 OpenCode agent.go Summarize）。
 * 依赖外部 LLM API client 生成真实摘要，而非简单 join。
 */
export class SummaryStrategy implements CompactStrategy {
  name = "summary";

  private _llmClient?: { sendMessage: (req: unknown) => Promise<AsyncIterable<unknown>> };

  /** 设置 LLM API client（由 AutoCompactor.setApiClient 调用） */
  setLlmClient(client?: { sendMessage: (req: unknown) => Promise<AsyncIterable<unknown>> }): void {
    this._llmClient = client;
  }

  async compact(messages: InternalMessage[], options: CompactOptions): Promise<InternalMessage[]> {
    const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
    const nonSys = messages.filter((m) => m.role !== "system");
    const recent = nonSys.slice(-options.preserveRecentCount);
    const old = nonSys.slice(0, -options.preserveRecentCount);
    if (old.length === 0) return [...system, ...recent];

    // 有 LLM client 时生成真实摘要，否则回退到占位摘要
    const summary = this._llmClient
      ? await this.generateSummaryWithLLM(old)
      : await this.generateSummaryFallback(old);

    return [...system, { role: "system", content: `[会话摘要]\n${summary}` }, ...recent];
  }

  /**
   * 通过 LLM 生成摘要（对齐 OpenCode Summarize prompt）。
   * 将旧消息 + 摘要 prompt 发给模型，提取摘要内容。
   */
  private async generateSummaryWithLLM(messages: InternalMessage[]): Promise<string> {
    if (!this._llmClient) return this.generateSummaryFallback(messages);

    const summarizePrompt = "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.";

    const contextMsgs: InternalMessage[] = [
      ...messages,
      { role: "user", content: summarizePrompt },
    ];

    try {
      const stream = await this._llmClient!.sendMessage({
        messages: contextMsgs.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 2000,
        temperature: 0.3,
      });

      // 从流中聚合 text content
      const chunks: string[] = [];
      for await (const event of stream as AsyncIterable<{ type: string; text?: string }>) {
        if (event.type === "content_block_delta" && event.text) {
          chunks.push(event.text);
        }
      }
      const summary = chunks.join("").trim();
      if (summary.length > 100) return summary;
    } catch {
      // 降级到占位摘要
    }

    return this.generateSummaryFallback(messages);
  }

  /**
   * 占位摘要（无 LLM client 时使用）。
   * 统计消息轮次 + 列出涉及的工具名。
   */
  private async generateSummaryFallback(messages: InternalMessage[]): Promise<string> {
    const toolCalls: string[] = [];
    let turns = 0;

    for (const m of messages) {
      if (m.role === "assistant") turns++;
      if (m.role === "assistant" && Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block && typeof block === "object" && (block as Record<string, unknown>).type === "tool_use") {
            toolCalls.push((block as Record<string, unknown>).name as string);
          }
        }
      }
    }

    const parts = [`${turns} 轮对话`];
    if (toolCalls.length > 0) {
      parts.push(`调用工具: ${[...new Set(toolCalls)].join(", ")}`);
    }
    parts.push(`共 ${messages.length} 条消息`);

    return parts.join("；");
  }
}

export class TruncateStrategy implements CompactStrategy {
  name = "truncate";
  async compact(messages: InternalMessage[], options: CompactOptions): Promise<InternalMessage[]> {
    const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
    const nonSys = messages.filter((m) => m.role !== "system");
    return [...system, ...nonSys.slice(-options.preserveRecentCount)];
  }
}

export class SelectiveStrategy implements CompactStrategy {
  name = "selective";
  async compact(messages: InternalMessage[], options: CompactOptions): Promise<InternalMessage[]> {
    const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
    const nonSys = messages.filter((m) => m.role !== "system");
    const recent = nonSys.slice(-options.preserveRecentCount);
    const old = nonSys.slice(0, -options.preserveRecentCount);
    const important = old.filter((msg) => {
      if (options.preserveToolResults && msg.role === "tool") return true;
      const c = typeof msg.content === "string" ? msg.content : "";
      if (c.includes("```")) return true;
      if (/重要|关键|决定|决策|结论|important|key|decision/.test(c)) return true;
      return false;
    });
    return [...system, ...important, ...recent];
  }
}

export class AutoCompactor {
  private strategies = new Map<string, CompactStrategy>();
  private defaultStrategy = "summary";
  private _summaryStrategy?: SummaryStrategy;

  constructor() {
    const summaryStrat = new SummaryStrategy();
    this._summaryStrategy = summaryStrat;
    this.registerStrategy(summaryStrat);
    this.registerStrategy(new TruncateStrategy());
    this.registerStrategy(new SelectiveStrategy());
  }

  /** 注入 LLM API client，使 SummaryStrategy 能生成真实摘要 */
  setApiClient(client: { sendMessage: (req: unknown) => Promise<AsyncIterable<unknown>> }): void {
    if (this._summaryStrategy) {
      this._summaryStrategy.setLlmClient(client);
    }
  }

  registerStrategy(s: CompactStrategy): void {
    this.strategies.set(s.name, s);
  }

  setDefaultStrategy(name: string): void {
    if (!this.strategies.has(name)) throw new Error(`Strategy not found: ${name}`);
    this.defaultStrategy = name;
  }

  async compact(
    messages: InternalMessage[],
    options: Partial<CompactOptions> = {},
  ): Promise<InternalMessage[]> {
    const strategy = this.strategies.get(this.defaultStrategy);
    if (!strategy) return messages;
    return strategy.compact(messages, {
      preserveRecentCount: options.preserveRecentCount ?? 10,
      preserveSystemMessages: options.preserveSystemMessages ?? true,
      preserveToolResults: options.preserveToolResults ?? true,
    });
  }

  /** 便捷方法：返回被压缩掉的消息数量 */
  async compactCount(messages: InternalMessage[]): Promise<number> {
    const original = messages.length;
    const result = await this.compact(messages);
    return original - result.length;
  }

  /** 供 recovery.ts 调用的轻量占位的压缩（§9.4） */
  async compactPlaceholder(): Promise<void> {
    // 由外部持有 conversation 引用时替换真实消息
  }
}