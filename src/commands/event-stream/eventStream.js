import { EventEmitter } from 'events';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
class EventStream extends EventEmitter {
    history = [];
    storageFile;
    constructor() {
        super();
        this.storageFile = join(process.cwd(), '.doge', 'events.json');
        this.load();
        this.setMaxListeners(50);
    }
    load() {
        if (existsSync(this.storageFile)) {
            try {
                const data = JSON.parse(readFileSync(this.storageFile, 'utf-8'));
                this.history = data.history || [];
            }
            catch (e) {
                console.error('Failed to load events:', e);
            }
        }
    }
    save() {
        try {
            const dir = join(this.storageFile, '..');
            if (!existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.storageFile, JSON.stringify({
                history: this.history.slice(-1000),
                savedAt: new Date().toISOString()
            }, null, 2));
        }
        catch (e) {
            console.error('Failed to save events:', e);
        }
    }
    publish(event, data) {
        const eventData = { event, data, time: new Date().toISOString() };
        this.history.push(eventData);
        this.emit(event, eventData);
        this.emit('*', eventData);
        if (this.history.length % 10 === 0) {
            this.save();
        }
    }
    subscribe(event, callback) {
        const id = `sub_${Date.now()}`;
        this.on(event, callback);
        return id;
    }
    getHistory(event, limit = 50) {
        let history = [...this.history].reverse();
        if (event) {
            history = history.filter(h => h.event === event);
        }
        return history.slice(0, limit);
    }
    getStats() {
        const events = new Map();
        this.history.forEach(h => {
            events.set(h.event, (events.get(h.event) || 0) + 1);
        });
        return {
            total: this.history.length,
            byEvent: Object.fromEntries(events),
            listeners: this.eventNames().length
        };
    }
    getChannel(name) {
        return {
            name,
            type: 'pubsub',
            subscribers: this.listenerCount(name),
            messagesPerSecond: 0,
            status: 'active'
        };
    }
    listChannels() {
        const names = this.eventNames();
        if (names.length === 0)
            return [{ name: 'default', type: 'pubsub', subscribers: 0, messagesPerSecond: 0, status: 'inactive' }];
        return names.map(n => ({
            name: n,
            type: typeof n === 'string' && n.startsWith('sub_') ? 'websocket' : 'pubsub',
            subscribers: this.listenerCount(n),
            messagesPerSecond: 0,
            status: 'active'
        }));
    }
    clear() {
        const count = this.history.length;
        this.history = [];
        this.save();
        return count;
    }
}
const eventStream = new EventStream();
export async function call(args, context) {
    if (!args || args.trim() === '') {
        const stats = eventStream.getStats();
        return `## event-stream \u4e8b\u4ef6\u6d41\u7cfb\u7edf\n\u7edf\u8ba1:\n- \u603b\u4e8b\u4ef6: ${stats.total}\n- \u76d1\u542c\u5668: ${stats.listeners}\n- \u5b58\u50a8: .doge/events.json\n\n\u7528\u6cd5:\n- /event-stream list [\u4e8b\u4ef6] - \u5217\u51fa\u4e8b\u4ef6\n- /event-stream subscribe <\u4e8b\u4ef6> - \u8ba2\u9605\n- /event-stream publish <\u4e8b\u4ef6> <\u6570\u636e> - \u53d1\u5e03\n- /event-stream history [\u4e8b\u4ef6] [\u6570\u91cf] - \u5386\u53f2\n- /event-stream stats - \u7edf\u8ba1\n- /event-stream clear - \u6e05\u7a7a\n\n\u793a\u4f8b:\n/event-stream publish test '{"message": "hello"}'\n/event-stream history test 10`;
    }
    const parts = args.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    if (command === 'list' || command === 'channels') {
        const channels = eventStream.listChannels();
        const result = channels.map((c) => `  ${c.name.padEnd(20)} | ${c.type.padEnd(10)} | ${c.status.padEnd(10)} | ${String(c.subscribers).padEnd(3)} 订阅者`).join('\n');
        return `## event-stream 频道列表:\n\n${result}\n\n总频道数: ${channels.length}`;
    }
    if (command === 'subscribe' && parts.length >= 2) {
        const event = parts[1];
        const id = eventStream.subscribe(event, (data) => {
            console.log(`[${event}]`, data);
        });
        const channel = eventStream.getChannel(event);
        return `## event-stream 订阅成功:\n- 事件: ${event}\n- ID: ${id}\n- 类型: ${channel.type}\n- 状态: ${channel.status}\n- 输出: 控制台`;
    }
    if (command === 'unsubscribe' && parts.length >= 2) {
        const event = parts[1];
        eventStream.removeAllListeners(event);
        return `## event-stream 已取消订阅:\n- 事件: ${event}`;
    }
    if (command === 'publish' && parts.length >= 2) {
        const event = parts[1];
        const data = parts.slice(2).join(' ') || '{}';
        let parsedData;
        try {
            parsedData = JSON.parse(data);
        }
        catch {
            parsedData = data;
        }
        eventStream.publish(event, parsedData);
        return `## event-stream 发布成功:\n- 事件: ${event}\n- 数据: ${typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)}`;
    }
    if (command === 'history') {
        const event = parts[1];
        const limit = parts[2] ? parseInt(parts[2]) : 20;
        const history = eventStream.getHistory(event, limit);
        if (history.length === 0) {
            return `## event-stream 历史记录为空${event ? ` (事件: ${event})` : ''}`;
        }
        const list = history.map(h => `[${new Date(h.time).toLocaleString()}] ${h.event}: ${typeof h.data === 'string' ? h.data : JSON.stringify(h.data)}`).join('\n');
        return `## event-stream 历史记录${event ? ` (事件: ${event})` : ''}:\n${list}`;
    }
    if (command === 'stats' || command === 'status') {
        const stats = eventStream.getStats();
        const channels = eventStream.listChannels();
        const events = Object.entries(stats.byEvent)
            .map(([e, c]) => `- ${e}: ${c} 次`)
            .join('\n');
        return `## event-stream 统计:\n- 总事件: ${stats.total}\n- 事件类型: ${Object.keys(stats.byEvent).length}\n- 监听器: ${stats.listeners}\n\n频道状态:\n${channels.map((c) => `  ${c.name}: ${c.status} (${c.subscribers} 订阅者)`).join('\n')}\n\n事件统计:\n${events || '暂无事件'}`;
    }
    if (command === 'clear') {
        const count = eventStream.clear();
        return `## event-stream 已清空:\n- 移除事件: ${count} 个`;
    }
    return `## event-stream 命令: ${args}\n可用: list, subscribe, unsubscribe, publish, history, stats/status, clear`;
}
//# sourceMappingURL=eventStream.js.map