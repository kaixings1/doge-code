/**
 * Shared infrastructure for classifier-based permission systems.
 *
 * This module provides common types, schemas, and utilities used by both:
 * - bashClassifier.ts (semantic Bash command matching)
 * - yoloClassifier.ts (YOLO mode security classification)
 */
/**
 * Extract tool use block from message content by tool name.
 */
export function extractToolUseBlock(content, toolName) {
    const block = content.find(b => b.type === 'tool_use' && b.name === toolName);
    if (!block || block.type !== 'tool_use') {
        return null;
    }
    return block;
}
/**
 * Parse and validate classifier response from tool use block.
 * Returns null if parsing fails.
 */
export function parseClassifierResponse(toolUseBlock, schema) {
    const parseResult = schema.safeParse(toolUseBlock.input);
    if (!parseResult.success) {
        return null;
    }
    return parseResult.data;
}
