import { EventEmitter } from 'events'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

class EventStream extends EventEmitter {
    private history: Array<{event: string, data: any, time: string}> = []
    private storageFile: string

    constructor() {
        super()
        this.storageFile = join(process.cwd(), '.doge', 'events.json')
        this.load()
        this.setMaxListeners(50)
    }

    private load(): void {
        if (existsSync(this.storageFile)) {
            try {
                const data = JSON.parse(readFileSync(this.storageFile, 'utf-8'))
                this.history = data.history || []
            } catch (e) {
                console.error('Failed to load events:', e)
            }
        }
    }

    private save(): void {
        try {
            const dir = join(this.storageFile, '..')
            if (!existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true })
            }
            writeFileSync(this.storageFile, JSON.stringify({
                history: this.history.slice(-1000),
                savedAt: new Date().toISOString()
            }, null, 2))
        } catch (e) {
            console.error('Failed to save events:', e)
        }
    }

    publish(event: string, data: any): void {
        const eventData = { event, data, time: new Date().toISOString() }
        this.history.push(eventData)
        this.emit(event, eventData)
        this.emit('*', eventData)
        if (this.history.length % 10 === 0) {
            this.save()
        }
    }

    subscribe(event: string, callback: (data: any) => void): string {
        const id = `sub_${Date.now()}`
        this.on(event, callback)
        return id
    }

    getHistory(event?: string, limit: number = 50): any[] {
        let history = [...this.history].reverse()
        if (event) {
            history = history.filter(h => h.event === event)
        }
        return history.slice(0, limit)
    }

    getStats(): any {
        const events = new Map<string, number>()
        this.history.forEach(h => {
            events.set(h.event, (events.get(h.event) || 0) + 1)
        })
        return {
            total: this.history.length,
            byEvent: Object.fromEntries(events),
            listeners: this.eventNames().length
        }
    }

    clear(): number {
        const count = this.history.length
        this.history = []
        this.save()
        return count
    }
}

const eventStream = new EventStream()

export async function call(args: string, context: any): Promise<string> {
    if (!args || args.trim() === '') {
        const stats = eventStream.getStats()
        return `## event-stream \u4e8b\u4ef6\u6d41\u7cfb\u7edf\n\u7edf\u8ba1:\n- \u603b\u4e8b\u4ef6: ${stats.total}\n- \u76d1\u542c\u5668: ${stats.listeners}\n- \u5b58\u50a8: .doge/events.json\n\n\u7528\u6cd5:\n- /event-stream list [\u4e8b\u4ef6] - \u5217\u51fa\u4e8b\u4ef6\n- /event-stream subscribe <\u4e8b\u4ef6> - \u8ba2\u9605\n- /event-stream publish <\u4e8b\u4ef6> <\u6570\u636e> - \u53d1\u5e03\n- /event-stream history [\u4e8b\u4ef6] [\u6570\u91cf] - \u5386\u53f2\n- /event-stream stats - \u7edf\u8ba1\n- /event-stream clear - \u6e05\u7a7a\n\n\u793a\u4f8b:\n/event-stream publish test '{"message": "hello"}'\n/event-stream history test 10`
    }

    const parts = args.trim().split(/\s+/)
    const command = parts[0].toLowerCase()

    if (command === 'list') {
        const event = parts[1]
        const listeners = eventStream.eventNames()
        if (event) {
            const count = eventStream.listenerCount(event)
            return `## event-stream \u4e8b\u4ef6: ${event}\n\u76d1\u542c\u5668: ${count} \u4e2a`
        }
        return `## event-stream \u6d3b\u8dc3\u4e8b\u4ef6:\n${listeners.map(e => `- ${e}: ${eventStream.listenerCount(e)} \u4e2a\u76d1\u542c\u5668`).join('\n')}`
    }

    if (command === 'subscribe' && parts.length >= 2) {
        const event = parts[1]
        const id = eventStream.subscribe(event, (data) => {
            console.log(`[${event}]`, data)
        })
        return `## event-stream \u8ba2\u9605\u6210\u529f:\n- \u4e8b\u4ef6: ${event}\n- ID: ${id}\n- \u8f93\u51fa: \u63a7\u5236\u53f0`
    }

    if (command === 'publish' && parts.length >= 2) {
        const event = parts[1]
        const data = parts.slice(2).join(' ') || '{}'
        let parsedData: any
        try {
            parsedData = JSON.parse(data)
        } catch {
            parsedData = data
        }
        eventStream.publish(event, parsedData)
        return `## event-stream \u53d1\u5e03\u6210\u529f:\n- \u4e8b\u4ef6: ${event}\n- \u6570\u636e: ${typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)}`
    }

    if (command === 'history') {
        const event = parts[1]
        const limit = parts[2] ? parseInt(parts[2]) : 20
        const history = eventStream.getHistory(event, limit)
        if (history.length === 0) {
            return `## event-stream \u5386\u53f2\u8bb0\u5f55\u4e3a\u7a7a${event ? ` (\u4e8b\u4ef6: ${event})` : ''}`
        }
        const list = history.map(h => `[${new Date(h.time).toLocaleString()}] ${h.event}: ${typeof h.data === 'string' ? h.data : JSON.stringify(h.data)}`).join('\n')
        return `## event-stream \u5386\u53f2\u8bb0\u5f55${event ? ` (\u4e8b\u4ef6: ${event})` : ''}:\n${list}`
    }

    if (command === 'stats') {
        const stats = eventStream.getStats()
        const events = Object.entries(stats.byEvent)
            .map(([e, c]) => `- ${e}: ${c} \u6b21`)
            .join('\n')
        return `## event-stream \u7edf\u8ba1:\n- \u603b\u4e8b\u4ef6: ${stats.total}\n- \u4e8b\u4ef6\u7c7b\u578b: ${Object.keys(stats.byEvent).length}\n- \u76d1\u542c\u5668: ${stats.listeners}\n\n\u4e8b\u4ef6\u7edf\u8ba1:\n${events || '\u6682\u65e0\u4e8b\u4ef6'}`
    }

    if (command === 'clear') {
        const count = eventStream.clear()
        return `## event-stream \u5df2\u6e05\u7a7a:\n- \u79fb\u9664\u4e8b\u4ef6: ${count} \u4e2a`
    }

    return `## event-stream \u547d\u4ee4: ${args}\n\u53ef\u7528: list, subscribe, publish, history, stats, clear`
}