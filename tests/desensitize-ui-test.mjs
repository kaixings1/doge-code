#!/usr/bin/env node
/**
 * 敏感词脱敏 — 桌面端 UI 交互验证。
 *
 * 真实驱动渲染层（点击开关 / 加词 / 删词 / 改角色 / 恢复默认），
 * 再从后端 /api/desensitize 回读，确认"前端操作 → 持久化"确实闭环。
 * 用 main.cjs 的 WORKBUDDY_SHOT_SPEC.script/probe 通道，无需额外注入。
 *
 * 运行: node desensitize-ui-test.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3094;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(HERE, 'layout-shots', 'desensitize');

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

const home = mkdtempSync(join(tmpdir(), 'wb-desens-ui-'));
mkdirSync(home, { recursive: true });
const now = Date.now();
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-demo',
  accounts: [{
    id: 'user-uid-demo', name: '演示账号', uid: 'uid-demo', nickname: '演示账号',
    type: 'personal', accessToken: 'AT-demo', refreshToken: 'RT-demo',
    expiresAt: now + 3600_000, tokenTail: 'demo', prefixPath: '/plugin',
    platform: 'workbuddy', addedAt: 1, updatedAt: 1,
  }],
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

/**
 * 探针：在渲染层里跑一段脚本，返回结构化结果。
 * 通过 WORKBUDDY_SHOT_SPEC 的 script/probe 字段注入。
 */
const probeSpec = [];

function addStep(tag, script, probe, delayMs = 900) {
  probeSpec.push({
    file: join(SHOT_DIR, `${tag}.png`),
    width: 1060, height: 900, zoom: 1, delayMs,
    // 面板现在在「脱敏」页里，先切页再执行操作，否则元素不可见
    section: 'desensitize',
    script,
    probe,
  });
}

const READ_UI = `(async () => {
  const badge = document.getElementById('desensitize-badge');
  const toggle = document.getElementById('desensitize-enabled');
  const chips = [...document.querySelectorAll('#term-list .term-chip span:first-child')].map(el => el.textContent);
  const roles = [...document.querySelectorAll('#desensitize-roles input:checked')].map(b => b.value);
  // 顺带把后端真实状态读回来，避免"UI 乐观更新"掩盖未落盘的问题
  let backend = null;
  try {
    const res = await fetch('http://127.0.0.1:${PORT}/api/desensitize');
    backend = (await res.json()).data;
  } catch (error) {
    backend = { error: String(error) };
  }
  return {
    badge: badge?.textContent || null,
    badgeClass: badge?.className || null,
    toggleChecked: toggle?.checked ?? null,
    chipCount: chips.length,
    chips: chips.slice(0, 40),
    roles,
    stateText: document.getElementById('desensitize-state')?.textContent || null,
    file: document.getElementById('desensitize-file')?.textContent || null,
    requests: document.getElementById('stat-requests')?.textContent || null,
    hits: document.getElementById('stat-hits')?.textContent || null,
    backendEnabled: backend?.enabled ?? null,
    backendTermCount: backend?.termCount ?? null,
    backendTerms: backend?.terms || [],
    backendRoles: backend?.roles || [],
    backendError: backend?.error || null,
  };
})()`;

// 步骤 1：初始渲染
addStep('01-initial', 'true', READ_UI);

// 步骤 2：加一个自定义词（走真实按钮 + input）
addStep('02-add-term', `(() => {
  const input = document.getElementById('term-input');
  input.value = 'acme-ui-codename';
  document.getElementById('btn-add-term').click();
  return true;
})()`, READ_UI);

// 步骤 3：再加多个词（逗号分隔批量）
addStep('03-add-batch', `(() => {
  const input = document.getElementById('term-input');
  input.value = '第一敏感词, 第二敏感词';
  document.getElementById('btn-add-term').click();
  return true;
})()`, READ_UI);

