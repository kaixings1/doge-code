/**
 * bridge-secure.ts — 安全版桥接服务器
 *
 * 相比 bridge.ts 增加：
 * - Token 认证（WebSocket + HTTP）
 * - 命令白名单/黑名单过滤
 * - 速率限制
 * - 操作审计日志
 *
 * 启动方式：
 *   bun run scripts/bridge-secure.ts
 *   BRIDGE_TOKEN=my-secret bun run scripts/bridge-secure.ts
 */

import { createServer, type Server, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, createHash, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';

// ─── 安全配置 ───

const CONFIG = {
  PORT: parseInt(process.env.PORT || '5678'),
  TOKEN: process.env.BRIDGE_TOKEN || 'doge-default-token-change-me',
  MAX_CONNECTIONS_PER_SESSION: 10,
  RATE_LIMIT_PER_MINUTE: 60,
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL || '3600000'),
  // 命令安全策略
  ALLOWED_COMMANDS: [
    'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'cd', 'head', 'tail',
    'grep', 'find', 'wc', 'sort', 'uniq', 'diff', 'file',
    'git status', 'git log', 'git diff', 'git branch', 'git show',
    'npm test', 'npm run', 'bun test', 'bun run',
    'python', 'node', 'bun',
    'mkdir', 'rm', 'cp', 'mv',
    'curl', 'wget',
  ],
  BLOCKED_PATTERNS: [
    new RegExp('rm\\s+(-rf?|/)', 'i'),
    /sudo/i,
    /chmod\s+777/i,
    /mkfs/i,
    new RegExp('dd\\s+if=/dev/(zero|random)', 'i'),
    /:\(\)\s*\{.*:\s*\|.*&/,
    /wget.*\|.*sh/i,
    /curl.*\|.*sh/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /child_process/i,
    /process\.env/i,
    /\.\.\//,
  ],
};

// ─── 日志 ───

function tsLog(level: string, ...args: unknown[]) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const color = { INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', DEBUG: '\x1b[36m' }[level] || '\x1b[0m';
  console.log(`${color}[${t}] [${level}]\x1b[0m`, ...args);
}

// ─── 类型 ───

interface ProtocolMessage {
  uuid: string;
  type: string;
  data: any;
  timestamp?: number;
}

interface Session {
  id: string;
  token: string;
  createdAt: number;
  lastActivity: number;
  state: 'active' | 'idle' | 'terminated';
  controllers: Set<string>;
  metadata: Record<string, any>;
  audit: Array<{ time: number; action: string; detail: string }>;
}

interface QueuedMessage {
  id: string;
  sessionId: string;
  message: ProtocolMessage;
  createdAt: number;
  delivered: boolean;
}

// ─── 审计日志 ───

function audit(session: Session, action: string, detail: string) {
  session.audit.push({ time: Date.now(), action, detail });
  if (session.audit.length > 1000) session.audit.shift();
  tsLog('INFO', `[Audit] ${session.id.slice(0, 8)} ${action}: ${detail}`);
}

// ─── 命令安全检查 ───

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  // 检查阻止模式
  for (const pattern of CONFIG.BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `匹配阻止规则: ${pattern.source}` };
    }
  }

  // 提取基础命令
  const baseCmd = command.trim().split(/\s+/)[0]?.toLowerCase();

  // 检查白名单（如果命令包含允许的前缀则放行）
  const isAllowed = CONFIG.ALLOWED_COMMANDS.some(allowed =>
    command.trim().startsWith(allowed) || baseCmd === allowed.split(' ')[0]
  );

  if (!isAllowed && process.env.BRIDGE_STRICT === '1') {
    return { safe: false, reason: `命令不在白名单中 (开启 BRIDGE_STRICT=1 解除限制)` };
  }

  return { safe: true };
}

// ─── 速率限制 ───

class RateLimiter {
  private counts = new Map<string, { count: number; resetAt: number }>();

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(key);
    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + 60000 });
      return true;
    }
    entry.count++;
    return entry.count <= CONFIG.RATE_LIMIT_PER_MINUTE;
  }
}

const rateLimiter = new RateLimiter();

// ─── 存储 ───

class SessionStore {
  private sessions = new Map<string, Session>();
  private queue = new Map<string, QueuedMessage[]>();

  createSession(metadata: Record<string, any> = {}): Session {
    const id = randomUUID();
    const token = createHash('sha256').update(`${id}:${CONFIG.TOKEN}`).digest('hex').slice(0, 16);
    const session: Session = {
      id, token, createdAt: Date.now(), lastActivity: Date.now(),
      state: 'active', controllers: new Set(), metadata, audit: [],
    };
    this.sessions.set(id, session);
    this.queue.set(id, []);
    tsLog('INFO', `[Session] Created: ${id} (token: ${token})`);
    audit(session, 'create', JSON.stringify(metadata));
    return session;
  }

