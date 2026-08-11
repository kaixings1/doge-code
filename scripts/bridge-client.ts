/**
 * bridge-client.ts — DogeCode 远程协助客户端
 *
 * 用法：
 *   bun run scripts/bridge-client.ts                    # 创建新会话（Host）
 *   bun run scripts/bridge-client.ts --join <sessionId>  # 加入会话（Remote）
 *   bun run scripts/bridge-client.ts --list             # 列出活跃会话
 *
 * 交互式命令：
 *   任何文本 → 作为 shell 命令执行
 *   /read <path> → 读取文件
 *   /list <path> → 列出目录
 *   /search <pattern> → 搜索代码
 *   /help → 显示帮助
 *   /quit → 退出
 */

import { WebSocket } from 'ws';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

const BRIDGE_URL = process.env.BRIDGE_URL || `http://localhost:${process.env.PORT || 5678}`;
const WS_URL = BRIDGE_URL.replace(/^http/, 'ws');
const SESSION_ID = process.argv.find((arg, i) => process.argv[i - 1] === '--join') || '';
const MODE = process.argv.includes('--list') ? 'list' : (SESSION_ID ? 'join' : 'host');

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
};

function log(tag: string, msg: string, color: keyof typeof colors = 'reset') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`${colors.gray}[${time}]${colors.reset} ${colors[color]}[${tag}]${colors.reset} ${msg}`);
}

function printBanner() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║           DogeCode Bridge Client v2.0                    ║
║           远程协助 / 远程终端                             ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
}

// ─── HTTP API ───

