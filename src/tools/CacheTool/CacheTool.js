import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['get', 'set', 'delete', 'clear', 'list']).describe('缓存操作'),
    key: z.string().optional().describe('缓存键'),
    value: z.string().optional().describe('缓存值'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    keys: z.array(z.string()).optional().describe('缓存键列表'),
    value: z.string().optional().describe('缓存值'),
    message: z.string().optional().describe('结果消息'),
}));
const cacheStore = new Map();
function pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of cacheStore) {
        if (entry.expiresAt !== null && now >= entry.expiresAt) {
            cacheStore.delete(key);
        }
    }
}
export const CacheTool = buildTool({
    name: 'cache',
    description: async () => '管理缓存操作（get/set/delete/clear/list）',
    callOn: 'manual',
    async prompt() {
        return '使用 cache 工具管理缓存。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'cache';
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
        const action = input?.action ?? '?';
        const key = input?.key;
        return `Cache: ${action}${key ? ` (${key})` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || '缓存操作完成',
        };
    },
    async call({ action, key, value }) {
        pruneExpired();
        switch (action) {
            case 'set': {
                if (!key || value === undefined) {
                    return { data: { success: false, message: 'set 操作需要 key 和 value 参数' } };
                }
                cacheStore.set(key, { value, expiresAt: null });
                return { data: { success: true, message: `缓存已设置: ${key}` } };
            }
            case 'get': {
                if (!key) {
                    return { data: { success: false, message: 'get 操作需要 key 参数' } };
                }
                const entry = cacheStore.get(key);
                if (!entry) {
                    return { data: { success: true, value: '', message: `key "${key}" 不存在` } };
                }
                return { data: { success: true, value: entry.value } };
            }
            case 'delete': {
                if (!key) {
                    return { data: { success: false, message: 'delete 操作需要 key 参数' } };
                }
                const existed = cacheStore.delete(key);
                return { data: { success: true, message: existed ? `已删除: ${key}` : `key "${key}" 不存在` } };
            }
            case 'clear': {
                cacheStore.clear();
                return { data: { success: true, message: '缓存已清空' } };
            }
            case 'list': {
                return {
                    data: {
                        success: true,
                        keys: Array.from(cacheStore.keys()),
                    },
                };
            }
        }
    },
});
