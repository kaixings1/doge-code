import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { watch } from 'node:fs';
const inputSchema = lazySchema(() => z.object({
    path: z.string().describe('监视路径'),
    pattern: z.string().optional().describe('文件匹配模式（glob）'),
    action: z.enum(['start', 'stop', 'list']).describe('操作'),
}));
const outputSchema = lazySchema(() => z.object({
    active: z.boolean().describe('监视器是否活跃'),
    watching: z.array(z.string()).describe('监视路径列表'),
    message: z.string().optional().describe('状态消息'),
}));
const watcherStore = new Map();
const watcherInstances = new Map();
function generateWatcherId() {
    return `watcher_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
export const FileWatcherTool = buildTool({
    name: 'file-watcher',
    description: async () => '监视文件系统变化（start/stop/list）',
    callOn: 'manual',
    async prompt() {
        return '使用 file-watcher 工具监视文件变化。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'file-watcher';
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
        const path = input?.path ?? '';
        return `FileWatcher: ${action} ${path.substring(0, 40)}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const msg = content.message || '文件监视器操作完成';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ path, pattern, action }) {
        switch (action) {
            case 'start': {
                if (!path) {
                    return { data: { active: false, watching: [], message: 'start 操作需要 path 参数' } };
                }
                const id = generateWatcherId();
                const entry = {
                    id,
                    path,
                    pattern,
                    startedAt: new Date().toISOString(),
                    events: [],
                };
                watcherStore.set(id, entry);
                try {
                    const watcher = watch(path, { recursive: true }, eventType => {
                        entry.events.push(`${eventType}@${new Date().toISOString()}`);
                        if (entry.events.length > 100)
                            entry.events.shift();
                    });
                    watcherInstances.set(id, watcher);
                    return {
                        data: {
                            active: true,
                            watching: [path],
                            message: `开始监视 ${path}${pattern ? ` (${pattern})` : ''}`,
                        },
                    };
                }
                catch (err) {
                    watcherStore.delete(id);
                    return {
                        data: {
                            active: false,
                            watching: [],
                            message: `启动监视失败: ${err instanceof Error ? err.message : String(err)}`,
                        },
                    };
                }
            }
            case 'stop': {
                const entryToStop = Array.from(watcherStore.values()).find(w => w.path === path);
                if (!entryToStop) {
                    return { data: { active: false, watching: [], message: `未找到监视 ${path} 的监视器` } };
                }
                const watcherInstance = watcherInstances.get(entryToStop.id);
                if (watcherInstance) {
                    watcherInstance.close();
                    watcherInstances.delete(entryToStop.id);
                }
                watcherStore.delete(entryToStop.id);
                return {
                    data: {
                        active: false,
                        watching: [],
                        message: `已停止监视 ${path}（记录了 ${entryToStop.events.length} 个事件）`,
                    },
                };
            }
            case 'list': {
                const watching = Array.from(watcherStore.values()).map(w => w.path);
                const active = watcherInstances.size > 0;
                return {
                    data: {
                        active,
                        watching,
                        message: `活跃监视器: ${watcherInstances.size} 个`,
                    },
                };
            }
        }
    },
});
//# sourceMappingURL=FileWatcherTool.js.map