async function createSession(): Promise<string> {
  const resp = await fetch(`${BRIDGE_URL}/v1/code/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { client: 'bridge-client', createdAt: Date.now() } }),
  });
  if (!resp.ok) throw new Error(`创建会话失败: ${resp.status}`);
  const data = await resp.json();
  return data.id;
}

async function listSessions(): Promise<any[]> {
  const resp = await fetch(`${BRIDGE_URL}/v1/code/sessions`);
  if (!resp.ok) throw new Error(`获取会话列表失败: ${resp.status}`);
  const data = await resp.json();
  return data.sessions || [];
}

async function getSessionInfo(sessionId: string): Promise<any> {
  const resp = await fetch(`${BRIDGE_URL}/v1/code/sessions/${sessionId}`);
  if (!resp.ok) throw new Error(`获取会话信息失败: ${resp.status}`);
  return resp.json();
}

// ─── WebSocket 客户端 ───

class BridgeClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private role: 'host' | 'controller';
  private connected = false;
  private rl: ReturnType<typeof createInterface> | null = null;

  constructor(sessionId: string, role: 'host' | 'controller') {
    this.sessionId = sessionId;
    this.role = role;
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = `${WS_URL}/session-ingress/${this.sessionId}`;
      log('WS', `连接到 ${wsUrl}`, 'cyan');

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        log('ERROR', `连接失败: ${err instanceof Error ? err.message : '未知错误'}`, 'red');
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          log('ERROR', '连接超时', 'red');
          resolve(false);
        }
      }, 10000);

      this.ws.on('open', () => {
        this.connected = true;
        clearTimeout(timeout);
        this.ws?.send(JSON.stringify({
          uuid: randomUUID(),
          type: `register-${this.role}`,
          data: { sessionId: this.sessionId },
        }));
        log('WS', `已注册为 ${this.role}`, 'green');
        resolve(true);
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // 忽略无效消息
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        if (!this.connected) {
          log('ERROR', `WebSocket 错误: ${err.message}`, 'red');
          resolve(false);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        log('WS', `连接关闭 (${code}): ${reason || '无原因'}`, 'yellow');
        process.exit(0);
      });
    });
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'system':
        if (msg.data.event === 'connected') {
          log('SYS', `会话已就绪，能力: ${(msg.data.capabilities || []).join(', ')}`, 'green');
        }
        break;
      case 'pong':
        break;
      case 'status':
        log('STATUS', msg.data.message || msg.data.event || JSON.stringify(msg.data), 'yellow');
        break;
      case 'tool:start':
        log('EXEC', `⏳ ${msg.data.tool} (${msg.data.callId?.slice(0, 8)}...)`, 'magenta');
        break;
      case 'tool:complete':
        log('DONE', `✅ ${msg.data.tool}`, 'green');
        if (msg.data.result?.stdout) {
          console.log(msg.data.result.stdout);
        }
        break;
      case 'tool:error':
        log('FAIL', `❌ ${msg.data.tool} → ${msg.data.error}`, 'red');
        break;
      case 'tool:response':
        if (msg.data.success) {
          const result = msg.data.result;
          if (result?.stdout !== undefined) {
            console.log(result.stdout);
          } else if (result?.content !== undefined) {
            console.log(result.content);
          } else if (result?.items !== undefined) {
            for (const item of result.items) {
              const icon = item.isDirectory ? '📁' : '📄';
              console.log(`  ${icon} ${item.name}`);
            }
          } else if (result?.matches !== undefined) {
            for (const m of result.matches) {
              console.log(`  ${colors.cyan}${m.file}:${m.line}${colors.reset} ${m.content}`);
            }
            console.log(`\n  共 ${result.count} 个匹配`);
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        } else {
          log('ERROR', msg.data.error, 'red');
        }
        break;
      case 'message':
        log('MSG', `${msg.data.text}`, 'reset');
        break;
      case 'disconnect':
        log('DISCONNECT', msg.data.reason || '未知原因', 'red');
        break;
      case 'sdp-offer':
      case 'sdp-answer':
      case 'ice-candidate':
        log('SIGNAL', `${msg.type}`, 'cyan');
        break;
      default:
        log('RECV', `${msg.type}: ${JSON.stringify(msg.data).slice(0, 150)}`, 'gray');
    }
    this.rl?.prompt();
  }

  send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ uuid: randomUUID(), timestamp: Date.now(), ...msg }));
    }
  }

  async interactive() {
    this.rl = createInterface({ input: process.stdin, prompt: `${colors.bold}${this.role === 'host' ? '🖥️' : '🎮'}>${colors.reset} ` });

    console.log(`
${colors.green}已连接！输入命令执行，输入 /help 查看帮助${colors.reset}
`);

    this.rl.prompt();

    this.rl.on('line', (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.rl?.prompt();
        return;
      }

      if (!this.connected) {
        log('ERROR', '未连接到服务器', 'red');
        this.rl?.prompt();
        return;
      }

      // 内置命令
      if (trimmed === '/quit' || trimmed === '/exit') {
        this.ws?.close();
        this.rl?.close();
        process.exit(0);
      }

      if (trimmed === '/help') {
        console.log(`
${colors.cyan}可用命令：${colors.reset}
  <command>              — 执行 shell 命令
  /read <path>           — 读取文件
  /list <path>           — 列出目录
  /search <pattern>      — 搜索代码
  /msg <text>            — 发送文本消息
  /info                  — 显示会话信息
  /ping                  — 心跳检测
  /quit                  — 退出
`);
        this.rl?.prompt();
        return;
      }

      if (trimmed === '/ping') {
        this.send({ type: 'ping' });
        this.rl?.prompt();
        return;
      }

      if (trimmed === '/info') {
        getSessionInfo(this.sessionId).then(info => {
          console.log(JSON.stringify(info, null, 2));
          this.rl?.prompt();
        }).catch(() => this.rl?.prompt());
        return;
      }

      if (trimmed.startsWith('/read ')) {
        const path = trimmed.slice(6).trim();
        this.send({ type: 'tool:request', data: { tool: 'filesystem', params: { operation: 'read', path }, callId: randomUUID() } });
        this.rl?.prompt();
        return;
      }

      if (trimmed.startsWith('/list ')) {
        const path = trimmed.slice(6).trim();
        this.send({ type: 'tool:request', data: { tool: 'filesystem', params: { operation: 'list', path }, callId: randomUUID() } });
        this.rl?.prompt();
        return;
      }

      if (trimmed.startsWith('/search ')) {
        const pattern = trimmed.slice(8).trim();
        this.send({ type: 'tool:request', data: { tool: 'search', params: { pattern, path: process.cwd() }, callId: randomUUID() } });
        this.rl?.prompt();
        return;
      }

      if (trimmed.startsWith('/msg ')) {
        this.send({ type: 'message', data: { text: trimmed.slice(5) } });
        this.rl?.prompt();
        return;
      }

      // 默认：执行 shell 命令
      this.send({ type: 'tool:request', data: { tool: 'terminal', params: { command: trimmed, cwd: process.cwd() }, callId: randomUUID() } });
      this.rl?.prompt();
    });

    this.rl.on('close', () => {
      this.ws?.close();
      process.exit(0);
    });

    // 心跳
    setInterval(() => {
      if (this.connected) this.send({ type: 'ping' });
    }, 30000);
  }
}

// ─── 主程序 ───

async function main() {
  printBanner();

  if (MODE === 'list') {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log('没有活跃会话');
    } else {
      console.log(`${colors.cyan}活跃会话 (${sessions.length}):${colors.reset}`);
      for (const s of sessions) {
        console.log(`  ${s.id} — ${s.status} (${s.controllers} 在线)`);
      }
    }
    return;
  }

  let sessionId = SESSION_ID;

  if (MODE === 'host') {
    sessionId = await createSession();
    log('SESSION', `新会话已创建: ${sessionId}`, 'green');
    log('SESSION', `远程用户可以使用以下命令加入：`, 'cyan');
    console.log(`\n  ${colors.bold}bun run scripts/bridge-client.ts --join ${sessionId}${colors.reset}\n`);
  } else {
    log('SESSION', `加入会话: ${sessionId}`, 'cyan');
  }

  const client = new BridgeClient(sessionId, MODE === 'host' ? 'host' : 'controller');
  const connected = await client.connect();
  if (!connected) {
    log('ERROR', '连接失败，退出', 'red');
    process.exit(1);
  }

  await client.interactive();
}

main().catch(err => {
  log('ERROR', err instanceof Error ? err.message : '未知错误', 'red');
  process.exit(1);
});
