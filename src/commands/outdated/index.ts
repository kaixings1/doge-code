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
  catch (e: any) { return { ok: false, output: e.message || 'Failed' } }
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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Outdated Dependencies (Advanced)', '', '📖 📖 Usage: ', '  /outdated                       Check outdated deps', '  /outdated major                 Major updates', '  /outdated minor                 Minor updates', '  /outdated patch                 Patch updates', '  /outdated security              Security vulnerabilities', '  /outdated update <pkg>          Update specific package', '  /outdated update-safe           Update safe (patch/minor)', '  /outdated update-all            Update all to latest', '  /outdated stats                 Statistics', '  /outdated history               Check history', '  /outdated config                Show/edit config', '  /outdated set <key> <val>       Set config value', '  /outdated export [file]         Export report', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /outdated set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No check history. Run /outdated first.' }
    const lines = ['Check History:', '═══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.status} | ${h.outdated} outdated | ${h.major} major | ${h.security} security`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'security') {
    const issues = getSecurityIssues()
    if (issues.length === 0) return { type: 'text', value: '[OK] No security vulnerabilities found!' }
    const lines = ['Security Vulnerabilities (' + issues.length + '):', '═══════════════════════════════', '']
    issues.forEach((i, idx) => {
      const icon = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🟡'
      lines.push(`${icon} ${idx + 1}. ${i.name} (${i.severity}, ${i.fixAvailable})`)
    })
    lines.push('', 'Fix: npm audit fix (or /outdated update-all)')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'major' || cmd === 'minor' || cmd === 'patch') {
    const deps = getOutdatedDeps(config)
    const filtered = deps.filter(d => d.updateType === cmd)
    if (filtered.length === 0) return { type: 'text', value: `[OK] No ${cmd} updates available` }
    const lines = [`${cmd.charAt(0).toUpperCase() + cmd.slice(1)} Updates (${filtered.length}):`, '══════════════════════', '']
    filtered.slice(0, 30).forEach((d, i) => {
      const warn = cmd === 'major' ? ' ⚠️ breaking' : ''
      lines.push(`  ${i + 1}. ${d.name}: ${d.current} → ${d.latest}${warn}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'update' || cmd === 'update-safe' || cmd === 'update-all') {
    if (cmd === 'update') {
      const pkg = parts[1]
      if (!pkg) return { type: 'text', value: 'Usage: /outdated update <package>' }
      const result = run(`npm install ${pkg}@latest 2>&1`)
      return { type: 'text', value: result.ok ? `[OK] Updated: ${pkg}` : '[ERROR] ' + result.output.slice(0, 200) }
    }
    const deps = getOutdatedDeps(config)
    if (deps.length === 0) return { type: 'text', value: '[OK] All dependencies up to date' }
    const target = cmd === 'update-safe' ? deps.filter(d => d.updateType !== 'major') : deps
    if (target.length === 0) return { type: 'text', value: 'No safe updates (only major updates available)' }
    const pkgs = target.map(d => d.name + '@' + d.latest).join(' ')
    const result = run(`npm install ${pkgs} 2>&1`)
    return { type: 'text', value: result.ok ? `[OK] Updated ${target.length} packages:\n${target.slice(0, 15).map(d => `  ${d.name}: ${d.current} → ${d.latest}`).join('\n')}` : '[ERROR] ' + result.output.slice(0, 300) }
  }

  if (cmd === 'stats') {
    const deps = getOutdatedDeps(config)
    const byType: Record<string, number> = { major: 0, minor: 0, patch: 0 }
    const outdated = deps.filter(d => d.status !== 'ok')
    outdated.forEach(d => { byType[d.updateType]++ })
    const security = getSecurityIssues().length
    const lines = ['Dependency Statistics:', '══════════════════════', '', `Total deps: ${deps.length}`, `Up to date: ${deps.length - outdated.length}`, `Outdated: ${outdated.length}`, '', 'By type:']
    Object.entries(byType).forEach(([t, c]) => lines.push(`  ${t}: ${c}`))
    lines.push(`Security issues: ${security}`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'export') {
    const deps = getOutdatedDeps(config)
    const security = getSecurityIssues()
    const file = parts[1] || 'outdated-report.json'
    writeFileSync(file, JSON.stringify({ deps, security, date: new Date().toISOString() }, null, 2), 'utf-8')
    return { type: 'text', value: `[OK] Exported: ${file}` }
  }

  const deps = getOutdatedDeps(config)
  const outdated = deps.filter(d => d.status !== 'ok')
  const security = getSecurityIssues()
  const major = outdated.filter(d => d.updateType === 'major').length
  saveHistory({ date: new Date().toISOString(), total: deps.length, outdated: outdated.length, major, security: security.length, status: outdated.length === 0 ? 'UP-TO-DATE' : 'OUTDATED' })

  if (outdated.length === 0) return { type: 'text', value: `[OK] All ${deps.length} dependencies up to date!` }

  const lines = ['Outdated Dependencies (' + outdated.length + '/' + deps.length + '):', '══════════════════════════════', '']
  outdated.slice(0, 25).forEach((d, i) => {
    const icon = d.updateType === 'major' ? '🔴' : d.updateType === 'minor' ? '🟡' : '🔵'
    lines.push(`  ${icon} ${i + 1}. ${d.name}: ${d.current} → ${d.latest} (${d.updateType})`)
  })
  if (outdated.length > 25) lines.push(`... ${outdated.length - 25} more`)
  if (security.length > 0) lines.push('', `🔒 ${security.length} security issues (run /outdated security)`)
  lines.push('', 'Actions:', '  /outdated update-safe - update patch+minor only', '  /outdated update-all  - update everything to latest', '  /outdated update <pkg> - update specific package')
  return { type: 'text', value: lines.join('\n') }
}

const outdated: Command = {
  type: 'local', name: 'outdated',
  description: 'Outdated - major/minor/patch/security/update-safe/update-all/stats/history',
  aliases: ['/outdated', '/old', '/update'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default outdated
