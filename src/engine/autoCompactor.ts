import type { InternalMessage } from "./messageNormalizer.ts";

/**
 * engine/autoCompactor.ts — 自动压缩器（文档 02 §8.1）
 *
 * 策略：summary / truncate / selective（策略模式，对应文档 01 §7.2）。
 *
 * ContextCascade 级联系统（吸收自 zhikuncode ContextCascade）：
 *   Level 0: Snip           ← 单条工具结果超预算时，截断中间保留首尾
 *   Level 1: MicroCompact   ← 对旧的可压缩工具结果替换为 "[cleared]"
 *   Level 2: AutoCompact    ← token 率 > 阈值时，三区划分 + LLM 摘要
 *   Level 3: CollapseDrain  ← 紧急情况下激进压缩 (contextWindow*0.5 目标)
 *   Level 4: ReactiveCompact← API 返回 413 时，仅保留 1 轮 + 极度压缩
 *
 * 执行顺序：Level 0-1 每次 API 调用前无条件执行（代价极低）
 *           Level 2 基于 buffer-based 阈值触发
 *           Level 3-4 仅在错误恢复路径触发
 */

// ============ Cascade 级别定义 ============

export type CascadeLevel =
  | { level: 0; name: "Snip" }
  | { level: 1; name: "MicroCompact" }
  | { level: 2; name: "AutoCompact" }
  | { level: 3; name: "CollapseDrain" }
  | { level: 4; name: "ReactiveCompact" };

export interface CascadeState {
  /** 当前达到的最高级别 */
  highestLevel: number;
  /** 本次级联压缩的消息数 */
  messagesRemoved: number;
  /** 是否发生熔断（连续失败超过阈值） */
  tripped: boolean;
}

export interface CascadeResult {
  messages: InternalMessage[];
  changed: boolean;
  state: CascadeState;
}

// ============ 配置常量 ============

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const MICRO_COMPACT_PROTECTED_TAIL = 10;
const COLLAPSE_DRAIN_TARGET_RATIO = 0.5;
const REACTIVE_COMPACT_RECENT_TURNS = 1;

export interface CompactOptions {
  preserveRecentCount: number;
  preserveSystemMessages: boolean;
  preserveToolResults?: boolean;
  /** 吸收自 Hermes Agent 程序化记忆：摘要时注入相关记忆上下文 */
  memoryContext?: string[]
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

    // 吸收自 Hermes Agent 程序化记忆：注入相关记忆上下文到摘要 prompt
    const memoryContext = options.memoryContext?.length
      ? `\n\n[相关记忆]\n${options.memoryContext.join('\n')}`
      : ''

    // 有 LLM client 时生成真��摘要，否则回退到占位摘要
    const summary = this._llmClient
      ? await this.generateSummaryWithLLM(old, memoryContext)
      : await this.generateSummaryFallback(old);

