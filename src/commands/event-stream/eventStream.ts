import { EventEmitter } from 'events'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path' class EventStream extends EventEmitter { private history: Array<{event: string, data: any, time: string}> = [] private storageFile: string constructor() { super() this.storageFile = join(process.cwd(), '.doge', 'events.json') this.load() this.setMaxListeners(50) } private load(): void { if (existsSync(this.storageFile)) { try { const data = JSON.parse(readFileSync(this.storageFile, 'utf-8')) this.history = data.history || [] } catch (e) { console.error('Failed to load events:', e) } } } private save(): void { try { const dir = join(this.storageFile, '..') if (!existsSync(dir)) { require('fs').mkdirSync(dir, { recursive: true }) } writeFileSync(this.storageFile, JSON.stringify({ history: this.history.slice(-1000), savedAt: new Date().toISOString() }, null, 2)) } catch (e) { console.error('Failed to save events:', e) } } publish(event: string, data: any): void { const eventData = { event, data, time: new Date().toISOString() } this.history.push(eventData) this.emit(event, eventData) this.emit('*', eventData) if (this.history.length % 10 === 0) { this.save() } } subscribe(event: string, callback: (data: any) => void): string { const id = `sub_${Date.now()}` this.on(event, callback) return id } getHistory(event?: string, limit: number = 50): any[] { let history = [...this.history].reverse() if (event) { history = history.filter(h => h.event === event) } return history.slice(0, limit) } getStats(): any { const events = new Map<string, number>() this.history.forEach(h => { events.set(h.event, (events.get(h.event) || 0) + 1) }) return { total: this.history.length, byEvent: Object.fromEntries(events), listeners: this.eventNames().length } } clear(): number { const count = this.history.length this.history = [] this.save() return count }
} const eventStream = new EventStream() export async function call(args: string, context: any): Promise<string> { if (!args || args.trim() === '') { const stats = eventStream.getStats() return `## event-stream 事件流系统 统计:
- 总事件: ${stats.total}
- 监听器: ${stats.listeners}
- 存储: .doge/events.json 用法:
- /event-stream list [事件] - 列出事件
- /event-stream subscribe <事件> - 订阅
- /event-stream publish <事件> <数据> - 发布
- /event-stream history [事件] [数量] - 历史
- /event-stream stats - 统计
- /event-stream clear - 清空 示例:
/event-stream publish test '{"message": "hello"}'
/event-stream history test 10` } const parts = args.trim().split(//s+/) const command = parts[0].toLowerCase() if (command === 'list') { const event = parts[1] const listeners = eventStream.eventNames() if (event) { const count = eventStream.listenerCount(event) return `## event-stream 事件: ${event}
监听器: ${count} 个` } return `## event-stream 活跃事件:
${listeners.map(e => `- ${e}: ${eventStream.listenerCount(e)} 个监听器`).join('/n')}` } if (command === 'subscribe' && parts.length >= 2) { const event = parts[1] const id = eventStream.subscribe(event, (data) => { console.log(`[${event}]`, data) }) return `## event-stream 订阅成功:
- 事件: ${event}
- ID: ${id}
- 输出: 控制台` } if (command === 'publish' && parts.length >= 2) { const event = parts[1] const data = parts.slice(2).join(' ') || '{}' let parsedData: any try { parsedData = JSON.parse(data) } catch { parsedData = data } eventStream.publish(event, parsedData) return `## event-stream 发布成功:
- 事件: ${event}
- 数据: ${typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)}` } if (command === 'history') { const event = parts[1] const limit = parts[2] ? parseInt(parts[2]) : 20 const history = eventStream.getHistory(event, limit) if (history.length === 0) { return `## event-stream 历史记录为空${event ? ` (事件: ${event})` : ''}` } const list = history.map(h => `[${new Date(h.time).toLocaleString()}] ${h.event}: ${typeof h.data === 'string' ? h.data : JSON.stringify(h.data)}` ).join('/n') return `## event-stream 历史记录${event ? ` (事件: ${event})` : ''}:
${list}` } if (command === 'stats') { const stats = eventStream.getStats() const events = Object.entries(stats.byEvent) .map(([e, c]) => `- ${e}: ${c} 次`) .join('/n') return `## event-stream 统计:
- 总事件: ${stats.total}
- 事件类型: ${Object.keys(stats.byEvent).length}
- 监听器: ${stats.listeners} 事件统计:
${events || '暂无事件'}` } if (command === 'clear') { const count = eventStream.clear() return `## event-stream 已清空:
- 移除事件: ${count} 个` } return `## event-stream 命令: ${args}
可用: list, subscribe, publish, history, stats, clear`
}
