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
      '📋 日志查看器', '', '📖 用法：',
      '  /logs find                      查找项目中的日志文件',
      '  /logs tail <文件> [N]           查看最后 N 行（默认 50）',
      '  /logs follow <文件>             实时跟踪日志（tail -f）',
      '  /logs search <文件> <模式>      用正则搜索日志',
      '  /logs filter <文件> <级别>      按级别过滤（error/warn/info/debug）',
      '  /logs stats <文件>              日志统计（级别、频率）',
      '  /logs files                     列出最近的日志文件及大小',
      '  /logs pm2 [名称]                查看 PM2 日志',
      '  /logs docker [名称]             查看 Docker 日志',
      '  /logs nginx                     查看 Nginx 访问日志',
      '  /logs error                     显示所有日志中的错误行',
      '  /logs watch                     监控所有日志中的错误',
    ].join('\n') }
  }

  if (cmd === 'find' || cmd === 'files') {
    const logs = findLogFiles('.')
    if (logs.length === 0) return { type: 'text', value: 'ℹ️ 未找到日志文件' }
    const lines = ['📋 日志文件：', '═══════════', '']
    logs.forEach(f => {
      try { const size = statSync(f); lines.push(f + '（' + (size.size / 1024).toFixed(1) + ' KB，' + size.mtime.toISOString().slice(0, 19) + '）') }
      catch { lines.push(f) }
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'tail') {
    const file = parts[1]; const n = parseInt(parts[2]) || 50
    if (!file) return { type: 'text', value: '📖 用法：/logs tail <文件> [N]' }
    try {
      const output = execSync('tail -n ' + n + ' "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output.split('\n').map(colorizeLogLine).join('\n') }
    } catch { return { type: 'text', value: '❌ 无法读取：' + file } }
  }

  if (cmd === 'follow' || cmd === 'f') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/logs follow <文件>' }
    try {
      const output = execSync('tail -n 20 "' + file + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '👁️ 正在跟踪：' + file + '（最后 20 行）：\n' + output.split('\n').map(colorizeLogLine).join('\n') + '\n\n（在终端中使用 tail -f 实现实时跟踪）' }
    } catch { return { type: 'text', value: '❌ 无法读取：' + file } }
  }

  if (cmd === 'search') {
    const file = parts[1]; const pattern = parts[2]
    if (!file || !pattern) return { type: 'text', value: '📖 用法：/logs search <文件> <模式>' }
    try {
      const output = execSync('grep -n -i "' + pattern + '" "' + file + '" 2>/dev/null | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'ℹ️ 未找到匹配' }
    } catch { return { type: 'text', value: 'ℹ️ 无匹配或文件不存在' } }
  }

  if (cmd === 'filter') {
    const file = parts[1]; const level = parts[2]?.toLowerCase() || 'error'
    if (!file) return { type: 'text', value: '📖 用法：/logs filter <文件> <级别>' }
    try {
      const output = execSync('grep -n -i "' + level + '" "' + file + '" 2>/dev/null | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: output || 'ℹ️ 未找到 ' + level + ' 级别日志' }
    } catch { return { type: 'text', value: 'ℹ️ 无匹配' } }
  }

  if (cmd === 'stats') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/logs stats <文件>' }
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
      const result = ['📊 日志统计：' + file, '📋 总行数：' + lines.length, '']
      Object.entries(levels).sort((a: any, b: any) => b[1] - a[1]).forEach(([k, v]) => result.push('  ' + k + ': ' + v))
      return { type: 'text', value: result.join('\n') }
    } catch { return { type: 'text', value: '❌ 无法读取：' + file } }
  }

  if (cmd === 'pm2') {
    const name = parts[1] || ''
    try { return { type: 'text', value: execSync('pm2 logs ' + name + ' --lines 30 --nostream 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '❌ PM2 不可用' } }
  }

  if (cmd === 'docker') {
    const name = parts[1] || ''
    try { return { type: 'text', value: execSync('docker compose logs --tail=30 ' + name + ' 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '❌ Docker 不可用' } }
  }

  if (cmd === 'nginx') {
    const logFile = parts[1] || '/var/log/nginx/access.log'
    try { return { type: 'text', value: execSync('tail -n 30 "' + logFile + '"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }) } }
    catch { return { type: 'text', value: '❌ 无法读取：' + logFile } }
  }

  if (cmd === 'error') {
    const logs = findLogFiles('.')
    if (logs.length === 0) return { type: 'text', value: 'ℹ️ 未找到日志文件' }
    const lines = ['🔴 错误行：', '═══════════', '']
    logs.forEach(f => {
      try {
        const errs = execSync('grep -i "error\\|fatal\\|crash" "' + f + '" 2>/dev/null | head -5', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        if (errs.trim()) { lines.push('--- ' + f + ' ---'); lines.push(errs.trim()) }
      } catch { /* ignore */ }
    })
    return { type: 'text', value: lines.join('\n') || 'ℹ️ 未找到错误' }
  }

  if (cmd === 'watch') {
    return { type: 'text', value: '👁️ 正在监控日志中的错误...（每 30 秒检查一次）\n使用 /logs error 查看当前错误' }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const logs: Command = {
  type: 'local', name: 'logs',
  description: '📋 日志查看器 - tail/follow/search/filter/stats/pm2/docker/nginx',
  aliases: ['/logs', '/log'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default logs
