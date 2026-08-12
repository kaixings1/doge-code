import { type Tool } from '../../engine/types.js'
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createSocket } from 'dgram'
import { networkInterfaces } from 'os'

interface PeerInfo {
  id: string
  name: string
  host: string
  port: number
  status: 'active' | 'inactive'
  lastActive: string
  version?: string
}

export class ListPeersTool implements Tool {
  name = 'list_peers'
  description = 'List remote peers, discover peers via UDP broadcast, and manage peer registry'
  parameters = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', description: 'Action: list, discover, add, remove, or ping', enum: ['list', 'discover', 'add', 'remove', 'ping'] },
      status: { type: 'string', description: 'Filter by peer status', enum: ['all', 'active', 'inactive'] },
      host: { type: 'string', description: 'Peer host for add/ping action' },
      port: { type: 'number', description: 'Peer port for add action' },
      name: { type: 'string', description: 'Peer name for add action' },
      timeout: { type: 'number', description: 'Discovery timeout in ms' }
    },
    required: []
  }
  validate = () => ({ valid: true })

  private peersDir(): string {
    return join(process.cwd(), '.doge', 'peers')
  }

  private loadPeers(): PeerInfo[] {
    const dir = this.peersDir()
    if (!existsSync(dir)) return []
    const peers: PeerInfo[] = []
    try {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
        try {
          peers.push(JSON.parse(readFileSync(join(dir, file), 'utf-8')))
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return peers
  }

  private savePeer(peer: PeerInfo): void {
    try {
      const dir = this.peersDir()
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, peer.id + '.json'), JSON.stringify(peer, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }

  private removePeer(id: string): boolean {
    try {
      require('fs').unlinkSync(join(this.peersDir(), id + '.json'))
      return true
    } catch { return false }
  }

  private getLocalIP(): string {
    const nets = networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) return net.address
      }
    }
    return '127.0.0.1'
  }

  private discover(timeoutMs: number): Promise<PeerInfo[]> {
    return new Promise((resolve) => {
      const found: PeerInfo[] = []
      const socket = createSocket('udp4')
      const localIP = this.getLocalIP()
      const broadcastAddr = '255.255.255.255'
      const port = 45678

      socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString())
          if (data.type === 'doge-peer' && data.name) {
            found.push({
              id: data.id || `peer-${rinfo.address}`,
              name: data.name,
              host: rinfo.address,
              port: data.port || port,
              status: 'active',
              lastActive: new Date().toISOString(),
              version: data.version,
            })
          }
        } catch { /* ignore */ }
      })

      socket.bind(() => {
        socket.setBroadcast(true)
        // 发送发现请求
        const discoveryMsg = JSON.stringify({ type: 'doge-discover', name: 'doge-code', version: '1.0.0' })
        try {
          socket.send(discoveryMsg, 0, discoveryMsg.length, port, broadcastAddr)
        } catch { /* */ }
        // 也尝试向本地 IP 发送
        try {
          socket.send(discoveryMsg, 0, discoveryMsg.length, port, localIP)
        } catch { /* ignore */ }
      })

      setTimeout(() => {
        try { socket.close() } catch { /* ignore */ }
        resolve(found)
      }, timeoutMs)
    })
  }

  private pingPeer(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms: number }> {
    return new Promise((resolve) => {
      const socket = createSocket('udp4')
      const start = Date.now()
      let done = false
      socket.on('message', () => {
        if (!done) { done = true; resolve({ ok: true, ms: Date.now() - start }); try { socket.close() } catch { /* ignore */ } }
      })
      socket.on('error', () => {
        if (!done) { done = true; resolve({ ok: false, ms: Date.now() - start }); try { socket.close() } catch { /* ignore */ } }
      })
      const msg = JSON.stringify({ type: 'doge-ping', name: 'doge-code' })
      socket.send(msg, 0, msg.length, port, host, () => {
        setTimeout(() => {
          if (!done) { done = true; resolve({ ok: false, ms: Date.now() - start }); try { socket.close() } catch { /* ignore */ } }
        }, timeoutMs)
      })
    })
  }

  execute = async (params: Record<string, any>) => {
    const action = params?.action || 'list'
    const statusFilter = params?.status || 'all'

    if (action === 'discover') {
      const timeout = params?.timeout || 3000
      const found = await this.discover(timeout)
      // 合并到注册表
      for (const peer of found) {
        if (!this.loadPeers().some(p => p.host === peer.host)) {
          this.savePeer(peer)
        }
      }
      const lines = ['## Peer Discovery', '', `Broadcast on port 45678, timeout ${timeout}ms`, '', `Found ${found.length} peers:`, '']
      found.forEach(p => lines.push(`- ${p.name} (${p.host}:${p.port}) v${p.version || '?'}`))
      if (found.length === 0) lines.push('(no peers responded - make sure other instances are running)')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'add') {
      const host = params?.host || ''
      const port = params?.port || 45678
      const name = params?.name || host
      if (!host) return { content: [{ type: 'text', text: 'Error: host is required for add action' }] }
      const peer: PeerInfo = {
        id: 'peer-' + Date.now().toString(36),
        name,
        host,
        port,
        status: 'active',
        lastActive: new Date().toISOString(),
      }
      this.savePeer(peer)
      return { content: [{ type: 'text', text: `Added peer: ${name} (${host}:${port})` }] }
    }

    if (action === 'remove') {
      const id = params?.id || params?.name || ''
      if (!id) return { content: [{ type: 'text', text: 'Error: id or name is required for remove action' }] }
      const peers = this.loadPeers()
      const target = peers.find(p => p.id === id || p.name === id || p.host === id)
      if (!target) return { content: [{ type: 'text', text: 'Peer not found: ' + id }] }
      const ok = this.removePeer(target.id)
      return { content: [{ type: 'text', text: ok ? 'Removed peer: ' + target.name : 'Failed to remove peer' }] }
    }

    if (action === 'ping') {
      const host = params?.host || ''
      const port = params?.port || 45678
      if (!host) return { content: [{ type: 'text', text: 'Error: host is required for ping action' }] }
      const result = await this.pingPeer(host, port, params?.timeout || 2000)
      return { content: [{ type: 'text', text: `Ping ${host}:${port} -> ${result.ok ? '✅ ' + result.ms + 'ms' : '❌ timeout'}` }] }
    }

    // list (default)
    const peers = this.loadPeers()
    const lines: string[] = ['## Peer Connections', '']
    const filtered = statusFilter === 'all' ? peers : peers.filter(p => p.status === statusFilter)
    if (filtered.length === 0) {
      lines.push('No peer connections found.')
      lines.push('Use action=discover to broadcast on the network, or action=add to add manually.')
    } else {
      lines.push(`Found ${filtered.length} peers:`)
      lines.push('')
      filtered.forEach(p => {
        lines.push(`- **${p.name}**`)
        lines.push(`  - ID: ${p.id}`)
        lines.push(`  - Host: ${p.host}:${p.port}`)
        lines.push(`  - Status: ${p.status}`)
        lines.push(`  - Last Active: ${p.lastActive}`)
        if (p.version) lines.push(`  - Version: ${p.version}`)
        lines.push('')
      })
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
}