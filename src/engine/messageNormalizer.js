export class MessageNormalizer {
    normalize(messages, provider) {
        return provider === "anthropic"
            ? this.normalizeForAnthropic(messages)
            : this.normalizeForOpenAI(messages);
    }
    normalizeForAnthropic(messages) {
        const result = [];
        for (const msg of messages) {
            if (msg.role === "system")
                continue; // Anthropic system 单独处理
            if (msg.role === "user") {
                result.push({ role: "user", content: this.asStringOrArray(msg.content) });
            }
            else if (msg.role === "assistant") {
                result.push({ role: "assistant", content: this.asStringOrArray(msg.content) });
            }
            else if (msg.role === "tool" && msg.toolUseId) {
                result.push({
                    role: "user",
                    content: [{ type: "tool_result", tool_use_id: msg.toolUseId, content: this.asString(msg.content) }],
                });
            }
        }
        return this.mergeConsecutive(result);
    }
    normalizeForOpenAI(messages) {
        const result = [];
        for (const msg of messages) {
            if (msg.role === "system") {
                result.push({ role: "system", content: this.asString(msg.content) });
            }
            else if (msg.role === "user") {
                result.push({ role: "user", content: this.asString(msg.content) });
            }
            else if (msg.role === "assistant") {
                result.push({ role: "assistant", content: this.asString(msg.content) });
            }
            else if (msg.role === "tool" && msg.toolUseId) {
                result.push({ role: "tool", tool_call_id: msg.toolUseId, content: this.asString(msg.content) });
            }
        }
        return result;
    }
    asString(c) {
        if (typeof c === "string")
            return c;
        try {
            return JSON.stringify(c);
        }
        catch {
            return String(c);
        }
    }
    asStringOrArray(c) {
        return typeof c === "string" ? c : c;
    }
    mergeConsecutive(messages) {
        if (messages.length <= 1)
            return messages;
        const out = [messages[0]];
        for (let i = 1; i < messages.length; i++) {
            const prev = out[out.length - 1];
            const curr = messages[i];
            if (prev.role === curr.role) {
                prev.content = `${this.asString(prev.content)}\n${this.asString(curr.content)}`;
            }
            else {
                out.push(curr);
            }
        }
        return out;
    }
}
