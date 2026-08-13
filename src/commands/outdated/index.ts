import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'outdated')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface OutdatedDep {
  name: string
  current: string
  wanted: string
  latest: string
  updateType: 'major' | 'minor' | 'patch'
  status: 'ok' | 'outdated' | 'major' | 'unknown'
}

interface OutdatedConfig {
  packageManager: 'npm' | 'yarn' | 'pnpm'
  includeDev: boolean
  checkSecurity: boolean
  updateStrategy: 'safe' | 'all'
  checkOnStartup: boolean
}

interface OutdatedRecord {
  date: string
  total: number
  outdated: number
  major: number
  security: number
  status: string
}

const DEFAULT_CONFIG: OutdatedConfig = {
  packageManager: 'npm',
  includeDev: true,
  checkSecurity: true,
  updateStrategy: 'safe',
  checkOnStartup: false,
}

function loadConfig(): OutdatedConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: OutdatedConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): OutdatedRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: OutdatedRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function run(cmd: string, timeout = 60000): { ok: boolean; output: string } {
  try { return { ok: true, output: execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim() } }
  catch (e: any) { return { ok: false, output: e.message || '执行失败' } }
}

function classifyUpdate(current: string, latest: string): 'major' | 'minor' | 'patch' {
  const c = current.split('.').map(Number)
  const l = latest.split('.').map(Number)
  if (l[0] > c[0]) return 'major'
  if (l[1] > c[1]) return 'minor'
  return 'patch'
}

function getOutdatedDeps(config: OutdatedConfig): OutdatedDep[] {
  const result = run('npm outdated --json 2>/dev/null || echo "{}"')
  if (!result.ok) return []
  try {
    const data = JSON.parse(result.output)
    const deps: OutdatedDep[] = []
    for (const [name, info] of Object.entries(data as Record<string, any>)) {
      const current = info.current || '0.0.0'
      const wanted = info.wanted || current
      const latest = info.latest || current
      deps.push({
        name, current, wanted, latest,
        updateType: classifyUpdate(current, latest),
        status: latest === current ? 'ok' : classifyUpdate(current, latest) === 'major' ? 'major' : 'outdated',
      })
    }
    return deps
  } catch { return [] }
}