// 步骤 4：删掉第一个自定义词（点 chip 上的 ×）
addStep('04-remove-term', `(() => {
  const buttons = [...document.querySelectorAll('#term-list .term-chip button')];
  const target = buttons.find(b => b.dataset.term === 'acme-ui-codename');
  if (target) target.click();
  return !!target;
})()`, READ_UI);

// 步骤 5：只勾 system（去掉 user）
addStep('05-roles-system-only', `(() => {
  const boxes = [...document.querySelectorAll('#desensitize-roles input')];
  for (const box of boxes) {
    const want = box.value === 'system';
    if (box.checked !== want) box.click();
  }
  return true;
})()`, READ_UI);

// 步骤 6：恢复 system + user
addStep('06-roles-both', `(() => {
  const boxes = [...document.querySelectorAll('#desensitize-roles input')];
  for (const box of boxes) {
    const want = box.value === 'system' || box.value === 'user';
    if (box.checked !== want) box.click();
  }
  return true;
})()`, READ_UI);

// 步骤 7：关掉开关
addStep('07-toggle-off', `(() => {
  const toggle = document.getElementById('desensitize-enabled');
  if (toggle.checked) toggle.click();
  return true;
})()`, READ_UI);

// 步骤 8：重新打开
addStep('08-toggle-on', `(() => {
  const toggle = document.getElementById('desensitize-enabled');
  if (!toggle.checked) toggle.click();
  return true;
})()`, READ_UI);

// 步骤 9：恢复默认词表（confirm 需要放行）
addStep('09-reset-terms', `(() => {
  window.confirm = () => true;
  document.getElementById('btn-reset-terms').click();
  return true;
})()`, READ_UI, 1200);

// 步骤 10：深色模式下的面板
addStep('10-dark', `(() => {
  document.querySelector('#theme-switch button[data-mode="dark"]').click();
  document.documentElement.scrollTop = document.documentElement.scrollHeight;
  return true;
})()`, READ_UI);

const specJson = JSON.stringify(probeSpec);

// ─── 启动 ────────────────────────────────────────────────

