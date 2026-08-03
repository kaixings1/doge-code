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
    if (files.length === 0) return { type: 'text', value: 'No .env files found' }
    const lines = ['Environment Variables:', '=======================', '']
    files.forEach(f => {
      const entries = parseEnvFile(f)
      lines.push('--- ' + f + ' (' + entries.length + ' vars) ---')
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
    if (!key) return { type: 'text', value: 'Usage: /env get <key>' }
    const value = process.env[key]
    return { type: 'text', value: value !== undefined ? key + '=' + key + ' (value hidden for security)' : 'Not set: ' + key }
  }

  if (cmd === 'set') {
    const key = parts[1]
    const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /env set <key> <value>' }
    const envFile = '.env.local'
    let lines: string[] = []
    if (existsSync(envFile)) { lines = readFileSync(envFile, 'utf-8').split('\n') }
    const idx = lines.findIndex(l => l.startsWith(key + '='))
    if (idx >= 0) lines[idx] = key + '=' + value
    else lines.push(key + '=' + value)
    writeFileSync(envFile, lines.join('\n') + '\n', 'utf-8')
    return { type: 'text', value: '[OK] Set ' + key + ' in ' + envFile }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const key = parts[1]
    if (!key) return { type: 'text', value: 'Usage: /env delete <key>' }
    const envFile = '.env.local'
    if (!existsSync(envFile)) return { type: 'text', value: 'No .env.local file' }
    const lines = readFileSync(envFile, 'utf-8').split('\n').filter(l => !l.startsWith(key + '='))
    writeFileSync(envFile, lines.join('\n'), 'utf-8')
    return { type: 'text', value: '[OK] Deleted ' + key }
  }

  if (cmd === 'diff') {
    const envFiles = getEnvFiles()
    if (envFiles.length < 2) return { type: 'text', value: 'Need at least 2 .env files to compare' }
    const allKeys = new Set<string>()
    const fileData: Record<string, EnvEntry[]> = {}
    envFiles.forEach(f => { fileData[f] = parseEnvFile(f); fileData[f].forEach(e => allKeys.add(e.key)) })
    const lines = ['Env Diff:', '==========', '']
    allKeys.forEach(key => {
      const values = envFiles.map(f => fileData[f].find(e => e.key === key)?.value || '(unset)')
      const allSame = values.every(v => v === values[0])
      if (!allSame) lines.push(key + ': ' + values.join(' | '))
    })
    return { type: 'text', value: lines.join('\n') || 'All env files are identical' }
  }

  if (cmd === 'copy') {
    const from = parts[1] || '.env'
    const to = parts[2] || '.env.local'
    if (!existsSync(from)) return { type: 'text', value: 'Source not found: ' + from }
    const content = readFileSync(from, 'utf-8')
    writeFileSync(to, content, 'utf-8')
    return { type: 'text', value: '[OK] Copied ' + from + ' to ' + to }
  }

  if (cmd === 'check') {
    const required = parts.slice(1)
    if (required.length === 0) return { type: 'text', value: 'Usage: /env check <key1> [key2] ...' }
    const lines = ['Env Check:', '===========', '']
    required.forEach(key => {
      const value = process.env[key]
      lines.push((value ? '[OK]' : '[MISSING]') + ' ' + key)
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
    if (!file) return { type: 'text', value: 'Usage: /env import <file>' }
    const entries = parseEnvFile(file)
    const target = '.env.local'
    let lines: string[] = existsSync(target) ? readFileSync(target, 'utf-8').split('\n') : []
    entries.forEach(e => {
      const idx = lines.findIndex(l => l.startsWith(e.key + '='))
      if (idx >= 0) lines[idx] = e.key + '=' + e.value
      else lines.push(e.key + '=' + e.value)
    })
    writeFileSync(target, lines.join('\n') + '\n', 'utf-8')
    return { type: 'text', value: '[OK] Imported ' + entries.length + ' vars to ' + target }
  }

  return { type: 'text', value: [
    'Environment Variables', '', 'Usage:',
    '  /env list               List all env vars from .env files',
    '  /env get <key>          Get variable value',
    '  /env set <key> <val>    Set variable in .env.local',
    '  /env delete <key>       Delete variable',
    '  /env diff               Compare env files',
    '  /env copy <from> <to>   Copy env file',
    '  /env check <keys...>    Check required vars',
    '  /env export [file]      Export as shell commands',
    '  /env import <file>      Import from file',
  ].join('\n') }
}

const env: Command = {
  type: 'local', name: 'env',
  description: 'Environment variables - list/get/set/delete/diff/copy/check/export/import',
  aliases: ['/env', '/environment'], supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default env
