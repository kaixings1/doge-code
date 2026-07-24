/**
 * engine/responseHandler.ts — 响应处理器（文档 02 §5.1）
 *
 * 解析流式响应、检测工具调用、聚合内容、判断是否需要用户输入。
 */
import { StreamProcessor } from "./streaming/streamProcessor.ts";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  requiresAuthorization?: boolean;
}

export interface ProcessedResponse {
  content: unknown;
  toolCalls: ToolCall[];
  stopReason: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  needsUserInput: boolean;
}

export interface APIEvent {
  type: string;
  [k: string]: unknown;
}

export class ResponseHandler {
  private streamProcessor = new StreamProcessor();
  onChunk?: (chunk: { type: string; text?: string }) => void;

  async handle(stream: AsyncIterable<APIEvent>): Promise<ProcessedResponse> {
    const chunks: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[] = [];
    const toolCalls: ToolCall[] = [];
    let stopReason: string | null = null;
    let model: string | null = null;
    let usage: { inputTokens: number; outputTokens: number } | null = null;

    for await (const event of stream) {
      const processed = this.streamProcessor.process(event);
      switch (processed.type) {
        case "content_block_delta":
          if (processed.chunk) {
            chunks.push(processed.chunk);
            if (this.onChunk) this.onChunk(processed.chunk);
          }
          break;
        case "content_block_stop":
          if (processed.block && processed.block.type === "tool_use") {
            toolCalls.push({
              id: processed.block.id,
              name: processed.block.name,
              input: processed.block.input ?? {},
            });
          }
          break;
        case "message_delta":
          if (processed.stopReason) stopReason = processed.stopReason;
          if (processed.usage) usage = processed.usage;
          break;
        case "message_start":
          if (processed.model) model = processed.model;
          break;
        case "error":
          throw new Error(`API error: ${JSON.stringify(processed.error)}`);
      }
    }

    const fullContent = this.aggregateContent(chunks);
    return {
      content: fullContent,
      toolCalls,
      stopReason: stopReason ?? "end_turn",
      model: model ?? "unknown",
      usage: usage ?? { inputTokens: 0, outputTokens: 0 },
      needsUserInput: this.checkNeedsUserInput(fullContent, toolCalls),
    };
  }

  private aggregateContent(
    chunks: { type: string; text?: string }[],
  ): string {
    return chunks
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string)
      .join("");
  }

  private checkNeedsUserInput(content: unknown, toolCalls: ToolCall[]): boolean {
    if (toolCalls.some((c) => c.requiresAuthorization)) return true;
    if (typeof content === "string") {
      return /\b(请问|是否|确认|继续|要吗|吗\?)\b/.test(content);
    }
    return false;
  }
}