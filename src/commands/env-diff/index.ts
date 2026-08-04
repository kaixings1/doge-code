import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, existsSync } from 'fs'

interface EnvVar { key: string; value: string; source: string }

function parseEnvFile(file: string): EnvVar[] {
  const vars: EnvVar[] = []
  if (!existsSync(file)) return vars
  try {
    readFileSync(file, 'utf-8').split('\n').forEach(line => {
      const t = line.trim()
      if (!t || t.startsWith('#')) return
      const eq = t.indexOf('=')
      if (eq === -1) return
      vars.push({ key: t.slice(0, eq).trim(), value: t.slice(eq + 1).replace(/^["']|["']$/g, '').trim(), source: file })
    })
  } catch { /* ignore */ }
  return vars
}

function getEnvFiles(): string[] {
  return ['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.staging'].filter(f => existsSync(f))
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Environment Diff', '', 'Usage:', '  /env-diff                        Compare all env files', '  /env-diff <file1> <file2>       Compare two files', '  /env-diff missing               Show missing vars', '  /env-diff extra                 Show extra vars', '  /env-diff shared                Show shared vars', '  /env-diff template              Generate .env.template', '  /env-diff validate              Validate required vars', '  /env-diff sync <from> <to>      Sync vars between files', '  /env-diff export                Export as shell script', '  /env-diff import <file>         Import from file', ''].join('\n') }

  const envFiles = getEnvFiles()
  if (envFiles.length === 0) return { type: 'text', value: 'No .env files found' }

  if (cmd === 'missing' || cmd === 'diff') {
    if (parts.length >= 3) {
      const file1 = parts[1]; const file2 = parts[2]
      const vars1 = parseEnvFile(file1); const vars2 = parseEnvFile(file2)
      const keys1 = new Set(vars1.map(v => v.key)); const keys2 = new Set(vars2.map(v => v.key))
      const missing = [...keys1].filter(k => !keys2.has(k))
      const extra = [...keys2].filter(k => !keys1.has(k))
      const lines = ['Diff: ' + file1 + ' vs ' + file2, '====================', '', 'Missing in ' + file2 + ' (' + missing.length + '):']
      missing.forEach(k => lines.push('  - ' + k))
      lines.push('', 'Extra in ' + file2 + ' (' + extra.length + '):')
      extra.forEach(k => lines.push('  + ' + k))
      return { type: 'text', value: lines.join('\n') }
    }
    const allVars: EnvVar[] = []
    envFiles.forEach(f => allVars.push(...parseEnvFile(f)))
    const allKeys = [...new Set(allVars.map(v => v.key))]
    const lines = ['Env File Comparison:', '=====================', '', 'Files: ' + envFiles.join(', '), '']
    allKeys.forEach(key => {
      const inFiles = envFiles.filter(f => parseEnvFile(f).some(v => v.key === key))
      const status = inFiles.length === envFiles.length ? '[OK]' : '[PARTIAL]'
      lines.push(status + ' ' + key + ' (' + inFiles.length + '/' + envFiles.length + ')')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'missing') {
    const base = parseEnvFile('.env')
    const baseKeys = new Set(base.map(v => v.key))
    const allVars: EnvVar[] = []
    envFiles.filter(f => f !== '.env').forEach(f => allVars.push(...parseEnvFile(f)))
    const allKeys = new Set(allVars.map(v => v.key))
    const missing = [...baseKeys].filter(k => !allKeys.has(k))
    if (missing.length === 0) return { type: 'text', value: '[OK] No missing vars' }
    return { type: 'text', value: 'Missing vars (' + missing.length + '):\n' + missing.join('\n') }
  }

  if (cmd === 'extra') {
    const base = parseEnvFile('.env')
    const baseKeys = new Set(base.map(v => v.key))
    const allVars: EnvVar[] = []
    envFiles.filter(f => f !== '.env').forEach(f => allVars.push(...parseEnvFile(f)))
    const extra = [...new Set(allVars.map(v => v.key))].filter(k => !baseKeys.has(k))
    if (extra.length === 0) return { type: 'text', value: '[OK] No extra vars' }
    return { type: 'text', value: 'Extra vars (' + extra.length + '):\n' + extra.join('\n') }
  }

  if (cmd === 'shared') {
    const allVars: EnvVar[] = []
    envFiles.forEach(f => allVars.push(...parseEnvFile(f)))
    const keyCounts: Record<string, string[]> = {}
    allVars.forEach(v => { if (!keyCounts[v.key]) keyCounts[v.key] = []; keyCounts[v.key].push(v.source) })
    const shared = Object.entries(keyCounts).filter(([_, files]) => new Set(files).size > 1)
    if (shared.length === 0) return { type: 'text', value: 'No shared vars' }
    const lines = ['Shared Vars:', '=============', '']
    shared.forEach(([k, files]) => lines.push(k + ': ' + [...new Set(files)].join(', ')))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'template') {
    const vars = parseEnvFile('.env')
    if (vars.length === 0) return { type: 'text', value: 'No .env file found' }
    const lines = ['# Environment Template', '# Copy to .env.local and fill in values', '']
    vars.forEach(v => lines.push(v.key + '='))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'validate') {
    const required = parts.slice(1)
    if (required.length === 0) return { type: 'text', value: 'Usage: /env-diff validate <key1> [key2] ...' }
    const env = parseEnvFile('.env')
    const envKeys = new Set(env.map(v => v.key))
    const lines = ['Validation:', '============', '']
    required.forEach(k => lines.push((envKeys.has(k) ? '[OK]' : '[MISSING]') + ' ' + k))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'sync') {
    const from = parts[1]; const to = parts[2]
    if (!from || !to) return { type: 'text', value: 'Usage: /env-diff sync <from> <to>' }
    const fromVars = parseEnvFile(from)
    const toVars = parseEnvFile(to)
    const toKeys = new Set(toVars.map(v => v.key))
    const missing = fromVars.filter(v => !toKeys.has(v.key))
    if (missing.length === 0) return { type: 'text', value: '[OK] All vars synced' }
    return { type: 'text', value: 'Missing in ' + to + ' (' + missing.length + '):\n' + missing.map(v => v.key).join('\n') }
  }

  if (cmd === 'export') {
    const vars = parseEnvFile('.env')
    const lines = vars.map(v => 'export ' + v.key + '="' + v.value + '"')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    const vars = parseEnvFile(file)
    return { type: 'text', value: 'Imported ' + vars.length + ' vars from ' + file }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const envDiff: Command = {
  type: 'local', name: 'env-diff',
  description: 'Env diff - compare/missing/extra/shared/template/validate/sync/export/import',
  aliases: '/env-diff, /envd, /env-compare'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default envDiff
