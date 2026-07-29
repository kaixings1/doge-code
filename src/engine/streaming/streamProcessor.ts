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
    const eventType = event.type
    if (eventType === 'content_block_start' || eventType === 'content_block_stop' || eventType === 'message_delta' || eventType === 'message_start') {
      console.log(`[STREAM-PROC] event type=${eventType}`, JSON.stringify(event).slice(0, 400))
    }
    switch (eventType) {
      case "message_start":
        this.buffer = []
        this.currentBlock = null
        this.messageStart = event.message as { content?: { type: string; id: string; name: string }[] }
        return { type: "message_start", model: (event.message as { model?: string })?.model }
      case "content_block_start": {
        const cb = event.content_block as { type: string; id?: string; name?: string; input?: Record<string, unknown> }
        this.currentBlock = cb.input !== null && cb.input !== undefined
          ? { type: cb.type, id: cb.id, name: cb.name, input: cb.input }
          : { type: cb.type, id: cb.id, name: cb.name }
        console.log(`[STREAM-PROC] content_block_start type=${cb.type} id=${cb.id} name=${cb.name} currentBlockSet=true`)
        return { type: "content_block_start", block: this.currentBlock }
      }
      case "content_block_delta":
        return this.processDelta(event as unknown as { index: number; delta: { type: string; text?: string; partial_json?: string } })
      case "content_block_stop": {
        const idx = (event as unknown as { index: number }).index
        console.log(`[STREAM-PROC] content_block_stop index=${idx} currentBlockType=${this.currentBlock?.type ?? 'null'} currentBlockId=${this.currentBlock?.id ?? 'null'}`)
        const result = this.processBlockStop(event as unknown as { index: number })
        console.log(`[STREAM-PROC] content_block_stop result blockType=${result.block?.type ?? 'null'} blockId=${result.block?.id ?? 'null'}`)
        return result
      }
      case "message_delta":
        return {
          type: "message_delta",
          stopReason: (event.delta as { stop_reason?: string })?.stop_reason,
          usage: (event.delta as { usage?: { inputTokens: number; outputTokens: number } })?.usage,
        }
      case "message_stop":
        return { type: "message_stop" }
      case "error":
        return { type: "error", error: event.error }
      default:
        return { type: "unknown", data: event }
    }
  }

  private processDelta(event: { index: number; delta: { type: string; text?: string; partial_json?: string } }): ProcessedEvent {
    if (!this.currentBlock) {
      console.warn(`[STREAM-PROC] processDelta but currentBlock is null, delta type=${event.delta.type}`)
      return { type: "content_block_delta", chunk: null }
    }
    const delta = event.delta
    if (delta.type === "text_delta") {
      const chunk = { type: "text", text: delta.text, index: event.index }
      this.buffer.push(chunk)
      if (this.onChunkCallback) this.onChunkCallback(chunk)
      return { type: "content_block_delta", chunk }
    }
    if (delta.type === "input_json_delta") {
      const chunk = { type: "tool_use", id: this.currentBlock.id, name: this.currentBlock.name, inputDelta: delta.partial_json, index: event.index }
      this.buffer.push(chunk)
      return { type: "content_block_delta", chunk }
    }
    console.log(`[STREAM-PROC] unexpected delta type=${delta.type} keys=${Object.keys(delta).join(',')}`)
    return { type: "content_block_delta", chunk: null }
  }

  private processBlockStop(event: { index: number }): ProcessedEvent {
    if (!this.currentBlock) return { type: "content_block_stop", block: null }
    const blockChunks = this.buffer.filter((c) => c.index === event.index)
    if (this.currentBlock.type === "text") {
      this.currentBlock.text = blockChunks.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
    }
    if (this.currentBlock.type === "tool_use") {
      if (this.currentBlock.input === null || this.currentBlock.input === undefined) {
        const json = blockChunks.filter((c) => c.type === "tool_use").map((c) => c.inputDelta ?? "").join("")
        console.log(`[STREAM-PROC] processBlockStop index=${event.index} blockType=tool_use blockChunks=${blockChunks.length} json="${json.slice(0, 200)}"`)
        try {
          this.currentBlock.input = JSON.parse(json)
          console.log(`[STREAM-PROC] parsed input:`, JSON.stringify(this.currentBlock.input).slice(0, 200))
        } catch (e) {
          console.log(`[STREAM-PROC] JSON.parse failed:`, e instanceof Error ? e.message : String(e))
          this.currentBlock.input = {}
        }
      }
    }
    const block = { ...this.currentBlock }
    this.currentBlock = null
    return { type: "content_block_stop", block }
  }
}
