/**
 * WorkBuddy Local Proxy 桌面端 — 主进程
 *
 * 登录流程适配 WorkBuddy 的 state 轮询制：
 *   1. 后端 POST /api/session/login/start → { state, authUrl }
 *   2. 打开登录页：默认内嵌 BrowserWindow（隔离 partition），可选系统浏览器
 *      （shell.openExternal；国际版推荐，可带出用户已有登录态）
 *   3. 轮询 GET /api/session/login/wait?state=... 直到 done
 *   4. 完成后关窗（内嵌模式）、广播状态刷新
 *
 * 启动时若发现临期 token（< 5 分钟）会自动刷新这些账号的 token，
 * 再批量拉一次余额推给渲染层，避免 UI 一上来就看到一堆"已过期"。
 *
 * 后端默认由外部（npm run start 手动启动）管理；显式设置
 * WORKBUDDY_DESKTOP_AUTOSTART_PROXY=1 时才由桌面端临时拉起 server.mjs。
 */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const PROXY_PORT = Number(process.env.WORKBUDDY_PROXY_PORT || 3065);
const PROXY_BASE = `http://127.0.0.1:${PROXY_PORT}`;
const PROXY_ROOT = path.resolve(__dirname, '..');
const PROXY_SCRIPT = path.join(PROXY_ROOT, 'server.mjs');
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 60 * 1000; // 签到/批量查询较慢，放宽超时
const STARTUP_REFRESH_MARGIN_MS = 5 * 60 * 1000; // 与后端 PROACTIVE_REFRESH_MARGIN_MS 对齐
const MAX_NAME_LENGTH = 100;
const MAX_UPLOAD_LENGTH = 256 * 1024;

/**
 * 登录窗口允许导航的域名。
 * 取自两版 cli/product.json → authentication.attributes 的
 * internalDomain / externalDomain / iOADomain，外加扫码登录所需的微信/QQ 域名：
 *   国内版（WorkBuddy）   : copilot.tencent.com / codebuddy.cn / workbuddy.cn
 *   国际版（WorkBuddy AI）: www.workbuddy.ai / codebuddy.ai
 */
const LOGIN_ALLOWED_HOSTS = Object.freeze([
  // internalDomain
  'copilot.tencent.com',
  'staging-copilot.tencent.com',
  'codebuddy.cn',
  'workbuddy.cn',
  // externalDomain
  'codebuddy.ai',
  'staging-codebuddy.tencent.com',
  'workbuddy.ai',
  'staging.workbuddy.ai',
  // iOADomain / 通用
  'tencent.com',
  'qq.com',
  'wechat.com',
  'weixin.qq.com',
  'tenpay.com',
]);

let mainWindow = null;
let loginWindow = null;
let loginInFlight = false;
// 进行中的登录：{ state, mode } —— 供渲染层查询状态、主动取消（关弹窗/点取消）
let activeLogin = null;
let proxyProcess = null;

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

function normalizeId(value) {
  return typeof value === 'string' && value && value.length <= 256 ? value : '';
}

