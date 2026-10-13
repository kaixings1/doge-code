/**
 * 验证文档里写的 `npm run desktop` 命令确实可用。
 *
 * 关键疑点：`npm --prefix desktop start` 执行 `electron .` 时，
 * cwd 到底是 workbuddy/ 还是 workbuddy/desktop/？
 * 若是前者，`electron .` 会找不到 desktop/package.json 而失败。
 *
 * 同时验证桌面端启动后能连上后端。
 *
 * 运行: node verify-desktop-command.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;

// 前置检查：electron 必须真正装在本项目里，否则直接给出明确指引并失败。
// （不允许回退到参考项目 —— 那只会掩盖未安装的事实。）
const LOCAL_ELECTRON_EXE = join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(LOCAL_ELECTRON_EXE)) {
  console.error('❌ electron 未安装到 desktop/node_modules');
  console.error('   请先执行: npm run desktop:install');
  process.exit(1);
}

let failures = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── 后端 ─────────────────────────────────────────────────

const home = mkdtempSync(join(tmpdir(), 'wb-cmd-'));
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-cmd',
  accounts: [{
    id: 'user-uid-cmd', name: '命令验证账号', uid: 'uid-cmd', nickname: '命令验证账号',
    type: 'personal', accessToken: 'AT-cmd', refreshToken: 'RT-cmd',
    expiresAt: Date.now() + 3600_000, tokenTail: '-cmd', prefixPath: '/plugin',
    platform: 'workbuddy', addedAt: 1, updatedAt: 1,
  }],
}, null, 2), 'utf8');

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
    await sleep(200);
  }
  return false;
}

// ─── 桌面端（走 npm run desktop 这条路径）─────────────────

let npmProc = null;
let npmLog = '';

function startViaNpmScript() {
  // Windows 下 npm 是 .cmd，用 shell 启动以复现用户真实敲命令的路径
  const cmd = 'npm run desktop';
  // ⚠️ 刻意不注入 PATH / NODE_PATH：本脚本的目的就是验证用户按文档敲
  // `npm run desktop` 时 electron 能否被解析到。此前注入参考项目的
  // electron 路径，导致 electron 未安装时测试误报通过。
  npmProc = spawn(cmd, {
    cwd: ROOT,
    shell: true,
    env: {
      ...process.env,
      WORKBUDDY_PROXY_PORT: String(PORT),
      WORKBUDDY_PROXY_HOME: home,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  npmProc.stdout.on('data', d => { npmLog += String(d); });
  npmProc.stderr.on('data', d => { npmLog += String(d); });
}

try {
  if (!await waitReady()) {
    console.error('后端启动失败:\n', serverLog);
    process.exit(1);
  }
  console.log('✅ 后端已就绪（' + BASE + '）\n');

  console.log('执行: npm run desktop   （cwd = workbuddy/）\n');
  startViaNpmScript();
  await sleep(12_000);

  const exited = npmProc.exitCode !== null;
  check('npm run desktop 未立即退出', !exited, exited ? `exitCode=${npmProc.exitCode}` : '');

  // npm --prefix 的 cwd 陷阱：找不到 package.json 会报 ENOENT
  const pkgErr = /ENOENT|Could not read package\.json|Unable to find Electron app/i.test(npmLog);
  check('未出现 package.json / app 路径错误', !pkgErr,
    pkgErr ? npmLog.slice(0, 300) : '');

  // 正是用户实际遇到过的那个错误
  const electronNotFound = /'electron' is not recognized|electron 不是内部或外部命令/i.test(npmLog);
  check('electron 可被解析（无 "not recognized" 错误）', !electronNotFound,
    electronNotFound ? 'electron 未安装或不在 PATH —— 请执行 npm run desktop:install' : '');

  const modErr = /Cannot find module/i.test(npmLog);
  check('无模块解析错误', !modErr, modErr ? npmLog.slice(0, 300) : '');

  // 正向证据：桌面端确实连到了后端
  const uiHit = /GET \/api\/session/.test(serverLog);
  check('桌面端已连接后端（后端日志出现 UI 请求）', uiHit,
    uiHit ? '' : '后端日志:\n' + serverLog.slice(-400));

  // 账号列表随 /api/session 一起返回，UI 不再单独请求 /api/accounts
  const sessionPayloadHasAccounts = await fetch(`${BASE}/api/session`)
    .then(r => r.json())
    .then(j => Array.isArray(j?.data?.accounts?.accounts))
    .catch(() => false);
  check('/api/session 已内联账号列表（UI 无需再请求 /api/accounts）', sessionPayloadHasAccounts);

  const configHit = /GET \/api\/config/.test(serverLog);
  check('桌面端拉取了网关配置', configHit);

  if (npmLog.trim()) {
    console.log('\n── npm run desktop 输出 ──');
    console.log(npmLog.trim().split('\n').slice(0, 10).join('\n'));
  } else {
    console.log('\n（无控制台输出，窗口模式正常）');
  }
} finally {
  if (npmProc && npmProc.exitCode === null) {
    // shell:true 下需杀进程树
    try {
      spawn('taskkill', ['/pid', String(npmProc.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* ignore */ }
  }
  if (server.exitCode === null) server.kill();
  await sleep(1200);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 npm run desktop 可用' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
