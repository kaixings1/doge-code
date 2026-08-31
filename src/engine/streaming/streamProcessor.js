/**
 * engine/streaming/streamProcessor.ts — 流式响应处理器（文档 02 §11.2）
 *
 * 解析 SSE/WebSocket 事件，聚合文本增量与工具调用参数，回调实时渲染。
 */
// ─── 预测性 AI 助手：preAnalysis 静态分析 ───
/**
 * preAnalysis — 轻量静态分析，在 AI 流式输出前执行
 * 检测代码中的可改进模式，返回建议列表
 */
export function preAnalysis(content) {
    if (!content)
        return [];
    const suggestions = [];
    const lines = content.split('\n');
    // 检测 TODO/FIXME/HACK
    const todoPattern = /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b|\bOPTIMIZE\b/i;
    lines.forEach((line, i) => {
        if (todoPattern.test(line)) {
            const match = line.match(todoPattern);
            suggestions.push({
                id: `todo-${i}`,
                type: 'todo',
                severity: 'info',
                message: `第 ${i + 1} 行: ${match?.[0] || '标记'} — ${line.trim().slice(0, 60)}`,
                line: i + 1,
            });
        }
    });
    // 检测超长函数（> 80 行）
    let funcStart = -1;
    let funcDepth = 0;
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('function ') || trimmed.startsWith('async function ') ||
            trimmed.startsWith('def ') || trimmed.startsWith('class ')) {
            funcStart = i;
            funcDepth = 0;
        }
        funcDepth += (trimmed.match(/\{/g) || []).length;
        funcDepth -= (trimmed.match(/\}/g) || []).length;
        if (funcStart >= 0 && funcDepth <= 0 && i > funcStart + 80) {
            suggestions.push({
                id: `long-func-${funcStart}`,
                type: 'long-func',
                severity: 'warning',
                message: `第 ${funcStart + 1} 行: 函数超过 80 行 (${i - funcStart + 1} 行)，建议拆分`,
                line: funcStart + 1,
                action: '建议拆分为多个小函数',
            });
            funcStart = -1;
        }
    });
    // 检测重复代码（连续 3+ 行完全相同）
    const seen = new Map();
    for (let i = 0; i < lines.length - 2; i++) {
        const triple = lines.slice(i, i + 3).map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#')).join('\n');
        if (triple.length > 30) {
            const existing = seen.get(triple);
            if (existing) {
                existing.push(i + 1);
            }
            else {
                seen.set(triple, [i + 1]);
            }
        }
    }
    for (const [block, lineNums] of seen) {
        if (lineNums.length > 1) {
            suggestions.push({
                id: `dup-${lineNums[0]}`,
                type: 'duplicate',
                severity: 'suggestion',
                message: `第 ${lineNums.join(', ')} 行: 发现 ${lineNums.length} 处重复代码块，建议提取为公共函数`,
                line: lineNums[0],
            });
        }
    }
    // 检测深度嵌套（> 4 层）
    lines.forEach((line, i) => {
        const indent = line.length - line.trimStart().length;
        const nest = Math.floor(indent / 2);
        if (nest > 4) {
            suggestions.push({
                id: `complex-${i}`,
                type: 'complex',
                severity: 'warning',
                message: `第 ${i + 1} 行: 嵌套深度 ${nest} 层，建议简化逻辑或提取函数`,
                line: i + 1,
            });
        }
    });
    // 检测废弃 API
    const deprecatedPatterns = [
        { pattern: /@deprecated/i, label: 'deprecated 注解' },
        { pattern: /\bcomponentWillMount\b/i, label: 'componentWillMount (已废弃)' },
        { pattern: /\bcomponentWillReceiveProps\b/i, label: 'componentWillReceiveProps (已废弃)' },
    ];
    lines.forEach((line, i) => {
        for (const dp of deprecatedPatterns) {
            if (dp.pattern.test(line)) {
                suggestions.push({
                    id: `deprecated-${i}-${dp.label}`,
                    type: 'deprecated',
                    severity: 'warning',
                    message: `第 ${i + 1} 行: 使用 ${dp.label}`,
                    line: i + 1,
                });
            }
        }
    });
    return suggestions.slice(0, 20);
}
export class StreamProcessor {
    constructor() {
        this.buffer = [];
        this.currentBlock = null;
        this.messageStart = null;
    }
    process(event) {
        const eventType = event.type;
        if (eventType === 'content_block_start' || eventType === 'content_block_stop' || eventType === 'message_delta' || eventType === 'message_start') {
            console.log(`[STREAM-PROC] event type=${eventType}`, JSON.stringify(event).slice(0, 400));
        }
        switch (eventType) {
            case "message_start":
                this.buffer = [];
                this.currentBlock = null;
                this.messageStart = event.message;
                return { type: "message_start", model: event.message?.model };
            case "content_block_start": {
                const cb = event.content_block;
                this.currentBlock = cb.input !== null && cb.input !== undefined
                    ? { type: cb.type, id: cb.id, name: cb.name, input: cb.input }
                    : { type: cb.type, id: cb.id, name: cb.name };
                console.log(`[STREAM-PROC] content_block_start type=${cb.type} id=${cb.id} name=${cb.name} currentBlockSet=true`);
                return { type: "content_block_start", block: this.currentBlock };
            }
            case "content_block_delta":
                return this.processDelta(event);
            case "content_block_stop": {
                const idx = event.index;
                console.log(`[STREAM-PROC] content_block_stop index=${idx} currentBlockType=${this.currentBlock?.type ?? 'null'} currentBlockId=${this.currentBlock?.id ?? 'null'}`);
                const result = this.processBlockStop(event);
                console.log(`[STREAM-PROC] content_block_stop result blockType=${result.block?.type ?? 'null'} blockId=${result.block?.id ?? 'null'}`);
                return result;
            }
            case "message_delta":
                return {
                    type: "message_delta",
                    stopReason: event.delta?.stop_reason,
                    usage: event.delta?.usage,
                };
            case "message_stop":
                return { type: "message_stop" };
            case "error":
                return { type: "error", error: event.error };
            default:
                return { type: "unknown", data: event };
        }
    }
    processDelta(event) {
        if (!this.currentBlock) {
            console.warn(`[STREAM-PROC] processDelta but currentBlock is null, delta type=${event.delta.type}`);
            return { type: "content_block_delta", chunk: null };
        }
        const delta = event.delta;
        if (delta.type === "text_delta") {
            const chunk = { type: "text", text: delta.text, index: event.index };
            this.buffer.push(chunk);
            return { type: "content_block_delta", chunk };
        }
        if (delta.type === "input_json_delta") {
            const chunk = { type: "tool_use", id: this.currentBlock.id, name: this.currentBlock.name, inputDelta: delta.partial_json, index: event.index };
            this.buffer.push(chunk);
            return { type: "content_block_delta", chunk };
        }
        console.log(`[STREAM-PROC] unexpected delta type=${delta.type} keys=${Object.keys(delta).join(',')}`);
        return { type: "content_block_delta", chunk: null };
    }
    processBlockStop(event) {
        if (!this.currentBlock)
            return { type: "content_block_stop", block: null };
        const blockChunks = this.buffer.filter((c) => c.index === event.index);
        if (this.currentBlock.type === "text") {
            const fullText = blockChunks.filter((c) => c.type === "text").map((c) => c.text || "").join("");
            this.currentBlock.text = fullText;
        }
        if (this.currentBlock.type === "tool_use") {
            if (this.currentBlock.input === null || this.currentBlock.input === undefined) {
                const json = blockChunks.filter((c) => c.type === "tool_use").map((c) => c.inputDelta ?? "").join("");
                console.log(`[STREAM-PROC] processBlockStop index=${event.index} blockType=tool_use blockChunks=${blockChunks.length} json="${json.slice(0, 200)}"`);
                try {
                    this.currentBlock.input = JSON.parse(json);
                    console.log(`[STREAM-PROC] parsed input:`, JSON.stringify(this.currentBlock.input).slice(0, 200));
                }
                catch (e) {
                    console.log(`[STREAM-PROC] JSON.parse failed:`, e instanceof Error ? e.message : String(e));
                    console.log(`[STREAM-PROC] raw json: "${json}"`);
                    // Strip trailing incomplete tokens (e.g. partial strings like "dir)
                    const cleaned = json.replace(/"\s*$/, '').trim();
                    try {
                        this.currentBlock.input = JSON.parse(cleaned);
                        console.log(`[STREAM-PROC] parsed input after cleanup:`, JSON.stringify(this.currentBlock.input).slice(0, 200));
                    }
                    catch {
                        this.currentBlock.input = {};
                    }
                }
            }
        }
        const block = { ...this.currentBlock };
        this.currentBlock = null;
        return { type: "content_block_stop", block };
    }
}
