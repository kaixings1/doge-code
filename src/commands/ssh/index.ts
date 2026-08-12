import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface SSHHost {
  id: string
  name: string
  host: string
  port: number
  user: string
  keyFile?: string
  description?: string
}

interface SSHSession {
  id: string
  host: string
  connectedAt: string
  status: 'active' | 'disconnected'
}

const SSH_CONFIG = join(homedir(), '.doge', 'ssh-hosts.json')

function loadHosts(): SSHHost[] {
  try { if (existsSync(SSH_CONFIG)) return JSON.parse(readFileSync(SSH_CONFIG, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHosts(hosts: SSHHost[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(SSH_CONFIG, JSON.stringify(hosts, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const hosts = loadHosts()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['SSH Manager', '', '📖 📖 Usage: ', '  /ssh list                    List saved hosts', '  /ssh add                     Add new host', '  /ssh remove <name>           Remove host', '  /ssh connect <name>          Connect to host', '  /ssh exec <name> <cmd>       Execute command', '  /ssh copy <name> <src> <dst> Copy files via scp', '  /ssh config                  Edit ssh config', '  /ssh keys                    List SSH keys', '  /ssh test <name>             Test connection', '  /ssh logs                    Connection logs', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    if (hosts.length === 0) return { type: 'text', value: 'No saved hosts. Use /ssh add to add one.' }
    const lines = ['SSH Hosts:', '===========', '']
    hosts.forEach(h => lines.push(h.name + ' - ' + h.user + '@' + h.host + ':' + h.port + (h.description ? ' (' + h.description + ')' : '')))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    return { type: 'text', value: 'Add host manually:\nEdit ' + SSH_CONFIG + '\n{\n  "id": "host-1",\n  "name": "production",\n  "host": "192.168.1.1",\n  "port": 22,\n  "user": "admin",\n  "keyFile": "~/.ssh/id_rsa",\n  "description": "Production server"\n}' }
  }

  if (cmd === 'remove') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /ssh remove <name>' }
    const idx = hosts.findIndex(h => h.name === name)
    if (idx === -1) return { type: 'text', value: 'Not found: ' + name }
    hosts.splice(idx, 1)
    saveHosts(hosts)
    return { type: 'text', value: '[OK] Removed: ' + name }
  }

  if (cmd === 'connect') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /ssh connect <name>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: 'Not found: ' + name }
    return { type: 'text', value: 'ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + host.user + '@' + host.host + ' -p ' + host.port }
  }

  if (cmd === 'exec') {
    const name = parts[1]
    const command = parts.slice(2).join(' ')
    if (!name || !command) return { type: 'text', value: 'Usage: /ssh exec <name> <command>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: 'Not found: ' + name }
    try {
      const output = execSync('ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + host.user + '@' + host.host + ' -p ' + host.port + ' "' + command + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
      return { type: 'text', value: output }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'copy' || cmd === 'scp') {
    const name = parts[1]; const src = parts[2]; const dst = parts[3]
    if (!name || !src || !dst) return { type: 'text', value: 'Usage: /ssh copy <name> <src> <dst>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: 'Not found: ' + name }
    try {
      execSync('scp ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + '-P ' + host.port + ' "' + src + '" ' + host.user + '@' + host.host + ':"' + dst + '"', { stdio: 'ignore', timeout: 60000 })
      return { type: 'text', value: '[OK] Copied: ' + src + ' -> ' + name + ':' + dst }
    } catch { return { type: 'text', value: '[ERROR] Copy failed' } }
  }

  if (cmd === 'config') {
    try {
      const config = readFileSync(join(homedir(), '.ssh', 'config'), 'utf-8')
      return { type: 'text', value: config || 'No SSH config found' }
    } catch { return { type: 'text', value: 'No SSH config found at ~/.ssh/config' } }
  }

  if (cmd === 'keys') {
    try {
      const output = execSync('ls -la ~/.ssh/id_* 2>/dev/null || echo "No keys"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'SSH Keys:\n' + output }
    } catch { return { type: 'text', value: 'No SSH keys found' } }
  }

  if (cmd === 'test') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /ssh test <name>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: 'Not found: ' + name }
    try {
      execSync('ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + '-o ConnectTimeout=5 -p ' + host.port + ' ' + host.user + '@' + host.host + ' echo "OK"', { stdio: 'ignore', timeout: 10000 })
      return { type: 'text', value: '[OK] Connection successful: ' + name }
    } catch { return { type: 'text', value: '[FAIL] Cannot connect: ' + name } }
  }

  if (cmd === 'logs') return { type: 'text', value: 'Connection logs not available' }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const ssh: Command = {
  type: 'local', name: 'ssh',
  description: 'SSH manager - list/add/connect/exec/copy/keys/test/logs',
  aliases: '/ssh, /remote'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default ssh
