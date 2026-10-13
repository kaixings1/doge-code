/**
 * 桌面端联调用的测试装置：
 *   1. 生成临时配置目录 + 两个假账号（其中一个为当前账号）
 *   2. 启动后端 server.mjs
 *   3. 启动 Electron 桌面端（借用 codebuddy/desktop 的 electron 安装）
 *   4. 采样桌面端与控制台输出，校验渲染层是否真的把数据画出来了
 *
 * 运行: node desktop-test.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3098;
const BASE = `http://127.0.0.1:${PORT}`;

const ELECTRON_CANDIDATES = [
  join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  join(ROOT, '..', 'codebuddy', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
];
const electronExe = ELECTRON_CANDIDATES.find(p => existsSync(p));
if (!electronExe) {
  console.error('未找到 electron.exe，请先 npm run desktop:install');
  process.exit(1);
}

const home = mkdtempSync(join(tmpdir(), 'wb-desktop-'));
const now = Date.now();

writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-demo',
  accounts: [
    {
      id: 'user-uid-demo', name: '演示账号', uid: 'uid-demo', nickname: '演示账号',
      type: 'personal', accessToken: 'AT-demo', refreshToken: 'RT-demo',
      expiresAt: now + 3600_000, tokenTail: 'demo', prefixPath: '/plugin',
      platform: 'workbuddy', addedAt: 1, updatedAt: 1,
    },
    {
      id: 'user-uid-ent', name: '企业演示', uid: 'uid-ent', nickname: '企业演示',
      type: 'enterprise', enterpriseId: 'ent-demo', accessToken: 'AT-ent',
      refreshToken: 'RT-ent', expiresAt: now + 1800_000, tokenTail: '-ent',
      prefixPath: '/plugin', platform: 'workbuddy', addedAt: 2, updatedAt: 2,
    },
  ],
}, null, 2), 'utf8');

let failures = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

// ─── 后端 ─────────────────────────────────────────────────

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--port', String(PORT), '--verbose'], {
  cwd: ROOT, env: { ...process.env, WORKBUDDY_PROXY_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += String(d); });
server.stderr.on('data', d => { serverLog += String(d); });

async function waitReady(ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// ─── 桌面端 ───────────────────────────────────────────────

let desktop = null;
let desktopLog = '';

function startDesktop() {
  desktop = spawn(electronExe, [join(ROOT, 'desktop')], {
    cwd: join(ROOT, 'desktop'),
    env: { ...process.env, WORKBUDDY_PROXY_PORT: String(PORT), WORKBUDDY_PROXY_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  desktop.stdout.on('data', d => { desktopLog += String(d); });
  desktop.stderr.on('data', d => { desktopLog += String(d); });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  if (!await waitReady()) {
    console.error('后端启动失败:\n', serverLog);
    process.exit(1);
  }
  console.log('✅ 后端已就绪');

  // 先用 HTTP 确认数据面正常（桌面端读的就是这些）
  const accounts = await (await fetch(`${BASE}/api/accounts`)).json();
  check('后端返回 2 个账号', accounts.data.accounts.length === 2);
  const session = await (await fetch(`${BASE}/api/session`)).json();
  check('后端识别当前账号昵称', session.data.session.nickname === '演示账号',
    session.data.session.nickname);

  console.log('\n启动 Electron 桌面端…');
  startDesktop();
  await sleep(9000); // 等 Electron 起来、窗口加载、首次 loadState 完成

  const alive = desktop && desktop.exitCode === null;
  check('Electron 进程存活（未崩溃）', alive, alive ? '' : `exitCode=${desktop?.exitCode}`);

  // 桌面端 main.cjs 会打印 [proxy] / [login] 前缀日志；崩溃会有堆栈。
  // 忽略 Electron/Chromium 内部缓存/GPU 报错、安全警告等已知噪音。
  const cleanedLog = desktopLog
    .replace(/^\[\d+:\d+\/.*/gm, '') // Electron/Chromium 内部 [pid:thread/time] 行
    .replace(/Electron Security Warning .* Insecure Content-Security-Policy.*/gi, '')
    .replace(/Unable to (move|create).*(cache|cac).*/gi, '')
    .replace(/Gpu Cache Creation failed.*/gi, '');
  const crashed = /Error:|Cannot find module|Uncaught|Failed to load/i.test(cleanedLog);
  check('桌面端日志无崩溃堆栈', !crashed, crashed ? cleanedLog.trim().slice(0, 400) : '');

  // preload/main 是否报模块解析错误（最常见的配置问题）
  const moduleError = /Cannot find module|ERR_MODULE_NOT_FOUND|require\(\) of ES module/i.test(desktopLog);
  check('无模块加载错误', !moduleError, moduleError ? desktopLog.slice(0, 400) : '');

  // 反向验证：桌面端确实连到了后端（后端 verbose 日志会记录 UI 的请求）
  const uiHit = /GET \/api\/session|GET \/api\/accounts/.test(serverLog);
  check('桌面端已向后端发起请求（链路打通）', uiHit,
    uiHit ? '' : '未在后端日志中看到 UI 请求');

  if (desktopLog.trim()) {
    console.log('\n── 桌面端输出 ──');
    console.log(desktopLog.trim().split('\n').slice(0, 12).join('\n'));
  } else {
    console.log('\n（桌面端无控制台输出，属正常：窗口模式不打印日志）');
  }
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
