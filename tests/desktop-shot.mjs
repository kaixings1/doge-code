/**
 * 桌面端 UI 截图验证：
 *   起后端 + Electron，等窗口渲染完成后把主窗口截图存盘，
 *   用于人工确认多账号 / 积分 / 签到面板确实画出来了。
 *
 * 运行: node desktop-shot.mjs   → 生成 desktop-shot.png
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;

const ELECTRON_CANDIDATES = [
  join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  join(ROOT, '..', 'codebuddy', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
];
const electronExe = ELECTRON_CANDIDATES.find(p => existsSync(p));
if (!electronExe) { console.error('未找到 electron.exe'); process.exit(1); }

const home = mkdtempSync(join(tmpdir(), 'wb-shot-'));
const now = Date.now();
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-demo',
  accounts: [
    {
      id: 'user-uid-demo', name: '演示账号', uid: 'uid-demo12345', nickname: '演示账号',
      type: 'personal', accessToken: 'AT-demo', refreshToken: 'RT-demo',
      expiresAt: now + 3600_000, tokenTail: 'demo', prefixPath: '/plugin',
      platform: 'workbuddy', addedAt: 1, updatedAt: 1,
    },
    {
      id: 'user-uid-ent', name: '企业演示', uid: 'uid-ent67890', nickname: '企业演示',
      type: 'enterprise', enterpriseId: 'ent-demo', accessToken: 'AT-ent',
      refreshToken: 'RT-ent', expiresAt: now - 60_000, tokenTail: '-ent',
      prefixPath: '/plugin', platform: 'workbuddy', addedAt: 2, updatedAt: 2,
    },
  ],
}, null, 2), 'utf8');

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--port', String(PORT)], {
  cwd: ROOT, env: { ...process.env, WORKBUDDY_PROXY_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch { /* retry */ }
    await sleep(200);
  }
  return false;
}

let desktop = null;
try {
  if (!await waitReady()) { console.error('后端启动失败'); process.exit(1); }
  console.log('✅ 后端就绪');

  /*
   * 截图方案：临时给 desktop 目录放一个 --shot 插件脚本不可行（要改主进程），
   * 改用 ELECTRON_ENABLE_LOGGING 之外的官方途径 —— 由主进程在 ready 后
   * 调用 capturePage。这里通过环境变量触发 main.cjs 里的截图分支。
   */
  desktop = spawn(electronExe, [join(ROOT, 'desktop')], {
    cwd: join(ROOT, 'desktop'),
    env: {
      ...process.env,
      WORKBUDDY_PROXY_PORT: String(PORT),
      WORKBUDDY_PROXY_HOME: home,
      WORKBUDDY_SHOT_PATH: join(HERE, 'desktop-shot.png'),
      WORKBUDDY_SHOT_DELAY_MS: '7000',
      // 缩小到 45% 以便一屏截到全部面板（积分 / 签到 / 模型 / API Key）
      WORKBUDDY_SHOT_ZOOM: process.env.WORKBUDDY_SHOT_ZOOM || '0.45',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  desktop.stdout.on('data', d => { log += String(d); });
  desktop.stderr.on('data', d => { log += String(d); });

  await sleep(16_000);
  const shot = join(HERE, 'desktop-shot.png');
  if (existsSync(shot)) {
    console.log('✅ 截图已生成:', shot);
  } else {
    console.log('⚠️ 未生成截图，桌面端输出:\n', log.slice(0, 800));
  }
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}
