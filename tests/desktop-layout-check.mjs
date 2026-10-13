/**
 * 桌面端**布局**验证：不只看"能不能画出来"，而是量布局本身。
 *
 *   起后端（假账号数据）+ Electron，对若干窗口尺寸 / 页面截图，
 *   并通过 probe 在渲染层里量出：
 *     - 内容区是否出现横向滚动条（overflow）
 *     - 是否出现意料之外的纵向滚动条
 *     - 侧边栏 / 内容区是否落在视口内、侧边栏是否在内容区左侧
 *     - 关键控件（按钮、输入框）是否被裁切、是否溢出容器
 *     - 账号行操作按钮是否换行 / 溢出
 *
 * 运行: node desktop-layout-check.mjs
 *   → 生成 layout-shots/*.png，并在控制台打印量化结果
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3097;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(HERE, 'layout-shots');

const ELECTRON_CANDIDATES = [
  join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
  join(ROOT, '..', 'codebuddy', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
];
const electronExe = ELECTRON_CANDIDATES.find(p => existsSync(p));
if (!electronExe) { console.error('未找到 electron.exe'); process.exit(1); }

// ─── 假数据：账号足够多，才能看出列表滚动 / 行内按钮换行 ──────

const home = mkdtempSync(join(tmpdir(), 'wb-layout-'));
const now = Date.now();
const makeAccount = (i, overrides = {}) => ({
  id: `user-uid-${i}`, name: `示例账号 ${i}`, uid: `uid-${String(i).padStart(6, '0')}abcdef`,
  nickname: i === 1 ? '演示账号（较长的昵称用于测试溢出）' : `示例账号 ${i}`,
  type: i % 3 === 0 ? 'enterprise' : i % 3 === 1 ? 'personal' : 'ultimate',
  enterpriseId: i % 3 === 0 ? `ent-${i}` : undefined,
  accessToken: `AT-${i}`, refreshToken: i % 4 === 0 ? null : `RT-${i}`,
  expiresAt: i % 2 === 0 ? now + 3600_000 : now - 60_000,
  tokenTail: String(i).padStart(4, '0'), prefixPath: '/plugin',
  platform: 'workbuddy', addedAt: i, updatedAt: i,
  // 版本与限流状态要覆盖到，才能验证两级筛选：偶数国际版，3/6 号已限流
  edition: i % 2 === 0 ? 'intl' : 'cn',
  rateLimits: i % 3 === 0
    ? { 'deepseek-v4.1-flash': { status: 429, code: 6004, resetAt: now + 1800_000, message: '已达上限' } }
    : {},
  ...overrides,
});
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-1',
  accounts: [1, 2, 3, 4, 5, 6, 7, 8].map(i => makeAccount(i)),
}, null, 2), 'utf8');
writeFileSync(join(home, 'config.json'), JSON.stringify({
  apiKey: 'wb-demo-key-1234', defaultModel: 'claude-sonnet-4.5',
}, null, 2), 'utf8');

// ─── 探针：在渲染层里量布局 ────────────────────────────────

const PROBE = `(() => {
  const doc = document.documentElement;
  const content = document.querySelector('.content') || document.body;
  const sidebar = document.querySelector('.sidebar');
  const rect = el => { const r = el.getBoundingClientRect(); return {
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const horizontalOverflow = [];
  const beyondContentRight = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (el.scrollWidth - el.clientWidth > 1 && cs.overflowX === 'visible') {
      horizontalOverflow.push({ sel: el.className || el.tagName, over: el.scrollWidth - el.clientWidth });
    }
    if (el === content) continue;
    // 固定定位的浮层（弹窗遮罩 / toast）本就铺满视口，不属于内容列溢出
    if (cs.position === 'fixed') continue;
    // 侧边栏在内容区左侧，不属于"超出右边界"
    if (sidebar && (el === sidebar || sidebar.contains(el))) continue;
    const cr = content.getBoundingClientRect();
    if (r.right > cr.right + 1 && r.width > 0) {
      beyondContentRight.push({ sel: String(el.className || el.tagName).slice(0, 40),
        outBy: Math.round(r.right - cr.right) });
    }
  }
  const squashed = [];
  for (const el of document.querySelectorAll('button, input, textarea, select, .field, .model-chip, .nav-item')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (el.scrollWidth - el.clientWidth > 1) {
      squashed.push({ sel: String(el.className || el.tagName).slice(0, 40),
        text: (el.textContent || el.placeholder || '').trim().slice(0, 20),
        need: el.scrollWidth, have: el.clientWidth });
    }
  }
  const opWrap = [];
  for (const row of document.querySelectorAll('.account-item')) {
    const btns = [...row.querySelectorAll('.account-actions button')];
    if (btns.length < 2) continue;
    const tops = btns.map(b => Math.round(b.getBoundingClientRect().top));
    if (new Set(tops).size > 1) opWrap.push({ id: row.dataset?.id, tops });
  }
  const fieldGrid = [...document.querySelectorAll('.page.active .panel .field-grid .field')];
  const activePage = document.querySelector('.page.active');
  const firstHeading = activePage?.querySelector('h2')?.textContent || null;
  const navItems = [...document.querySelectorAll('.nav-item')];
  // 签到入口只应出现在国内版账号行上（国际版无签到活动）
  const checkinButtonsByEdition = { cn: 0, intl: 0 };
  const intlWithCheckin = [];
  for (const row of document.querySelectorAll('.account-item')) {
    const edition = row.querySelector('.badge[class*="edition-intl"]') ? 'intl' : 'cn';
    const hasCheckin = !!row.querySelector('.account-actions button[data-action="checkin"]');
    if (hasCheckin) checkinButtonsByEdition[edition]++;
    if (edition === 'intl' && hasCheckin) intlWithCheckin.push(row.dataset?.id);
  }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docScrollW: doc.scrollWidth, docClientW: doc.clientWidth,
    pageScrollsHorizontally: doc.scrollWidth > doc.clientWidth,
    wrapRect: rect(content), sidebarRect: sidebar ? rect(sidebar) : null,
    // 侧边栏必须完全位于内容区左侧，且不重叠
    sidebarLeftOfContent: sidebar
      ? Math.round(sidebar.getBoundingClientRect().right) <= Math.round(content.getBoundingClientRect().left) + 1
      : false,
    panelsCount: document.querySelectorAll('.page.active .panel').length,
    activePage: activePage?.dataset.page || null,
    navCount: navItems.length,
    navVisible: navItems.filter(item => item.getBoundingClientRect().width > 0).length,
    firstHeading,
    horizontalOverflow: horizontalOverflow.slice(0, 8),
    beyondContentRight: beyondContentRight.slice(0, 8),
    squashedControls: squashed.slice(0, 8),
    opWrap,
    checkinButtonsByEdition,
    intlWithCheckin,
    accountRows: document.querySelectorAll('.account-item').length,
    accountGroups: document.querySelectorAll('.account-group-title').length,
    segActive: (() => {
      const edition = document.querySelector('#account-edition-filter .seg-item.active');
      const status = document.querySelector('#account-status-filter .seg-item.active');
      return { edition: edition?.dataset.edition || null, status: status?.dataset.status || null };
    })(),
    logRows: document.querySelectorAll('.log-row').length,
    fieldGridPerRow: fieldGrid.length
      ? fieldGrid.filter(f => Math.abs(f.getBoundingClientRect().top - fieldGrid[0].getBoundingClientRect().top) < 2).length
      : 0,
    toast: (() => { const t = document.getElementById('toast'); const r = t.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right),
        withinViewport: r.x >= 0 && r.right <= window.innerWidth + 1 }; })(),
  };
})()`;

// 尺寸覆盖：默认尺寸、最小尺寸、窄、宽、矮，各截概览页顶部与账号页
const SIZES = [
  { tag: 'default-1060x800', width: 1060, height: 800 },
  { tag: 'min-820x600', width: 820, height: 600 },
  { tag: 'narrow-760x820', width: 760, height: 820 },
  { tag: 'wide-1600x900', width: 1600, height: 900 },
  { tag: 'short-1100x520', width: 1100, height: 520 },
];

const spec = [];
for (const size of SIZES) {
  spec.push({
    file: join(SHOT_DIR, `${size.tag}-top.png`),
    width: size.width, height: size.height, zoom: 1, delayMs: 700, probe: PROBE,
    section: 'overview', // 显式指定，避免被上次所在页（localStorage）带偏
  });
  spec.push({
    file: join(SHOT_DIR, `${size.tag}-accounts.png`),
    width: size.width, height: size.height, zoom: 1, delayMs: 700, probe: PROBE,
    section: 'accounts',
  });
  spec.push({
    file: join(SHOT_DIR, `${size.tag}-logs.png`),
    width: size.width, height: size.height, zoom: 1, delayMs: 900, probe: PROBE,
    section: 'logs',
  });
}
// 每个功能页各来一张（默认尺寸），确认切页后布局都成立
for (const page of ['overview', 'accounts', 'gateway', 'desensitize', 'logs']) {
  spec.push({
    file: join(SHOT_DIR, `page-${page}.png`),
    width: 1240, height: 860, zoom: 1, delayMs: 800, probe: PROBE,
    section: page,
  });
}
// 账号页的三级筛选态：国内 / 国际 / 已限流，确认切换后布局仍成立
for (const [tag, script] of [
  ['accounts-cn', "document.querySelector('#account-edition-filter [data-edition=\"cn\"]')?.click(); true"],
  ['accounts-intl', "document.querySelector('#account-edition-filter [data-edition=\"intl\"]')?.click(); true"],
  ['accounts-limited', "document.querySelector('#account-status-filter [data-status=\"limited\"]')?.click(); true"],
]) {
  spec.push({
    file: join(SHOT_DIR, `${tag}.png`),
    width: 1240, height: 860, zoom: 1, delayMs: 800, probe: PROBE,
    section: 'accounts',
    script,
  });
}
// 深色模式 + 弹窗各来一张，确认主题与无障碍未被破坏
spec.push({
  file: join(SHOT_DIR, 'dark-top.png'),
  width: 1060, height: 800, zoom: 1, delayMs: 700, probe: PROBE,
  section: 'overview',
  script: "document.querySelector('#theme-switch button[data-mode=\"dark\"]')?.click(); true",
});
spec.push({
  file: join(SHOT_DIR, 'modal.png'),
  width: 1060, height: 800, zoom: 1, delayMs: 500, probe: PROBE,
  section: 'overview',
  script: "document.getElementById('btn-add-account')?.click(); true",
});

// ─── 启动后端 + 桌面端 ─────────────────────────────────────

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

mkdirSync(SHOT_DIR, { recursive: true });
let desktop = null;
let desktopLog = '';

try {
  if (!await waitReady()) { console.error('后端启动失败'); process.exit(1); }
  console.log('✅ 后端就绪');

  desktop = spawn(electronExe, [join(ROOT, 'desktop')], {
    cwd: join(ROOT, 'desktop'),
    env: {
      ...process.env,
      WORKBUDDY_PROXY_PORT: String(PORT),
      WORKBUDDY_PROXY_HOME: home,
      WORKBUDDY_SHOT_SPEC: JSON.stringify(spec),
      WORKBUDDY_SHOT_DELAY_MS: '7000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  desktop.stdout.on('data', d => { desktopLog += String(d); process.stdout.write(String(d)); });
  desktop.stderr.on('data', d => { desktopLog += String(d); });

  // 等 electron 跑完全部截图后自行退出（步骤数 × 每步约 1.5s + 启动 7s，留足余量）
  const deadline = Date.now() + Math.max(180_000, 30_000 + spec.length * 3000);
  while (desktop.exitCode === null && Date.now() < deadline) await sleep(500);
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

// ─── 汇总探针结果，给出结论 ────────────────────────────────

const probes = [...desktopLog.matchAll(/^\[probe\] (\S+) (\{.*\})$/gm)]
  .map(m => ({ file: m[1], data: JSON.parse(m[2]) }));

console.log(`\n共采集 ${probes.length} 个探针样本，截图见 ${SHOT_DIR}\n`);

let problems = 0;
const report = (label, ok, detail = '') => {
  if (!ok) problems++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const failed = probes.filter(p => p.data.probeError);
report('所有探针均成功执行', failed.length === 0,
  failed.slice(0, 2).map(f => f.data.probeError).join('; '));

console.log('── 每种尺寸的布局 ──');
const bySize = new Map();
for (const p of probes) {
  const tag = p.file.split(/[\\/]/).pop().replace(/\.png$/, '');
  if (!bySize.has(tag)) bySize.set(tag, []);
  bySize.get(tag).push(p);
}
for (const [tag, list] of bySize) {
  const d = list[0].data;
  if (d.probeError) { console.log(`${tag}: 探针失败`); continue; }
  const off = list.flatMap(p => p.data.beyondContentRight || []);
  const squash = list.flatMap(p => p.data.squashedControls || []);
  const wrap = list.flatMap(p => p.data.opWrap || []);
  const horizOverflow = list.flatMap(p => p.data.horizontalOverflow || []);
  console.log(`${tag}: viewport=${d.viewport.w}x${d.viewport.h}`
    + ` 内容列=${d.wrapRect.w}px 面板数=${d.panelsCount} 账号行=${d.accountRows}`
    + ` 横向溢出=${off.length} 处 控件裁切=${squash.length} 处 按钮换行=${wrap.length} 处`
    + ` 页面横滚=${list.some(p => p.data.pageScrollsHorizontally) ? '是' : '否'}`);
  report(`  ${tag} 无元素超出内容列右边界`, off.length === 0,
    off.slice(0, 3).map(o => `${o.sel} 超出 ${o.outBy}px`).join('; '));
  report(`  ${tag} 控件未被裁切`, squash.length === 0,
    squash.slice(0, 3).map(s => `${s.sel}「${s.text}」需 ${s.need} 实得 ${s.have}`).join('; '));
  report(`  ${tag} 无横向溢出容器`, horizOverflow.length === 0,
    horizOverflow.slice(0, 3).map(h => `${h.sel} 溢出 ${h.over}px`).join('; '));
}

console.log('\n── 逐尺寸明细 ──');
for (const [tag, list] of bySize) {
  for (const p of list) {
    const d = p.data;
    if (d.probeError) { console.log(`  ${tag}: 探针失败 — ${d.probeError}`); continue; }
    console.log(`  ${tag}: 页面=${d.activePage}`
      + ` 内容列 ${d.wrapRect.w}x${d.wrapRect.h}`
      + ` 侧边栏 ${d.sidebarRect ? `${d.sidebarRect.w}px` : '无'}`
      + ` 面板数=${d.panelsCount}`
      + ` 字段行 ${d.fieldGridPerRow}/行`
      + (d.logRows ? ` 日志行=${d.logRows}` : '')
      + (d.opWrap.length ? ` 按钮换行=${d.opWrap.length}` : ''));
  }
}

report('侧边栏存在且位于内容区左侧', probes.every(p => p.data.sidebarRect && p.data.sidebarLeftOfContent),
  probes.filter(p => !p.data.sidebarRect || !p.data.sidebarLeftOfContent).length
    ? `${probes.filter(p => !p.data.sidebarRect || !p.data.sidebarLeftOfContent).length} 个样本不合格` : '');
report('五个导航项在所有尺寸下均可见', probes.every(p => p.data.navVisible === 5 && p.data.navCount === 5),
  probes.filter(p => p.data.navVisible !== 5).map(p => p.file.split(/[\\/]/).pop()).slice(0, 3).join('; '));
report('每个功能页均可切换到（有 active 页）', probes.every(p => p.data.activePage),
  probes.filter(p => !p.data.activePage).length ? '存在无激活页的样本' : '');
report('所有尺寸均无页面横向滚动', probes.every(p => !p.data.pageScrollsHorizontally));
report('账号操作按钮不换行', probes.every(p => (p.data.opWrap || []).length === 0));
report('toast 始终在视口内', probes.every(p => p.data.toast?.withinViewport));

// 五个功能页各自都要能画出来（页面级样本）
const pageProbes = probes.filter(p => /page-(overview|accounts|gateway|desensitize|logs)\.png$/.test(p.file));
report('五个功能页均有截图样本', pageProbes.length === 5, `实得 ${pageProbes.length} 个`);
for (const p of pageProbes) {
  const name = p.file.split(/[\\/]/).pop().replace(/\.png$/, '');
  report(`  ${name} 页面标题正确`, p.data.firstHeading !== null, `标题=${p.data.firstHeading}`);
  report(`  ${name} 无元素超出内容区右边界`, (p.data.beyondContentRight || []).length === 0,
    (p.data.beyondContentRight || []).slice(0, 2).map(o => `${o.sel} 超出 ${o.outBy}px`).join('; '));
}

// 账号页筛选：点击后分段选择器状态与分组标题都要跟着变
const filterProbes = probes.filter(p => /accounts-(cn|intl|limited)\.png$/.test(p.file));
report('账号页筛选态均有截图样本', filterProbes.length === 3, `实得 ${filterProbes.length} 个`);
for (const p of filterProbes) {
  const name = p.file.split(/[\\/]/).pop().replace(/\.png$/, '');
  const expected = name.replace('accounts-', '');
  if (expected === 'limited') {
    report(`  ${name} 状态筛选已激活`, p.data.segActive?.status === 'limited', `status=${p.data.segActive?.status}`);
  } else {
    report(`  ${name} 版本筛选已激活`, p.data.segActive?.edition === expected, `edition=${p.data.segActive?.edition}`);
  }
  report(`  ${name} 无元素超出内容区右边界`, (p.data.beyondContentRight || []).length === 0,
    (p.data.beyondContentRight || []).slice(0, 2).map(o => `${o.sel} 超出 ${o.outBy}px`).join('; '));
}
// 版本选具体值时不再显示分组标题（只有"全部"才分组）
const cnProbe = filterProbes.find(p => p.file.includes('accounts-cn'));
const intlProbe = filterProbes.find(p => p.file.includes('accounts-intl'));
report('筛选国内：只列国内账号（4 个）', cnProbe?.data.accountRows === 4, `实得 ${cnProbe?.data.accountRows}`);
report('筛选国际：只列国际账号（4 个）', intlProbe?.data.accountRows === 4, `实得 ${intlProbe?.data.accountRows}`);
report('筛选具体版本时不显示分组标题', cnProbe?.data.accountGroups === 0, `实得 ${cnProbe?.data.accountGroups}`);
// 「全部」视图下按版本分组：国内 4 + 国际 4
const accountsProbe = probes.find(p => /page-accounts\.png$/.test(p.file));
report('全部视图：显示国内/国际两个分组', accountsProbe?.data.accountGroups === 2, `实得 ${accountsProbe?.data.accountGroups}`);
report('全部视图：共 8 个账号行', accountsProbe?.data.accountRows === 8, `实得 ${accountsProbe?.data.accountRows}`);
// 国际版没有签到活动：签到按钮只应出现在国内版账号行上（假数据 1/3/5/7 为国内版）
report('国内版账号行都有签到按钮', accountsProbe?.data.checkinButtonsByEdition?.cn === 4,
  `实得 ${accountsProbe?.data.checkinButtonsByEdition?.cn}`);
report('国际版账号行不显示签到按钮', accountsProbe?.data.checkinButtonsByEdition?.intl === 0,
  `实得 ${accountsProbe?.data.checkinButtonsByEdition?.intl}`);
report('没有国际版账号误带签到入口', (accountsProbe?.data.intlWithCheckin || []).length === 0,
  (accountsProbe?.data.intlWithCheckin || []).join(','));

console.log(`\n${problems === 0 ? '🎉 布局检查全部通过' : `⚠️ 发现 ${problems} 处布局问题`}\n`);
process.exit(0);
