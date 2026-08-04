import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync, spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'docker')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const COMPOSE_DIR = join(CONFIG_DIR, 'composes')

interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  ports: string
  created: string
  cpu?: string
  memory?: string
  health?: string
}

interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  created: string
}

interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  size?: string
}

interface DockerNetwork {
  id: string
  name: string
  driver: string
  scope: string
}

interface DockerConfig {
  defaultRegistry: string
  autoUpdate: boolean
  cleanupThreshold: number
  logMaxSize: string
  buildCache: boolean
  defaultNetwork: string
  securityScan: boolean
  composeProfiles: string[]
  environments: Record<string, { registry: string; network: string; env: Record<string, string> }>
}

interface DockerStats {
  containers: { running: number; stopped: number; total: number }
  images: { total: number; size: string; dangling: number }
  volumes: { total: number; dangling: number }
  networks: { total: number }
  buildCache: { size: string; entries: number }
}

const DEFAULT_CONFIG: DockerConfig = {
  defaultRegistry: 'docker.io',
  autoUpdate: false,
  cleanupThreshold: 7,
  logMaxSize: '10m',
  buildCache: true,
  defaultNetwork: 'bridge',
  securityScan: true,
  composeProfiles: ['dev', 'prod'],
  environments: {},
}

function loadConfig(): DockerConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: DockerConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function run(cmd: string, timeout = 30000): string {
  try { return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim() } catch (e: any) { return '[ERROR] ' + (e.message || 'Command failed') }
}

function parseContainers(all = false): DockerContainer[] {
  const output = run('docker ps' + (all ? ' -a' : '') + ' --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"')
  if (output.startsWith('[ERROR]')) return []
  return output.split('\n').filter(Boolean).map(line => {
    const [id, name, image, status, ports, created] = line.split('|')
    return { id: id?.slice(0, 12), name, image, status, ports, created }
  })
}

function parseImages(all = false): DockerImage[] {
  const output = run('docker images' + (all ? ' -a' : '') + ' --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"')
  if (output.startsWith('[ERROR]')) return []
  return output.split('\n').filter(Boolean).map(line => {
    const [id, repository, tag, size, created] = line.split('|')
    return { id: id?.slice(0, 12), repository, tag, size, created }
  })
}

function parseVolumes(): DockerVolume[] {
  const output = run('docker volume ls --format "{{.Name}}|{{.Driver}}|{{.Mountpoint}}"')
  if (output.startsWith('[ERROR]')) return []
  return output.split('\n').filter(Boolean).map(line => {
    const [name, driver, mountpoint] = line.split('|')
    return { name, driver, mountpoint }
  })
}

function parseNetworks(): DockerNetwork[] {
  const output = run('docker network ls --format "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}"')
  if (output.startsWith('[ERROR]')) return []
  return output.split('\n').filter(Boolean).map(line => {
    const [id, name, driver, scope] = line.split('|')
    return { id: id?.slice(0, 12), name, driver, scope }
  })
}

function getContainerStats(id: string): { cpu: string; memory: string; netIO: string; blockIO: string; pids: string } {
  const output = run(`docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}" ${id}`)
  const [cpu, memory, netIO, blockIO, pids] = output.split('|')
  return { cpu: cpu || 'N/A', memory: memory || 'N/A', netIO: netIO || 'N/A', blockIO: blockIO || 'N/A', pids: pids || '0' }
}

function getContainerLogs(id: string, tail = 50): string {
  return run(`docker logs --tail ${tail} ${id} 2>&1`)
}

function inspectContainer(id: string): any {
  try { return JSON.parse(run(`docker inspect ${id} 2>/dev/null || echo "[]"`) || '[]')[0] || {} } catch { return {} }
}

function getDockerComposeFiles(): string[] {
  const files: string[] = []
  try {
    for (const entry of readdirSync('.')) {
      if (entry === 'docker-compose.yml' || entry === 'docker-compose.yaml' || entry === 'compose.yml' || entry === 'compose.yaml' || entry.startsWith('docker-compose.') || entry.startsWith('compose.')) {
        files.push(entry)
      }
    }
  } catch { /* ignore */ }
  return files
}

