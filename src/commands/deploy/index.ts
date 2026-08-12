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
    const msg = err?.stderr ? String(err.stderr).trim() : err?.stdout ? String(err.stdout).trim() : err?.message || '未知错误'
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
      if (!sshHost) return { ok: false, output: '❌ SSH_HOST 未配置' }
      return safeExec(`ssh ${sshHost} "cd ${env.env.REMOTE_DIR || '/app'} && git pull && npm ci && npm run build && pm2 restart all" 2>&1`, env.timeout)
    }
    default: return { ok: false, output: `❌ 未知部署目标：${env.target}` }
  }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  try {
    if (cmd === 'help' || cmd === '') return { type: 'text', value: [
      '🚀 部署管理', '', '📖 用法：',
      '  /deploy <环境>                   部署到环境',
      '  /deploy now [环境]               快速部署到默认环境',
      '  /deploy list                    列出环境',
      '  /deploy status [环境]            查看部署状态',
      '  /deploy rollback [环境]          回滚上次部署',
      '  /deploy history                 查看部署历史',
      '  /deploy check                   部署前检查',
      '  /deploy health [URL]            健康检查',
      '  /deploy env <名称>              查看环境配置',
      '  /deploy env-set <环境> <键> <值> 设置环境变量',
      '  /deploy add-env <名称> <目标>    添加环境',
      '  /deploy remove-env <名称>        删除环境',
      '  /deploy set-default <名称>       设置默认环境',
      '  /deploy config                  查看完整配置',
      '  /deploy ssh <主机> <命令>        执行 SSH 命令',
      '  /deploy scp <源> <主机>:<目标>   上传文件',
      '  /deploy pm2 <list|logs>          PM2 进程管理',
      '  /deploy docker <up|down|logs>   Docker 管理',
      '  /deploy vercel [--prod]         部署到 Vercel',
      '  /deploy netlify                 部署到 Netlify',
    ].join('\n') }

    if (cmd === 'list') {
      const lines = ['🚀 部署环境：', '══════════════════', '']
      for (const [name, env] of Object.entries(config.environments)) {
        const mark = name === config.defaultEnv ? '✅' : '  '
        lines.push(`${mark} ${name} → ${env.target} (${env.url || '未设置 URL'})`)
      }
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'config') {
      return { type: 'text', value: JSON.stringify(config, null, 2) }
    }

    if (cmd === 'env') {
      const name = parts[1] || config.defaultEnv
      const env = config.environments[name]
      if (!env) return { type: 'text', value: `❌ 未知环境：${name}\n可用：${Object.keys(config.environments).join(', ')}` }
      const lines = [`📋 环境：${name}`, `🎯 目标：${env.target}`, `🔗 URL：${env.url || '未设置'}`, `🔨 构建：${env.buildCommand}`, `🏥 健康检查：${env.healthCheck}`, `⏱️ 超时：${env.timeout}ms`, `↩️ 自动回滚：${env.autoRollback ? '是' : '否'}`, '', '📦 环境变量：']
      for (const [k, v] of Object.entries(env.env)) lines.push(`  ${k}=${v}`)
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'env-set') {
      const envName = parts[1]; const key = parts[2]; const value = parts.slice(3).join(' ')
      if (!envName || !key || !value) return { type: 'text', value: '📖 用法：/deploy env-set <环境> <键> <值>' }
      const env = config.environments[envName]
      if (!env) return { type: 'text', value: `❌ 未知环境：${envName}` }
      env.env[key] = value; saveConfig(config)
      return { type: 'text', value: `✅ ${envName}.${key} = ${value}` }
    }

    if (cmd === 'add-env') {
      const name = parts[1]; const target = parts[2] as DeployEnvironment['target']
      if (!name || !target) return { type: 'text', value: '📖 用法：/deploy add-env <名称> <目标>\n目标：vercel, netlify, docker, pm2, ssh, custom' }
      if (!['vercel', 'netlify', 'docker', 'pm2', 'ssh', 'custom'].includes(target)) return { type: 'text', value: `❌ 无效目标：${target}\n可选：vercel, netlify, docker, pm2, ssh, custom` }
      if (config.environments[name]) return { type: 'text', value: `⚠️ 环境已存在：${name}` }
      config.environments[name] = { name, target, url: '', env: {}, buildCommand: 'npm run build', preDeploy: [], postDeploy: [], healthCheck: '/health', timeout: 60000, autoRollback: true }
      saveConfig(config)
      return { type: 'text', value: `✅ 已添加环境：${name} (${target})` }
    }

    if (cmd === 'remove-env') {
      const name = parts[1]
      if (!name) return { type: 'text', value: '📖 用法：/deploy remove-env <名称>' }
      if (!config.environments[name]) return { type: 'text', value: `❌ 未知环境：${name}` }
      if (name === config.defaultEnv) return { type: 'text', value: '❌ 无法删除默认环境。请先设置其他默认环境。' }
      delete config.environments[name]; saveConfig(config)
      return { type: 'text', value: `✅ 已删除：${name}` }
    }

    if (cmd === 'set-default') {
      const name = parts[1]
      if (!name || !config.environments[name]) return { type: 'text', value: '📖 用法：/deploy set-default <名称>' }
      config.defaultEnv = name; saveConfig(config)
      return { type: 'text', value: `✅ 默认环境已设置：${name}` }
    }

    if (cmd === 'check') {
      const checks: [string, boolean][] = [
        ['构建文件存在 (package.json/pyproject.toml/go.mod)', existsSync('package.json') || existsSync('pyproject.toml') || existsSync('go.mod')],
        ['构建脚本已定义', existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')).scripts?.build : false],
        ['.gitignore 存在', existsSync('.gitignore')],
        ['部署配置存在 (Dockerfile/vercel.json/netlify.toml)', existsSync('Dockerfile') || existsSync('docker-compose.yml') || existsSync('vercel.json') || existsSync('netlify.toml')],
      ]
      const gitResult = safeExec('git status --porcelain', 5000)
      checks.push(['Git 工作区干净', gitResult.output === ''])
      const lines = ['📋 部署前检查：', '═══════════════════', '']
      let passed = 0
      for (const [name, ok] of checks) { lines.push(`  ${ok ? '✅' : '❌'} ${name}`); if (ok) passed++ }
      lines.push('', `📊 结果：${passed}/${checks.length} 项检查通过`)
      return { type: 'text', value: lines.join('\n') }
    }

    if (cmd === 'history') {
      const history = loadHistory()
      if (history.length === 0) return { type: 'text', value: 'ℹ️ 暂无部署历史' }
      return { type: 'text', value: '📅 部署历史：\n' + history.slice(-15).map(h => `  ${h.date.slice(0, 19)} | ${h.env} → ${h.target} | ${h.status} | ${h.duration}ms | ${h.commit}`).join('\n') }
    }

    if (cmd === 'health') {
      const url = parts[1] || config.environments[config.defaultEnv]?.url
      if (!url) return { type: 'text', value: 'ℹ️ 未配置 URL。用法：/deploy health <url>' }
      const result = healthCheck(url, '/health')
      return { type: 'text', value: `🏥 健康检查：${url}\n状态：${result.status} (${result.duration}ms)\n${result.ok ? '✅ 服务正常' : '❌ 服务异常'}` }
    }

    if (cmd === 'ssh') {
      const host = parts[1]; const command = parts.slice(2).join(' ')
      if (!host || !command) return { type: 'text', value: '📖 用法：/deploy ssh <主机> <命令>' }
      const result = safeExec(`ssh ${host} "${command}"`, 30000)
      return { type: 'text', value: result.ok ? result.output : `❌ ${result.output}` }
    }

    if (cmd === 'scp') {
      if (!parts[1] || !parts[2]) return { type: 'text', value: '📖 用法：/deploy scp <源文件> <主机>:<目标>' }
      const result = safeExec(`scp ${parts[1]} ${parts[2]}`, 60000)
      return { type: 'text', value: result.ok ? '✅ 上传成功' : `❌ ${result.output}` }
    }

    if (cmd === 'pm2') {
      const sub = parts[1] || 'list'
      const result = safeExec(`pm2 ${sub} ${parts.slice(2).join(' ')} 2>&1`, 15000)
      return { type: 'text', value: result.ok ? result.output : `❌ ${result.output}` }
    }

    if (cmd === 'docker') {
      const sub = parts[1] || 'ps'
      const commands: Record<string, string> = { build: 'docker build -t app . 2>&1', up: 'docker compose up -d --build 2>&1', down: 'docker compose down 2>&1', logs: 'docker compose logs --tail=50 2>&1', ps: 'docker compose ps 2>&1' }
      const command = commands[sub]
      if (!command) return { type: 'text', value: `❌ 未知 Docker 子命令：${sub}\n可用：${Object.keys(commands).join(', ')}` }
      const result = safeExec(command, 120000)
      return { type: 'text', value: result.ok ? result.output : `❌ ${result.output}` }
    }

    if (cmd === 'vercel') {
      const envFlag = parts.includes('--prod') ? '--prod' : ''
      const result = safeExec(`vercel ${envFlag} --yes 2>&1`, 120000)
      return { type: 'text', value: result.ok ? result.output : `❌ ${result.output}` }
    }

    if (cmd === 'netlify') {
      const result = safeExec('netlify deploy --prod 2>&1', 120000)
      return { type: 'text', value: result.ok ? result.output : `❌ ${result.output}` }
    }

    if (cmd === 'rollback') {
      const envName = parts[1] || config.defaultEnv
      const env = config.environments[envName]
      if (!env) return { type: 'text', value: `❌ 未知环境：${envName}` }
      let result: { ok: boolean; output: string }
      if (env.target === 'vercel') result = safeExec('vercel rollback 2>&1', 30000)
      else if (env.target === 'docker') result = safeExec('docker compose down && git checkout HEAD~1 -- . && docker compose up -d --build 2>&1', 120000)
      else if (env.target === 'pm2') result = safeExec('pm2 deploy ecosystem.config.js revert 2>&1 || echo "No previous deploy"', 30000)
      else result = { ok: false, output: `${env.target} 不支持回滚` }
      saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: 'rolled-back', duration: 0, commit: getCurrentCommit(), message: '回滚', logs: [result.output] })
      return { type: 'text', value: result.ok ? `✅ 回滚成功\n${result.output}` : `❌ ${result.output}` }
    }

    // Default: deploy to environment
    const envName = cmd === 'now' ? (parts[1] || config.defaultEnv) : cmd
    const env = config.environments[envName]
    if (!env) return { type: 'text', value: `❌ 未知环境：${envName}\n可用：${Object.keys(config.environments).join(', ')}` }

    const lines = [`🚀 部署到 ${envName} (${env.target})`, `📝 提交：${getCurrentCommit()}`]
    const startTime = Date.now()
    let success = true

    for (const step of env.preDeploy) {
      lines.push(`\n🔧 部署前：${step}`)
      const r = safeExec(step, env.timeout)
      if (!r.ok) { lines.push(`  ❌ 失败：${r.output.slice(0, 200)}`); success = false; break }
      lines.push('  ✅ 通过')
    }

    if (success && env.buildCommand) {
      lines.push(`\n🔨 构建：${env.buildCommand}`)
      const r = safeExec(env.buildCommand, env.timeout)
      if (!r.ok) { lines.push(`  ❌ 构建失败：${r.output.slice(0, 300)}`); success = false }
      else lines.push('  ✅ 构建成功')
    }

    if (success) {
      lines.push(`\n📤 部署到 ${env.target}...`)
      const r = deployToTarget(env)
      if (!r.ok) {
        lines.push(`  ❌ 部署失败：${r.output.slice(0, 300)}`)
        success = false
        if (env.autoRollback) {
          lines.push('  ↩️ 自动回滚中...')
          const rb = env.target === 'vercel' ? safeExec('vercel rollback 2>&1', 30000) : { ok: false, output: '回滚不可用' }
          lines.push(rb.ok ? '  ✅ 已回滚' : `  ⚠️ ${rb.output}`)
        }
      } else lines.push('  ✅ 部署成功')
    }

    if (success && env.url && config.autoHealthCheck) {
      const health = healthCheck(env.url, env.healthCheck)
      lines.push(`\n🏥 健康检查：${health.ok ? '✅' : '❌'} 状态 ${health.status} (${health.duration}ms)`)
      if (!health.ok) success = false
    }

    const duration = Date.now() - startTime
    lines.push('', `${success ? '✅ 部署成功' : '❌ 部署失败'} (${duration}ms)`)
    saveHistory({ id: 'deploy-' + Date.now(), date: new Date().toISOString(), env: envName, target: env.target, status: success ? 'success' : 'failed', duration, commit: getCurrentCommit(), message: '部署到 ' + envName, logs: lines })
    return { type: 'text', value: lines.join('\n') }

  } catch (err) {
    return { type: 'text', value: `❌ [ERROR] 未知错误：${formatError(err)}` }
  }
}

const deploy: Command = {
  type: 'local', name: 'deploy',
  description: '🚀 部署 - 多环境/历史/健康/回滚/检查/配置',
  aliases: ['/deploy', '/ship'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default deploy