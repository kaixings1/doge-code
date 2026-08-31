/**
 * engine/responseHandler.ts — 响应处理器（文档 02 §5.1）
 *
 * 解析流式响应、检测工具调用、聚合内容、判断是否需要用户输入。
 */
import { StreamProcessor } from "./streaming/streamProcessor.ts";
import { extractPlainTextToolCalls, parsePlainTextToolCalls, stripPlainTextToolCalls } from "../utils/plainTextToolCallRepair.ts";
const DEFAULT_TRUNCATION = {
    maxOutputChars: 20000,
    truncationMarker: '...[truncated, output budget exceeded]',
};
export class ResponseHandler {
    constructor() {
        this.streamProcessor = new StreamProcessor();
    }
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
                            input: processed.block.input != null &&
                                typeof processed.block.input === 'object'
                                ? processed.block.input
                                : {},
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
        let fullContent = this.aggregateContent(chunks);
        // 修复纯文本工具调用：某些模型将工具调用以 XML/纯文本形式写入响应内容
        // 而非使用结构化 tool_use block，此处检测并转换。
        // 支持两种形态：
        //   1) 整段文本 100% 是工具调用 -> parsePlainTextToolCalls，正文清空
        //   2) 工具调用与正文混杂 -> extractPlainTextToolCalls 提取 + strip 剥离
        if (toolCalls.length === 0) {
            let converted = 0;
            const pushBlocks = (blocks) => {
                for (const block of blocks) {
                    // 将参数值转换为字符串（工具执行器期望字符串类型）
                    const stringArgs = {};
                    for (const [key, val] of Object.entries(block.arguments)) {
                        stringArgs[key] = typeof val === 'string' ? val : JSON.stringify(val);
                    }
                    toolCalls.push({
                        id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        name: block.name,
                        input: stringArgs,
                    });
                    converted++;
                }
            };
            // 情形 1：整段纯工具调用
            const parsedBlocks = parsePlainTextToolCalls(fullContent);
            if (parsedBlocks && parsedBlocks.length > 0) {
                pushBlocks(parsedBlocks);
                fullContent = "";
            }
            else {
                // 情形 2：与正文混杂，逐行扫描提取工具块，并仅剥离工具块正文
                const mixedBlocks = extractPlainTextToolCalls(fullContent);
                if (mixedBlocks.length > 0) {
                    pushBlocks(mixedBlocks);
                    fullContent = stripPlainTextToolCalls(fullContent);
                }
            }
            if (converted > 0) {
                console.log(`[RESP-HANDLER] 修复了 ${converted} 个纯文本工具调用`);
            }
        }
        const result = {
            content: fullContent,
            toolCalls,
            stopReason: stopReason ?? "end_turn",
            model: model ?? "unknown",
            usage: usage ?? { inputTokens: 0, outputTokens: 0 },
            needsUserInput: this.checkNeedsUserInput(fullContent, toolCalls),
        };
        // 自适应输出截断（吸收自 codegraph 输出预算）
        result.content = this.truncateContent(result.content);
        return result;
    }
    aggregateContent(chunks) {
        return chunks
            .filter((c) => c.type === "text" && c.text != null)
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
    /** 自适应输出截断（吸收自 codegraph 输出预算）：超过阈值时保留开头并标记截断 */
    truncateContent(content, config) {
        const { maxOutputChars, truncationMarker } = { ...DEFAULT_TRUNCATION, ...config };
        if (typeof content === 'string' && content.length > maxOutputChars) {
            return content.slice(0, maxOutputChars) + truncationMarker;
        }
        return content;
    }
}
