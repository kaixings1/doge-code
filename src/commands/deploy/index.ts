import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, normalize } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'deploy')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')
const EXEC_TIMEOUT = 60000

interface DeployEnvironment {
  name: string; target: 'vercel' | 'netlify' | 'docker' | 'pm2' | 'ssh' | 'custom'
  url: string; env: Record<string, string>; buildCommand: string
  preDeploy: string[]; postDeploy: string[]; healthCheck: string; timeout: number; autoRollback: boolean
}

interface DeployConfig {
  environments: Record<string, DeployEnvironment>; defaultEnv: string
  requireBuildPass: boolean; requireTestsPass: boolean; trackHistory: boolean; autoHealthCheck: boolean
}

interface DeployRecord {
  id: string; date: string; env: string; target: string
  status: 'success' | 'failed' | 'rolled-back' | 'in-progress'; duration: number; commit: string; message: string; logs: string[]
}

// ====== Utility Helpers ======
function safeExec(cmd: string, timeout = EXEC_TIMEOUT): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 })
    return { ok: true, output: output.trim() }
  } catch (err: any) {
    const msg = err?.stderr ? String(err.stderr).trim() : err?.stdout ? String(err.stdout).trim() : err?.message || 'Unknown error'
    return { ok: false, output: msg.slice(0, 500) }
  }
}

function safeReadFile(file: string): string | null {
  try { if (!existsSync(file)) return null; return readFileSync(file, 'utf-8') } catch { return null }
}

function safeWriteFile(file: string, content: string): boolean {
  try { const d = dirname(file); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(file, content, 'utf-8'); return true } catch { return false }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200)
  return String(err).slice(0, 200)
}

function loadConfig(): DeployConfig {
  try {
    if (existsSync(CONFIG_FILE)) return { ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  } catch { /* corrupted - use defaults */ }
  return {
    environments: {
      dev: { name: 'dev', target: 'docker', url: 'http://localhost:3000', env: {}, buildCommand: 'npm run build', preDeploy: [], postDeploy: [], healthCheck: '/health', timeout: 60000, autoRollback: true },
      staging: { name: 'staging', target: 'vercel', url: '', env: {}, buildCommand: 'npm run build', preDeploy: ['npm run test'], postDeploy: [], healthCheck: '/health', timeout: 120000, autoRollback: true },
      prod: { name: 'prod', target: 'vercel', url: '', env: {}, buildCommand: 'npm run build', preDeploy: ['npm run test', 'npm run lint'], postDeploy: [], healthCheck: '/health', timeout: 120000, autoRollback: false },
    },
    defaultEnv: 'dev', requireBuildPass: true, requireTestsPass: false, trackHistory: true, autoHealthCheck: true,
  }
}

function saveConfig(config: DeployConfig) { safeWriteFile(CONFIG_FILE, JSON.stringify(config, null, 2)) }

function loadHistory(): DeployRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { return [] }
}

function saveHistory(record: DeployRecord) {
  try {
    const history = loadHistory(); history.push(record)
    if (history.length > 100) history.splice(0, history.length - 100)
    safeWriteFile(HISTORY_FILE, JSON.stringify(history, null, 2))
  } catch { /* ignore */ }
}

function getCurrentCommit(): string {
  try { return execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim() } catch { return 'unknown' }
}

function healthCheck(url: string, path: string, timeout = 15000): { ok: boolean; status: string; duration: number } {
  try {
    const start = Date.now()
    const status = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time ${Math.ceil(timeout / 1000)} "${url}${path}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
    return { ok: status.startsWith('2') || status.startsWith('3'), status, duration: Date.now() - start }
  } catch { return { ok: false, status: 'UNREACHABLE', duration: timeout } }
}

