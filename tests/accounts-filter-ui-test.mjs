#!/usr/bin/env node
/**
 * 账号页两级筛选 — UI 验证。
 *
 * 造 6 个账号覆盖四种组合（国内/国际 × 正常/已限流），真实点击分段选择器，
 * 断言：
 *   - 一级（版本）切换后列表与分组标题正确
 *   - 二级（状态）切换后只留对应状态的账号
 *   - 数量徽标随一级选择联动（二级计数基于当前版本）
 *   - 两级组合筛选结果正确
 *
 * 运行: node accounts-filter-ui-test.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3092;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(HERE, 'layout-shots', 'accounts-filter');

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

// ─── 假数据：6 个账号，覆盖 国内/国际 × 正常/已限流 ────────

const home = mkdtempSync(join(tmpdir(), 'wb-acc-filter-'));
mkdirSync(home, { recursive: true });
const now = Date.now();
const future = now + 3600_000;   // 限流恢复时间（未来 → 已限流）
const past = now - 3600_000;     // 已恢复 → 正常

const makeAccount = (i, { edition, limited }) => ({
  id: `user-uid-${i}`,
  name: `${edition === 'intl' ? '国际' : '国内'}账号${i}`,
  uid: `uid-${String(i).padStart(6, '0')}`,
  nickname: `${edition === 'intl' ? '国际' : '国内'}账号${i}`,
  type: 'personal',
  accessToken: `AT-${i}`,
  refreshToken: `RT-${i}`,
  expiresAt: now + 7200_000,
  tokenTail: String(i).padStart(4, '0'),
  prefixPath: '/plugin',
  platform: edition === 'intl' ? 'workbuddy-ai' : 'workbuddy',
  edition,
  endpoint: edition === 'intl' ? 'https://www.workbuddy.ai' : 'https://copilot.tencent.com',
  addedAt: i,
  updatedAt: i,
  rateLimits: limited
    ? { 'deepseek-v4.1-flash': { status: 429, code: 6004, resetAt: future, message: 'quota', at: now } }
    : { 'glm-5.3': { status: 429, code: 6004, resetAt: past, message: '已恢复', at: past } },
});

writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-1',
  accounts: [
    makeAccount(1, { edition: 'cn', limited: false }),
    makeAccount(2, { edition: 'cn', limited: true }),
    makeAccount(3, { edition: 'cn', limited: false }),
    makeAccount(4, { edition: 'intl', limited: false }),
    makeAccount(5, { edition: 'intl', limited: true }),
    makeAccount(6, { edition: 'intl', limited: true }),
  ],
}, null, 2), 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(SHOT_DIR, { recursive: true });

// ─── 后端 ─────────────────────────────────────────────────

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

/** 读当前筛选状态 + 列表里实际渲染的账号名与分组标题 */
const READ_UI = `(() => {
  const seg = sel => [...document.querySelectorAll(sel + ' .seg-item')].map(item => ({
    key: item.dataset.edition || item.dataset.status,
    active: item.classList.contains('active'),
    count: item.querySelector('.seg-count')?.textContent ?? null,
  }));
  const titles = [...document.querySelectorAll('#account-list .account-group-title')]
    .map(el => el.textContent.trim());
  // 账号名带「当前」「已限流」等徽章，只取名字部分做断言
  const names = [...document.querySelectorAll('#account-list .account-name > span:first-child')]
    .map(el => el.textContent.trim());
  return {
    editionSeg: seg('#account-edition-filter'),
    statusSeg: seg('#account-status-filter'),
    groupTitles: titles,
    names,
    rowCount: document.querySelectorAll('#account-list .account-item').length,
    emptyText: document.querySelector('#account-list .empty')?.textContent?.trim() || null,
  };
})()`;

const probeSpec = [];
function addStep(tag, script, delayMs = 700) {
  probeSpec.push({
    file: join(SHOT_DIR, `${tag}.png`),
    width: 1200, height: 900, zoom: 1, delayMs,
    section: 'accounts',
    script,
    probe: READ_UI,
  });
}

const clickSeg = (id, attr, value) =>
  `document.querySelector('#${id} .seg-item[data-${attr}="${value}"]').click(); true`;