function generateDockerfile(language: string, options: { baseImage?: string; port?: number; workdir?: string; cmd?: string }): string {
  const templates: Record<string, string> = {
    node: `# Node.js Dockerfile
FROM ${options.baseImage || 'node:20-alpine'} AS builder
WORKDIR ${options.workdir || '/app'}
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM ${options.baseImage || 'node:20-alpine'} AS runner
WORKDIR ${options.workdir || '/app'}
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE ${options.port || 3000}
HEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 3000}/health || exit 1
CMD ${options.cmd || '["node", "dist/index.js"]'}`,

    python: `# Python Dockerfile
FROM ${options.baseImage || 'python:3.12-slim'} AS builder
WORKDIR ${options.workdir || '/app'}
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python -m compileall .

FROM ${options.baseImage || 'python:3.12-slim'} AS runner
WORKDIR ${options.workdir || '/app'}
COPY --from=builder /app /app
EXPOSE ${options.port || 8000}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${options.port || 8000}/health || exit 1
CMD ${options.cmd || '["python", "-m", "uvicorn", "main:app"]'}`,

    go: `# Go Dockerfile
FROM ${options.baseImage || 'golang:1.22-alpine'} AS builder
WORKDIR ${options.workdir || '/app'}
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app

FROM ${options.baseImage || 'alpine:3.19'} AS runner
WORKDIR ${options.workdir || '/app'}
COPY --from=builder /app/app .
EXPOSE ${options.port || 8080}
HEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 8080}/health || exit 1
CMD ${options.cmd || '["./app"]'}`,

    rust: `# Rust Dockerfile
FROM ${options.baseImage || 'rust:1.75-slim'} AS builder
WORKDIR ${options.workdir || '/app'}
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src
COPY . .
RUN cargo build --release

FROM ${options.baseImage || 'debian:bookworm-slim'} AS runner
WORKDIR ${options.workdir || '/app'}
COPY --from=builder /app/target/release/app .
EXPOSE ${options.port || 8080}
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${options.port || 8080}/health || exit 1
CMD ${options.cmd || '["./app"]'}`,

    java: `# Java Dockerfile
FROM ${options.baseImage || 'eclipse-temurin:21-jdk-alpine'} AS builder
WORKDIR ${options.workdir || '/app'}
COPY . .
RUN ./mvnw package -DskipTests

FROM ${options.baseImage || 'eclipse-temurin:21-jre-alpine'} AS runner
WORKDIR ${options.workdir || '/app'}
COPY --from=builder /app/target/*.jar app.jar
EXPOSE ${options.port || 8080}
HEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 8080}/health || exit 1
CMD ${options.cmd || '["java", "-jar", "app.jar"]'}`,
  }
  return templates[language] || templates.node
}

