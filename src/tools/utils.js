/**
 * 使用 sourceToolUseID 标记用户消息，使消息保持短暂性直到工具解析完成。
 * 这可以防止 UI 中出现重复的"正在运行"消息。
 */
export function tagMessagesWithToolUseID(messages, toolUseID) {
    if (!toolUseID) {
        return messages;
    }
    return messages.map(m => {
        if (m.type === 'user') {
            return { ...m, sourceToolUseID: toolUseID };
        }
        return m;
    });
}
/**
 * 从父消息中提取指定工具名的工具使用 ID。
 */
export function getToolUseIDFromParentMessage(parentMessage, toolName) {
    const toolUseBlock = parentMessage.message.content.find(block => block.type === 'tool_use' && block.name === toolName);
    return toolUseBlock && toolUseBlock.type === 'tool_use'
        ? toolUseBlock.id
        : undefined;
}
//# sourceMappingURL=utils.js.map