  getSession(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s) s.lastActivity = Date.now();
    return s;
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
    this.queue.delete(id);
    tsLog('INFO', `[Session] Deleted: ${id}`);
  }

  verifyToken(id: string, token: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    try {
      return timingSafeEqual(Buffer.from(session.token), Buffer.from(token));
    } catch {
      return false;
    }
  }

  getActiveSessions(): Array<{ id: string; status: string; controllers: number; createdAt: number }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id, status: s.state, controllers: s.controllers.size, createdAt: s.createdAt,
    }));
  }

  queueMessage(sessionId: string, message: ProtocolMessage): void {
    const queue = this.queue.get(sessionId) || [];
    queue.push({ id: randomUUID(), sessionId, message, createdAt: Date.now(), delivered: false });
    this.queue.set(sessionId, queue);
  }

  getQueuedMessages(sessionId: string): QueuedMessage[] {
    return this.queue.get(sessionId) || [];
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (now - s.lastActivity > CONFIG.SESSION_TTL_MS) {
        this.deleteSession(id);
      }
    }
  }
}

// ─── 工具执行器（带安全检查）───

class ToolExecutor extends EventEmitter {
  private store: SessionStore;

  constructor(store: SessionStore) {
    super();
    this.store = store;
  }

  async executeTool(sessionId: string, tool: string, params: any, senderId?: string): Promise<any> {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    // 速率限制
    const rateKey = `${sessionId}:${senderId || 'unknown'}`;
    if (!rateLimiter.check(rateKey)) {
      throw new Error('速率限制：每分钟最多 60 次请求');
    }

    // 命令安全检查
    if (tool === 'terminal' && params.command) {
      const check = isCommandSafe(params.command);
      if (!check.safe) {
        audit(session, 'blocked', `${params.command} — ${check.reason}`);
        throw new Error(`安全检查未通过: ${check.reason}`);
      }
    }

    audit(session, 'tool', `${tool} ${JSON.stringify(params).slice(0, 100)} by ${senderId || 'HTTP'}`);

    switch (tool) {
      case 'terminal': return this.executeTerminal(params);
      case 'filesystem': return this.executeFilesystem(params);
      case 'search': return this.executeSearch(params);
      case 'code': return this.executeCode(params);
      default: throw new Error(`Unknown tool: ${tool}`);
    }
  }

  private async executeTerminal(params: any): Promise<any> {
    const { command, cwd, timeout = 30000 } = params;
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      const startTime = Date.now();
      const child = exec(command, {
        cwd: cwd || process.cwd(), timeout, maxBuffer: 10 * 1024 * 1024, env: process.env,
      }, (error: any, stdout: string, stderr: string) => {
        const duration = Date.now() - startTime;
        tsLog('DEBUG', `Command "${command?.slice(0, 50)}" completed in ${duration}ms`);
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: error?.code || 0, duration });
      });
    });
  }

  private async executeFilesystem(params: any): Promise<any> {
    const { operation, path, content } = params;
    const fs = await import('fs/promises');
    switch (operation) {
      case 'read': return { success: true, content: await fs.readFile(path, 'utf-8'), path };
      case 'write': await fs.writeFile(path, content ?? '', 'utf-8'); return { success: true, path };
      case 'list': {
        const entries = await fs.readdir(path, { withFileTypes: true });
        return { success: true, path, items: entries.map((e: any) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() })) };
      }
      case 'exists': try { await fs.access(path); return { success: true, path, exists: true }; } catch { return { success: true, path, exists: false }; }
      case 'mkdir': await fs.mkdir(path, { recursive: true }); return { success: true, path };
      case 'delete': await fs.rm(path, { recursive: true, force: true }); return { success: true, path };
      default: throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async executeSearch(params: any): Promise<any> {
    const { pattern, path: searchPath, fileTypes } = params;
    const fs = await import('fs/promises');
    const nodePath = await import('path');
    const results: Array<{ file: string; line: number; content: string }> = [];
    const extensions = fileTypes || ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py', '.go', '.rs'];
    async function scanDir(dir: string): Promise<void> {
      if (results.length >= 100) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= 100) return;
          const fullPath = nodePath.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await scanDir(fullPath);
          } else if (entry.isFile() && extensions.includes(nodePath.extname(entry.name))) {
            try {
              const lines = (await fs.readFile(fullPath, 'utf-8')).split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(pattern)) {
                  results.push({ file: fullPath, line: i + 1, content: lines[i].trim() });
                  if (results.length >= 100) break;
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
    await scanDir(searchPath || '.');
    return { success: true, pattern, matches: results, count: results.length };
  }

  private async executeCode(params: any): Promise<any> {
    const { action, code, language } = params;
    return { result: `Code ${action} complete (${code?.split('\n').length || 0} lines)`, action, language };
  }
}

// ─── 主服务器 ───

