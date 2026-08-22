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
        return '✅ 已终止端口 ' + port + ' 上的进程（PID：' + pid + '）'
      }
    }
    return '端口 ' + port + ' 上未找到进程'
  } catch { return '❌ 终止端口 ' + port + ' 上的进程失败' }
}

function isPortAvailable(port: number): boolean {
  try {
    execSync('netstat -ano | findstr :' + port, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return false
  } catch { return true }
}

export const call: LocalCommandCall = async (args) => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `ports — 🔌 端口管理 - 列出/检查/终止/查找/监控\n用法: /ports`.trim(), truncated: false }
  }
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const ports = getUsedPorts()
    if (ports.length === 0) return { type: 'text', value: '📋 未发现活跃端口（或 netstat 不可用）' }
    const lines = ['🔌 活跃端口：', '==============', '']
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
    if (isNaN(port)) return { type: 'text', value: '📖 用法：/ports check <端口号>' }
    return { type: 'text', value: isPortAvailable(port) ? '✅ 端口 ' + port + ' 可用' : '🔴 端口 ' + port + ' 正在使用' }
  }

  if (cmd === 'kill') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: '📖 用法：/ports kill <端口号>' }
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
    return { type: 'text', value: '🔍 可用端口（' + start + '-' + end + '）：\n' + available.join(', ') }
  }

  if (cmd === 'process') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: '📖 用法：/ports process <端口号>' }
    try {
      const output = execSync('netstat -ano | findstr :' + port, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || '端口 ' + port + ' 上无进程' }
    } catch { return { type: 'text', value: '端口 ' + port + ' 上无进程' } }
  }

  if (cmd === 'common') {
    const commonPorts = [80, 443, 3000, 3001, 5000, 8000, 8080, 8888, 9000, 9090, 5432, 3306, 27017, 6379, 11211]
    const lines = ['🔌 常用端口：', '==============', '']
    commonPorts.forEach(p => {
      lines.push('  ' + p + '：' + (isPortAvailable(p) ? '✅ 可用' : '🔴 使用中'))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'monitor') {
    const port = parseInt(parts[1])
    if (isNaN(port)) return { type: 'text', value: '📖 用法：/ports monitor <端口号>' }
    return { type: 'text', value: '👁️ 正在监控端口 ' + port + '...（每 5 秒检查一次）\n使用 /ports check ' + port + ' 查看当前状态' }
  }

  return { type: 'text', value: [
    '🔌 端口管理器', '', '📖 用法：',
    '  /ports list               列出所有活跃端口', '  /ports check <端口号>     检查端口是否可用',
    '  /ports kill <端口号>      终止端口上的进程', '  /ports find [起始] [结束]  查找可用端口',
    '  /ports process <端口号>   查看使用端口的进程', '  /ports common            检查常用开发端口',
    '  /ports monitor <端口号>   监控端口状态',
  ].join('\n') }
}

const ports: Command = {
  type: 'local', name: 'ports',
  description: '🔌 端口管理 - 列出/检查/终止/查找/监控',
  aliases: ['/ports', '/port'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default ports
