/**
 * engine/responseHandler.ts — 响应处理器（文档 02 §5.1）
 *
 * 解析流式响应、检测工具调用、聚合内容、判断是否需要用户输入。
 */
import { StreamProcessor, preAnalysis, type PreAnalysisSuggestion } from "./streaming/streamProcessor.ts";
import { containsPlainTextToolCalls, parsePlainTextToolCalls, type PlainTextToolCallBlock } from "../utils/plainTextToolCallRepair.ts";

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

    let fullContent = this.aggregateContent(chunks);

    // 修复纯文本工具调用：某些模型将工具调用以 XML/纯文本形式写入响应内容
    // 而非使用结构化 tool_use block，此处检测并转换
    if (toolCalls.length === 0 && containsPlainTextToolCalls(fullContent)) {
      const parsedBlocks = parsePlainTextToolCalls(fullContent);
      if (parsedBlocks && parsedBlocks.length > 0) {
        for (const block of parsedBlocks) {
          // 将参数值转换为字符串（工具执行器期望字符串类型）
          const stringArgs: Record<string, string> = {};
          for (const [key, val] of Object.entries(block.arguments)) {
            stringArgs[key] = typeof val === 'string' ? val : JSON.stringify(val);
          }
          toolCalls.push({
            id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: block.name,
            input: stringArgs,
          });
        }
        // 从内容中移除已解析的工具调用文本，避免重复显示
        fullContent = "";
        console.log(`[RESP-HANDLER] 修复了 ${toolCalls.length} 个纯文本工具调用`);
      }
    }

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
      .filter((c) => c.type === "text" && c.text != null)
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