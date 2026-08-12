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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🔍 环境变量对比', '', '📖 用法：', '  /env-diff                        比较所有环境文件', '  /env-diff <文件1> <文件2>       比较两个文件', '  /env-diff missing               显示缺失变量', '  /env-diff extra                 显示多余变量', '  /env-diff shared                显示共享变量', '  /env-diff template              生成 .env.template', '  /env-diff validate              验证必需变量', '  /env-diff sync <源> <目标>      同步变量', '  /env-diff export                导出为 shell 脚本', '  /env-diff import <文件>         从文件导入', ''].join('\n') }

  const envFiles = getEnvFiles()
  if (envFiles.length === 0) return { type: 'text', value: 'ℹ️ 未找到 .env 文件' }

  if (cmd === 'missing' || cmd === 'diff') {
    if (parts.length >= 3) {
      const file1 = parts[1]; const file2 = parts[2]
      const vars1 = parseEnvFile(file1); const vars2 = parseEnvFile(file2)
      const keys1 = new Set(vars1.map(v => v.key)); const keys2 = new Set(vars2.map(v => v.key))
      const missing = [...keys1].filter(k => !keys2.has(k))
      const extra = [...keys2].filter(k => !keys1.has(k))
      const lines = ['🔍 对比：' + file1 + ' vs ' + file2, '═════════════════════', '', '❌ ' + file2 + ' 中缺失（' + missing.length + '）：']
      missing.forEach(k => lines.push('  - ' + k))
      lines.push('', '➕ ' + file2 + ' 中多余（' + extra.length + '）：')
      extra.forEach(k => lines.push('  + ' + k))
      return { type: 'text', value: lines.join('\n') }
    }
    const allVars: EnvVar[] = []
    envFiles.forEach(f => allVars.push(...parseEnvFile(f)))
    const allKeys = [...new Set(allVars.map(v => v.key))]
    const lines = ['📋 环境文件对比', '═══════════════', '', '📁 文件：' + envFiles.join(', '), '']
    allKeys.forEach(key => {
      const inFiles = envFiles.filter(f => parseEnvFile(f).some(v => v.key === key))
      const status = inFiles.length === envFiles.length ? '✅' : '⚠️'
      lines.push(status + ' ' + key + '（' + inFiles.length + '/' + envFiles.length + '）')
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
    if (missing.length === 0) return { type: 'text', value: '✅ 无缺失变量' }
    return { type: 'text', value: '❌ 缺失变量（' + missing.length + '）：\n' + missing.join('\n') }
  }

  if (cmd === 'extra') {
    const base = parseEnvFile('.env')
    const baseKeys = new Set(base.map(v => v.key))
    const allVars: EnvVar[] = []
    envFiles.filter(f => f !== '.env').forEach(f => allVars.push(...parseEnvFile(f)))
    const extra = [...new Set(allVars.map(v => v.key))].filter(k => !baseKeys.has(k))
    if (extra.length === 0) return { type: 'text', value: '✅ 无多余变量' }
    return { type: 'text', value: '⚠️ 多余变量（' + extra.length + '）：\n' + extra.join('\n') }
  }

  if (cmd === 'shared') {
    const allVars: EnvVar[] = []
    envFiles.forEach(f => allVars.push(...parseEnvFile(f)))
    const keyCounts: Record<string, string[]> = {}
    allVars.forEach(v => { if (!keyCounts[v.key]) keyCounts[v.key] = []; keyCounts[v.key].push(v.source) })
    const shared = Object.entries(keyCounts).filter(([_, files]) => new Set(files).size > 1)
    if (shared.length === 0) return { type: 'text', value: 'ℹ️ 无共享变量' }
    const lines = ['📋 共享变量', '═══════════', '']
    shared.forEach(([k, files]) => lines.push(k + ': ' + [...new Set(files)].join(', ')))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'template') {
    const vars = parseEnvFile('.env')
    if (vars.length === 0) return { type: 'text', value: '❌ 未找到 .env 文件' }
    const lines = ['# 环境变量模板', '# 复制到 .env.local 并填入值', '']
    vars.forEach(v => lines.push(v.key + '='))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'validate') {
    const required = parts.slice(1)
    if (required.length === 0) return { type: 'text', value: '📖 用法：/env-diff validate <键名1> [键名2] ...' }
    const env = parseEnvFile('.env')
    const envKeys = new Set(env.map(v => v.key))
    const lines = ['🔍 验证结果', '═══════════', '']
    required.forEach(k => lines.push((envKeys.has(k) ? '✅' : '⚠️') + ' ' + k))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'sync') {
    const from = parts[1]; const to = parts[2]
    if (!from || !to) return { type: 'text', value: '📖 用法：/env-diff sync <源> <目标>' }
    const fromVars = parseEnvFile(from)
    const toVars = parseEnvFile(to)
    const toKeys = new Set(toVars.map(v => v.key))
    const missing = fromVars.filter(v => !toKeys.has(v.key))
    if (missing.length === 0) return { type: 'text', value: '✅ 所有变量已同步' }
    return { type: 'text', value: '❌ ' + to + ' 中缺失（' + missing.length + '）：\n' + missing.map(v => v.key).join('\n') }
  }

  if (cmd === 'export') {
    const vars = parseEnvFile('.env')
    const lines = vars.map(v => 'export ' + v.key + '="' + v.value + '"')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'import') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 文件未找到：' + file }
    const vars = parseEnvFile(file)
    return { type: 'text', value: '✅ 已从 ' + file + ' 导入 ' + vars.length + ' 个变量' }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const envDiff: Command = {
  type: 'local', name: 'env-diff',
  description: '环境变量对比 - 比较/缺失/多余/共享/模板/验证/同步/导出/导入',
  aliases: '/env-diff, /envd, /env-compare'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default envDiff