function getSecurityIssues(): Array<{ name: string; severity: string; fixAvailable: string }> {
  const result = run('npm audit --json 2>/dev/null || echo "{}"')
  if (!result.ok) return []
  try {
    const data = JSON.parse(result.output)
    const issues: Array<{ name: string; severity: string; fixAvailable: string }> = []
    const vulns = data.vulnerabilities || {}
    for (const [name, info] of Object.entries(vulns as Record<string, any>)) {
      if (info.severity === 'low' || info.severity === 'moderate') continue
      issues.push({ name, severity: info.severity, fixAvailable: info.isDirect ? 'direct' : 'indirect' })
    }
    return issues.slice(0, 20)
  } catch { return [] }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📦 过期依赖检查（高级）', '', '📖 用法：', '  /outdated                       检查过期依赖', '  /outdated major                 大版本更新', '  /outdated minor                 小版本更新', '  /outdated patch                 补丁更新', '  /outdated security              安全漏洞', '  /outdated update <包名>         更新指定包', '  /outdated update-safe           安全更新（仅补丁/小版本）', '  /outdated update-all            全部更新到最新', '  /outdated stats                 统计', '  /outdated history               查看历史', '  /outdated config                查看/编辑配置', '  /outdated set <键> <值>         设置配置', '  /outdated export [文件]         导出报告', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置项：${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/outdated set <键> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: '📋 暂无检查历史。请先运行 /outdated。' }
    const lines = ['📅 检查历史：', '═══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.status} | ${h.outdated} 个过期 | ${h.major} 个大版本 | ${h.security} 个安全问题`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'security') {
    const issues = getSecurityIssues()
    if (issues.length === 0) return { type: 'text', value: '✅ 未发现安全漏洞！' }
    const lines = ['🔒 安全漏洞（' + issues.length + '）：', '═══════════════════════════════', '']
    issues.forEach((i, idx) => {
      const icon = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🟡'
      lines.push(`${icon} ${idx + 1}. ${i.name} (${i.severity}, ${i.fixAvailable})`)
    })
    lines.push('', '💡 修复建议：运行 npm audit fix 或 /outdated update-all')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'major' || cmd === 'minor' || cmd === 'patch') {
    const deps = getOutdatedDeps(config)
    const filtered = deps.filter(d => d.updateType === cmd)
    if (filtered.length === 0) return { type: 'text', value: `✅ 没有可用的 ${cmd} 更新` }
    const title = cmd === 'major' ? '大版本' : cmd === 'minor' ? '小版本' : '补丁'
    const lines = [`📦 ${title}更新（${filtered.length}）：`, '══════════════════════', '']
    filtered.slice(0, 30).forEach((d, i) => {
      const warn = cmd === 'major' ? ' ⚠️ breaking' : ''
      lines.push(`  ${i + 1}. ${d.name}: ${d.current} → ${d.latest}${warn}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'update' || cmd === 'update-safe' || cmd === 'update-all') {
    if (cmd === 'update') {
      const pkg = parts[1]
      if (!pkg) return { type: 'text', value: '📖 用法：/outdated update <包名>' }
      const result = run(`npm install ${pkg}@latest 2>&1`)
      return { type: 'text', value: result.ok ? `✅ 已更新：${pkg}` : '❌ 更新失败：' + result.output.slice(0, 200) }
    }
    const deps = getOutdatedDeps(config)
    if (deps.length === 0) return { type: 'text', value: '✅ 所有依赖均为最新' }
    const target = cmd === 'update-safe' ? deps.filter(d => d.updateType !== 'major') : deps
    if (target.length === 0) return { type: 'text', value: '📋 没有安全更新（只有大版本更新可用）' }
    const pkgs = target.map(d => d.name + '@' + d.latest).join(' ')
    const result = run(`npm install ${pkgs} 2>&1`)
    return { type: 'text', value: result.ok ? '✅ 已更新 ' + target.length + ' 个包：\n' + target.slice(0, 15).map(d => '  ' + d.name + '：' + d.current + ' → ' + d.latest).join('\n') : '❌ 更新失败：' + result.output.slice(0, 300) }
  }

  if (cmd === 'stats') {
    const deps = getOutdatedDeps(config)
    const byType: Record<string, number> = { major: 0, minor: 0, patch: 0 }
    const outdated = deps.filter(d => d.status !== 'ok')
    outdated.forEach(d => { byType[d.updateType]++ })
    const security = getSecurityIssues().length
    const lines = ['📊 依赖统计：', '══════════════════════', '', `总依赖数：${deps.length}`, `已是最新：${deps.length - outdated.length}`, `已过期：${outdated.length}`, '', '按类型：']
    Object.entries(byType).forEach(([t, c]) => lines.push(`  ${t}：${c}`))
    lines.push('安全问题：' + security)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const deps = getOutdatedDeps(config)
    const security = getSecurityIssues()
    const file = parts[1] || 'outdated-report.json'
    writeFileSync(file, JSON.stringify({ deps, security, date: new Date().toISOString() }, null, 2), 'utf-8')
    return { type: 'text', value: `✅ 已导出：${file}` }
  }

  const deps = getOutdatedDeps(config)
  const outdated = deps.filter(d => d.status !== 'ok')
  const security = getSecurityIssues()
  const major = outdated.filter(d => d.updateType === 'major').length
  saveHistory({ date: new Date().toISOString(), total: deps.length, outdated: outdated.length, major, security: security.length, status: outdated.length === 0 ? 'UP-TO-DATE' : 'OUTDATED' })

  if (outdated.length === 0) return { type: 'text', value: `✅ ${deps.length} 个依赖均已是最新！` }

  const lines = ['📦 过期依赖（' + outdated.length + '/' + deps.length + '）：', '══════════════════════════════', '']
  outdated.slice(0, 25).forEach((d, i) => {
    const icon = d.updateType === 'major' ? '🔴' : d.updateType === 'minor' ? '🟡' : '🔵'
    lines.push(`  ${icon} ${i + 1}. ${d.name}: ${d.current} → ${d.latest} (${d.updateType})`)
  })
  if (outdated.length > 25) lines.push(`... ${outdated.length - 25} more`)
  if (security.length > 0) lines.push('', `🔒 ${security.length} 个安全问题（运行 /outdated security 查看）`)
  lines.push('', '操作：', '  /outdated update-safe - 仅更新补丁和小版本', '  /outdated update-all  - 全部更新到最新', '  /outdated update <包名> - 更新指定包')
  return { type: 'text', value: lines.join('\n') }
}

const outdated: Command = {
  type: 'local', name: 'outdated',
  description: '📦 过期依赖 - 大版本/小版本/补丁/安全/安全更新/全部更新/统计/历史',
  aliases: ['/outdated', '/old', '/update'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default outdated
