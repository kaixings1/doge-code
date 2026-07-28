import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    source: z.string().describe('事件源名称'),
    action: z.enum(['subscribe', 'unsubscribe', 'list', 'publish', 'history']).describe('事件流操作'),
    eventType: z.string().optional().describe('事件类型（publish 时使用）'),
    data: z.string().optional().describe('事件数据（JSON 字符串）'),
    limit: z.number().optional().describe('返回事件数量限制'),
}));
const outputSchema = lazySchema(() => z.object({
    active: z.boolean().describe('订阅是否活跃'),
    events: z.array(z.string()).optional().describe('事件列表'),
    message: z.string().optional().describe('状态消息'),
    subscribers: z.number().optional().describe('订阅者数量'),
    eventId: z.string().optional().describe('已发布事件的 ID'),
}));
const MAX_EVENTS_PER_SOURCE = 500;
const MAX_SUBSCRIPTIONS = 100;
const eventStore = new Map();
const subscriptions = new Map();
let subCounter = 0;
function getOrCreateSource(source) {
    const events = eventStore.get(source);
    if (!events) {
        const newEvents = [];
        eventStore.set(source, newEvents);
        return newEvents;
    }
    return events;
}
function addEvent(source, event) {
    const events = getOrCreateSource(source);
    events.push(event);
    if (events.length > MAX_EVENTS_PER_SOURCE) {
        events.splice(0, events.length - MAX_EVENTS_PER_SOURCE);
    }
}
export const EventStreamTool = buildTool({
    name: 'event-stream',
    description: async () => '事件流管理（subscribe/unsubscribe/publish/history/list）',
    callOn: 'manual',
    async prompt() {
        return '使用 event-stream 工具管理事件流订阅和发布。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'event-stream';
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
        const source = input?.source ?? '';
        return `EventStream: ${action} ${source}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || '事件流操作完成',
        };
    },
    async call({ source, action, eventType, data, limit = 50 }) {
        switch (action) {
            case 'subscribe': {
                if (!source) {
                    return { data: { active: false, message: 'subscribe 需要 source 参数' } };
                }
                const subId = `sub_${++subCounter}_${Date.now()}`;
                const subscription = {
                    id: subId,
                    source,
                    eventType,
                    createdAt: Date.now(),
                };
                subscriptions.set(subId, subscription);
                const sourceSubs = Array.from(subscriptions.values()).filter(s => s.source === source);
                return {
                    data: {
                        active: true,
                        message: `已订阅 "${source}"${eventType ? ` (类型: ${eventType})` : ''}，订阅ID: ${subId}`,
                        subscribers: sourceSubs.length,
                    },
                };
            }
            case 'unsubscribe': {
                const subToRemove = Array.from(subscriptions.entries()).find(([, s]) => s.source === source);
                if (!subToRemove) {
                    return { data: { active: false, message: `未找到对 "${source}" 的订阅` } };
                }
                const [removedId] = subToRemove;
                subscriptions.delete(removedId);
                const remaining = Array.from(subscriptions.values()).filter(s => s.source === source).length;
                return {
                    data: {
                        active: false,
                        message: `已取消订阅 "${source}" (ID: ${removedId})，剩余 ${remaining} 个订阅`,
                        subscribers: remaining,
                    },
                };
            }
            case 'publish': {
                if (!source || !eventType) {
                    return { data: { active: false, message: 'publish 需要 source 和 eventType 参数' } };
                }
                let parsedData = data;
                if (data) {
                    try {
                        parsedData = JSON.parse(data);
                    }
                    catch {
                        parsedData = data;
                    }
                }
                const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const event = {
                    id: eventId,
                    type: eventType,
                    source,
                    data: parsedData,
                    timestamp: Date.now(),
                };
                addEvent(source, event);
                return {
                    data: {
                        active: true,
                        eventId,
                        message: `事件已发布到 "${source}": ${eventType}`,
                    },
                };
            }
            case 'history': {
                const events = eventStore.get(source) ?? [];
                const limited = events.slice(-limit);
                const eventStrings = limited.map(e => `[${new Date(e.timestamp).toISOString()}] ${e.type}: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}`);
                return {
                    data: {
                        active: true,
                        events: eventStrings,
                        message: `"${source}" 的历史事件 (${limited.length}/${events.length})`,
                    },
                };
            }
            case 'list': {
                const sources = Array.from(eventStore.keys());
                const sourceInfo = sources.map(s => {
                    const events = eventStore.get(s) ?? [];
                    const subs = Array.from(subscriptions.values()).filter(sub => sub.source === s).length;
                    return { source: s, events: events.length, subscribers: subs };
                });
                const sourceList = sourceInfo.map(s => `${s.source} (${s.events} events, ${s.subscribers} subs)`).join('\n');
                return {
                    data: {
                        active: true,
                        events: sourceInfo.map(s => JSON.stringify(s)),
                        message: sources.length > 0 ? `活跃源 (${sources.length}):\n${sourceList}` : '无活跃事件流',
                    },
                };
            }
        }
    },
});
//# sourceMappingURL=EventStreamTool.js.map