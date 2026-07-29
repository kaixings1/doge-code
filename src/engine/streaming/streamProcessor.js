export class StreamProcessor {
    buffer = [];
    currentBlock = null;
    messageStart = null;
    onChunkCallback;
    process(event) {
        switch (event.type) {
            case "message_start":
                this.messageStart = event.message;
                this.buffer = [];
                this.currentBlock = null;
                return { type: "message_start", model: event.message?.model };
            case "content_block_start":
                this.currentBlock = event.content_block;
                return { type: "content_block_start", block: this.currentBlock };
            case "content_block_delta":
                return this.processDelta(event);
            case "content_block_stop":
                return this.processBlockStop(event);
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
        if (!this.currentBlock)
            return { type: "error", error: "没有当前代码块" };
        const delta = event.delta;
        if (delta.type === "text_delta") {
            const chunk = { type: "text", text: delta.text, index: event.index };
            this.buffer.push(chunk);
            if (this.onChunkCallback)
                this.onChunkCallback(chunk);
            return { type: "content_block_delta", chunk };
        }
        if (delta.type === "input_json_delta") {
            const chunk = { type: "tool_use", id: this.currentBlock.id, name: this.currentBlock.name, inputDelta: delta.partial_json, index: event.index };
            this.buffer.push(chunk);
            return { type: "content_block_delta", chunk };
        }
        return { type: "content_block_delta", chunk: null };
    }
    processBlockStop(event) {
        if (!this.currentBlock)
            return { type: "content_block_stop", block: null };
        const blockChunks = this.buffer.filter((c) => c.index === event.index);
        if (this.currentBlock.type === "text") {
            this.currentBlock.text = blockChunks.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        }
        if (this.currentBlock.type === "tool_use") {
            const json = blockChunks.filter((c) => c.type === "tool_use").map((c) => c.inputDelta ?? "").join("");
            try {
                this.currentBlock.input = JSON.parse(json);
            }
            catch {
                this.currentBlock.input = {};
            }
        }
        const block = { ...this.currentBlock };
        this.currentBlock = null;
        return { type: "content_block_stop", block };
    }
}
//# sourceMappingURL=streamProcessor.js.map