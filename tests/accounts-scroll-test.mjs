#!/usr/bin/env node
/**
 * 账号页滚动行为验证：
 *   造 30 个账号（足够长），确认
 *     - 页面本身不滚动（documentElement 无滚动条）
 *     - 账号列表容器内部可滚动（scrollHeight > clientHeight）
 *     - 滚动列表时，顶部筛选器与底部提示保持不动（在视口内）
 *
 * 运行: node accounts-scroll-test.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3091;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(HERE, 'layout-shots', 'accounts-scroll');

const ELECTRON_CANDIDATES = [
  join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  join(ROOT, '..', 'codebuddy', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
];
const electronExe = ELECTRON_CANDIDATES.find(p => existsSync(p));
if (!electronExe) { console.error('未找到 electron.exe'); process.exit(1); }

let failures = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

// 30 个账号：一半国内一半国际，确保列表远高于视口
const home = mkdtempSync(join(tmpdir(), 'wb-acc-scroll-'));
mkdirSync(home, { recursive: true });
const now = Date.now();
const accounts = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  const intl = n % 2 === 0;
  return {
    id: `user-uid-${n}`,
    name: `${intl ? '国际' : '国内'}账号${n}`,
    uid: `uid-${String(n).padStart(6, '0')}`,
    nickname: `${intl ? '国际' : '国内'}账号${n}`,
    type: 'personal',
    accessToken: `AT-${n}`,
    refreshToken: `RT-${n}`,
    expiresAt: now + 7200_000,
    tokenTail: String(n).padStart(4, '0'),
    prefixPath: '/plugin',
    platform: intl ? 'workbuddy-ai' : 'workbuddy',
    edition: intl ? 'intl' : 'cn',
    endpoint: intl ? 'https://www.workbuddy.ai' : 'https://copilot.tencent.com',
    addedAt: n, updatedAt: n,
    rateLimits: n % 5 === 0
      ? { 'deepseek-v4.1-flash': { status: 429, code: 6004, resetAt: now + 3600_000, message: 'quota', at: now } }
      : {},
  };
});
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-1', accounts,
}, null, 2), 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(SHOT_DIR, { recursive: true });

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--port', String(PORT)], {
  cwd: ROOT, env: { ...process.env, WORKBUDDY_PROXY_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += String(d); });
server.stderr.on('data', d => { serverLog += String(d); });

async function waitReady(ms = 20_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch { /* retry */ }
    await sleep(200);
  }
  return false;
}

// ─── 探针 ─────────────────────────────────────────────────

/** 量滚动相关尺寸 */
const PROBE = `(() => {
  const doc = document.documentElement;
  const list = document.getElementById('account-list');
  const filters = document.querySelector('.account-filters');
  const hint = document.querySelector('.page[data-page="accounts"] .panel > .hint');
  const r = el => { const b = el.getBoundingClientRect(); return {
    top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  return {
    // 页面本身是否可滚
    pageScrollH: doc.scrollHeight, pageClientH: doc.clientHeight,
    pageScrolls: doc.scrollHeight > doc.clientHeight + 1,
    // 列表容器是否内部可滚
    listScrollH: list.scrollHeight, listClientH: list.clientHeight,
    listScrollable: list.scrollHeight > list.clientHeight + 1,
    listOverflowY: getComputedStyle(list).overflowY,
    listScrollTop: list.scrollTop,
    rowCount: document.querySelectorAll('#account-list .account-item').length,
    // 筛选器与提示是否固定在视口内
    filtersRect: filters ? r(filters) : null,
    hintRect: hint ? r(hint) : null,
    viewportH: window.innerHeight,
  };
})()`;

const probeSpec = [
  { file: join(SHOT_DIR, '01-top.png'), width: 1200, height: 760, zoom: 1, delayMs: 900, section: 'accounts', probe: PROBE },
  // 滚到列表底部：页面不该动，列表该动
  {
    file: join(SHOT_DIR, '02-list-bottom.png'), width: 1200, height: 760, zoom: 1, delayMs: 900,
    section: 'accounts',
    script: "(() => { const l = document.getElementById('account-list'); l.scrollTop = l.scrollHeight; return l.scrollTop; })()",
    probe: PROBE,
  },
];

let desktop = null;
try {
  if (!await waitReady()) { console.error('后端启动失败:\n', serverLog); process.exit(1); }
  console.log('✅ 后端就绪');

  desktop = spawn(electronExe, [join(ROOT, 'desktop')], {
    cwd: join(ROOT, 'desktop'),
    env: {
      ...process.env,
      WORKBUDDY_PROXY_PORT: String(PORT),
      WORKBUDDY_PROXY_HOME: home,
      WORKBUDDY_SHOT_SPEC: JSON.stringify(probeSpec),
      WORKBUDDY_SHOT_DELAY_MS: '6000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  desktop.stdout.on('data', d => { log += String(d); });
  desktop.stderr.on('data', d => { log += String(d); });

  await sleep(6000 + probeSpec.length * 2200 + 5000);
  desktop.kill();
  await sleep(500);

  const parsed = [...log.matchAll(/^\[probe\] (\S+) (\{.*\})$/gm)]
    .map(m => ({ file: m[1], data: JSON.parse(m[2]) }));
  const byTag = tag => parsed.find(p => p.file.includes(tag))?.data || {};

  console.log('\n━━━ 滚动行为 ━━━');
  const top = byTag('01-top');
  check('探针有返回', parsed.length >= 2, `收到 ${parsed.length} 条`);
  check('渲染 30 个账号', top.rowCount, 30);
  check('页面本身不滚动', top.pageScrolls, false,
    `pageScrollH=${top.pageScrollH} clientH=${top.pageClientH}`);
  check('账号列表内部可滚动', top.listScrollable, true,
    `scrollH=${top.listScrollH} clientH=${top.listClientH}`);
  check('列表 overflow-y 为 auto', top.listOverflowY, 'auto');
  check('初始列表在顶部', top.listScrollTop, 0);

  const bottom = byTag('02-list-bottom');
  check('滚动后列表位置已变化', bottom.listScrollTop > 0, `scrollTop=${bottom.listScrollTop}`);
  check('滚动列表后页面仍不滚动', bottom.pageScrolls, false);
  check('筛选器仍在视口内（不随列表滚走）',
    bottom.filtersRect && bottom.filtersRect.top >= 0 && bottom.filtersRect.bottom <= bottom.viewportH,
    JSON.stringify(bottom.filtersRect));
  check('底部提示仍在视口内',
    bottom.hintRect && bottom.hintRect.bottom <= bottom.viewportH + 1,
    JSON.stringify(bottom.hintRect));
  check('筛选器位置未变（顶部固定）',
    top.filtersRect && bottom.filtersRect && Math.abs(top.filtersRect.top - bottom.filtersRect.top) <= 1,
    `top=${top.filtersRect?.top} bottom=${bottom.filtersRect?.top}`);
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