/** 词表入参归一：字符串数组、去空白、忽略大小写去重（后端还会再校验一遍） */
function normalizeTerms(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const term = raw.trim();
    if (!term || term.length > 200) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

// ─── 后端通信 ─────────────────────────────────────────────

/**
 * 本地网关若启用了 API Key（{项目根}/data/config.json 里的 apiKey），
 * 桌面端的管理请求要自动带上，否则所有 /api/* 都会 401。
 * 只读本地文件，不经过网络，key 不出本机。
 */
function readLocalApiKey() {
  try {
    const dir = process.env.WORKBUDDY_PROXY_HOME || path.join(PROXY_ROOT, 'data');
    const file = path.join(dir, 'config.json');
    if (!fs.existsSync(file)) return null;
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = typeof config?.apiKey === 'string' ? config.apiKey.trim() : '';
    return key || null;
  } catch {
    return null;
  }
}

async function proxyFetch(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const apiKey = readLocalApiKey();
  try {
    const response = await fetch(`${PROXY_BASE}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      const detail = payload?.error || payload?.error?.message || `HTTP ${response.status}`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return Object.prototype.hasOwnProperty.call(payload || {}, 'data') ? payload.data : payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接本地代理超时');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 取原始文本响应（导出 JSONL 用；proxyFetch 会按 JSON 解析，不适合）。
 */
async function proxyFetchText(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const apiKey = readLocalApiKey();
  try {
    const response = await fetch(`${PROXY_BASE}${pathname}`, {
      ...options,
      headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接本地代理超时');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyIsReady() {
  try {
    await proxyFetch('/health');
    return true;
  } catch {
    return false;
  }
}

function startProxyProcess() {
  if (proxyProcess || process.env.WORKBUDDY_DESKTOP_AUTOSTART_PROXY !== '1') return;
  proxyProcess = spawn(process.execPath, [PROXY_SCRIPT, '--port', String(PROXY_PORT)], {
    cwd: PROXY_ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  proxyProcess.stdout?.on('data', data => console.log(`[proxy] ${String(data).trimEnd()}`));
  proxyProcess.stderr?.on('data', data => console.warn(`[proxy] ${String(data).trimEnd()}`));
  proxyProcess.once('exit', () => { proxyProcess = null; });
}

async function ensureProxy() {
  if (await proxyIsReady()) return;
  startProxyProcess();
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (await proxyIsReady()) return;
  }
  throw new Error(
    `无法连接本地代理 http://127.0.0.1:${PROXY_PORT}，请先启动后端（npm run start）`,
  );
}

// ─── 状态广播 ─────────────────────────────────────────────

function sendStateChanged(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('accounts:state-changed', state);
}

async function getState() {
  await ensureProxy();
  return proxyFetch('/api/session');
}

async function publishFreshState() {
  const next = await getState();
  sendStateChanged(next);
  return next;
}

/**
 * 启动自动维护：临期 token（< 5 分钟）自动刷新一次，再批量查询一次积分余额，
  通过 accounts:auto-maintained 事件推给渲染层更新。
  任一账号或环节失败只记录日志，不影响其他账号和窗口使用。
 */
async function startupMaintenance() {
  try {
    await ensureProxy();
    const snapshot = await proxyFetch('/api/accounts');
    const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
    const stale = accounts.filter(account =>
      account?.available !== false
      && account?.hasRefreshToken
      && Number.isFinite(Number(account?.expiresAt))
      && Number(account.expiresAt) - Date.now() < STARTUP_REFRESH_MARGIN_MS);
    if (!stale.length) return;

    const refreshedIds = [];
    for (const account of stale) {
      try {
        await proxyFetch('/api/accounts/refresh', {
          method: 'POST',
          body: JSON.stringify({ id: account.id }),
        });
        refreshedIds.push(account.id);
      } catch (error) {
        console.warn('[startup] 自动刷新 token 失败:', account.id, error.message);
      }
    }

    let balances = null;
    try {
      balances = await proxyFetch('/api/accounts/usage');
    } catch (error) {
      console.warn('[startup] 自动查询余额失败:', error.message);
    }

    await publishFreshState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('accounts:auto-maintained', { refreshed: refreshedIds, balances });
    }
    console.log(`[startup] 已自动刷新 ${refreshedIds.length} 个临期账号的 Token 并更新余额`);
  } catch (error) {
    console.warn('[startup] 启动自动维护失败:', error instanceof Error ? error.message : String(error));
  }
}

// ─── 内嵌登录窗口 ─────────────────────────────────────────

function isAllowedLoginNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'about:') return true;
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    return LOGIN_ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * 打开登录页并等待登录完成。
 * edition: 'cn'=国内版 / 'intl'=国际版，决定后端登录页与端点。
 * mode: 'embedded'=内嵌窗口（默认）/ 'external'=系统默认浏览器（shell.openExternal）。
 * 返回 { ok: true } 或抛错（超时/用户关闭/后端报错）。
 */
