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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔒 SSH 管理器', '', '📖 用法：', '  /ssh list                    列出已保存主机', '  /ssh add                     添加新主机', '  /ssh remove <name>           删除主机', '  /ssh connect <name>          连接到主机', '  /ssh exec <name> <cmd>       执行命令', '  /ssh copy <name> <src> <dst> 通过 scp 复制文件', '  /ssh config                  编辑 ssh 配置', '  /ssh keys                    列出 SSH 密钥', '  /ssh test <name>             测试连接', '  /ssh logs                    连接日志', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    if (hosts.length === 0) return { type: 'text', value: '📋 无已保存主机。使用 /ssh add 添加一个。' }
    const lines = ['SSH 主机：', '===========', '']
    hosts.forEach(h => lines.push(h.name + ' - ' + h.user + '@' + h.host + ':' + h.port + (h.description ? '（' + h.description + '）' : '')))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    return { type: 'text', value: '💡 手动添加主机：\n编辑 ' + SSH_CONFIG + '\n{\n  "id": "host-1",\n  "name": "production",\n  "host": "192.168.1.1",\n  "port": 22,\n  "user": "admin",\n  "keyFile": "~/.ssh/id_rsa",\n  "description": "Production server"\n}' }
  }

  if (cmd === 'remove') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/ssh remove <name>' }
    const idx = hosts.findIndex(h => h.name === name)
    if (idx === -1) return { type: 'text', value: '❌ 未找到：' + name }
    hosts.splice(idx, 1)
    saveHosts(hosts)
    return { type: 'text', value: '✅ 已删除：' + name }
  }

  if (cmd === 'connect') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/ssh connect <name>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: '❌ 未找到：' + name }
    return { type: 'text', value: 'ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + host.user + '@' + host.host + ' -p ' + host.port }
  }

  if (cmd === 'exec') {
    const name = parts[1]
    const command = parts.slice(2).join(' ')
    if (!name || !command) return { type: 'text', value: '📖 用法：/ssh exec <name> <command>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: '❌ 未找到：' + name }
    try {
      const output = execSync('ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + host.user + '@' + host.host + ' -p ' + host.port + ' "' + command + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
      return { type: 'text', value: output }
    } catch (err) {
      return { type: 'text', value: '❌ ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'copy' || cmd === 'scp') {
    const name = parts[1]; const src = parts[2]; const dst = parts[3]
    if (!name || !src || !dst) return { type: 'text', value: '📖 用法：/ssh copy <name> <src> <dst>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: '❌ 未找到：' + name }
    try {
      execSync('scp ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + '-P ' + host.port + ' "' + src + '" ' + host.user + '@' + host.host + ':"' + dst + '"', { stdio: 'ignore', timeout: 60000 })
      return { type: 'text', value: '✅ 已复制：' + src + ' -> ' + name + ':' + dst }
    } catch { return { type: 'text', value: '❌ 复制失败' } }
  }

  if (cmd === 'config') {
    try {
      const config = readFileSync(join(homedir(), '.ssh', 'config'), 'utf-8')
      return { type: 'text', value: config || '未找到 SSH 配置' }
    } catch { return { type: 'text', value: '未找到 ~/.ssh/config 中的 SSH 配置' } }
  }

  if (cmd === 'keys') {
    try {
      const output = execSync('ls -la ~/.ssh/id_* 2>/dev/null || echo "No keys"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '🔑 SSH 密钥：\n' + output }
    } catch { return { type: 'text', value: '未找到 SSH 密钥' } }
  }

  if (cmd === 'test') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/ssh test <name>' }
    const host = hosts.find(h => h.name === name)
    if (!host) return { type: 'text', value: '❌ 未找到：' + name }
    try {
      execSync('ssh ' + (host.keyFile ? '-i ' + host.keyFile + ' ' : '') + '-o ConnectTimeout=5 -p ' + host.port + ' ' + host.user + '@' + host.host + ' echo "OK"', { stdio: 'ignore', timeout: 10000 })
      return { type: 'text', value: '✅ 连接成功：' + name }
    } catch { return { type: 'text', value: '❌ 无法连接：' + name } }
  }

  if (cmd === 'logs') return { type: 'text', value: '连接日志不可用' }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const ssh: Command = {
  type: 'local', name: 'ssh',
  description: 'SSH manager - list/add/connect/exec/copy/keys/test/logs',
  aliases: '/ssh, /remote'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default ssh
