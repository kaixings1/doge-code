import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'deploy')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface DeployEnvironment {
  name: string
  target: 'vercel' | 'netlify' | 'docker' | 'pm2' | 'ssh' | 'custom'
  url: string
  env: Record<string, string>
  buildCommand: string
  preDeploy: string[]
  postDeploy: string[]
  healthCheck: string
  timeout: number
  autoRollback: boolean
}

interface DeployConfig {
  environments: Record<string, DeployEnvironment>
  defaultEnv: string
  requireBuildPass: boolean
  requireTestsPass: boolean
  trackHistory: boolean
  autoHealthCheck: boolean
}

interface DeployRecord {
  id: string
  date: string
  env: string
  target: string
  status: 'success' | 'failed' | 'rolled-back' | 'in-progress'
  duration: number
  commit: string
  message: string
  logs: string[]
}

const DEFAULT_CONFIG: DeployConfig = {
  environments: {
    dev: { name: 'dev', target: 'docker', url: 'http://localhost:3000', env: {}, buildCommand: 'npm run build', preDeploy: [], postDeploy: [], healthCheck: '/health', timeout: 60000, autoRollback: true },
    staging: { name: 'staging', target: 'vercel', url: '', env: {}, buildCommand: 'npm run build', preDeploy: ['npm run test'], postDeploy: [], healthCheck: '/health', timeout: 120000, autoRollback: true },
    prod: { name: 'prod', target: 'vercel', url: '', env: {}, buildCommand: 'npm run build', preDeploy: ['npm run test', 'npm run lint'], postDeploy: [], healthCheck: '/health', timeout: 120000, autoRollback: false },
  },
  defaultEnv: 'dev',
  requireBuildPass: true,
  requireTestsPass: false,
  trackHistory: true,
  autoHealthCheck: true,
}