let desktop = null;
const probes = [];
try {
  if (!await waitReady()) { console.error('后端启动失败:\n', serverLog); process.exit(1); }
  console.log('✅ 后端就绪');

  desktop = spawn(electronExe, [join(ROOT, 'desktop')], {
    cwd: join(ROOT, 'desktop'),
    env: {
      ...process.env,
      WORKBUDDY_PROXY_PORT: String(PORT),
      WORKBUDDY_PROXY_HOME: home,
      WORKBUDDY_SHOT_SPEC: specJson,
      WORKBUDDY_SHOT_DELAY_MS: '6000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  desktop.stdout.on('data', d => {
    const text = String(d);
    log += text;
    for (const line of text.split('\n')) {
      if (line.startsWith('[probe] ')) probes.push(line.slice(8).trim());
    }
  });
  desktop.stderr.on('data', d => { log += String(d); });

  // 等所有步骤跑完：启动 6 秒 + 每步（切页 200ms + 脚本 + delayMs + 截图）
  await sleep(6000 + probeSpec.length * 1600 + 6000);
  desktop.kill();
  await sleep(500);

  // ─── 校验 ──────────────────────────────────────────────

  console.log('\n━━━ UI 探针结果 ━━━');
  const parsed = probes.map(line => {
    const idx = line.indexOf(' ');
    const file = idx > 0 ? line.slice(0, idx) : line;
    const rest = idx > 0 ? line.slice(idx + 1) : '';
    let data = null;
    try { data = JSON.parse(rest); } catch { /* 解析失败 */ }
    return { file, data };
  });

  check('探针全部有返回', parsed.length >= 10, `收到 ${parsed.length} 条`);
  check('探针无错误', parsed.every(p => p.data && !p.data.probeError),
    parsed.filter(p => p.data?.probeError).map(p => p.data.probeError).join('; ') || '');

  const byTag = tag => parsed.find(p => p.file.includes(tag))?.data || {};

  const initial = byTag('01-initial');
  check('初始 badge 显示已启用', /已启用/.test(initial.badge || ''), initial.badge);
  check('初始开关为开', initial.toggleChecked === true);
  check('初始词表已渲染', initial.chipCount === 31, `chipCount=${initial.chipCount}`);
  check('初始角色含 system+user', (initial.roles || []).join(',') === 'system,user', (initial.roles || []).join(','));
  check('词表文件路径已展示', /desensitize\.json$/.test(initial.file || ''), initial.file);

  const added = byTag('02-add-term');
  check('加词后 chip 数 +1', added.chipCount === 32, `chipCount=${added.chipCount}`);
  check('新词出现在词表里', (added.chips || []).includes('acme-ui-codename'));
  check('后端已持久化新词', (added.backendTerms || []).includes('acme-ui-codename'));
  check('后端词数一致', added.backendTermCount === 32, `termCount=${added.backendTermCount}`);

  const batch = byTag('03-add-batch');
  check('批量加词 chip 数 +2', batch.chipCount === 34, `chipCount=${batch.chipCount}`);
  check('批量词都在', ['第一敏感词', '第二敏感词'].every(t => (batch.chips || []).includes(t)));
  check('后端已收到批量词', ['第一敏感词', '第二敏感词'].every(t => (batch.backendTerms || []).includes(t)));
  check('后端词数 = UI 词数', batch.backendTermCount === batch.chipCount,
    `backend=${batch.backendTermCount} ui=${batch.chipCount}`);

  const removed = byTag('04-remove-term');
  check('删词后 chip 数 -1', removed.chipCount === 33, `chipCount=${removed.chipCount}`);
  check('被删的词已消失', !(removed.chips || []).includes('acme-ui-codename'));
  check('后端已删除该词', !(removed.backendTerms || []).includes('acme-ui-codename'));

  const sysOnly = byTag('05-roles-system-only');
  check('UI 角色只剩 system', (sysOnly.roles || []).join(',') === 'system', (sysOnly.roles || []).join(','));
  check('后端角色已更新', (sysOnly.backendRoles || []).join(',') === 'system', (sysOnly.backendRoles || []).join(','));

  const bothRoles = byTag('06-roles-both');
  check('UI 角色恢复 system+user', (bothRoles.roles || []).join(',') === 'system,user', (bothRoles.roles || []).join(','));
  check('后端角色已恢复', (bothRoles.backendRoles || []).join(',') === 'system,user', (bothRoles.backendRoles || []).join(','));

  const off = byTag('07-toggle-off');
  check('关闭后 badge 显示已关闭', /已关闭/.test(off.badge || ''), off.badge);
  check('关闭后开关为关', off.toggleChecked === false);
  check('关闭后提示文案', /关闭状态已保存/.test(off.stateText || ''), off.stateText);
  check('后端已关闭', off.backendEnabled === false);

  const on = byTag('08-toggle-on');
  check('重开后开关为开', on.toggleChecked === true);
  check('后端已开启', on.backendEnabled === true);
  check('重开后词表保留', on.backendTermCount === 33, `termCount=${on.backendTermCount}`);

  const reset = byTag('09-reset-terms');
  check('恢复默认后 chip 数回到 31', reset.chipCount === 31, `chipCount=${reset.chipCount}`);
  check('后端词表已恢复默认', reset.backendTermCount === 31, `termCount=${reset.backendTermCount}`);
  check('自定义词已清除', !(reset.backendTerms || []).includes('第一敏感词'));

  const dark = byTag('10-dark');
  check('深色模式下面板仍渲染', dark.chipCount === 31, `chipCount=${dark.chipCount}`);
  check('探针读取后端无错误', parsed.every(p => !p.data?.backendError),
    parsed.map(p => p.data?.backendError).filter(Boolean).join('; ') || '');

  console.log('\n━━━ 截图 ━━━');
  console.log(`截图目录: ${SHOT_DIR}`);

  if (failures) {
    console.log('\n桌面端输出片段:\n', log.slice(-1500));
  }
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
