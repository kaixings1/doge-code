import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

interface EnvEntry {
  key: string
  value: string
  description?: string
  scope: 'local' | 'project' | 'global'
}

function parseEnvFile(filePath: string): EnvEntry[] {
  const entries: EnvEntry[] = []
  try {
    if (!existsSync(filePath)) return entries
    const content = readFileSync(filePath, 'utf-8')
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) return
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, '').trim()
      entries.push({ key, value, scope: filePath.includes('.env.local') ? 'local' : filePath.includes('.env.global') ? 'global' : 'project' })
    })
  } catch { /* ignore */ }
  return entries
}

function getEnvFiles(): string[] {
  const files: string[] = ['.env', '.env.local', '.env.production', '.env.development', '.env.test']
  return files.filter(f => existsSync(f))
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const files = getEnvFiles()
    if (files.length === 0) return { type: 'text', value: 'ℹ️ 未找到 .env 文件' }
    const lines = ['📋 环境变量', '═══════════', '']
    files.forEach(f => {
      const entries = parseEnvFile(f)
      lines.push('--- ' + f + '（' + entries.length + ' 个变量）---')
      entries.forEach(e => {
        const displayVal = e.value.length > 40 ? e.value.slice(0, 37) + '...' : e.value
        lines.push('  ' + e.key + '=' + displayVal)
      })
      lines.push('')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'get') {
    const key = parts[1]
    if (!key) return { type: 'text', value: '📖 用法：/env get <键名>' }
    const val = process.env[key]
    const isSet = typeof val !== 'undefined' && val !== null
    return { type: 'text', value: isSet ? key + '=' + key + '（值已隐藏，安全原因）' : '❌ 未设置：' + key }
  }

  if (cmd === 'set') {
    const key = parts[1]
    const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/env set <键名> <值>' }
    const envFile = '.env.local'
    let lines: string[] = []
    if (existsSync(envFile)) { lines = readFileSync(envFile, 'utf-8').split('\n') }
    const idx = lines.findIndex(l => l.startsWith(key + '='))
    if (idx >= 0) lines[idx] = key + '=' + value
    else lines.push(key + '=' + value)
    writeFileSync(envFile, lines.join('\n') + '\n', 'utf-8')
    return { type: 'text', value: '✅ 已设置 ' + key + ' 到 ' + envFile }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const key = parts[1]
    if (!key) return { type: 'text', value: '📖 用法：/env delete <键名>' }
    const envFile = '.env.local'
    if (!existsSync(envFile)) return { type: 'text', value: '❌ 未找到 .env.local 文件' }
    const lines = readFileSync(envFile, 'utf-8').split('\n').filter(l => !l.startsWith(key + '='))
    writeFileSync(envFile, lines.join('\n'), 'utf-8')
    return { type: 'text', value: '✅ 已删除：' + key }
  }

  if (cmd === 'diff') {
    const envFiles = getEnvFiles()
    if (envFiles.length < 2) return { type: 'text', value: '⚠️ 至少需要 2 个 .env 文件才能比较' }
    const allKeys = new Set<string>()
    const fileData: Record<string, EnvEntry[]> = {}
    envFiles.forEach(f => { fileData[f] = parseEnvFile(f); fileData[f].forEach(e => allKeys.add(e.key)) })
    const lines = ['🔍 环境变量差异', '═══════════════', '']
    allKeys.forEach(key => {
      const values = envFiles.map(f => fileData[f].find(e => e.key === key)?.value || '(未设置)')
      const allSame = values.every(v => v === values[0])
      if (!allSame) lines.push(key + ': ' + values.join(' | '))
    })
    return { type: 'text', value: lines.join('\n') || '✅ 所有 .env 文件内容相同' }
  }

  if (cmd === 'copy') {
    const from = parts[1] || '.env'
    const to = parts[2] || '.env.local'
    if (!existsSync(from)) return { type: 'text', value: '❌ 源文件未找到：' + from }
    const content = readFileSync(from, 'utf-8')
    writeFileSync(to, content, 'utf-8')
    return { type: 'text', value: '✅ 已复制 ' + from + ' 到 ' + to }
  }

  if (cmd === 'check') {
    const required = parts.slice(1)
    if (required.length === 0) return { type: 'text', value: '📖 用法：/env check <键名1> [键名2] ...' }
    const lines = ['🔍 环境变量检查', '═══════════════', '']
    required.forEach(key => {
      const value = process.env[key]
      lines.push((value ? '✅' : '⚠️') + ' ' + key)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const file = parts[1] || '.env'
    const entries = parseEnvFile(file)
    const lines = entries.map(e => 'export ' + e.key + '="' + e.value + '"')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file) return { type: 'text', value: '📖 用法：/env import <文件>' }
    const entries = parseEnvFile(file)
    const target = '.env.local'
    let lines: string[] = existsSync(target) ? readFileSync(target, 'utf-8').split('\n') : []
    entries.forEach(e => {
      const idx = lines.findIndex(l => l.startsWith(e.key + '='))
      if (idx >= 0) lines[idx] = e.key + '=' + e.value
      else lines.push(e.key + '=' + e.value)
    })
    writeFileSync(target, lines.join('\n') + '\n', 'utf-8')
    return { type: 'text', value: '✅ 已导入 ' + entries.length + ' 个变量到 ' + target }
  }

  return { type: 'text', value: [
    '📋 环境变量管理', '', '📖 用法：',
    '  /env list               列出所有环境变量',
    '  /env get <键名>          获取变量值',
    '  /env set <键名> <值>     设置变量',
    '  /env delete <键名>       删除变量',
    '  /env diff               比较环境文件',
    '  /env copy <源> <目标>    复制环境文件',
    '  /env check <键名...>     检查必需变量',
    '  /env export [文件]       导出为 shell 命令',
    '  /env import <文件>       从文件导入',
  ].join('\n') }
}

const env: Command = {
  type: 'local', name: 'env',
  description: '环境变量管理 - 列出/获取/设置/删除/比较/复制/检查/导出/导入',
  aliases: ['/env', '/environment'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default env