function deployToTarget(env: DeployEnvironment): { ok: boolean; output: string } {
  switch (env.target) {
    case 'vercel': return safeExec('vercel --prod --yes 2>&1', env.timeout)
    case 'netlify': return safeExec('netlify deploy --prod 2>&1', env.timeout)
    case 'docker': return safeExec('docker compose up -d --build 2>&1', env.timeout)
    case 'pm2': return safeExec('pm2 restart ecosystem.config.js 2>&1 || pm2 start ecosystem.config.js 2>&1', env.timeout)
    case 'ssh': {
      const sshHost = env.env.SSH_HOST || ''
      if (!sshHost) return { ok: false, output: '[ERROR] SSH_HOST not configured' }
      return safeExec(`ssh ${sshHost} "cd ${env.env.REMOTE_DIR || '/app'} && git pull && npm ci && npm run build && pm2 restart all" 2>&1`, env.timeout)
    }
    default: return { ok: false, output: `Unknown target: ${env.target}` }
  }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  try {
    if (cmd === 'help' || cmd === '') return { type: 'text', value: [
      'Deploy Manager', '', 'Usage:',
      '  /deploy <env>                   Deploy to environment',
      '  /deploy now [env]               Quick deploy to default env',
      '  /deploy list                    List environments',
      '  /deploy status [env]            Check deployment status',
      '  /deploy rollback [env]          Rollback last deploy',
      '  /deploy history                 View deploy history',
      '  /deploy check                   Pre-deploy checklist',
      '  /deploy health [url]            Health check endpoint',
      '  /deploy env <name>              View environment config',
      '  /deploy env-set <env> <k> <v>   Set environment variable',
      '  /deploy add-env <name> <target> Add new environment',
      '  /deploy remove-env <name>       Remove environment',
      '  /deploy set-default <name>      Set default environment',
      '  /deploy config                  View full configuration',
      '  /deploy ssh <host> <cmd>        Execute SSH command',
      '  /deploy scp <src> <host>:<dst>  Upload via SCP',
      '  /deploy pm2 <list|logs>          PM2 process management',
      '  /deploy docker <up|down|logs>   Docker management',
      '  /deploy vercel [--prod]         Deploy to Vercel',
      '  /deploy netlify                 Deploy to Netlify',
    ].join('\n') }

    if (cmd === 'list') {
      const lines = ['Deploy Environments:', '════════════════════', '']
      for (const [name, env] of Object.entries(config.environments)) {
        const mark = name === config.defaultEnv ? '*' : ' '
        lines.push(`${mark} ${name} → ${env.target} (${env.url || 'no URL'})`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'config') {
      return { type: 'text', value: JSON.stringify(config, null, 2) }
    }

    if (cmd === 'env') {
      const name = parts[1] || config.defaultEnv
      const env = config.environments[name]
      if (!env) return { type: 'text', value: `Unknown environment: ${name}\nAvailable: ${Object.keys(config.environments).join(', ')}` }
      const lines = [`Environment: ${name}`, `Target: ${env.target}`, `URL: ${env.url || '(not set)'}`, `Build: ${env.buildCommand}`, `Health: ${env.healthCheck}`, `Timeout: ${env.timeout}ms`, `Auto-rollback: ${env.autoRollback}`, '', 'Env Vars:']
      for (const [k, v] of Object.entries(env.env)) lines.push(`  ${k}=${v}`)
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'env-set') {
      const envName = parts[1]; const key = parts[2]; const value = parts.slice(3).join(' ')
      if (!envName || !key || !value) return { type: 'text', value: 'Usage: /deploy env-set <env> <key> <value>' }
      const env = config.environments[envName]
      if (!env) return { type: 'text', value: `Unknown environment: ${envName}` }
      env.env[key] = value; saveConfig(config)
      return { type: 'text', value: `[OK] ${envName}.${key} = ${value}` }
    }

    if (cmd === 'add-env') {
      const name = parts[1]; const target = parts[2] as DeployEnvironment['target']
      if (!name || !target) return { type: 'text', value: 'Usage: /deploy add-env <name> <target>\nTargets: vercel, netlify, docker, pm2, ssh, custom' }
      if (!['vercel', 'netlify', 'docker', 'pm2', 'ssh', 'custom'].includes(target)) return { type: 'text', value: `Invalid target: ${target}\nValid: vercel, netlify, docker, pm2, ssh, custom` }
      if (config.environments[name]) return { type: 'text', value: `Environment already exists: ${name}` }
      config.environments[name] = { name, target, url: '', env: {}, buildCommand: 'npm run build', preDeploy: [], postDeploy: [], healthCheck: '/health', timeout: 60000, autoRollback: true }
      saveConfig(config)
      return { type: 'text', value: `[OK] Added environment: ${name} (${target})` }
    }

    if (cmd === 'remove-env') {
      const name = parts[1]
      if (!name) return { type: 'text', value: 'Usage: /deploy remove-env <name>' }
      if (!config.environments[name]) return { type: 'text', value: `Unknown environment: ${name}` }
      if (name === config.defaultEnv) return { type: 'text', value: 'Cannot remove default environment. Set another default first.' }
      delete config.environments[name]; saveConfig(config)
      return { type: 'text', value: `[OK] Removed: ${name}` }
    }

    if (cmd === 'set-default') {
      const name = parts[1]
      if (!name || !config.environments[name]) return { type: 'text', value: 'Usage: /deploy set-default <name>' }
      config.defaultEnv = name; saveConfig(config)
      return { type: 'text', value: `[OK] Default environment: ${name}` }
    }

    if (cmd === 'check') {
      const checks: [string, boolean][] = [
        ['Build file exists (package.json/pyproject.toml/go.mod)', existsSync('package.json') || existsSync('pyproject.toml') || existsSync('go.mod')],
        ['Build script defined', existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')).scripts?.build : false],
        ['.gitignore exists', existsSync('.gitignore')],
        ['Deploy config exists (Dockerfile/vercel.json/netlify.toml)', existsSync('Dockerfile') || existsSync('docker-compose.yml') || existsSync('vercel.json') || existsSync('netlify.toml')],
      ]
      const gitResult = safeExec('git status --porcelain', 5000)
      checks.push(['Git working tree clean', gitResult.output === ''])
      const lines = ['Pre-deploy Checks:', '═══════════════════', '']
      let passed = 0
      for (const [name, ok] of checks) { lines.push(`  ${ok ? '✅' : '❌'} ${name}`); if (ok) passed++ }
      lines.push('', `Result: ${passed}/${checks.length} checks passed`)
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'history') {
      const history = loadHistory()
      if (history.length === 0) return { type: 'text', value: 'No deploy history' }
      return { type: 'text', value: 'Deploy History:\n' + history.slice(-15).map(h => `  ${h.date.slice(0, 19)} | ${h.env} → ${h.target} | ${h.status} | ${h.duration}ms | ${h.commit}`).join('\n') }
    }

    if (cmd === 'health') {
      const url = parts[1] || config.environments[config.defaultEnv]?.url
      if (!url) return { type: 'text', value: 'No URL configured. Use /deploy health <url>' }
      const result = healthCheck(url, '/health')
      return { type: 'text', value: `Health Check: ${url}\nStatus: ${result.status} (${result.duration}ms)\n${result.ok ? '✅ Service healthy' : '❌ Service unhealthy'}` }
    }

    if (cmd === 'ssh') {
      const host = parts[1]; const command = parts.slice(2).join(' ')
      if (!host || !command) return { type: 'text', value: 'Usage: /deploy ssh <host> <command>' }
      const result = safeExec(`ssh ${host} "${command}"`, 30000)
      return { type: 'text', value: result.ok ? result.output : `[ERROR] ${result.output}` }
    }

    if (cmd === 'scp') {
      if (!parts[1] || !parts[2]) return { type: 'text', value: 'Usage: /deploy scp <src> <host>:<dest>' }
      const result = safeExec(`scp ${parts[1]} ${parts[2]}`, 60000)
      return { type: 'text', value: result.ok ? '[OK] Uploaded' : `[ERROR] ${result.output}` }
    }

    if (cmd === 'pm2') {
      const sub = parts[1] || 'list'
      const result = safeExec(`pm2 ${sub} ${parts.slice(2).join(' ')} 2>&1`, 15000)
      return { type: 'text', value: result.ok ? result.output : `[ERROR] ${result.output}` }
    }

    if (cmd === 'docker') {
      const sub = parts[1] || 'ps'
      const commands: Record<string, string> = { build: 'docker build -t app . 2>&1', up: 'docker compose up -d --build 2>&1', down: 'docker compose down 2>&1', logs: 'docker compose logs --tail=50 2>&1', ps: 'docker compose ps 2>&1' }
      const command = commands[sub]
      if (!command) return { type: 'text', value: `Unknown docker subcommand: ${sub}\nAvailable: ${Object.keys(commands).join(', ')}` }
      const result = safeExec(command, 120000)
      return { type: 'text', value: result.ok ? result.output : `[ERROR] ${result.output}` }
    }

    if (cmd === 'vercel') {
      const envFlag = parts.includes('--prod') ? '--prod' : ''
      const result = safeExec(`vercel ${envFlag} --yes 2>&1`, 120000)
      return { type: 'text', value: result.ok ? result.output : `[ERROR] ${result.output}` }
    }

    if (cmd === 'netlify') {
      const result = safeExec('netlify deploy --prod 2>&1', 120000)
      return { type: 'text', value: result.ok ? result.output : `[ERROR] ${result.output}` }
    }

    if (cmd === 'rollback') {
      const envName = parts[1] || config.defaultEnv
      const env = config.environments[envName]
      if (!env) return { type: 'text', value: `Unknown environment: ${envName}` }
      let result: { ok: boolean; output: string }
      if (env.target === 'vercel') result = safeExec('vercel rollback 2>&1', 30000)
      else if (env.target === 'docker') result = safeExec('docker compose down && git checkout HEAD~1 -- . && docker compose up -d --build 2>&1', 120000)
      else if (env.target === 'pm2') result = safeExec('pm2 deploy ecosystem.config.js revert 2>&1 || echo "No previous deploy"', 30000)
      else result = { ok: false, output: `Rollback not supported for ${env.target}` }
      saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: 'rolled-back', duration: 0, commit: getCurrentCommit(), message: 'Rollback', logs: [result.output] })
      return { type: 'text', value: result.ok ? `[OK] Rolled back\n${result.output}` : `[ERROR] ${result.output}` }
    }

    // Default: deploy to environment
    const envName = cmd === 'now' ? (parts[1] || config.defaultEnv) : cmd
    const env = config.environments[envName]
    if (!env) return { type: 'text', value: `Unknown environment: ${envName}\nAvailable: ${Object.keys(config.environments).join(', ')}` }

    const lines = [`Deploying to ${envName} (${env.target})`, `Commit: ${getCurrentCommit()}`]
    const startTime = Date.now()
    let success = true

    for (const step of env.preDeploy) {
      lines.push(`\nPre-deploy: ${step}`)
      const r = safeExec(step, env.timeout)
      if (!r.ok) { lines.push(`  ❌ Failed: ${r.output.slice(0, 200)}`); success = false; break }
      lines.push('  ✅ Passed')
    }

    if (success && env.buildCommand) {
      lines.push(`\nBuilding: ${env.buildCommand}`)
      const r = safeExec(env.buildCommand, env.timeout)
      if (!r.ok) { lines.push(`  ❌ Build failed: ${r.output.slice(0, 300)}`); success = false }
      else lines.push('  ✅ Build passed')
    }

    if (success) {
      lines.push(`\nDeploying via ${env.target}...`)
      const r = deployToTarget(env)
      if (!r.ok) {
        lines.push(`  ❌ Deploy failed: ${r.output.slice(0, 300)}`)
        success = false
        if (env.autoRollback) {
          lines.push('  ↩️ Auto-rolling back...')
          const rb = env.target === 'vercel' ? safeExec('vercel rollback 2>&1', 30000) : { ok: false, output: 'Rollback N/A' }
          lines.push(rb.ok ? '  ✅ Rolled back' : `  ⚠️ ${rb.output}`)
        }
      } else lines.push('  ✅ Deployed')
    }

    if (success && env.url && config.autoHealthCheck) {
      const health = healthCheck(env.url, env.healthCheck)
      lines.push(`\nHealth check: ${health.ok ? '✅' : '❌'} Status ${health.status} (${health.duration}ms)`)
      if (!health.ok) success = false
    }

    const duration = Date.now() - startTime
    lines.push('', `${success ? '✅ DEPLOY SUCCESSFUL' : '❌ DEPLOY FAILED'} (${duration}ms)`)
    saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: success ? 'success' : 'failed', duration, commit: getCurrentCommit(), message: 'Deploy to ' + envName, logs: lines })
    return { type: 'text', value: lines.join('\n') }

  } catch (err) {
    return { type: 'text', value: `[ERROR] Unexpected error: ${formatError(err)}` }
  }
}

const deploy: Command = {
  type: 'local', name: 'deploy',
  description: 'Deploy - multi-environment with history/health/rollback/check/config',
  aliases: ['/deploy', '/ship'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default deploy