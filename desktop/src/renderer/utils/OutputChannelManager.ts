/**
 * OutputChannelManager — 多通道输出管理器
 *
 * 管理多个输出通道（如 Build / Debug / Tasks / Plugins），
 * 每个通道维护独立日志条目列表。
 */

export interface OutputEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export interface OutputChannel {
  id: string
  name: string
  entries: OutputEntry[]
}

export interface OutputChannelManagerOptions {
  channels?: Array<{ id: string; name: string }>
}

export class OutputChannelManager {
  private channels: Map<string, OutputChannel> = new Map()
  private listeners: Set<() => void> = new Set()

  constructor(options: OutputChannelManagerOptions = {}) {
    const defaultChannels = [
      { id: 'build', name: 'Build' },
      { id: 'debug', name: 'Debug' },
      { id: 'tasks', name: 'Tasks' },
      { id: 'plugins', name: 'Plugins' },
    ]
    const list = options.channels || defaultChannels
    for (const ch of list) {
      this.channels.set(ch.id, { id: ch.id, name: ch.name, entries: [] })
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify() {
    this.listeners.forEach(fn => {
      try { fn() } catch { /* ignore */ }
    })
  }

  getChannel(id: string): OutputChannel | undefined {
    return this.channels.get(id)
  }

  getChannels(): OutputChannel[] {
    return Array.from(this.channels.values())
  }

  append(channelId: string, message: string, level: OutputEntry['level'] = 'info'): void {
    const channel = this.channels.get(channelId)
    if (!channel) return
    channel.entries.push({ timestamp: Date.now(), level, message })
    this.notify()
  }

  clear(channelId: string): void {
    const channel = this.channels.get(channelId)
    if (!channel) return
    channel.entries = []
    this.notify()
  }

  clearAll(): void {
    this.channels.forEach(ch => { ch.entries = [] })
    this.notify()
  }

  getEntries(channelId: string): OutputEntry[] {
    return this.channels.get(channelId)?.entries || []
  }
}