async function startLoginWindow(edition, mode) {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    throw new Error('已有登录窗口在进行，请先完成或关闭它');
  }
  if (loginInFlight) {
    throw new Error('已有登录流程在进行，请先完成当前登录或等待超时');
  }
  await ensureProxy();
  loginInFlight = true;
  try {
    return await runLoginFlow(edition, mode);
  } finally {
    loginInFlight = false;
    activeLogin = null;
    // 让渲染层复位按钮（外部浏览器模式没有窗口关闭事件可依赖）
    sendLoginState({ active: false });
  }
}

/** 把登录进行状态推给渲染层（弹窗按钮据此启用/禁用与显示取消） */
function sendLoginState(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('login:state', payload);
}

/**
 * 取消进行中的登录：通知后端中止轮询，并让等待逻辑尽快退出。
 * 用户在浏览器里放弃登录、关掉弹窗、或点「取消」时调用。
 */
async function cancelActiveLogin() {
  const current = activeLogin;
  activeLogin = null;
  if (!current?.state) return { canceled: false };
  try {
    await proxyFetch('/api/session/login/cancel', {
      method: 'POST',
      body: JSON.stringify({ state: current.state }),
    });
  } catch (error) {
    console.warn('[login] 取消登录失败:', error.message);
  }
  return { canceled: true };
}