function loadConfig(): DeployConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: DeployConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): DeployRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: DeployRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 100) history.splice(0, history.length - 100)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function getCurrentCommit(): string {
  try { return execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8' }).trim() } catch { return 'unknown' }
}

function run(cmd: string, timeout: number): { ok: boolean; output: string } {
  try { return { ok: true, output: execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim() } }
  catch (e: any) { return { ok: false, output: e.message || 'Command failed' } }
}

function healthCheck(url: string, path: string, timeout = 15000): { ok: boolean; status: string; duration: number } {
  try {
    const start = Date.now()
    const status = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time ${timeout / 1000} "${url}${path}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
    return { ok: status.startsWith('2') || status.startsWith('3'), status, duration: Date.now() - start }
  } catch { return { ok: false, status: 'UNREACHABLE', duration: timeout } }
}

function deployToTarget(env: DeployEnvironment): { ok: boolean; output: string } {
  switch (env.target) {
    case 'vercel': return run('vercel --prod --yes 2>&1', env.timeout)
    case 'netlify': return run('netlify deploy --prod 2>&1', env.timeout)
    case 'docker': return run('docker compose up -d --build 2>&1', env.timeout)
    case 'pm2': return run('pm2 restart ecosystem.config.js 2>&1 || pm2 start ecosystem.config.js 2>&1', env.timeout)
    case 'ssh': {
      const sshHost = env.env.SSH_HOST || ''
      if (!sshHost) return { ok: false, output: '[ERROR] SSH_HOST not set in environment config' }
      return run(`ssh ${sshHost} "cd ${env.env.REMOTE_DIR || '/app'} && git pull && npm ci && npm run build && pm2 restart all" 2>&1`, env.timeout)
    }
    default: return { ok: false, output: 'Unknown target: ' + env.target }
  }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Deploy Manager (Advanced)', '', 'Usage:', '  /deploy <env>                   Deploy to environment', '  /deploy now [env]               Deploy now', '  /deploy list                    List environments', '  /deploy status [env]            Deployment status', '  /deploy rollback [env]          Rollback last deploy', '  /deploy history                 Deploy history', '  /deploy logs                    Recent deploy logs', '  /deploy check                   Pre-deploy checks', '  /deploy health [url]            Health check', '  /deploy env <name>              View env config', '  /deploy env-set <env> <k> <v>   Set env variable', '  /deploy add-env <name> <target> Add environment', '  /deploy remove-env <name>       Remove environment', '  /deploy set-default <name>      Set default env', '  /deploy ssh <host> <cmd>        SSH execute', '  /deploy scp <src> <host>:<dst>  SCP upload', '  /deploy pm2 <list|logs|restart> PM2 management', '  /deploy docker <up|down|logs>   Docker management', '  /deploy vercel [--prod]         Deploy to Vercel', '  /deploy netlify                 Deploy to Netlify', '  /deploy config                  View full config', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    const lines = ['Deploy Environments:', '====================', '']
    for (const [name, env] of Object.entries(config.environments)) {
      const mark = name === config.defaultEnv ? '*' : ' '
      lines.push(`${mark} ${name} → ${env.target} (${env.url || 'no URL'})`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'env') {
    const name = parts[1] || config.defaultEnv
    const env = config.environments[name]
    if (!env) return { type: 'text', value: `Unknown env: ${name}` }
    const lines = [`Environment: ${name}`, '=================', '', `Target: ${env.target}`, `URL: ${env.url || '(not set)'}`, `Build: ${env.buildCommand}`, `Pre-deploy: ${env.preDeploy.join('; ') || 'none'}`, `Post-deploy: ${env.postDeploy.join('; ') || 'none'}`, `Health: ${env.healthCheck}`, `Timeout: ${env.timeout}ms`, `Auto-rollback: ${env.autoRollback}`, '', 'Env Vars:']
    Object.entries(env.env).forEach(([k, v]) => lines.push(`  ${k}=${v}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'env-set') {
    const envName = parts[1]; const key = parts[2]; const value = parts.slice(3).join(' ')
    if (!envName || !key || !value) return { type: 'text', value: 'Usage: /deploy env-set <env> <key> <value>' }
    const env = config.environments[envName]
    if (!env) return { type: 'text', value: `Unknown env: ${envName}` }
    env.env[key] = value
    saveConfig(config)
    return { type: 'text', value: `[OK] ${envName}.${key} = ${value}` }
  }

  if (cmd === 'add-env') {
    const name = parts[1]; const target = parts[2] as DeployEnvironment['target']
    if (!name || !target) return { type: 'text', value: 'Usage: /deploy add-env <name> <target>' }
    if (!['vercel', 'netlify', 'docker', 'pm2', 'ssh', 'custom'].includes(target)) return { type: 'text', value: 'Target must be: vercel, netlify, docker, pm2, ssh, custom' }
    config.environments[name] = { name, target, url: '', env: {}, buildCommand: 'npm run build', preDeploy: [], postDeploy: [], healthCheck: '/health', timeout: 60000, autoRollback: true }
    saveConfig(config)
    return { type: 'text', value: `[OK] Added env: ${name} (${target})` }
  }

  if (cmd === 'remove-env') {
    const name = parts[1]
    if (!name || !config.environments[name]) return { type: 'text', value: `Unknown env: ${name}` }
    if (name === config.defaultEnv) return { type: 'text', value: 'Cannot remove default env. Set another default first.' }
    delete config.environments[name]
    saveConfig(config)
    return { type: 'text', value: `[OK] Removed env: ${name}` }
  }

  if (cmd === 'set-default') {
    const name = parts[1]
    if (!name || !config.environments[name]) return { type: 'text', value: `Unknown env: ${name}` }
    config.defaultEnv = name
    saveConfig(config)
    return { type: 'text', value: `[OK] Default env: ${name}` }
  }

  if (cmd === 'check' || cmd === 'preflight') {
    const lines = ['Pre-deploy Checks:', '===================', '']
    const buildExists = existsSync('package.json') || existsSync('pyproject.toml') || existsSync('go.mod') || existsSync('Cargo.toml')
    lines.push((buildExists ? '[OK]' : '[WARN]') + ' Build file detected')
    if (existsSync('package.json')) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      lines.push((pkg.scripts?.build ? '[OK]' : '[WARN]') + ' Build script defined')
      lines.push((pkg.scripts?.test ? '[OK]' : '[WARN]') + ' Test script defined')
    }
    lines.push(existsSync('.gitignore') ? '[OK] .gitignore exists' : '[WARN] No .gitignore')
    lines.push(existsSync('Dockerfile') || existsSync('docker-compose.yml') || existsSync('vercel.json') || existsSync('netlify.toml') ? '[OK] Deploy config exists' : '[WARN] No deploy config (Dockerfile/vercel.json/netlify.toml)')
    const gitClean = run('git status --porcelain', 5000)
    lines.push(gitClean.output === '' ? '[OK] Git working tree clean' : '[WARN] Uncommitted changes:\n' + gitClean.output.slice(0, 300))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No deploy history' }
    const lines = ['Deploy History:', '===============', '']
    history.slice(-15).forEach(h => {
      const icon = h.status === 'success' ? '✅' : h.status === 'failed' ? '❌' : h.status === 'rolled-back' ? '↩️' : '🔄'
      lines.push(`${icon} ${h.date.slice(0, 19)} | ${h.env} → ${h.target} | ${h.status} | ${h.duration}ms | ${h.commit}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'health') {
    const url = parts[1]
    const env = config.environments[config.defaultEnv]
    const targetUrl = url || env?.url
    if (!targetUrl) return { type: 'text', value: 'No URL configured. Use /deploy health <url>' }
    const result = healthCheck(targetUrl, env?.healthCheck || '/health')
    return { type: 'text', value: `Health Check: ${targetUrl}\nStatus: ${result.status} (${result.duration}ms)\n${result.ok ? '[OK] Service healthy' : '[FAIL] Service unhealthy'}` }
  }

  if (cmd === 'ssh') {
    const host = parts[1]; const command = parts.slice(2).join(' ')
    if (!host || !command) return { type: 'text', value: 'Usage: /deploy ssh <host> <command>' }
    const result = run(`ssh ${host} "${command}"`, 30000)
    return { type: 'text', value: result.ok ? result.output : '[ERROR] ' + result.output }
  }

  if (cmd === 'scp') {
    if (!parts[1] || !parts[2]) return { type: 'text', value: 'Usage: /deploy scp <src> <host>:<dest>' }
    const result = run(`scp ${parts[1]} ${parts[2]}`, 60000)
    return { type: 'text', value: result.ok ? '[OK] Uploaded' : '[ERROR] ' + result.output }
  }

  if (cmd === 'pm2') {
    const sub = parts[1] || 'list'
    const result = run(`pm2 ${sub} ${parts.slice(2).join(' ')} 2>&1`, 15000)
    return { type: 'text', value: result.ok ? result.output : '[ERROR] ' + result.output }
  }

  if (cmd === 'docker') {
    const sub = parts[1] || 'ps'
    let command = ''
    if (sub === 'build') command = 'docker build -t app . 2>&1'
    else if (sub === 'up') command = 'docker compose up -d --build 2>&1'
    else if (sub === 'down') command = 'docker compose down 2>&1'
    else if (sub === 'logs') command = 'docker compose logs --tail=50 2>&1'
    else if (sub === 'ps') command = 'docker compose ps 2>&1'
    else return { type: 'text', value: 'Unknown docker subcommand: ' + sub }
    const result = run(command, 120000)
    return { type: 'text', value: result.ok ? result.output : '[ERROR] ' + result.output }
  }

  if (cmd === 'vercel') {
    const envFlag = parts.includes('--prod') ? '--prod' : ''
    const result = run(`vercel ${envFlag} --yes 2>&1`, 120000)
    return { type: 'text', value: result.ok ? result.output : '[ERROR] ' + result.output }
  }

  if (cmd === 'netlify') {
    const result = run('netlify deploy --prod 2>&1', 120000)
    return { type: 'text', value: result.ok ? result.output : '[ERROR] ' + result.output }
  }

  if (cmd === 'rollback') {
    const envName = parts[1] || config.defaultEnv
    const env = config.environments[envName]
    if (!env) return { type: 'text', value: `Unknown env: ${envName}` }
    let result: { ok: boolean; output: string }
    if (env.target === 'vercel') result = run('vercel rollback 2>&1', 30000)
    else if (env.target === 'docker') result = run('docker compose down && git checkout HEAD~1 -- . && docker compose up -d --build 2>&1', 120000)
    else if (env.target === 'pm2') result = run('pm2 deploy ecosystem.config.js revert 2>&1 || echo "No previous deploy"', 30000)
    else result = { ok: false, output: 'Rollback not supported for target: ' + env.target }
    saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: 'rolled-back', duration: 0, commit: getCurrentCommit(), message: 'Rollback', logs: [result.output] })
    return { type: 'text', value: result.ok ? '[OK] Rolled back\n' + result.output : '[ERROR] ' + result.output }
  }

  // Default: deploy to env
  const envName = cmd === 'now' ? (parts[1] || config.defaultEnv) : cmd
  const env = config.environments[envName]
  if (!env) return { type: 'text', value: `Unknown env: ${envName}. Available: ${Object.keys(config.environments).join(', ')}` }

  const lines = [`Deploying to ${envName} (${env.target})`, '═════════════════════════', '', `Commit: ${getCurrentCommit()}`]
  const startTime = Date.now()
  let success = true

  // Pre-deploy
  if (env.preDeploy.length > 0) {
    lines.push('', 'Pre-deploy steps:')
    for (const step of env.preDeploy) {
      lines.push(`  Running: ${step}`)
      const result = run(step, env.timeout)
      if (!result.ok) {
        lines.push(`  ❌ Failed: ${result.output.slice(0, 200)}`)
        success = false
        break
      }
      lines.push('  ✅ Passed')
    }
  }

  // Build
  if (success && env.buildCommand) {
    lines.push('', `Building: ${env.buildCommand}`)
    const result = run(env.buildCommand, env.timeout)
    if (!result.ok) { lines.push(`  ❌ Build failed: ${result.output.slice(0, 300)}`); success = false }
    else lines.push('  ✅ Build passed')
  }

  // Deploy
  if (success) {
    lines.push('', `Deploying via ${env.target}...`)
    const result = deployToTarget(env)
    if (!result.ok) {
      lines.push(`  ❌ Deploy failed: ${result.output.slice(0, 300)}`)
      success = false
      if (env.autoRollback) {
        lines.push('  ↩️ Auto-rolling back...')
        const rb = env.target === 'vercel' ? run('vercel rollback 2>&1', 30000) : { ok: false, output: 'Rollback N/A' }
        lines.push(rb.ok ? '  ✅ Rolled back' : `  ⚠️ ${rb.output}`)
      }
    } else lines.push('  ✅ Deployed')
  }

  // Health check
  if (success && env.url && config.autoHealthCheck) {
    lines.push('', `Health check: ${env.url}${env.healthCheck}`)
    const health = healthCheck(env.url, env.healthCheck)
    lines.push(`${health.ok ? '✅' : '❌'} Status ${health.status} (${health.duration}ms)`)
    if (!health.ok) success = false
  }

  // Post-deploy
  if (success && env.postDeploy.length > 0) {
    lines.push('', 'Post-deploy steps:')
    for (const step of env.postDeploy) {
      lines.push(`  Running: ${step}`)
      run(step, env.timeout)
    }
  }

  const duration = Date.now() - startTime
  lines.push('', `${success ? '✅ DEPLOY SUCCESSFUL' : '❌ DEPLOY FAILED'} (${duration}ms)`)

  saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: success ? 'success' : 'failed', duration, commit: getCurrentCommit(), message: 'Deploy to ' + envName, logs: lines })

  return { type: 'text', value: lines.join('\n') }
}

const deploy: Command = {
  type: 'local', name: 'deploy',
  description: 'Deploy - multi-env/vercel/netlify/docker/pm2/ssh + history/health/rollback/config',
  aliases: ['/deploy', '/ship'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default deploy
