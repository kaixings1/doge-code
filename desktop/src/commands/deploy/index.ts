import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: [
    'Deploy Tools:', '',
    'SSH/SCP:',
    '  /deploy ssh <host> <cmd>       SSH execute command',
    '  /deploy scp <src> <host>:<dst> SCP upload file',
    '',
    'PM2:',
    '  /deploy pm2 list               PM2 process list',
    '  /deploy pm2 restart <name>     PM2 restart',
    '  /deploy pm2 logs <name>        PM2 logs',
    '  /deploy pm2 stop <name>        PM2 stop',
    '  /deploy pm2 monit              PM2 monitor',
    '',
    'Docker:',
    '  /deploy docker build           Docker build',
    '  /deploy docker up              Docker compose up',
    '  /deploy docker down            Docker compose down',
    '  /deploy docker logs            Docker logs',
    '  /deploy docker ps              Docker ps',
    '',
    'Platforms:',
    '  /deploy vercel                 Deploy to Vercel',
    '  /deploy vercel --prod          Deploy to Vercel production',
    '  /deploy netlify                Deploy to Netlify',
    '  /deploy status                 Check deploy status',
    '  /deploy rollback               Rollback last deploy',
  ].join('\n') }

  let r = ''
  if (c === 'ssh') {
    const host = p[1]; const cmd = p.slice(2).join(' ')
    if (!host || !cmd) return { type: 'text', value: 'Usage: /deploy ssh <host> <command>' }
    try { r = execSync('ssh ' + host + ' "' + cmd + '"', { encoding: 'utf-8', timeout: 30000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'scp') {
    if (!p[1] || !p[2]) return { type: 'text', value: 'Usage: /deploy scp <src> <host>:<dest>' }
    try { r = execSync('scp ' + p[1] + ' ' + p[2], { encoding: 'utf-8', timeout: 60000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'pm2') {
    const sub = p[1] || 'list'
    try { r = execSync('pm2 ' + sub + ' ' + p.slice(2).join(' '), { encoding: 'utf-8', timeout: 15000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'docker') {
    const sub = p[1] || 'ps'
    try {
      if (sub === 'build') r = execSync('docker build -t app . 2>&1', { encoding: 'utf-8', timeout: 120000 }).trim()
      else if (sub === 'up') r = execSync('docker compose up -d 2>&1', { encoding: 'utf-8', timeout: 60000 }).trim()
      else if (sub === 'down') r = execSync('docker compose down 2>&1', { encoding: 'utf-8', timeout: 30000 }).trim()
      else if (sub === 'logs') r = execSync('docker compose logs --tail=50 2>&1', { encoding: 'utf-8', timeout: 15000 }).trim()
      else if (sub === 'ps') r = execSync('docker compose ps 2>&1', { encoding: 'utf-8', timeout: 10000 }).trim()
      else r = 'Unknown docker subcommand: ' + sub
    } catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'vercel') {
    const env = p.includes('--prod') ? '--prod' : ''
    try { r = execSync('vercel ' + env + ' --yes 2>&1', { encoding: 'utf-8', timeout: 120000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'netlify') {
    try { r = execSync('netlify deploy --prod 2>&1', { encoding: 'utf-8', timeout: 120000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'status') {
    try {
      const pm2 = execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const docker = execSync('docker compose ps --format "{{.Names}}: {{.Status}}" 2>/dev/null || echo ""', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      r = 'PM2: ' + pm2.slice(0, 500) + '\nDocker: ' + docker
    } catch (e: any) { r = '[ERROR] ' + e.message }
  } else if (c === 'rollback') {
    try { r = execSync('vercel rollback 2>&1', { encoding: 'utf-8', timeout: 30000 }).trim() }
    catch (e: any) { r = '[ERROR] ' + e.message }
  } else {
    r = 'Unknown: ' + c
  }
  return { type: 'text', value: r || '(no output)' }
}

const cmd = { type: 'local-jsx' as const, name: 'deploy', description: 'Deploy - ssh/scp/pm2/docker/vercel/netlify + rollback + status', argumentHint: '<ssh|scp|pm2|docker|vercel|netlify|status|rollback> [args]', isEnabled: () => true, load: () => import('./index.ts') } satisfies Command
export default cmd
