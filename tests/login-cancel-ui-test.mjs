#!/usr/bin/env node
/**
 * 登录取消 — 桌面端 UI 回归验证。
 *
 * 复现并验证用户报告的场景：
 *   1. 打开弹窗 → 点「在浏览器中打开登录页」（外部浏览器模式，等待 5 分钟）
 *   2. 关掉弹窗（模拟用户放弃等待）
 *   3. 重新打开弹窗 → 按钮必须可用（而不是卡在灰色禁用态）
 *   4. 顺带验证「取消等待」按钮在等待中可见、点击后恢复
 *
 * 用 main.cjs 的 WORKBUDDY_SHOT_SPEC.script/probe 通道驱动，无需额外注入。
 *
 * 运行: node login-cancel-ui-test.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3093;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(HERE, 'layout-shots', 'login-cancel');

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

const home = mkdtempSync(join(tmpdir(), 'wb-login-cancel-'));
mkdirSync(home, { recursive: true });
const now = Date.now();
writeFileSync(join(home, 'accounts.json'), JSON.stringify({
  currentAccountId: 'user-uid-demo',
  accounts: [{
    id: 'user-uid-demo', name: '演示账号', uid: 'uid-demo', nickname: '演示账号',
    type: 'personal', accessToken: 'AT-demo', refreshToken: 'RT-demo',
    expiresAt: now + 3600_000, tokenTail: 'demo', prefixPath: '/plugin',
    platform: 'workbuddy', edition: 'cn', endpoint: 'https://copilot.tencent.com', addedAt: 1, updatedAt: 1,
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

// ─── 探针步骤 ──────────────────────────────────────────────

/** 读弹窗里登录相关控件的真实状态 */
const READ_LOGIN_UI = `(async () => {
  const btn = document.getElementById('web-login-button');
  const cancel = document.getElementById('web-login-cancel');
  const modal = document.getElementById('add-modal');
  let loginState = null;
  try { loginState = await window.workbuddyDesktop.getLoginState(); } catch {}
  return {
    modalOpen: modal?.classList.contains('open') ?? null,
    buttonDisabled: btn?.disabled ?? null,
    buttonText: (btn?.textContent || '').trim(),
    cancelVisible: cancel ? getComputedStyle(cancel).display !== 'none' : null,
    loginActive: loginState?.active ?? null,
  };
})()`;

const probeSpec = [];
function addStep(tag, script, delayMs = 900) {
  probeSpec.push({
    file: join(SHOT_DIR, `${tag}.png`),
    width: 1200, height: 860, zoom: 1, delayMs,
    script,
    probe: READ_LOGIN_UI,
  });
}

// 1. 打开弹窗（此时不应有进行中的登录）
addStep('01-open-modal', `document.getElementById('btn-add-account').click(); true`);

// 2. 选国际版（会自动切到系统浏览器）+ 点登录 → 进入等待
addStep('02-start-external-login', `(() => {
  document.querySelector('input[name="account-edition"][value="intl"]').click();
  document.getElementById('web-login-button').click();
  return true;
})()`, 2500);

// 3. 关掉弹窗（模拟用户放弃等待）→ 应自动取消
addStep('03-close-modal', `(() => {
  document.getElementById('close-modal').click();
  return true;
})()`, 1500);

// 4. 重新打开弹窗 → 按钮必须可用（核心断言）
addStep('04-reopen-modal', `document.getElementById('btn-add-account').click(); true`, 1500);

// 5. 再次发起登录，然后用「取消等待」按钮取消
addStep('05-start-then-cancel', `(async () => {
  document.getElementById('web-login-button').click();
  await new Promise(r => setTimeout(r, 2000));
  const cancel = document.getElementById('web-login-cancel');
  if (cancel && getComputedStyle(cancel).display !== 'none') cancel.click();
  return true;
})()`, 2500);

// 6. 取消后按钮应恢复可用
addStep('06-after-cancel', `true`, 1200);

// ─── 启动 Electron ─────────────────────────────────────────

let desktop = null;
let desktopLog = '';

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
      // 不真的拉起系统浏览器（自动化环境里会弹出真实窗口）
      WORKBUDDY_SKIP_OPEN_BROWSER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  desktop.stdout.on('data', d => { const t = String(d); log += t; desktopLog += t; });
  desktop.stderr.on('data', d => { log += String(d); desktopLog += String(d); });

  await sleep(6000 + probeSpec.length * 2600 + 5000);
  desktop.kill();
  await sleep(500);

  // ─── 校验 ────────────────────────────────────────────────

  console.log('\n━━━ UI 探针结果 ━━━');
  const parsed = [...log.matchAll(/^\[probe\] (\S+) (\{.*\})$/gm)]
    .map(m => ({ file: m[1], data: JSON.parse(m[2]) }));
  const byTag = tag => parsed.find(p => p.file.includes(tag))?.data || {};

  check('探针全部有返回', parsed.length >= probeSpec.length, `收到 ${parsed.length}/${probeSpec.length} 条`);

  const opened = byTag('01-open-modal');
  check('弹窗已打开', opened.modalOpen, true);
  check('初始按钮可用', opened.buttonDisabled, false);
  check('初始无进行中登录', opened.loginActive, false);

  const started = byTag('02-start-external-login');
  check('发起登录后进入等待', started.loginActive, true);
  check('等待中按钮禁用', started.buttonDisabled, true);
  check('等待中出现「取消等待」按钮', started.cancelVisible, true);

  const closed = byTag('03-close-modal');
  check('关窗后弹窗关闭', closed.modalOpen, false);

  const reopened = byTag('04-reopen-modal');
  check('重开弹窗：弹窗打开', reopened.modalOpen, true);
  check('重开弹窗：无残留登录任务', reopened.loginActive, false);
  check('重开弹窗：按钮可用（未卡死）', reopened.buttonDisabled, false);
  check('重开弹窗：取消按钮已隐藏', reopened.cancelVisible, false);
  check('重开弹窗：按钮文案正常', /打开/.test(reopened.buttonText || ''), reopened.buttonText);

  const canceled = byTag('06-after-cancel');
  check('点取消后按钮恢复可用', canceled.buttonDisabled, false);
  check('点取消后无进行中登录', canceled.loginActive, false);

  // 后端也应记下取消
  check('后端日志有取消记录', /已取消/.test(serverLog), '');
} finally {
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (server.exitCode === null) server.kill();
  await sleep(600);
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? '🎉 全部通过' : `⚠️ ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);