function generateDockerCompose(services: Array<{ name: string; image: string; port: string; env?: Record<string, string>; volumes?: string[] }>): string {
  let compose = `version: '3.8'\n\nservices:\n`
  services.forEach(s => {
    compose += `  ${s.name}:\n`
    compose += `    image: ${s.image}\n`
    compose += `    ports:\n      - "${s.port}"\n`
    if (s.env && Object.keys(s.env).length > 0) {
      compose += `    environment:\n`
      Object.entries(s.env).forEach(([k, v]) => compose += `      ${k}: ${v}\n`)
    }
    if (s.volumes && s.volumes.length > 0) {
      compose += `    volumes:\n`
      s.volumes.forEach(v => compose += `      - ${v}\n`)
    }
    compose += `    restart: unless-stopped\n`
    compose += `    healthcheck:\n`
    compose += `      test: ["CMD", "curl", "-f", "http://localhost:${s.port.split(':')[0]}/health"]\n`
    compose += `      interval: 30s\n      timeout: 3s\n      retries: 3\n\n`
  })
  compose += `networks:\n  default:\n    driver: bridge\n`
  return compose
}

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: 'Docker Manager\n\nUsage:\n  /docker ps [-a]                 List containers\n  /docker images [-a]             List images\n  /docker run <image>             Run container\n  /docker logs <id> [N]           View logs\n  /docker exec <id> <cmd>         Execute command\n  /docker start|stop|restart <id> Container control\n  /docker build [tag]             Build image\n  /docker pull <image>            Pull image\n  /docker push <image>            Push image\n\nCompose:\n  /docker compose [up|down|ps|logs|build|pull|restart]\n\nAdvanced:\n  /docker stats                  Live resource usage\n  /docker networks               List networks\n  /docker volumes                List volumes\n  /docker inspect <id>           Container details\n  /docker prune                  Clean unused resources\n  /docker cleanup                Remove stopped + unused\n  /docker compose-logs [name]    View compose logs\n  /docker health                 Health check all containers\n\nManagement:\n  /docker generate <lang>        Generate Dockerfile\n  /docker compose-init           Generate docker-compose.yml\n  /docker scan <image>           Security scan\n  /docker config                 View/edit config\n  /docker save <name>            Export container\n  /docker load <file>            Import container' }

  let r = ''
  if (c === 'ps') {
    const containers = parseContainers(p.includes('-a'))
    if (containers.length === 0) return { type: 'text', value: 'No containers found' }
    const lines = ['Containers:', '============', '']
    containers.forEach(c => lines.push(c.id + ' ' + c.name + ' (' + c.image + ') - ' + c.status))
    return { type: 'text', value: lines.join('\n') }
  }

  if (c === 'images') {
    const images = parseImages(p.includes('-a'))
    if (images.length === 0) return { type: 'text', value: 'No images found' }
    const lines = ['Images:', '=======', '']
    images.forEach(i => lines.push(i.repository + ':' + i.tag + ' (' + i.size + ') - ' + i.id))
    return { type: 'text', value: lines.join('\n') }
  }

  if (c === 'logs') { r = getContainerLogs(p[1], parseInt(p[2]) || 50) }
  else if (c === 'exec') { r = run('docker exec ' + p[1] + ' ' + p.slice(2).join(' ')) }
  else if (c === 'start') { r = run('docker start ' + p[1]) }
  else if (c === 'stop') { r = run('docker stop ' + p[1]) }
  else if (c === 'restart') { r = run('docker restart ' + p[1]) }
  else if (c === 'rm') { r = run('docker rm ' + p[1]) }
  else if (c === 'rmi') { r = run('docker rmi ' + p[1]) }
  else if (c === 'build') { r = run('docker build -t ' + (p[1] || 'app') + ' . 2>&1') }
  else if (c === 'images') { r = run('docker images') }
  else if (c === 'pull') { r = run('docker pull ' + p[1]) }
  else if (c === 'push') { r = run('docker push ' + p[1]) }
  else if (c === 'run') { r = run('docker run -d ' + p.slice(1).join(' ')) }
  else if (c === 'inspect') { r = run('docker inspect ' + p[1]) }
  else if (c === 'prune') { r = run('docker system prune -f 2>&1') }
  else if (c === 'cleanup') { r = run('docker container prune -f && docker image prune -f 2>&1') }
  else if (c === 'stats') { r = run('docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"') }
  else if (c === 'networks') { r = run('docker network ls') }
  else if (c === 'volumes') { r = run('docker volume ls') }
  else if (c === 'health') {
    const containers = parseContainers(true)
    if (containers.length === 0) return { type: 'text', value: 'No containers' }
    const lines = ['Container Health:', '==================', '']
    containers.forEach(c => {
      const healthy = c.status.includes('Up') ? '[OK]' : '[DOWN]'
      lines.push(healthy + ' ' + c.name + ' - ' + c.status)
    })
    return { type: 'text', value: lines.join('\n') }
  }
  else if (c === 'compose') {
    const sub = p[1] || 'ps'
    const rest = p.slice(2).join(' ')
    if (sub === 'up') r = run('docker compose up -d ' + rest + ' 2>&1')
    else if (sub === 'down') r = run('docker compose down ' + rest + ' 2>&1')
    else if (sub === 'ps') r = run('docker compose ps')
    else if (sub === 'logs') r = run('docker compose logs --tail=30 ' + rest)
    else if (sub === 'build') r = run('docker compose build ' + rest + ' 2>&1')
    else if (sub === 'pull') r = run('docker compose pull ' + rest + ' 2>&1')
    else if (sub === 'restart') r = run('docker compose restart ' + rest + ' 2>&1')
    else if (sub === 'scale') r = run('docker compose up -d --scale ' + rest + ' 2>&1')
    else r = 'Unknown compose subcommand: ' + sub
  }
  else if (c === 'generate') {
    const lang = p[1] || 'node'
    const dockerfile = generateDockerfile(lang, { port: parseInt(p[2]) || 3000 })
    writeFileSync('Dockerfile', dockerfile, 'utf-8')
    return { type: 'text', value: '[OK] Generated Dockerfile for ' + lang + '\n\n' + dockerfile }
  }
  else if (c === 'compose-init') {
    const compose = generateDockerCompose([
      { name: 'app', image: 'node:20-alpine', port: '3000:3000', env: { NODE_ENV: 'production' }, volumes: ['./data:/data'] },
      { name: 'db', image: 'postgres:16', port: '5432:5432', env: { POSTGRES_DB: 'app', POSTGRES_PASSWORD: 'secret' } },
      { name: 'redis', image: 'redis:7-alpine', port: '6379:6379' },
    ])
    writeFileSync('docker-compose.yml', compose, 'utf-8')
    return { type: 'text', value: '[OK] Generated docker-compose.yml\n\n' + compose }
  }
  else if (c === 'scan') {
    const image = p[1]
    if (!image) return { type: 'text', value: 'Usage: /docker scan <image>' }
    try {
      const output = run('docker scout cves ' + image + ' 2>/dev/null || trivy image ' + image + ' 2>/dev/null || echo "No scanner available"')
      return { type: 'text', value: output }
    } catch { return { type: 'text', value: 'Install docker scout or trivy for scanning' } }
  }
  else if (c === 'config') {
    const config = loadConfig()
    const key = p[1]; const value = p.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: '[OK] ' + key + ' = ' + value } }
    return { type: 'text', value: 'Unknown config: ' + key }
  }
  else { r = 'Unknown: ' + c }

  return { type: 'text', value: r || '(no output)' }
}

const cmd = { type: 'local-jsx' as const, name: 'docker', description: 'Docker - ps/logs/exec/compose/stats/networks/volumes/prune/scan/generate/config', argumentHint: '<ps|logs|exec|compose|stats|networks|volumes|prune|scan|generate|config> [args]', isEnabled: () => true, load: () => import('./index.ts') } satisfies Command
export default cmd
