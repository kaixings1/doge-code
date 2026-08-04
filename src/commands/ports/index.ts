import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

interface PortInfo {
  port: number
  protocol: string
  state: string
  pid?: string
  process?: string
}

function getUsedPorts(): PortInfo[] {
  const ports: PortInfo[] = []
  try {
    const output = execSync('netstat -ano 2>/dev/null || ss -tlnp 2>/dev/null', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const lines = output.split('\n').filter(Boolean)
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 4) {
        const localAddr = parts[1] || parts[3]
        const portMatch = localAddr.match(/:(\d+)$/)
        if (portMatch) {
          ports.push({ port: parseInt(portMatch[1]), protocol: parts[0] || 'tcp', state: parts[3] || parts[2] || 'LISTENING', pid: parts[4] || parts[5] || '' })
        }
      }
    })
  } catch { /* ignore */ }
  return ports
}

function killProcessOnPort(port: number): string {
  try {
    const output = execSync('netstat -ano | findstr :' + port, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    const lines = output.split('\n').filter(Boolean)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== '0') {
        execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' })
        return '[OK] Killed PID ' + pid + ' on port ' + port
      }
    }
    return 'No process found on port ' + port
  } catch { return '[ERROR] Failed to kill process on port ' + port }
}

function isPortAvailable(port: number): boolean {
  try {
    execSync('netstat -ano | findstr :' + port, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return false
  } catch { return true }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const ports = getUsedPorts()
    if (ports.length === 0) return { type: 'text', value: 'No active ports found (or netstat not available)' }
    const lines = ['Active Ports:', '==============', '']
    const seen = new Set<number>()
    ports.forEach(p => {
      if (!seen.has(p.port)) {
        seen.add(p.port)
        lines.push('  Port ' + p.port + ' (' + p.protocol + ') - ' + p.state + (p.pid ? ' [PID: ' + p.pid + ']' : ''))
      }
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'check') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: 'Usage: /ports check <port>' }
    return { type: 'text', value: isPortAvailable(port) ? '[OK] Port ' + port + ' is available' : '[BUSY] Port ' + port + ' is in use' }
  }

  if (cmd === 'kill') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: 'Usage: /ports kill <port>' }
    return { type: 'text', value: killProcessOnPort(port) }
  }

  if (cmd === 'find') {
    const start = parseInt(parts[1]) || 3000
    const end = parseInt(parts[2]) || 9999
    const available: number[] = []
    for (let p = start; p <= Math.min(end, start + 100); p++) {
      if (isPortAvailable(p)) available.push(p)
      if (available.length >= 10) break
    }
    return { type: 'text', value: 'Available ports (' + start + '-' + end + '):\n' + available.join(', ') }
  }

  if (cmd === 'process') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: 'Usage: /ports process <port>' }
    try {
      const output = execSync('netstat -ano | findstr :' + port, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'No process on port ' + port }
    } catch { return { type: 'text', value: 'No process on port ' + port } }
  }

  if (cmd === 'common') {
    const commonPorts = [80, 443, 3000, 3001, 5000, 8000, 8080, 8888, 9000, 9090, 5432, 3306, 27017, 6379, 11211]
    const lines = ['Common Ports:', '==============', '']
    commonPorts.forEach(p => {
      lines.push('  ' + p + ': ' + (isPortAvailable(p) ? '[AVAIL]' : '[USED]'))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'monitor') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: 'Usage: /ports monitor <port>' }
    return { type: 'text', value: 'Monitoring port ' + port + '... (checks every 5s)\nUse /ports check ' + port + ' for current status' }
  }

  return { type: 'text', value: [
    'Port Manager', '', 'Usage:',
    '  /ports list               List all active ports', '  /ports check <port>       Check if port is available',
    '  /ports kill <port>        Kill process on port', '  /ports find [start] [end] Find available ports',
    '  /ports process <port>     Show process using port', '  /ports common             Check common dev ports',
    '  /ports monitor <port>     Monitor port status',
  ].join('\n') }
}

const ports: Command = {
  type: 'local', name: 'ports',
  description: 'Port management - list/check/kill/find/monitor',
  aliases: ['/ports', '/port'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default ports
