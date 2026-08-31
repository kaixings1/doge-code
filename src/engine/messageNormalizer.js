export class MessageNormalizer {
    /**
     * validateRoles — 确保消息序列中 user/assistant/tool 角色交替出现。
     *
     * 吸收自 aider 的 ensure_alternating_roles() 和 sanity_check_messages()。
     * 当检测到连续相同角色时，自动合并内容到前一条消息。
     */
    static validateRoles(messages) {
        const issues = [];
        const fixed = [];
        let lastRole = null;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const role = msg.role;
            // 跳过 system（system 消息不参与交替检查）
            if (role === 'system') {
                fixed.push(msg);
                continue;
            }
            // 检查连续相同角色
            if (lastRole === role) {
                issues.push(`连续 ${role} 消息（索引 ${i - 1} -> ${i}）`);
                // 合并到前一条消息
                if (fixed.length > 0) {
                    const prev = fixed[fixed.length - 1];
                    if (typeof prev.content === 'string' && typeof msg.content === 'string') {
                        prev.content = `${prev.content}\n${msg.content}`;
                    }
                    else if (Array.isArray(prev.content) && Array.isArray(msg.content)) {
                        prev.content = [...prev.content, ...msg.content];
                    }
                }
            }
            else {
                fixed.push({ ...msg });
            }
            lastRole = role;
        }
        return {
            valid: issues.length === 0,
            fixed,
            issues,
        };
    }
    normalize(messages, provider) {
        const validation = MessageNormalizer.validateRoles(messages);
        if (!validation.valid) {
            console.warn('[MessageNormalizer] 检测到连续相同角色消息，已自动合并:', validation.issues.join('; '));
        }
        const sourceMessages = validation.valid ? messages : validation.fixed;
        return provider === "anthropic"
            ? this.normalizeForAnthropic(sourceMessages)
            : this.normalizeForOpenAI(sourceMessages);
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
                const blocks = Array.isArray(msg.content) ? msg.content : [];
                const textParts = [];
                const toolCalls = [];
                for (const block of blocks) {
                    if (block.type === "text" && typeof block.text === "string") {
                        textParts.push(block.text);
                    }
                    else if (block.type === "tool_use") {
                        toolCalls.push({
                            id: block.id,
                            type: "function",
                            function: {
                                name: block.name,
                                arguments: JSON.stringify(block.input ?? {}),
                            },
                        });
                    }
                }
                const openAIMsg = {
                    role: "assistant",
                    content: textParts.length > 0 ? textParts.join("") : "",
                };
                if (toolCalls.length > 0) {
                    openAIMsg.tool_calls = toolCalls;
                }
                result.push(openAIMsg);
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