// 1. 初始：全部 / 全部
addStep('01-initial', 'true');
// 2. 一级选国内
addStep('02-edition-cn', clickSeg('account-edition-filter', 'edition', 'cn'));
// 3. 国内 + 已限流
addStep('03-cn-limited', clickSeg('account-status-filter', 'status', 'limited'));
// 4. 国内 + 正常
addStep('04-cn-normal', clickSeg('account-status-filter', 'status', 'normal'));
// 5. 一级切国际（状态仍为"正常"）
addStep('05-intl-normal', clickSeg('account-edition-filter', 'edition', 'intl'));
// 6. 国际 + 已限流
addStep('06-intl-limited', clickSeg('account-status-filter', 'status', 'limited'));
// 7. 回全部 / 全部
addStep('07-back-all', `(() => {
  document.querySelector('#account-status-filter .seg-item[data-status="all"]').click();
  document.querySelector('#account-edition-filter .seg-item[data-edition="all"]').click();
  return true;
})()`);

// ─── 启动 Electron ─────────────────────────────────────────

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

  await sleep(6000 + probeSpec.length * 1500 + 5000);
  desktop.kill();
  await sleep(500);

  // ─── 校验 ────────────────────────────────────────────────

  console.log('\n━━━ UI 探针结果 ━━━');
  const parsed = [...log.matchAll(/^\[probe\] (\S+) (\{.*\})$/gm)]
    .map(m => ({ file: m[1], data: JSON.parse(m[2]) }));
  const byTag = tag => parsed.find(p => p.file.includes(tag))?.data || {};
  check('探针全部有返回', parsed.length >= probeSpec.length, `收到 ${parsed.length}/${probeSpec.length} 条`);

  const segCount = (seg, key) => Number(seg.find(s => s.key === key)?.count);

  // 1. 初始
  const init = byTag('01-initial');
  check('初始 6 个账号', init.rowCount, 6);
  check('初始按版本分组（两个标题）', init.groupTitles.length, 2);
  check('国内分组标题正确', /国内账号 · 3/.test(init.groupTitles[0] || ''), init.groupTitles[0]);
  check('国际分组标题正确', /国际账号 · 3/.test(init.groupTitles[1] || ''), init.groupTitles[1]);
  check('一级计数 全部=6', segCount(init.editionSeg, 'all'), 6);
  check('一级计数 国内=3', segCount(init.editionSeg, 'cn'), 3);
  check('一级计数 国际=3', segCount(init.editionSeg, 'intl'), 3);
  check('二级计数 正常=3', segCount(init.statusSeg, 'normal'), 3);
  check('二级计数 已限流=3', segCount(init.statusSeg, 'limited'), 3);

  // 2. 一级选国内 → 只列国内，无分组标题；二级计数联动为国内口径（正常 2 / 限流 1）
  const cn = byTag('02-edition-cn');
  check('国内：3 个账号', cn.rowCount, 3);
  check('国内：无分组标题（单组）', cn.groupTitles.length, 0);
  check('国内：全是国内账号', cn.names.every(n => n.startsWith('国内')), cn.names.join(','));
  check('国内：二级计数 正常=2（联动）', segCount(cn.statusSeg, 'normal'), 2);
  check('国内：二级计数 已限流=1（联动）', segCount(cn.statusSeg, 'limited'), 1);

  // 3. 国内 + 已限流 → 只剩 1 个
  const cnLimited = byTag('03-cn-limited');
  check('国内+已限流：1 个账号', cnLimited.rowCount, 1);
  check('国内+已限流：账号名正确', cnLimited.names[0], '国内账号2');

  // 4. 国内 + 正常 → 2 个
  const cnNormal = byTag('04-cn-normal');
  check('国内+正常：2 个账号', cnNormal.rowCount, 2);
  check('国内+正常：无已限流账号', cnNormal.names.every(n => !n.includes('2')), cnNormal.names.join(','));

  // 5. 切国际（状态保持"正常"）→ 1 个国际正常账号
  const intlNormal = byTag('05-intl-normal');
  check('国际+正常：1 个账号', intlNormal.rowCount, 1);
  check('国际+正常：账号名正确', intlNormal.names[0], '国际账号4');
  check('国际：二级计数 已限流=2（联动）', segCount(intlNormal.statusSeg, 'limited'), 2);

  // 6. 国际 + 已限流 → 2 个
  const intlLimited = byTag('06-intl-limited');
  check('国际+已限流：2 个账号', intlLimited.rowCount, 2);
  check('国际+已限流：账号名正确', intlLimited.names.join(','), '国际账号5,国际账号6');

  // 7. 回到全部 → 恢复分组展示
  const back = byTag('07-back-all');
  check('回到全部：6 个账号', back.rowCount, 6);
  check('回到全部：恢复两个分组标题', back.groupTitles.length, 2);
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