async function runLoginFlow(edition, mode) {
  const editionId = edition === 'intl' ? 'intl' : 'cn';
  const editionLabel = editionId === 'intl' ? '国际版' : '国内版';
  const useExternalBrowser = mode === 'external';
  const started = await proxyFetch('/api/session/login/start', {
    method: 'POST',
    body: JSON.stringify({ edition: editionId }),
  });
  const { state, authUrl } = started || {};
  if (!state || !authUrl) throw new Error('后端未返回登录链接，请检查网络');
  activeLogin = { state, mode: useExternalBrowser ? 'external' : 'embedded', edition: editionId };
  sendLoginState({ active: true, mode: activeLogin.mode, edition: editionId });

  // 系统浏览器模式：外部浏览器与登录页共享登录态，完成后仍由后端轮询判定
  if (useExternalBrowser) {
    // 自动化验证时跳过真实打开浏览器（WORKBUDDY_SKIP_OPEN_BROWSER=1）
    if (process.env.WORKBUDDY_SKIP_OPEN_BROWSER === '1') {
      console.log('[login] 已跳过打开系统浏览器（WORKBUDDY_SKIP_OPEN_BROWSER=1）');
    } else {
      await shell.openExternal(authUrl);
    }
    return awaitExternalLogin(state, editionLabel);
  }

  loginWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: `登录 WorkBuddy ${editionLabel}账号`,
    autoHideMenuBar: true,
    webPreferences: {
      partition: `workbuddy-login-${Date.now()}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const win = loginWindow;

  const guardNavigation = webContents => {
    const handler = (event, rawUrl) => {
      if (!isAllowedLoginNavigation(rawUrl)) event.preventDefault();
    };
    webContents.on('will-navigate', handler);
    webContents.on('will-redirect', handler);
    webContents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedLoginNavigation(url)) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    });
  };
  guardNavigation(win.webContents);

  let settled = false;
  let pollTimer = null;
  let resolveTask;
  let rejectTask;
  const task = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const finish = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(taskTimeout);
    if (pollTimer) clearInterval(pollTimer);
    if (loginWindow === win && !win.isDestroyed()) win.close();
    loginWindow = null;
    publishFreshState().catch(() => {});
    if (error) rejectTask(error);
    else resolveTask({ ok: true });
  };

  const taskTimeout = setTimeout(() => {
    finish(new Error('网页登录等待超时（5 分钟），请重试'));
  }, LOGIN_TIMEOUT_MS);
  win.on('closed', () => {
    if (!settled) {
      // 用户关窗即放弃登录：通知后端中止轮询，避免任务空转到超时
      void cancelActiveLogin();
      finish(new Error('登录窗口已关闭，未完成登录'));
    }
  });

  win.webContents.loadURL(authUrl).catch(error => {
    console.warn('[login] 登录页加载失败:', error.message);
  });

  pollTimer = setInterval(() => {
    if (settled) return;
    proxyFetch(`/api/session/login/wait?state=${encodeURIComponent(state)}`)
      .then(result => {
        if (!result || result.pending) return;
        if (result.error) finish(new Error(result.error));
        else finish();
      })
      .catch(error => console.warn('[login] 查询登录进度失败:', error.message));
  }, LOGIN_POLL_INTERVAL_MS);

  return task;
}

/**
 * 系统浏览器模式的等待：只轮询后端登录状态，不持有任何窗口。
 * 用户关掉浏览器不影响等待（登录可能在浏览器里已完成），
 * 直到后端拿到 token、报错、被取消，或 5 分钟超时。
 */
async function awaitExternalLogin(state, editionLabel) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));
    // 已被取消（关弹窗/点取消）：停止轮询，不当作错误弹出
    if (!activeLogin || activeLogin.state !== state) {
      return { ok: false, canceled: true };
    }
    let result;
    try {
      result = await proxyFetch(`/api/session/login/wait?state=${encodeURIComponent(state)}`);
    } catch (error) {
      // 登录任务被清理（已取消 / 后端切换账号等）时直接结束，不必等满 5 分钟
      if (/登录任务不存在|已过期/.test(error.message)) {
        return { ok: false, canceled: true };
      }
      console.warn('[login] 查询登录进度失败:', error.message);
      continue;
    }
    if (!result || result.pending) continue;
    if (result.error) throw new Error(result.error);
    publishFreshState().catch(() => {});
    return { ok: true, external: true };
  }
  throw new Error(`已打开系统浏览器完成${editionLabel}登录，但等待超时（5 分钟），请重试`);
}

// ─── 主窗口 ───────────────────────────────────────────────

const DEFAULT_WIN_BOUNDS = { width: 1060, height: 800 };
const MIN_WIN = { width: 820, height: 600 };

/**
 * 开发热重载：renderer 目录（index.html / app.js / 面板脚本）变更时自动刷新窗口。
 * 仅未打包运行（electron . / npm start）时启用；main.cjs、preload.cjs 的改动
 * 不在此列，需要重启 Electron（主进程代码无法通过刷新窗口生效）。
 */
let rendererWatchStarted = false;
function startRendererDevWatch() {
  if (app.isPackaged || rendererWatchStarted) return;
  rendererWatchStarted = true;
  const rendererDir = path.join(__dirname, 'renderer');
  let timer = null;
  try {
    fs.watch(rendererDir, { persistent: false }, (_event, filename) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        console.log(`[Dev] renderer/${filename || ''} 变更，自动刷新窗口`);
        mainWindow.webContents.reloadIgnoringCache();
      }, 150);
    });
    console.log('[Dev] renderer 热重载已启用（main/preload 改动需重启应用）');
  } catch (error) {
    console.warn('[Dev] renderer 监听失败:', error.message);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIN_BOUNDS.width,
    height: DEFAULT_WIN_BOUNDS.height,
    minWidth: MIN_WIN.width,
    minHeight: MIN_WIN.height,
    title: 'WorkBuddy 本地代理 · 会话与账号管理',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 渲染完成后再最大化并显示，避免先出现小窗口再拉伸的闪烁；启动即全屏大小
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  startRendererDevWatch();
  // 渲染层报错要能看见，否则布局探针失败时只有一句"脚本执行失败"
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.warn(`[renderer] ${message} (${sourceId}:${line})`);
  });
  // 外链走系统浏览器，不在应用内打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── IPC ──────────────────────────────────────────────────

function registerIpc() {
  // 会话
  ipcMain.handle('session:get-state', () => getState());
  ipcMain.handle('session:start-login', (_event, edition, mode) => startLoginWindow(edition, mode));
  // 登录进行状态（弹窗打开时据此复位按钮，避免上次未完成的登录把按钮卡在禁用态）
  ipcMain.handle('session:login-state', () => ({
    active: Boolean(activeLogin),
    mode: activeLogin?.mode || null,
    edition: activeLogin?.edition || null,
  }));
  ipcMain.handle('session:cancel-login', () => cancelActiveLogin());
  ipcMain.handle('session:refresh', async () => {
    await ensureProxy();
    await proxyFetch('/api/session/refresh', { method: 'POST', body: '{}' });
    return publishFreshState();
  });
  ipcMain.handle('session:logout', async () => {
    await ensureProxy();
    await proxyFetch('/api/session/logout', { method: 'POST', body: '{}' });
    return publishFreshState();
  });

  // 配置
  ipcMain.handle('config:get', async () => {
    await ensureProxy();
    return proxyFetch('/api/config');
  });
  ipcMain.handle('config:save', async (_event, payload) => {
    await ensureProxy();
    return proxyFetch('/api/config', { method: 'POST', body: JSON.stringify(payload) });
  });

  // 多账号
  ipcMain.handle('accounts:switch', async (_event, id) => {
    const accountId = normalizeId(id);
    if (!accountId) throw new Error('账号 ID 无效');
    await ensureProxy();
    await proxyFetch('/api/accounts/current', { method: 'POST', body: JSON.stringify({ id: accountId }) });
    return publishFreshState();
  });
  ipcMain.handle('accounts:refresh-token', async (_event, id) => {
    await ensureProxy();
    await proxyFetch('/api/accounts/refresh', { method: 'POST', body: JSON.stringify(id ? { id } : {}) });
    return publishFreshState();
  });
  ipcMain.handle('accounts:remove', async (_event, id) => {
    const accountId = normalizeId(id);
    if (!accountId) throw new Error('账号 ID 无效');
    await ensureProxy();
    await proxyFetch(`/api/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
    return publishFreshState();
  });
  // 手动添加账号：粘贴 accessToken/refreshToken JSON（与网页登录等价的备用通道）
  ipcMain.handle('accounts:upload', async (_event, name, fileText, edition) => {
    if (typeof fileText !== 'string' || !fileText.trim() || fileText.length > MAX_UPLOAD_LENGTH) {
      throw new Error('账号内容为空或过大（上限 256KB）');
    }
    let parsed;
    try { parsed = JSON.parse(fileText); } catch { throw new Error('粘贴内容不是有效 JSON'); }
    await ensureProxy();
    await proxyFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: normalizeName(name),
        ...parsed,
        // 弹窗里选的版本优先于粘贴内容里的同名字段
        edition: edition === 'intl' ? 'intl' : 'cn',
      }),
    });
    return publishFreshState();
  });

  // 积分 / 签到（当前账号）
  ipcMain.handle('billing:usage', async () => {
    await ensureProxy();
    return proxyFetch('/api/usage');
  });
  ipcMain.handle('billing:checkin-status', async () => {
    await ensureProxy();
    return proxyFetch('/api/checkin/status');
  });
  ipcMain.handle('billing:checkin', async () => {
    await ensureProxy();
    return proxyFetch('/api/checkin', { method: 'POST', body: '{}' });
  });

  // 多账号批量积分 / 签到
  ipcMain.handle('accounts:usage', async () => {
    await ensureProxy();
    return proxyFetch('/api/accounts/usage');
  });
  ipcMain.handle('accounts:checkin', async (_event, id) => {
    await ensureProxy();
    return proxyFetch('/api/accounts/checkin', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : {}),
    });
  });

  // 敏感词脱敏（词表维护 / 开关 / 命中统计）
  ipcMain.handle('desensitize:get', async () => {
    await ensureProxy();
    return proxyFetch('/api/desensitize');
  });
  ipcMain.handle('desensitize:set-enabled', async (_event, enabled) => {
    await ensureProxy();
    return proxyFetch('/api/desensitize/enabled', {
      method: 'POST',
      body: JSON.stringify({ enabled: enabled === true }),
    });
  });
  ipcMain.handle('desensitize:set-roles', async (_event, roles) => {
    const list = Array.isArray(roles) ? roles.filter(role => typeof role === 'string') : [];
    await ensureProxy();
    return proxyFetch('/api/desensitize/roles', {
      method: 'POST',
      body: JSON.stringify({ roles: list }),
    });
  });
  ipcMain.handle('desensitize:set-terms', async (_event, terms) => {
    const list = normalizeTerms(terms);
    if (!list.length) throw new Error('词表不能为空');
    await ensureProxy();
    return proxyFetch('/api/desensitize/terms', { method: 'PUT', body: JSON.stringify({ terms: list }) });
  });
  ipcMain.handle('desensitize:add-terms', async (_event, terms) => {
    const list = normalizeTerms(terms);
    if (!list.length) throw new Error('请填写要添加的词');
    await ensureProxy();
    return proxyFetch('/api/desensitize/terms', { method: 'POST', body: JSON.stringify({ terms: list }) });
  });
  ipcMain.handle('desensitize:remove-term', async (_event, term) => {
    const value = typeof term === 'string' ? term.trim() : '';
    if (!value) throw new Error('缺少要删除的词');
    await ensureProxy();
    return proxyFetch('/api/desensitize/terms', {
      method: 'DELETE',
      body: JSON.stringify({ terms: [value] }),
    });
  });
  ipcMain.handle('desensitize:reset', async () => {
    await ensureProxy();
    return proxyFetch('/api/desensitize/reset', { method: 'POST', body: '{}' });
  });
  ipcMain.handle('desensitize:reset-stats', async () => {
    await ensureProxy();
    return proxyFetch('/api/desensitize/stats/reset', { method: 'POST', body: '{}' });
  });

  // 请求加工管线：状态 / 运行时开关 / 重置统计
  ipcMain.handle('pipeline:get', async () => {
    await ensureProxy();
    return proxyFetch('/api/pipeline');
  });
  ipcMain.handle('pipeline:set-stage', async (_event, stage, enabled) => {
    if (typeof stage !== 'string' || !stage) {
      throw new Error('pipeline:set-stage 需要一个 stage 名称');
    }
    await ensureProxy();
    // 后端吃的是 disabled，这里把渲染层的 enabled 语义翻转后送出
    return proxyFetch('/api/pipeline/disable', {
      method: 'POST',
      body: JSON.stringify({ stage, disabled: enabled !== true }),
    });
  });
  ipcMain.handle('pipeline:reset-stats', async () => {
    await ensureProxy();
    return proxyFetch('/api/pipeline/reset', { method: 'POST', body: '{}' });
  });

  // 运行日志：查询 / 统计 / 清空 / 导出
  ipcMain.handle('logs:get', async (_event, query) => {
    await ensureProxy();
    const qs = typeof query === 'string' && query ? `?${query}` : '';
    return proxyFetch(`/api/logs${qs}`);
  });
  ipcMain.handle('logs:stats', async () => {
    await ensureProxy();
    return proxyFetch('/api/logs/stats');
  });
  ipcMain.handle('logs:clear', async () => {
    await ensureProxy();
    return proxyFetch('/api/logs', { method: 'DELETE' });
  });
  // 导出：后端回 JSONL 原文，这里走系统保存对话框落盘
  ipcMain.handle('logs:export', async () => {
    await ensureProxy();
    const text = await proxyFetchText('/api/logs/download');
    const count = text ? text.trim().split('\n').filter(Boolean).length : 0;
    if (!count) return { count: 0 };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出运行日志',
      defaultPath: path.join(app.getPath('downloads'), `workbuddy-logs-${stamp}.jsonl`),
      filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }, { name: '全部文件', extensions: ['*'] }],
    });
    if (canceled || !filePath) return { canceled: true, count };
    fs.writeFileSync(filePath, text, 'utf8');
    return { count, file: filePath };
  });
}

