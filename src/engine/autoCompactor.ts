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

export class SummaryStrategy implements CompactStrategy {
  name = "summary";
  async compact(messages: InternalMessage[], options: CompactOptions): Promise<InternalMessage[]> {
    const system = options.preserveSystemMessages ? messages.filter((m) => m.role === "system") : [];
    const nonSys = messages.filter((m) => m.role !== "system");
    const recent = nonSys.slice(-options.preserveRecentCount);
    const old = nonSys.slice(0, -options.preserveRecentCount);
    if (old.length === 0) return [...system, ...recent];
    const summary = await this.generateSummary(old);
    return [...system, { role: "system", content: `[会话摘要]\n${summary}` }, ...recent];
  }
  private async generateSummary(messages: InternalMessage[]): Promise<string> {
    return messages
      .map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n");
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

  constructor() {
    this.registerStrategy(new SummaryStrategy());
    this.registerStrategy(new TruncateStrategy());
    this.registerStrategy(new SelectiveStrategy());
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

  /** 供 recovery.ts 调用的轻量占位的压缩（§9.4） */
  async compactPlaceholder(): Promise<void> {
    // 由外部持有 conversation 引用时替换真实消息
  }
}