    return [...system, { role: "system", content: `[会话摘要]\n${summary}` }, ...recent];
  }

  /**
   * 通过 LLM 生成摘要（对齐 OpenCode Summarize prompt）。
   * 将旧消息 + 摘要 prompt 发给模型，提取摘要内容。
   */
  private async generateSummaryWithLLM(messages: InternalMessage[], memoryContext = ''): Promise<string> {
    if (!this._llmClient) return this.generateSummaryFallback(messages);

    const summarizePrompt = "Summarize this conversation to preserve context for continuation. Include: 1) Main topic and progression. 2) What was recently implemented, modified, or debugged. 3) Technologies, frameworks, and architectural decisions discussed. 4) Files created or modified, their purposes and key changes. 5) Problems encountered and how they were resolved. 6) Pending work or next steps. Focus on technical identifiers (file paths, function names, errors)." + memoryContext;

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
    const result = await strategy.compact(messages, {
      preserveRecentCount: options.preserveRecentCount ?? 10,
      preserveSystemMessages: options.preserveSystemMessages ?? true,
      preserveToolResults: options.preserveToolResults ?? true,
    });
    // 压缩后确保 orphaned tool 消息不与其父 assistant 消息分离
    this._repairOrphanedToolMessages(result);
    return result;
  }

  /** 修复压缩后孤立的 tool 消息（吸收自 Continue conversationCompaction + CoreCoder _safe_split） */
  private _repairOrphanedToolMessages(messages: InternalMessage[]): void {
    // 收集当前消息中所有有效的 tool_call_id
    const validToolCallIds = new Set<string>();
    for (const m of messages) {
      if (m.role === 'assistant' && typeof m.content === 'object') {
        for (const block of m.content as Array<Record<string, unknown>>) {
          if (block.type === 'tool_use' && typeof block.id === 'string') {
            validToolCallIds.add(block.id);
          }
        }
      }
    }
    // 将 orphaned tool 消息替换为 "Tool cancelled" 占位（Continue 模式）
    // 而非直接删除——保留消息结构完整性，让模型知道该调用被取消
    for (const m of messages) {
      if (m.role === 'tool') {
        const tcId = (m as { tool_call_id?: string }).tool_call_id;
        if (tcId && !validToolCallIds.has(tcId)) {
          (m as { content: string }).content = 'Tool cancelled';
        }
      }
    }
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

// ============ ContextCascade 级联服务 ============

/**
 * Level 0: Snip — 单条工具结果超预算时，截断中间保留首尾。
 * 吸收自 zhikuncode SnipService。
 */
export function snipMessages(messages: InternalMessage[]): InternalMessage[] {
  const MAX_TOOL_RESULT_CHARS = 8000;
  const KEEP_HEAD = 2000;
  const KEEP_TAIL = 2000;

  return messages.map((msg) => {
    if (msg.role !== "tool") return msg;
    const content = typeof msg.content === "string" ? msg.content : String(msg.content);
    if (content.length <= MAX_TOOL_RESULT_CHARS) return msg;

    const truncated =
      content.slice(0, KEEP_HEAD) +
      `\n...[snip: ${content.length - KEEP_HEAD - KEEP_TAIL} chars omitted]...\n` +
      content.slice(-KEEP_TAIL);

    return { ...msg, content: truncated };
  });
}

/**
 * Level 1: MicroCompact — 对旧的可压缩工具结果替换为 "[cleared]"。
 * 吸收自 zhikuncode MicroCompactService。
 */
export function microCompact(messages: InternalMessage[], protectedTail = MICRO_COMPACT_PROTECTED_TAIL): InternalMessage[] {
  const toolResultSet = new Set<string>();
  const tailStart = Math.max(0, messages.length - protectedTail);

  for (let i = 0; i < tailStart; i++) {
    const msg = messages[i];
    if (msg.role === "tool") {
      const content = typeof msg.content === "string" ? msg.content : String(msg.content);
      if (content.length > 500 && !content.includes("[cleared]")) {
        toolResultSet.add(content);
      }
    }
  }

  if (toolResultSet.size === 0) return messages;

  const contentToCleared = new Map(toolResultSet.map((c) => [c, `[cleared] ${c.length} chars`]));

  return messages.map((msg) => {
    if (msg.role !== "tool") return msg;
    const content = typeof msg.content === "string" ? msg.content : String(msg.content);
    const cleared = contentToCleared.get(content);
    if (cleared) return { ...msg, content: cleared };
    return msg;
  });
}

/**
 * Level 2: AutoCompact — token 率 > 阈值时，三区划分 + LLM 摘要。
 * 包装现有 SummaryStrategy / AutoCompactor 逻辑。
 */
export async function autoCompactCascade(
  messages: InternalMessage[],
  compactFn: (messages: InternalMessage[], preserveRecentCount?: number) => Promise<InternalMessage[]>,
  preserveRecentCount = 10,
): Promise<InternalMessage[]> {
  return compactFn(messages, preserveRecentCount);
}

/**
 * Level 3: CollapseDrain — 紧急情况下激进压缩。
 * 目标：保留上下文窗口的 50%（zhikuncode: contextWindow * 0.5）。
 * 吸收自 zhikuncode CompactService CollapseDrain 模式。
 */
export function collapseDrain(messages: InternalMessage[]): InternalMessage[] {
  const system = messages.filter((m) => m.role === "system");
  const recent = messages.filter((m) => m.role === "tool" || m.role === "assistant" || m.role === "user");

  const recentLimit = Math.max(3, Math.floor(recent.length * COLLAPSE_DRAIN_TARGET_RATIO));
  const kept = recent.slice(-recentLimit);

  return [...system, ...kept];
}

/**
 * Level 4: ReactiveCompact — API 返回 413 时，仅保留 1 轮 + 极度压缩。
 * 吸收自 zhikuncode CompactService ReactiveCompact 模式。
 */
export function reactiveCompact(messages: InternalMessage[]): InternalMessage[] {
  const system = messages.filter((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role === "user");
  const recentUser = userMessages.slice(-REACTIVE_COMPACT_RECENT_TURNS);
  const recentAssistant = messages.filter((m) => m.role === "assistant").slice(-2);

  return [...system, ...recentUser, ...recentAssistant];
}

/**
 * 执行完整 ContextCascade 级联（五层级联）。
 *
 * 执行顺序：
 *   Level 0 (Snip) → Level 1 (MicroCompact) → Level 2 (AutoCompact)
 *   → [错误恢复时] Level 3 (CollapseDrain) → Level 4 (ReactiveCompact)
 *
 * @param messages - 当前会话消息
 * @param opts - 选项
 * @param opts.maxLevel - 最大执行级别（默认 2，错误恢复时传入 4）
 * @param opts.compactFn - Level 2 的 LLM 摘要函数
 * @param opts.consecutiveFailures - 连续失败次数（用于熔断）
 * @returns CascadeResult
 */
export async function executeCascade(
  messages: InternalMessage[],
  opts: {
    maxLevel?: number;
    compactFn?: (msgs: InternalMessage[], preserveRecentCount?: number) => Promise<InternalMessage[]>;
    consecutiveFailures?: number;
  } = {},
): Promise<CascadeResult> {
  const maxLevel = opts.maxLevel ?? 2;
  const consecutiveFailures = opts.consecutiveFailures ?? 0;
  const tripped = consecutiveFailures >= DEFAULT_MAX_CONSECUTIVE_FAILURES;

  let current = messages;
  let highestLevel = 0;
  let totalRemoved = 0;

  // Level 0: Snip（无条件执行，代价极低）
  if (current.length > 0) {
    const before = current.length;
    current = snipMessages(current);
    highestLevel = 0;
    totalRemoved += before - current.length;
  }

  // Level 1: MicroCompact（无条件执行，代价极低）
  if (current.length > 0) {
    const before = current.length;
    current = microCompact(current);
    highestLevel = 1;
    totalRemoved += before - current.length;
  }

  // Level 2: AutoCompact（buffer-based 阈值触发）
  if (maxLevel >= 2 && current.length > 20 && !tripped) {
    const before = current.length;
    current = await autoCompactCascade(current, opts.compactFn ?? (async (m) => m));
    highestLevel = 2;
    totalRemoved += before - current.length;
  }

  // Level 3: CollapseDrain（紧急恢复）
  if (maxLevel >= 3 && !tripped) {
    const before = current.length;
    current = collapseDrain(current);
    highestLevel = 3;
    totalRemoved += before - current.length;
  }

  // Level 4: ReactiveCompact（413 恢复）
  if (maxLevel >= 4) {
    const before = current.length;
    current = reactiveCompact(current);
    highestLevel = 4;
    totalRemoved += before - current.length;
  }

  const state: CascadeState = {
    highestLevel,
    messagesRemoved: totalRemoved,
    tripped,
  };

  return {
    messages: current,
    changed: totalRemoved > 0,
    state,
  };
}