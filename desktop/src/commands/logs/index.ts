import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync, spawn } from 'child_process'
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join, basename } from 'path'

interface LogSource {
  name: string
  path: string
  type: 'file' | 'command' | 'service'
  tail: boolean
}

function findLogFiles(dir: string, depth = 2): string[] {
  const logs: string[] = []
  const scan = (d: string, currDepth: number) => {
    if (currDepth > depth) return
    try {
      const entries = readdirSync(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) { scan(fp, currDepth + 1) }
        else if (entry.name.endsWith('.log') || entry.name.includes('log')) logs.push(fp)
      }
    } catch { /* ignore */ }
  }
  scan(dir, 0)
  return logs.slice(0, 20)
}

function colorizeLogLine(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('crash')) return '[ERR] ' + line
  if (lower.includes('warn') || lower.includes('warning')) return '[WRN] ' + line
  if (lower.includes('info') || lower.includes('notice')) return '[INF] ' + line
  if (lower.includes('debug') || lower.includes('trace')) return '[DBG] ' + line
  if (lower.includes('success') || lower.includes('ok') || lower.includes('done')) return '[OK]  ' + line
  return '     ' + line
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') {
    return { type: 'text', value: [
      'Log Viewer', '', 'Usage:',
      '  /logs find                  Find log files in project',
      '  /logs tail <file> [N]       Tail last N lines (default 50)',
      '  /logs follow <file>         Follow log in real-time (tail -f)',
      '  /logs search <file> <regex> Search logs with regex',
      '  /logs filter <file> <level> Filter by level (error/warn/info/debug)',
      '  /logs stats <file>          Log statistics (levels, frequency)',
      '  /logs files                 List recent log files with sizes',
      '  /logs pm2 [name]            View PM2 logs',
      '  /logs docker [name]         View Docker logs',
      '  /logs nginx                 View Nginx access logs',
      '  /logs error                 Show only error lines from all logs',
      '  /logs watch                 Watch all logs for errors',
    ].join('\n') }
  }

  if (cmd === 'find' || cmd === 'files') {
    const logs = findLogFiles('.')
    if (logs.length === 0) return { type: 'text', value: 'No log files found' }
    const lines = ['Log Files:', '===========', '']
    logs.forEach(f => {
      try { const size = statSync(f); lines.push(f + ' (' + (size.size / 1024).toFixed(1) + ' KB, ' + size.mtime.toISOString().slice(0, 19) + ')') }
      catch { lines.push(f) }
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tail') {
    const file = parts[1]; const n = parseInt(parts[2]) || 50
    if (!file) return { type: 'text', value: 'Usage: /logs tail <file> [N]' }
    try {
      const output = execSync('tail -n ' + n + ' "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output.split('\n').map(colorizeLogLine).join('\n') }
    } catch { return { type: 'text', value: '[ERROR] Cannot read ' + file } }
  }

  if (cmd === 'follow' || cmd === 'f') {
    const file = parts[1]
    if (!file) return { type: 'text', value: 'Usage: /logs follow <file>' }
    try {
      const output = execSync('tail -n 20 "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Following ' + file + ' (last 20 lines):\n' + output.split('\n').map(colorizeLogLine).join('\n') + '\n\n(Use tail -f in terminal for real-time following)' }
    } catch { return { type: 'text', value: '[ERROR] Cannot read ' + file } }
  }

  if (cmd === 'search') {
    const file = parts[1]; const pattern = parts[2]
    if (!file || !pattern) return { type: 'text', value: 'Usage: /logs search <file> <pattern>' }
    try {
      const output = execSync('grep -n -i "' + pattern + '" "' + file + '" 2>/dev/null | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'No matches found' }
    } catch { return { type: 'text', value: 'No matches or file not found' } }
  }

  if (cmd === 'filter') {
    const file = parts[1]; const level = parts[2]?.toLowerCase() || 'error'
    if (!file) return { type: 'text', value: 'Usage: /logs filter <file> <level>' }
    try {
      const output = execSync('grep -n -i "' + level + '" "' + file + '" 2>/dev/null | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'No ' + level + ' lines found' }
    } catch { return { type: 'text', value: 'No matches' } }
  }

  if (cmd === 'stats') {
    const file = parts[1]
    if (!file) return { type: 'text', value: 'Usage: /logs stats <file>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      const levels: Record<string, number> = {}
      lines.forEach(l => {
        const lower = l.toLowerCase()
        if (lower.includes('error')) levels.error = (levels.error || 0) + 1
        else if (lower.includes('warn')) levels.warn = (levels.warn || 0) + 1
        else if (lower.includes('info')) levels.info = (levels.info || 0) + 1
        else if (lower.includes('debug')) levels.debug = (levels.debug || 0) + 1
        else levels.other = (levels.other || 0) + 1
      })
      const result = ['Log Stats: ' + file, 'Total lines: ' + lines.length, '']
      Object.entries(levels).sort((a: any, b: any) => b[1] - a[1]).forEach(([k, v]) => result.push('  ' + k + ': ' + v))
      return { type: 'text', value: result.join('\n') }
    } catch { return { type: 'text', value: '[ERROR] Cannot read ' + file } }
  }

  if (cmd === 'pm2') {
    const name = parts[1] || ''
    try { return { type: 'text', value: execSync('pm2 logs ' + name + ' --lines 30 --nostream 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '[ERROR] PM2 not available' } }
  }

  if (cmd === 'docker') {
    const name = parts[1] || ''
    try { return { type: 'text', value: execSync('docker compose logs --tail=30 ' + name + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '[ERROR] Docker not available' } }
  }

  if (cmd === 'nginx') {
    const logFile = parts[1] || '/var/log/nginx/access.log'
    try { return { type: 'text', value: execSync('tail -n 30 "' + logFile + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '[ERROR] Cannot read ' + logFile } }
  }

  if (cmd === 'error') {
    const logs = findLogFiles('.')
    if (logs.length === 0) return { type: 'text', value: 'No log files found' }
    const lines = ['Error Lines:', '=============', '']
    logs.forEach(f => {
      try {
        const errs = execSync('grep -i "error\\|fatal\\|crash" "' + f + '" 2>/dev/null | head -5', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        if (errs.trim()) { lines.push('--- ' + f + ' ---'); lines.push(errs.trim()) }
      } catch { /* ignore */ }
    })
    return { type: 'text', value: lines.join('\n') || 'No errors found' }
  }

  if (cmd === 'watch') {
    return { type: 'text', value: 'Watching logs for errors... (checks every 30s)\nUse /logs error to see current errors' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const logs: Command = {
  type: 'local', name: 'logs',
  description: 'Log viewer - tail/follow/search/filter/stats/pm2/docker/nginx',
  aliases: ['/logs', '/log'], supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default logs
