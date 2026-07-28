import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    lines: z.number().optional().describe('要裁剪的旧消息数'),
    keepRecent: z.number().optional().describe('保留最近的消息数'),
    target: z.enum(['user', 'assistant', 'system', 'all']).optional().describe('裁剪目标'),
    preserveSystem: z.boolean().optional().describe('是否保留系统消息'),
}));
const outputSchema = lazySchema(() => z.object({
    sniped: z.boolean().describe('裁剪是否成功'),
    linesRemoved: z.number().describe('移除的消息数'),
    linesKept: z.number().describe('保留的消息数'),
    message: z.string().describe('结果消息'),
    removedTypes: z.record(z.number()).optional().describe('按类型统计移除的消息数'),
}));
const MAX_HISTORY = 1000;
const historyStore = [];
function addToHistory(role, content) {
    historyStore.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role,
        content,
        tokens: Math.max(1, Math.ceil(content.length / 4)),
        timestamp: Date.now(),
    });
    if (historyStore.length > MAX_HISTORY) {
        historyStore.shift();
    }
}
export function getHistoryLength() {
    return historyStore.length;
}
export function getRecentHistory(count) {
    return historyStore.slice(-count);
}
export function snipeHistory(lines, keepRecent, preserveSystem) {
    const removedTypes = { user: 0, assistant: 0, system: 0 };
    if (historyStore.length === 0) {
        return { removed: 0, kept: historyStore.length, removedTypes };
    }
    // 按时间排序（最早的在前面）
    const sorted = [...historyStore].sort((a, b) => a.timestamp - b.timestamp);
    const total = sorted.length;
    const toRemove = Math.min(lines, total - keepRecent);
    if (toRemove <= 0) {
        return { removed: 0, kept: total, removedTypes };
    }
    const entriesToRemove = sorted.slice(0, toRemove);
    const idsToRemove = new Set(entriesToRemove.map(e => e.id));
    for (const entry of entriesToRemove) {
        if (preserveSystem && entry.role === 'system')
            continue;
        removedTypes[entry.role]++;
    }
    // 从原始 store 中移除
    for (let i = historyStore.length - 1; i >= 0; i--) {
        if (idsToRemove.has(historyStore[i].id)) {
            const entry = historyStore[i];
            if (preserveSystem && entry.role === 'system')
                continue;
            historyStore.splice(i, 1);
        }
    }
    const kept = historyStore.length;
    return { removed: total - kept, kept, removedTypes };
}
export const SnipTool = buildTool({
    name: 'snip',
    description: async () => '裁剪历史上下文以减少 token 使用量',
    callOn: 'manual',
    async prompt() {
        return '使用 snip 工具裁剪历史上下文以节省 token。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'snip';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const lines = input?.lines ?? '?';
        return `Snip: ${lines} lines`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || 'Snip completed',
        };
    },
    async call({ lines = 100, keepRecent = 50, target = 'all', preserveSystem = true }) {
        const beforeCount = historyStore.length;
        const result = snipeHistory(lines, keepRecent, preserveSystem);
        const afterCount = historyStore.length;
        const rolesRemoved = target !== 'all' ? ` (仅 ${target})` : '';
        const preserved = preserveSystem ? ' (保留系统消息)' : '';
        return {
            data: {
                sniped: result.removed > 0,
                linesRemoved: result.removed,
                linesKept: result.kept,
                removedTypes: result.removedTypes,
                message: `裁剪完成: ${beforeCount} → ${afterCount} 条消息 (移除 ${result.removed}, 保留 ${result.kept})${preserved}${rolesRemoved}`,
            },
        };
    },
});
//# sourceMappingURL=SnipTool.js.map