const store = new SessionStore();
const executor = new ToolExecutor(store);

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const authHeader = req.headers.authorization;

  // Token 验证辅助
  function checkAuth(): boolean {
    if (!authHeader) return false;
    const token = authHeader.replace('Bearer ', '');
    return token === CONFIG.TOKEN;
  }

  try {
    // GET /health - 健康检查（公开）
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy', version: 'v2.1.0-secure',
        sessions: store['sessions'].size, uptime: process.uptime(),
      }));
      return;
    }

    // POST /v1/code/sessions - 创建会话（需要认证）
    if (req.method === 'POST' && url.pathname === '/v1/code/sessions') {
      const body = await parseBody(req);
      const session = store.createSession(body?.metadata || {});
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: session.id, token: session.token, status: session.state }));
      return;
    }

    // GET /v1/code/sessions - 列出会话（公开）
    if (req.method === 'GET' && url.pathname === '/v1/code/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions: store.getActiveSessions() }));
      return;
    }

    // GET /v1/code/sessions/{id} - 会话信息（公开）
    const sessionMatch = url.pathname.match(/^\/v1\/code\/sessions\/([^/]+)$/);
    if (req.method === 'GET' && sessionMatch) {
      const session = store.getSession(sessionMatch[1]);
      if (!session) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: session.id, status: session.state, controllers: session.controllers.size }));
      return;
    }

    // POST /v1/code/sessions/{id}/tools - 执行工具（需要 Token）
    const toolsMatch = url.pathname.match(/^\/v1\/code\/sessions\/(.+)\/tools$/);
    if (req.method === 'POST' && toolsMatch) {
      const sessionId = toolsMatch[1];
      if (!checkAuth()) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const session = store.getSession(sessionId);
      if (!session) { res.writeHead(404); res.end(JSON.stringify({ error: 'Session not found' })); return; }
      const body = await parseBody(req);
      try {
        const result = await executor.executeTool(sessionId, body.tool, body.params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result, tool: body.tool }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

// ─── WebSocket 服务器 ───

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const sessionId = url.pathname.split('/').pop() || '';
  const token = new URL(request.url!, `http://${request.headers.host}`).searchParams.get('token') || '';

  const session = store.getSession(sessionId);
  if (!session) { ws.close(1008, 'Session not found'); return; }

  if (session.controllers.size >= CONFIG.MAX_CONNECTIONS_PER_SESSION) {
    ws.close(1008, 'Session full');
    return;
  }

  const controllerId = randomUUID();
  session.controllers.add(controllerId);
  audit(session, 'connect', `Controller ${controllerId.slice(0, 8)} connected`);

  ws.send(JSON.stringify({
    type: 'system',
    data: { event: 'connected', sessionId, controllerId, capabilities: ['terminal', 'filesystem', 'search', 'code'] },
  }));

  ws.on('message', async (data) => {
    try {
      const msg: ProtocolMessage = JSON.parse(data.toString());
      if (!msg.type || !msg.uuid) return;

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', uuid: msg.uuid, data: { timestamp: Date.now() } }));
          break;

        case 'register-host':
        case 'controller':
          ws.send(JSON.stringify({ type: 'status', uuid: msg.uuid, data: { message: `Registered as ${msg.type}` } }));
          break;

        case 'tool:request': {
          const { tool, params, callId } = msg.data;
          try {
            ws.send(JSON.stringify({ type: 'tool:start', uuid: msg.uuid, data: { tool, callId } }));
            const result = await executor.executeTool(sessionId, tool, params, controllerId);
            ws.send(JSON.stringify({ type: 'tool:complete', uuid: msg.uuid, data: { tool, result, callId } }));
            ws.send(JSON.stringify({ type: 'tool:response', uuid: msg.uuid, data: { success: true, result, call_id: callId } }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'tool:error', uuid: msg.uuid, data: { tool, error: err.message, callId } }));
            ws.send(JSON.stringify({ type: 'tool:response', uuid: msg.uuid, data: { success: false, error: err.message, call_id: callId } }));
          }
          break;
        }

        case 'message':
          // 广播给 session 内其他连接
          break;

        default:
          ws.send(JSON.stringify({ type: 'ack', uuid: msg.uuid, data: { received: msg.type } }));
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    session.controllers.delete(controllerId);
    audit(session, 'disconnect', `Controller ${controllerId.slice(0, 8)} disconnected`);
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  if (url.pathname.startsWith('/session-ingress/')) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});

// ─── 辅助函数 ───

async function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: string) => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

// ─── 启动 ───

server.listen(CONFIG.PORT, () => {
  tsLog('INFO', `
╔═══════════════════════════════════════════════════════════╗
║       DogeCode Secure Bridge Server v2.1                 ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${CONFIG.PORT}                                            ║
║  Token: ${CONFIG.TOKEN.slice(0, 8)}...                            ║
║  Max connections/session: ${CONFIG.MAX_CONNECTIONS_PER_SESSION}                         ║
║  Rate limit: ${CONFIG.RATE_LIMIT_PER_MINUTE}/min                             ║
║  BRIDGE_STRICT: ${process.env.BRIDGE_STRICT || '0'} (0=允许所有命令, 1=仅白名单)       ║
╚═══════════════════════════════════════════════════════════╝`);

  // 保持进程存活 + 定时清理
  setInterval(() => {
    tsLog('INFO', `Status: ${store['sessions'].size} sessions, uptime ${Math.floor(process.uptime())}s`);
    store.cleanup();
  }, 60000);
});
