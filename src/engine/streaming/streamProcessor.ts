/**
 * engine/streaming/streamProcessor.ts — 流式响应处理器（文档 02 §11.2）
 *
 * 解析 SSE/WebSocket 事件，聚合文本增量与工具调用参数，回调实时渲染。
 */
export interface APIEvent {
  type: string;
  [k: string]: unknown;
}

export interface ProcessedEvent {
  type: string;
  chunk?: { type: string; text?: string; id?: string; name?: string; inputDelta?: string; index?: number };
  block?: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };
  stopReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  error?: unknown;
  data?: unknown;
}

export class StreamProcessor {
  private buffer: { type: string; text?: string; id?: string; inputDelta?: string; index?: number }[] = [];
  private currentBlock: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string } | null = null;
  private messageStart: { content?: { type: string; id: string; name: string }[] } | null = null;
  onChunkCallback?: (chunk: { type: string; text?: string }) => void;

  process(event: APIEvent): ProcessedEvent {
    switch (event.type) {
      case "message_start":
        this.messageStart = event.message as { content?: { type: string; id: string; name: string }[] };
        return { type: "message_start", model: (event.message as { model?: string })?.model };
      case "content_block_start":
        this.currentBlock = event.content_block as { type: string; id?: string; name?: string };
        return { type: "content_block_start", block: this.currentBlock };
      case "content_block_delta":
        return this.processDelta(event as unknown as { index: number; delta: { type: string; text?: string; partial_json?: string } });
      case "content_block_stop":
        return this.processBlockStop(event as unknown as { index: number });
      case "message_delta":
        return {
          type: "message_delta",
          stopReason: (event.delta as { stop_reason?: string })?.stop_reason,
          usage: (event.delta as { usage?: { inputTokens: number; outputTokens: number } })?.usage,
        };
      case "message_stop":
        return { type: "message_stop" };
      case "error":
        return { type: "error", error: event.error };
      default:
        return { type: "unknown", data: event };
    }
  }

  private processDelta(event: { index: number; delta: { type: string; text?: string; partial_json?: string } }): ProcessedEvent {
    if (!this.currentBlock) return { type: "error", error: "No current block" };
    const delta = event.delta;
    if (delta.type === "text_delta") {
      const chunk = { type: "text", text: delta.text, index: event.index };
      this.buffer.push(chunk);
      if (this.onChunkCallback) this.onChunkCallback(chunk);
      return { type: "content_block_delta", chunk };
    }
    if (delta.type === "input_json_delta") {
      const chunk = { type: "tool_use", id: this.currentBlock.id, name: this.currentBlock.name, inputDelta: delta.partial_json, index: event.index };
      this.buffer.push(chunk);
      return { type: "content_block_delta", chunk };
    }
    return { type: "content_block_delta", chunk: null };
  }

  private processBlockStop(event: { index: number }): ProcessedEvent {
    if (!this.currentBlock) return { type: "content_block_stop", block: null };
    const blockChunks = this.buffer.filter((c) => c.index === event.index);
    if (this.currentBlock.type === "text") {
      this.currentBlock.text = blockChunks.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    }
    if (this.currentBlock.type === "tool_use") {
      const json = blockChunks.filter((c) => c.type === "tool_use").map((c) => c.inputDelta ?? "").join("");
      try {
        this.currentBlock.input = JSON.parse(json);
      } catch {
        this.currentBlock.input = {};
      }
    }
    const block = { ...this.currentBlock };
    this.currentBlock = null;
    return { type: "content_block_stop", block };
  }
}