app.whenReady().then(async () => {
  registerIpc();
  createMainWindow();
  try { await ensureProxy(); } catch (error) { console.warn('[proxy]', error.message); }
  void startupMaintenance();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
  maybeCaptureScreenshot();
});

/**
 * 自动化验证用的截图钩子：仅当设置 WORKBUDDY_SHOT_PATH / WORKBUDDY_SHOT_SPEC
 * 时生效，等窗口渲染完成后把主窗口存盘，然后退出。正常运行不受影响。
 *
 *   WORKBUDDY_SHOT_PATH      单张截图路径（配合 SHOT_DELAY_MS / SHOT_ZOOM）
 *   WORKBUDDY_SHOT_SPEC      JSON 数组，按顺序截多张，用于核对多种窗口尺寸下的布局：
 *                            [{ file, width, height, section?, zoom?, delayMs?, probe? }]
 *                            width/height 是**内容区**尺寸（即渲染层视口）；
 *                            section 会先点击对应侧边导航项；probe 是求值后打印的表达式。
 */
function parseShotSpec() {
  const shots = [];
  const spec = process.env.WORKBUDDY_SHOT_SPEC;
  if (spec) {
    try {
      const parsed = JSON.parse(spec);
      if (Array.isArray(parsed)) {
        for (const shot of parsed) if (shot && shot.file) shots.push(shot);
      } else {
        console.error('[shot] WORKBUDDY_SHOT_SPEC 不是数组');
      }
    } catch (error) {
      console.error('[shot] WORKBUDDY_SHOT_SPEC 解析失败:', error.message);
    }
  }
  const single = process.env.WORKBUDDY_SHOT_PATH;
  if (single) shots.push({ file: single });
  return shots;
}

