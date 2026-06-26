import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

function run(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim() }
  catch (e: any) { return '错误: ' + e.message }
}

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '/docker ps | run\n/docker ps -a | all\n/docker logs <id> | logs\n/docker start <id> | start\n/docker stop <id> | stop\n/docker build | build\n/docker images | images\n/docker exec <id> <cmd> | exec' }
  let r = ''
  if (c === 'ps') { r = run('docker ps' + (p.includes('-a') ? ' -a' : '')) }
  else if (c === 'logs') { r = run('docker logs --tail 50 ' + (p[1] || '')) }
  else if (c === 'start') { r = run('docker start ' + (p[1] || '')) }
  else if (c === 'stop') { r = run('docker stop ' + (p[1] || '')) }
  else if (c === 'build') { r = run('docker build -t app . 2>&1') }
  else if (c === 'images') { r = run('docker images') }
  else if (c === 'exec') { r = run('docker exec ' + p[1] + ' ' + p.slice(2).join(' ')) }
  else { r = '未知: ' + c }
  return { type: 'text', value: r || '(无输出)' }
}

const cmd = { type: 'local-jsx' as const, name: 'docker', description: 'Docker 容器管理：ps/logs/start/stop/build/images/exec', argumentHint: '<ps|logs|start|stop|build|images|exec>', isEnabled: () => true, load: () => import('./index.js') } satisfies Command
export default cmd
