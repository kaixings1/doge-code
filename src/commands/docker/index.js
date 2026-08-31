import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
const CONFIG_DIR = join(homedir(), '.doge', 'docker');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const EXEC_TIMEOUT = 60000;
const DEFAULT_CONFIG = {
    defaultRegistry: 'docker.io', autoUpdate: false, cleanupThreshold: 7,
    logMaxSize: '10m', buildCache: true, defaultNetwork: 'bridge', securityScan: true,
};
// ====== Utility Helpers ======
function safeExec(cmd, timeout = EXEC_TIMEOUT) {
    try {
        const output = execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
        return { ok: true, output: output.trim() };
    }
    catch (err) {
        const msg = err?.stderr ? String(err.stderr).trim() : err?.stdout ? String(err.stdout).trim() : err?.message || '未知错误';
        return { ok: false, output: msg.slice(0, 500) };
    }
}
function safeWriteFile(file, content) {
    try {
        const d = dirname(file);
        if (!existsSync(d))
            mkdirSync(d, { recursive: true });
        writeFileSync(file, content, 'utf-8');
        return true;
    }
    catch {
        return false;
    }
}
function formatError(err) {
    if (err instanceof Error)
        return err.message.slice(0, 200);
    return String(err).slice(0, 200);
}
function loadConfig() {
    try {
        if (existsSync(CONFIG_FILE))
            return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
    }
    catch { /* ignore */ }
    return { ...DEFAULT_CONFIG };
}
function saveConfig(config) { safeWriteFile(CONFIG_FILE, JSON.stringify(config, null, 2)); }
function parseContainers(all = false) {
    const result = safeExec(`docker ps ${all ? '-a' : ''} --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"`, 10000);
    if (!result.ok)
        return [];
    return result.output.split('\n').filter(Boolean).map(line => {
        const [id, name, image, status, ports, created] = line.split('|');
        return { id: id?.slice(0, 12) || '', name: name || '', image: image || '', status: status || '', ports: ports || '', created: created || '' };
    });
}
function generateDockerfile(language, options) {
    const templates = {
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 3000}/health || exit 1
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:${options.port || 8000}/health || exit 1
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 8080}/health || exit 1
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:${options.port || 8080}/health || exit 1
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:${options.port || 8080}/health || exit 1
CMD ${options.cmd || '["java", "-jar", "app.jar"]'}`,
    };
    return templates[language] || 'Unsupported language: ' + language + '\nSupported: ' + Object.keys(templates).join(', ');
}
export const call = async (args) => {
    if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
        return { output: `docker — Docker - ps/logs/exec/compose/stats/networks/volumes/prune/scan/generate/config\n用法: /docker`.trim(), truncated: false };
    }
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    const config = loadConfig();
    try {
        if (!c)
            return { type: 'text', value: [
                    '🐳 Docker 管理', '', '📖 用法：',
                    '  /docker ps [-a]                 列出容器',
                    '  /docker logs <id> [N]           查看容器日志',
                    '  /docker exec <id> <命令>        在容器中执行命令',
                    '  /docker start|stop|restart <id> 容器生命周期',
                    '  /docker rm <id>                 删除容器',
                    '  /docker rmi <id>                删除镜像',
                    '  /docker build [标签]            构建镜像',
                    '  /docker pull|push <镜像>        拉取/推送镜像',
                    '  /docker scan <镜像>             安全扫描镜像',
                    '  /docker stats                   实时资源使用',
                    '  /docker networks                列出网络',
                    '  /docker volumes                 列出卷',
                    '  /docker prune                   清理未使用资源',
                    '', 'Compose：',
                    '  /docker compose up|down|ps|logs|build|pull|restart [参数]',
                    '', '生成：',
                    '  /docker generate <语言>         生成 Dockerfile',
                    '  /docker compose-init            生成 compose.yml',
                    '', '配置：',
                    '  /docker config                  查看/编辑配置',
                    '  /docker health                  健康检查所有容器',
                ].join('\n') };
        let r = '';
        if (c === 'ps') {
            const containers = parseContainers(p.includes('-a'));
            return { type: 'text', value: containers.length > 0 ? '📋 容器列表：\n' + containers.map(c => `  ${c.id} ${c.name}（${c.image}）- ${c.status}`).join('\n') : 'ℹ️ 未找到容器' };
        }
        if (c === 'logs') {
            const id = p[1];
            if (!id)
                return { type: 'text', value: '📖 用法：/docker logs <容器ID>' };
            const n = parseInt(p[2]) || 50;
            r = safeExec(`docker logs --tail ${n} ${id} 2>&1`, 10000).output;
        }
        else if (c === 'exec') {
            const id = p[1];
            const cmd = p.slice(2).join(' ');
            if (!id || !cmd)
                return { type: 'text', value: '📖 用法：/docker exec <id> <命令>' };
            r = safeExec(`docker exec ${id} ${cmd}`, 30000).output;
        }
        else if (['start', 'stop', 'restart', 'rm'].includes(c)) {
            const id = p[1];
            if (!id)
                return { type: 'text', value: `📖 用法：/docker ${c} <容器ID>` };
            r = safeExec(`docker ${c} ${id}`, 30000).output;
        }
        else if (c === 'rmi') {
            const id = p[1];
            if (!id)
                return { type: 'text', value: '📖 用法：/docker rmi <镜像ID>' };
            r = safeExec(`docker rmi ${id}`, 30000).output;
        }
        else if (c === 'build') {
            const tag = p[1] || 'app';
            r = safeExec(`docker build -t ${tag} . 2>&1`, 120000).output;
        }
        else if (c === 'pull') {
            const img = p[1];
            if (!img)
                return { type: 'text', value: '📖 用法：/docker pull <镜像>' };
            r = safeExec(`docker pull ${img}`, 120000).output;
        }
        else if (c === 'push') {
            const img = p[1];
            if (!img)
                return { type: 'text', value: '📖 用法：/docker push <镜像>' };
            r = safeExec(`docker push ${img}`, 120000).output;
        }
        else if (c === 'run') {
            r = safeExec(`docker run -d ${p.slice(1).join(' ')}`, 15000).output;
        }
        else if (c === 'prune') {
            r = safeExec('docker system prune -f 2>&1', 30000).output;
        }
        else if (c === 'stats') {
            r = safeExec('docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"', 10000).output;
        }
        else if (c === 'networks') {
            r = safeExec('docker network ls', 10000).output;
        }
        else if (c === 'volumes') {
            r = safeExec('docker volume ls', 10000).output;
        }
        else if (c === 'health') {
            const containers = parseContainers(true);
            return { type: 'text', value: containers.length > 0 ? '🏥 容器健康：\n' + containers.map(c => `  ${c.status.includes('Up') ? '✅' : '❌'} ${c.name} - ${c.status}`).join('\n') : 'ℹ️ 无容器' };
        }
        else if (c === 'compose') {
            const sub = p[1] || 'ps';
            const rest = p.slice(2).join(' ');
            const cmds = { up: `docker compose up -d ${rest} 2>&1`, down: `docker compose down ${rest} 2>&1`, ps: 'docker compose ps', logs: `docker compose logs --tail=30 ${rest}`, build: `docker compose build ${rest} 2>&1`, pull: `docker compose pull ${rest} 2>&1`, restart: `docker compose restart ${rest} 2>&1` };
            const cmd = cmds[sub];
            if (!cmd)
                return { type: 'text', value: `❌ 未知 compose 子命令：${sub}\n可用：${Object.keys(cmds).join(', ')}` };
            r = safeExec(cmd, 120000).output;
        }
        else if (c === 'generate') {
            const lang = p[1] || 'node';
            const dockerfile = generateDockerfile(lang, { port: parseInt(p[2]) || 3000 });
            safeWriteFile('Dockerfile', dockerfile);
            return { type: 'text', value: `✅ [OK] Generated Dockerfile for ${lang}\n\n${dockerfile}` };
        }
        else if (c === 'compose-init') {
            const compose = `version: '3.8'\n\nservices:\n  app:\n    image: node:20-alpine\n    ports:\n      - "3000:3000"\n    environment:\n      NODE_ENV: production\n    restart: unless-stopped\n    healthcheck:\n      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]\n      interval: 30s\n      timeout: 3s\n      retries: 3\n\n  db:\n    image: postgres:16-alpine\n    ports:\n      - "5432:5432"\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_PASSWORD: secret\n    restart: unless-stopped\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n\nvolumes:\n  pgdata:\n`;
            safeWriteFile('docker-compose.yml', compose);
            return { type: 'text', value: `✅ [OK] Generated docker-compose.yml\n\n${compose}` };
        }
        else if (c === 'scan') {
            const image = p[1];
            if (!image)
                return { type: 'text', value: '📖 用法：/docker scan <镜像>' };
            const r1 = safeExec(`docker scout cves ${image} 2>&1`, 120000);
            if (r1.ok)
                return { type: 'text', value: r1.output.slice(0, 2000) };
            const r2 = safeExec(`trivy image ${image} 2>&1`, 120000);
            if (r2.ok)
                return { type: 'text', value: r2.output.slice(0, 2000) };
            return { type: 'text', value: '💡 安装 docker scout 或 trivy 进行镜像扫描：\n  docker scout：docker scout install\n  trivy：npm install -g trivy' };
        }
        else if (c === 'config') {
            const key = p[1];
            const value = p.slice(2).join(' ');
            if (!key || !value)
                return { type: 'text', value: JSON.stringify(config, null, 2) };
            if (key in config) {
                config[key] = value;
                saveConfig(config);
                return { type: 'text', value: `✅ [OK] ${key} = ${value}` };
            }
            return { type: 'text', value: `❌ 未知配置项：${key}` };
        }
        else {
            r = `❌ 未知命令：${c}`;
        }
        return { type: 'text', value: r || '（无输出）' };
    }
    catch (err) {
        return { type: 'text', value: `❌ [ERROR] ${formatError(err)}` };
    }
};
const cmd = { type: 'local-jsx', name: 'docker', description: 'Docker - ps/logs/exec/compose/stats/networks/volumes/prune/scan/generate/config', argumentHint: '<ps|logs|exec|compose|stats|networks|volumes|prune|scan|generate|config> [args]', isEnabled: () => true, load: () => import('./index.ts') };
export default cmd;
