/**
 * engine/responseHandler.ts — 响应处理器（文档 02 §5.1）
 *
 * 解析流式响应、检测工具调用、聚合内容、判断是否需要用户输入。
 */
import { StreamProcessor } from "./streaming/streamProcessor.ts";
export class ResponseHandler {
    streamProcessor = new StreamProcessor();
    onChunk;
    async handle(stream) {
        const chunks = [];
        const toolCalls = [];
        let stopReason = null;
        let model = null;
        let usage = null;
        for await (const event of stream) {
            const processed = this.streamProcessor.process(event);
            switch (processed.type) {
                case "content_block_delta":
                    if (processed.chunk) {
                        chunks.push(processed.chunk);
                        if (this.onChunk)
                            this.onChunk(processed.chunk);
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
                    if (processed.stopReason)
                        stopReason = processed.stopReason;
                    if (processed.usage)
                        usage = processed.usage;
                    break;
                case "message_start":
                    if (processed.model)
                        model = processed.model;
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
    aggregateContent(chunks) {
        return chunks
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("");
    }
    checkNeedsUserInput(content, toolCalls) {
        if (toolCalls.some((c) => c.requiresAuthorization))
            return true;
        if (typeof content === "string") {
            return /\b(请问|是否|确认|继续|要吗|吗\?)\b/.test(content);
        }
        return false;
    }
}