function maybeCaptureScreenshot() {
  const shots = parseShotSpec();
  if (!shots.length) return;
  const delay = Number(process.env.WORKBUDDY_SHOT_DELAY_MS || 6000);
  const defaultZoom = Number(process.env.WORKBUDDY_SHOT_ZOOM || 0);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  setTimeout(async () => {
    try {
      for (const shot of shots) {
        if (!mainWindow || mainWindow.isDestroyed()) break;
        const width = Math.round(Number(shot.width) || 0);
        const height = Math.round(Number(shot.height) || 0);
        if (width > 0 && height > 0) {
          // 启动即最大化；先还原成普通窗口才能按内容区尺寸精确摆放
          if (mainWindow.isMaximized()) mainWindow.unmaximize();
          mainWindow.setContentSize(width, height);
        }
        // 缩小页面可一屏截到长面板；默认 1 倍
        const zoom = shot.zoom === undefined ? defaultZoom : Number(shot.zoom) || 0;
        mainWindow.webContents.setZoomFactor(zoom > 0 ? zoom : 1);
        await sleep(400);
        if (shot.section) {
          const section = JSON.stringify(String(shot.section));
          await mainWindow.webContents
            .executeJavaScript(`document.querySelector('.nav-item[data-page=${section}]')?.click(); true`)
            .catch(() => {});
          // 切页后要等面板渲染（脚本里的操作依赖元素已可见）
          await sleep(200);
        }
        if (shot.script) {
          await mainWindow.webContents
            .executeJavaScript(String(shot.script))
            .catch(error => console.warn('[shot] script 执行失败:', error.message));
        }
        const scrollTo = shot.scrollTo === 'bottom'
          ? 'document.documentElement.scrollHeight'
          : '0';
        await mainWindow.webContents
          .executeJavaScript(`window.scrollTo(0, ${scrollTo}); true`)
          .catch(() => {});
        await sleep(Number(shot.delayMs) || (width || shot.section ? 900 : 600));
        if (shot.probe) {
          const value = await mainWindow.webContents
            .executeJavaScript(String(shot.probe))
            .catch(error => ({ probeError: error.message, stack: error.stack }));
          console.log(`[probe] ${shot.file} ${JSON.stringify(value)}`);
        }
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(shot.file, image.toPNG());
        console.log(`[shot] saved ${shot.file}`);
      }
    } catch (error) {
      console.error('[shot] failed:', error.message);
    } finally {
      app.quit();
    }
  }, delay);
}

app.on('before-quit', () => {
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  if (proxyProcess && !proxyProcess.killed) proxyProcess.kill();
  proxyProcess = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
