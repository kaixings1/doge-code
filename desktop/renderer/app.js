/* WorkBuddy 本地代理 · Web 管理界面（复用桌面渲染组件） */

const api = window.workbuddyAPI || window.workbuddyDesktop;
const $ = id => document.getElementById(id);
let state = null;
let currentConfig = null;
let busy = false;
let usageBusy = false;
let checkinBusy = false;
const usageMap = new Map();   // accountId -> usage | error string | null(loading)
const checkinMap = new Map(); // accountId -> claimResult | error string | null(loading)
// 账号页两级筛选：edition = all|cn|intl，status = all|normal|limited
const accountFilter = { edition: 'all', status: 'all' };

const PROXY_PORT = 3065;
const PROXY_BASE = api?.baseUrl || `http://127.0.0.1:${PROXY_PORT}`;

// ─── 工具 ────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function toast(message, type = 'ok') {
  const element = $('toast');
  element.textContent = message;
  element.className = type;
  element.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.style.display = 'none'; }, 3500);
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** 短时间：同天显示 HH:mm，跨天显示 MM-DD HH:mm（用于限额恢复时间） */
function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString('zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatRemaining(ms) {
  if (!Number.isFinite(ms) || !ms) return '';
  const diff = ms - Date.now();
  if (diff <= 0) return '（已过期）';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `（${minutes} 分钟后过期）`;
  return `（${Math.round(minutes / 60)} 小时后过期）`;
}

function expiryBadge(expiresAt) {
  if (!expiresAt) return '<span class="badge warn">未提供过期时间</span>';
  const left = Number(expiresAt) - Date.now();
  if (left <= 0) return '<span class="badge bad">已过期</span>';
  if (left < 3600e3) return `<span class="badge warn">${Math.max(1, Math.round(left / 60e3))} 分钟后过期</span>`;
  return `<span class="badge ok">${(left / 3600e3).toFixed(1)} 小时后过期</span>`;
}

// ─── 主题 ────────────────────────────────────

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  // system 模式下 color-scheme 也要跟随系统，否则原生控件会停留在浅色
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';
  document.documentElement.style.colorScheme = effective;
  localStorage.setItem('workbuddy-desktop-theme', mode);
  document.querySelectorAll('#theme-switch button').forEach(item => {
    item.classList.toggle('active', item.dataset.mode === mode);
  });
}

// ─── 页面导航 ────────────────────────────────

const PAGE_KEY = 'workbuddy-desktop-page';
const PAGES = ['overview', 'accounts', 'gateway', 'desensitize', 'pipeline', 'logs'];

/** 当前页（子模块据此判断是否需要重新加载） */
let currentPage = 'overview';

function showPage(name, { persist = true } = {}) {
  const page = PAGES.includes(name) ? name : 'overview';
  currentPage = page;
  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.dataset.page === page);
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  if (persist) localStorage.setItem(PAGE_KEY, page);
  // 切到日志页时清掉未读标记，并立即拉一次最新日志
  if (page === 'logs') {
    clearLogsBadge();
    window.wbLogsPanel?.load?.();
  }
  // 切到加工页时拉一次最新管线状态（统计是累计值，每次进页面都该刷新）
  if (page === 'pipeline') {
    window.wbPipelinePanel?.load?.();
  }
}

// ─── 日志未读徽标 ─────────────────────────────

let lastSeenLogId = Number(localStorage.getItem('workbuddy-desktop-log-seen') || 0);

function clearLogsBadge() {
  const badge = $('nav-count-logs');
  if (badge) badge.style.display = 'none';
  const stats = window.wbLogsPanel?.lastStats?.();
  if (stats?.lastId) {
    lastSeenLogId = stats.lastId;
    localStorage.setItem('workbuddy-desktop-log-seen', String(lastSeenLogId));
  }
}

/** 有新日志时在导航上显示未读数（只在非日志页显示，避免打扰当前阅读） */
function updateLogsBadge(stats) {
  const badge = $('nav-count-logs');
  if (!badge || !stats) return;
  const lastId = Number(stats.lastId) || 0;
  const warnCount = (stats.byLevel?.warn || 0) + (stats.byLevel?.error || 0);
  // 未读 = 上次已读之后新增的条数；首次运行把当前水位记为已读
  if (!lastSeenLogId) {
    lastSeenLogId = lastId;
    localStorage.setItem('workbuddy-desktop-log-seen', String(lastId));
    badge.style.display = 'none';
    return;
  }
  const unread = Math.max(0, lastId - lastSeenLogId);
  if (currentPage === 'logs' || !unread) {
    badge.style.display = 'none';
    if (currentPage === 'logs') {
      lastSeenLogId = lastId;
      localStorage.setItem('workbuddy-desktop-log-seen', String(lastId));
    }
    return;
  }
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.title = `${unread} 条新日志（其中警告/错误 ${warnCount} 条）`;
  badge.style.display = '';
}

// ─── 渲染：会话状态 ────────────────────────────

function renderSession() {
  const session = state?.session || {};
  const health = state?.health || {};
  const badge = $('session-badge');
  const currentAccount = state?.accounts?.accounts?.find(a => a.id === state.accounts.currentAccountId);

  if (!health.upstreamConfigured) {
    badge.className = 'badge bad';
    badge.textContent = '⚠️ 未登录';
    badge.title = health.unavailableReason || '';
  } else if (!session.loggedIn) {
    badge.className = 'badge bad';
    badge.textContent = '未登录';
  } else {
    const expiresAt = Number(session.tokenExpiresAt) || 0;
    const expiringSoon = expiresAt && expiresAt - Date.now() < 5 * 60 * 1000;
    badge.className = `badge ${expiringSoon ? 'warn' : 'ok'}`;
    badge.textContent = expiringSoon ? '临期（将自动刷新）' : '已登录';
  }

  $('session-nickname').textContent = session.nickname || currentAccount?.nickname || currentAccount?.name || '—';
  $('session-uid').textContent = session.accountUid || currentAccount?.uid || '—';
  $('session-endpoint').textContent = session.endpoint || '—';
  const expiresAt = Number(session.tokenExpiresAt) || 0;
  $('session-expires').textContent = session.loggedIn
    ? `${formatTime(expiresAt)}${formatRemaining(expiresAt)}`
    : '—';

  // 退出登录 / 刷新 Token 在「会话状态」面板头里，按当前账号是否有可用凭证来决定禁用
  const hasActive = Boolean(session.loggedIn || currentAccount);
  $('btn-logout').disabled = !session.loggedIn;
  $('btn-refresh-token').disabled = !session.loggedIn;
}

// ─── 渲染：账号列表（带行内积分 / 签到面板） ────

function typeLabel(type) {
  if (type === 'enterprise') return '企业';
  if (type === 'ultimate') return '旗舰';
  return '个人';
}

/** 限额徽章：显示状态码 + 恢复时间（账号×模型，仅未过期的） */
function rateLimitBadges(account) {
  const limits = account.rateLimits || {};
  const now = Date.now();
  const active = Object.entries(limits)
    .map(([model, info]) => ({ model, ...info }))
    .filter(item => Number(item.resetAt) > now)
    .sort((a, b) => a.resetAt - b.resetAt);
  if (!active.length) return [];
  const first = active[0];
  const extra = active.length > 1 ? ` +${active.length - 1}` : '';
  const title = active
    .map(item => `${item.model}: ${item.status}，${formatTime(item.resetAt)} 恢复`)
    .join('\n');
  return [`<span class="badge warn" title="${esc(title)}">${esc(String(first.status))} · ${esc(formatShortTime(first.resetAt))} 恢复${extra}</span>`];
}

function accountBadges(account, isCurrent) {
  return [
    `<span class="badge edition-${esc(account.edition || 'cn')}">${esc(account.editionLabel || (account.edition === 'intl' ? '国际版' : '国内版'))}</span>`,
    `<span class="badge">${typeLabel(account.type)}</span>`,
    isCurrent ? '<span class="badge cur">当前</span>' : '',
    account.available === false
      ? '<span class="badge bad">不可用</span>'
      : expiryBadge(account.expiresAt),
    ...rateLimitBadges(account),
  ].filter(Boolean).join(' ');
}

function usagePanelHtml(account) {
  const entry = usageMap.get(account.id);
  if (entry === undefined) {
    return '<div class="row-panel">积分尚未查询，请点击该账号行上的「积分」按钮。</div>';
  }
  if (entry === null) {
    return '<div class="row-panel"><span class="badge warn">正在查询积分…</span></div>';
  }
  if (typeof entry === 'string') {
    return `<div class="row-panel error"><span class="badge bad">查询失败</span> ${esc(entry)}</div>`;
  }
  // 三字段简报：总剩余 / 套餐基础 / 平台奖励（企业账号后两项为 null）
  const totalLeft = entry.unlimited ? '∞' : (entry.totalLeft ?? '—');
  const planLeft = entry.planLeft ?? '—';
  const bonusLeft = entry.bonusLeft ?? '—';
  const kindTag = entry.kind === 'enterprise' ? ' <span class="meta">（企业账号，不区分套餐/奖励）</span>' : '';
  return `<div class="row-panel">
    <div class="panel-label"><span>总剩余积分：</span><span class="big">${esc(totalLeft)}</span>${kindTag}</div>
    <div class="row"><span>套餐基础积分：</span><span>${esc(planLeft)}</span><span class="meta">· 平台奖励积分：${esc(bonusLeft)}</span></div>
  </div>`;
}

function checkinPanelHtml(account) {
  if (!supportsCheckin(account)) {
    return '<div class="row-panel">国际版暂无签到活动，该账号不参与签到。</div>';
  }
  const entry = checkinMap.get(account.id);
  if (entry === undefined) {
    return '<div class="row-panel">签到状态未查询，请点击该账号行上的「签到」按钮。</div>';
  }
  if (entry === null) {
    return '<div class="row-panel"><span class="badge warn">正在签到…</span></div>';
  }
  if (typeof entry === 'string') {
    return `<div class="row-panel error"><span class="badge bad">签到失败</span> ${esc(entry)}</div>`;
  }
  if (!entry || entry.success === undefined) {
    return '<div class="row-panel">未获取到签到结果</div>';
  }
  if (entry.success) {
    const d = entry.data || {};
    const parts = [];
    parts.push(`<span class="badge ok">✅ 签到成功</span>`);
    if (Number.isFinite(d.points) && d.points) parts.push(`<span>本次 +${esc(d.points)} 积分</span>`);
    if (Number.isFinite(d.continuousDays)) parts.push(`<span>连续 ${esc(d.continuousDays)} 天</span>`);
    if (Number.isFinite(d.totalDays)) parts.push(`<span>累计 ${esc(d.totalDays)} 天</span>`);
    return `<div class="row-panel"><div class="panel-label">${parts.join(' ')}</div></div>`;
  }
  return `<div class="row-panel"><div class="panel-label"><span class="badge warn">${esc(entry.msg || '未领取')}</span><span class="meta">code=${esc(entry.code ?? '?')}</span></div></div>`;
}

/** 账号当前是否处于限流状态（存在未到恢复时间的限额记录） */
function isRateLimited(account) {
  const limits = account?.rateLimits || {};
  const now = Date.now();
  return Object.values(limits).some(info => Number(info?.resetAt) > now);
}

/** 账号所属版本：cn=国内 / intl=国际（缺省视为国内，兼容旧账号记录） */
function accountEdition(account) {
  return account?.edition === 'intl' ? 'intl' : 'cn';
}

/** 国际版没有签到活动，签到相关入口对其隐藏 */
function supportsCheckin(account) {
  return accountEdition(account) !== 'intl';
}

/** 可参与签到的账号（一键签到只用这批） */
function checkinableAccounts(accounts) {
  return accounts.filter(supportsCheckin);
}

/** 单行渲染（不含分组标题） */
function accountRowHtml(account, currentAccountId) {
  const isCurrent = account.id === currentAccountId;
  const meta = [
    account.uid ? `uid ${esc(account.uid.slice(0, 8))}…` : '',
    account.tokenTail ? `token 尾号 ${esc(account.tokenTail)}` : '',
    account.expiresAt ? `更新于 ${esc(formatTime(account.updatedAt || account.expiresAt))}` : '',
    account.available === false
      ? `<span style="color:var(--danger)">${esc(account.reason || '账号不可用')}</span>`
      : '',
    account.disabled === true
      ? '<span style="color:var(--danger)"><strong>已禁用</strong></span>'
      : '',
  ].filter(Boolean).join(' · ');
  const disabled = account.disabled === true;
  const actions = disabled
    ? [
        `<button class="danger" data-action="enable" data-id="${esc(account.id)}">启用</button>`,
        `<button data-action="usage" data-id="${esc(account.id)}">积分</button>`,
        !account.desktop
          ? `<button class="danger" data-action="remove" data-id="${esc(account.id)}">删除</button>`
          : '',
      ].filter(Boolean).join('')
    : [
      isCurrent
        ? '<button class="primary" disabled>当前使用中</button>'
        : (account.available !== false
          ? `<button class="primary" data-action="switch" data-id="${esc(account.id)}">设为当前</button>`
          : ''),
      account.hasRefreshToken
        ? `<button data-action="refresh" data-id="${esc(account.id)}">刷新 Token</button>`
        : '',
      `<button data-action="usage" data-id="${esc(account.id)}">积分</button>`,
      supportsCheckin(account)
        ? `<button data-action="checkin" data-id="${esc(account.id)}">签到</button>`
        : '',
      `<button class="danger" data-action="disable" data-id="${esc(account.id)}">禁用</button>`,
      !account.desktop
        ? `<button class="danger" data-action="remove" data-id="${esc(account.id)}">删除</button>`
        : '',
    ].filter(Boolean).join('');
  return `<article class="account-item" data-id="${esc(account.id)}">
    <div class="account-head">
      <div class="account-main">
        <div class="account-name"><span>${esc(account.nickname || account.name || account.uid || '未命名账号')}</span>${accountBadges(account, isCurrent)}</div>
        <div class="account-meta">${meta || '无可展示的账号信息'}</div>
      </div>
      <div class="account-actions">${actions}</div>
    </div>
    <div class="row-panels">${usagePanelHtml(account)}${checkinPanelHtml(account)}</div>
  </article>`;
}

function renderAccounts() {
  const list = $('account-list');
  const snapshot = state?.accounts;
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  $('accounts-count').textContent = String(accounts.length);

  // 顶部按钮按账号是否存在启用；一键签到只针对国内版账号
  $('btn-query-usage').disabled = !accounts.length;
  $('btn-checkin-all').disabled = !checkinableAccounts(accounts).length;

  // 两级筛选：版本（全部/国内/国际）+ 状态（全部/正常/已限流）
  const byEdition = accounts.filter(account => accountFilter.edition === 'all'
    || accountEdition(account) === accountFilter.edition);
  const byStatus = byEdition.filter(account => accountFilter.status === 'all'
    || (accountFilter.status === 'limited' ? isRateLimited(account) : !isRateLimited(account)));

  // 各分段的数量徽标（状态计数基于当前已选的版本，形成"二次分级"的联动）
  const limitedInEdition = byEdition.filter(isRateLimited).length;
  updateSegCounts({
    all: accounts.length,
    cn: accounts.filter(a => accountEdition(a) === 'cn').length,
    intl: accounts.filter(a => accountEdition(a) === 'intl').length,
    normal: byEdition.length - limitedInEdition,
    limited: limitedInEdition,
  });

  if (!accounts.length) {
    list.innerHTML = '<div class="empty">暂无账号，请点击右上角「登录 / 添加账号」</div>';
    return;
  }
  if (!byStatus.length) {
    list.innerHTML = '<div class="empty">当前筛选条件下没有账号</div>';
    return;
  }

  // 版本选「全部」时按版本分组展示，选具体版本时只列该组
  const groups = accountFilter.edition === 'all'
    ? [
      { key: 'cn', title: '国内账号', items: byStatus.filter(a => accountEdition(a) === 'cn') },
      { key: 'intl', title: '国际账号', items: byStatus.filter(a => accountEdition(a) === 'intl') },
    ].filter(group => group.items.length)
    : [{ key: accountFilter.edition, title: '', items: byStatus }];

  list.innerHTML = groups.map(group => {
    const title = group.title
      ? `<div class="account-group-title">${esc(group.title)} · ${group.items.length}</div>`
      : '';
    return title + group.items.map(a => accountRowHtml(a, snapshot.currentAccountId)).join('');
  }).join('');
}

/** 更新分段选择器上的数量徽标 */
function updateSegCounts(counts) {
  document.querySelectorAll('.seg-item').forEach(item => {
    const key = item.dataset.edition || item.dataset.status;
    const badge = item.querySelector('.seg-count');
    if (badge && key) badge.textContent = String(counts[key] ?? 0);
  });
}

// ─── 渲染：网关 / 模型 / 配置 ──────────────────

function renderGateway() {
  $('api-chat').textContent = `POST ${PROXY_BASE}/v1/chat/completions`;
  $('api-messages').textContent = `POST ${PROXY_BASE}/v1/messages`;
  $('api-models').textContent = `GET ${PROXY_BASE}/v1/models`;
  $('api-base').textContent = `${PROXY_BASE}/v1`;
}

function renderModels() {
  const box = $('models');
  const models = Array.isArray(state?.models) ? state.models : [];
  if (!models.length) {
    box.innerHTML = '<div class="empty" style="padding:14px 0">暂无模型</div>';
    return;
  }
  // 倍率统一展示为官方风格 "0.03x"：兼容远程 "x0.03" 与内置 "x0.03 credits" 两种写法
  const formatCredits = c => {
    const m = /x\s*([\d.]+)/i.exec(c || '');
    return m ? `${m[1]}x` : (c || '');
  };
  box.innerHTML = models.map(m => {
    const cls = m.isDefault ? 'model-chip default' : 'model-chip';
    const credits = m.credits ? `<span class="credits">${esc(formatCredits(m.credits))}</span>` : '';
    const name = m.name && m.name !== m.id ? `<span class="credits">${esc(m.name)}</span>` : '';
    return `<span class="${cls}">${esc(m.id)}${m.isDefault ? '（默认）' : ''}${name}${credits}</span>`;
  }).join('');

  const def = models.find(m => m.isDefault) || models[0];
  if (def) {
    const badge = $('default-model-badge');
    badge.textContent = `默认 ${def.id}`;
    badge.style.display = '';
    $('default-model').textContent = def.id;
  }
}

function renderConfig() {
  currentConfig = state?.config || { apiKeySet: false, apiKey: null };
  const { apiKeySet, apiKey } = currentConfig;
  $('api-key-input').placeholder = apiKeySet
    ? `当前已设置：${apiKey}（输入新值覆盖）`
    : '留空表示不启用鉴权；至少 8 个字符';
  $('api-key-status').textContent = apiKeySet
    ? `✅ 已启用，客户端请求需带 Authorization: Bearer <key>（当前 ${apiKey}）`
    : '未启用（仅监听 127.0.0.1，建议本机使用）';

  // 思考块透传开关
  const tt = currentConfig.translateThinking;
  const toggle = $('translate-thinking-enabled');
  const badge = $('translate-thinking-badge');
  if (toggle) {
    toggle.checked = tt === true;
    toggle.disabled = false;
    if (badge) {
      badge.className = tt === true ? 'badge ok' : 'badge';
      badge.textContent = tt === true ? '已开启' : '已关闭';
    }
    $('translate-thinking-state').textContent = tt === true
      ? '上游推理内容会以 thinking 块呈现'
      : '关闭后仅透传正文，不展示推理过程';
  }
}

function renderProxyStatus() {
  const health = state?.health;
  $('proxy-status').innerHTML = health?.upstreamConfigured
    ? `代理已连接 · ${esc(health.upstreamBaseUrl || '')} · 当前账号 ${esc(health.currentAccountId || state?.accounts?.currentAccountId || '')}`
    : state
      ? `服务已连接，等待登录账号。${esc(health?.unavailableReason || '')}`
      : '<span style="color:var(--danger)">无法连接代理，请检查服务进程</span>';
  if ($('metric-service')) {
    $('metric-service').textContent = state ? '已连接' : '未连接';
    $('metric-service-note').textContent = state ? (health?.upstreamConfigured ? '已配置账号，实际可用性以请求结果为准' : '添加账号后即可使用代理') : '请启动服务后刷新页面';
    $('metric-accounts').textContent = String(state?.accounts?.accounts?.length ?? 0);
    $('metric-models').textContent = String(state?.models?.length ?? 0);
    $('metric-auth').textContent = state?.config?.apiKeySet ? '已启用' : state ? '未启用' : '—';
  }
}

function render() {
  renderSession();
  renderAccounts();
  renderGateway();
  renderModels();
  renderConfig();
  renderProxyStatus();
  renderNavCounts();
}

/** 导航上的数量徽标：账号数 / 日志未读 */
function renderNavCounts() {
  const accounts = state?.accounts?.accounts;
  const count = Array.isArray(accounts) ? accounts.length : 0;
  const badge = $('nav-count-accounts');
  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle('muted', count === 0);
  }
}

// ─── 加载 ─────────────────────────────────────

let refreshBusy = false;
async function refresh() {
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const next = await api.getState();
    state = next;
    // 配置面板（apiKey / defaultModel）与词表通过独立接口加载，避免阻塞状态
    await Promise.all([loadConfig(), loadDesensitize()]);
    // 清掉已删除账号的本地缓存
    const validIds = new Set((state.accounts?.accounts || []).map(a => a.id));
    for (const id of usageMap.keys()) if (!validIds.has(id)) usageMap.delete(id);
    for (const id of checkinMap.keys()) if (!validIds.has(id)) checkinMap.delete(id);
    render();
  } catch (error) {
    state = null;
    render();
    $('proxy-status').innerHTML = `<span style="color:var(--danger)">加载失败：${esc(error.message)}</span>`;
  } finally {
    refreshBusy = false;
  }
}

async function loadConfig() {
  try {
    const cfg = await api.getConfig();
    // config 里的 desensitize 是精简摘要（无 terms），不要拿它覆盖完整词表状态
    state = { ...(state || {}), config: cfg };
    renderConfig();
  } catch (error) {
    console.warn('读取配置失败:', error.message);
  }
}

/** 词表面板自带状态，这里只做转发，避免再往主 state 里塞一份 */
function loadDesensitize() {
  return window.wbDesensitizePanel?.load();
}

// ─── 行内操作：积分 / 签到 ──────────────────────

async function queryUsageFor(id) {
  const data = await api.getAllBalances();
  const rows = Array.isArray(data?.results) ? data.results : [];
  const returned = new Set();
  for (const row of rows) {
    if (!row?.id) continue;
    returned.add(row.id);
    usageMap.set(row.id, row.usage ? row.usage : (row.error ? String(row.error) : '余额响应为空'));
  }
  const accounts = state?.accounts?.accounts || [];
  for (const acc of accounts) if (!returned.has(acc.id)) usageMap.set(acc.id, '未返回余额数据');
  renderAccounts();
  return data;
}

async function queryAllUsage() {
  if (usageBusy) return;
  const accounts = state?.accounts?.accounts || [];
  if (!accounts.length) { toast('暂无可查询的账号', 'err'); return; }
  usageBusy = true;
  const button = $('btn-query-usage');
  button.disabled = true;
  button.textContent = '查询中…';
  accounts.forEach(a => usageMap.set(a.id, null));
  renderAccounts();
  try {
    const result = await queryUsageFor(null);
    const rows = result?.results || [];
    const ok = rows.filter(r => r.usage).length;
    toast(ok === rows.length
      ? `✅ 已更新 ${ok} 个账号的积分`
      : `已更新 ${ok}/${rows.length} 个账号，部分失败`, ok !== rows.length ? 'err' : 'ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    accounts.forEach(a => usageMap.set(a.id, `查询失败：${message}`));
    renderAccounts();
    toast(`积分查询失败：${message}`, 'err');
  } finally {
    usageBusy = false;
    button.disabled = false;
    button.textContent = '查询全部账号积分';
  }
}

async function checkinFor(id) {
  // id 缺省 = 全部账号串行签到；指定 id = 单账号签到
  const data = await api.checkinAllAccounts(id || null);
  const rows = Array.isArray(data?.results) ? data.results : [];
  if (id) {
    const row = rows.find(r => r.id === id) || rows[0];
    if (!row) {
      checkinMap.set(id, '未返回签到结果');
    } else if (row.error) {
      checkinMap.set(id, String(row.error));
    } else if (row.claim) {
      checkinMap.set(id, row.claim);
    } else {
      checkinMap.set(id, '签到响应为空');
    }
  } else {
    for (const row of rows) {
      if (!row?.id) continue;
      if (row.error) checkinMap.set(row.id, String(row.error));
      else if (row.claim) checkinMap.set(row.id, row.claim);
      else checkinMap.set(row.id, '签到响应为空');
    }
    const accounts = checkinableAccounts(state?.accounts?.accounts || []);
    const returned = new Set(rows.map(r => r.id));
    for (const acc of accounts) if (!returned.has(acc.id)) checkinMap.set(acc.id, '未返回签到结果');
  }
  renderAccounts();
  return data;
}

async function checkinAll() {
  if (checkinBusy) return;
  const accounts = checkinableAccounts(state?.accounts?.accounts || []);
  if (!accounts.length) { toast('暂无可签到的账号（国际版无签到活动）', 'err'); return; }
  if (!confirm(`将对 ${accounts.length} 个国内版账号串行签到，可能需要一点时间。继续？`)) return;
  checkinBusy = true;
  const button = $('btn-checkin-all');
  button.disabled = true;
  button.textContent = '签到中…';
  accounts.forEach(a => checkinMap.set(a.id, null));
  renderAccounts();
  try {
    const data = await checkinFor(null);
    const succeeded = data?.succeeded ?? 0;
    const total = data?.total ?? 0;
    toast(`签到完成：${succeeded}/${total} 个账号成功领取`, succeeded < total ? 'err' : 'ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    accounts.forEach(a => checkinMap.set(a.id, `签到失败：${message}`));
    renderAccounts();
    toast(`签到失败：${message}`, 'err');
  } finally {
    checkinBusy = false;
    button.disabled = false;
    button.textContent = '一键全部签到';
  }
}

// ─── 账号操作 ─────────────────────────────────

async function runAccountAction(action, id) {
  if (busy) return;
  busy = true;
  try {
    if (action === 'switch') {
      await api.switchAccount(id);
      await refresh();
      toast('✅ 已切换当前账号');
    } else if (action === 'refresh') {
      await api.refreshAccountToken(id);
      await refresh();
      toast('✅ Token 已刷新');
    } else if (action === 'disable' || action === 'enable') {
      const enabled = action === 'enable';
      const account = state?.accounts?.accounts?.find(a => a.id === id);
      if (!enabled && !confirm(`确定禁用账号「${account?.nickname || account?.name || id}」？禁用后不参与转发/轮询/刷新，可随时启用。`)) return;
      await api.setAccountEnabled(id, enabled);
      await refresh();
      toast(enabled ? '✅ 账号已启用' : '账号已禁用');
    } else if (action === 'remove') {
      const account = state?.accounts?.accounts?.find(a => a.id === id);
      if (!confirm(`确定删除账号「${account?.nickname || account?.name || id}」？`)) return;
      await api.removeAccount(id);
      await refresh();
      toast('账号已删除');
    } else if (action === 'usage') {
      usageMap.set(id, null);
      renderAccounts();
      try {
        await queryUsageFor(id);
        const entry = usageMap.get(id);
        if (typeof entry === 'string') toast(`积分查询失败：${entry}`, 'err');
        else toast('✅ 已更新积分');
      } catch (error) {
        usageMap.set(id, error instanceof Error ? error.message : String(error));
        renderAccounts();
        toast(`积分查询失败：${error.message}`, 'err');
      }
    } else if (action === 'checkin') {
      checkinMap.set(id, null);
      renderAccounts();
      try {
        await checkinFor(id);
        const entry = checkinMap.get(id);
        if (typeof entry === 'string') toast(`签到失败：${entry}`, 'err');
        else if (entry?.success) toast('✅ 该账号签到成功');
        else if (entry?.msg) toast(entry.msg, 'err');
      } catch (error) {
        checkinMap.set(id, error instanceof Error ? error.message : String(error));
        renderAccounts();
        toast(`签到失败：${error.message}`, 'err');
      }
    }
  } catch (error) {
    toast(`操作失败：${error.message}`, 'err');
  } finally {
    busy = false;
  }
}

// ─── 添加账号弹窗 ─────────────────────────────

function openModal() {
  $('add-modal').classList.add('open');
  syncLoginModeHint();
  // 以主进程真实状态复位按钮：上次若在等待中被关窗，这里会重新可用
  api.getLoginState()
    .then(state => applyLoginState(state?.active))
    .catch(() => applyLoginState(false));
}

function closeModal() {
  $('add-modal').classList.remove('open');
  $('auth-json-input').value = '';
  $('upload-button').disabled = true;
  $('account-name').value = '';
  // 关窗即放弃等待：通知主进程中止后端轮询，否则按钮会一直卡在禁用态
  if (loginActive) {
    api.cancelLogin()
      .then(() => toast('已取消登录等待'))
      .catch(() => {})
      .finally(() => applyLoginState(false));
  }
}

/** 弹窗里选的账号版本（cn=国内版 / intl=国际版） */
function selectedEdition() {
  const checked = document.querySelector('input[name="account-edition"]:checked');
  return checked?.value === 'intl' ? 'intl' : 'cn';
}

/** 弹窗里选的登录方式（embedded=内嵌窗口 / external=系统默认浏览器） */
function selectedLoginMode() {
  if (api.isWeb) return 'external';
  const checked = document.querySelector('input[name="login-mode"]:checked');
  return checked?.value === 'external' ? 'external' : 'embedded';
}

function setLoginMode(mode) {
  const input = document.querySelector(`input[name="login-mode"][value="${mode}"]`);
  if (input) input.checked = true;
  syncLoginModeHint();
}

/**
 * 登录状态（由主进程推送）：等待中时按钮显示「取消等待」。
 * 关键点：状态来自主进程而非本地变量，弹窗反复开关也不会把按钮卡在禁用态。
 */
let loginActive = false;

function applyLoginState(active) {
  loginActive = Boolean(active);
  const button = $('web-login-button');
  const cancel = $('web-login-cancel');
  if (!button) return;
  if (loginActive) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>等待登录完成…';
    if (cancel) cancel.style.display = '';
  } else {
    button.disabled = false;
    if (cancel) cancel.style.display = 'none';
    syncLoginModeHint();
  }
}

/** 登录按钮与提示随登录方式变化（等待中不改文案，交给 applyLoginState） */
function syncLoginModeHint() {
  if (loginActive) return;
  if (api.isWeb) {
    $('web-login-button').textContent = '在新标签页登录';
    $('web-login-hint').textContent = '完成官方登录后自动同步账号；关闭此面板会取消等待';
    return;
  }
  const external = selectedLoginMode() === 'external';
  $('web-login-button').textContent = external ? '在浏览器中打开登录页' : '打开网页登录';
  $('web-login-hint').textContent = external
    ? '将用系统默认浏览器打开，登录完成后自动加入账号列表；关掉此窗口即取消等待'
    : '将打开内嵌窗口，登录完成后自动加入账号列表；关掉此窗口即取消等待';
}

async function startWebLogin() {
  if (busy || loginActive) return;
  busy = true;
  const edition = selectedEdition();
  const mode = selectedLoginMode();
  const editionLabel = edition === 'intl' ? '国际版' : '国内版';
  const button = $('web-login-button');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>等待网页登录…';
  try {
    const result = await api.startLogin(edition, mode);
    if (result?.canceled) {
      toast('已取消登录等待');
      return;
    }
    closeModal();
    await refresh();
    toast(`✅ 登录成功，${editionLabel}账号已加入列表`);
  } catch (error) {
    toast(`登录失败：${error.message}`, 'err');
  } finally {
    busy = false;
    // 以主进程状态为准复位按钮，避免这里与真实状态不一致
    const state = await api.getLoginState().catch(() => null);
    applyLoginState(state?.active);
  }
}

/** 取消等待中的登录（主进程会通知后端中止轮询） */
async function cancelWebLogin() {
  try {
    await api.cancelLogin();
    toast('已取消登录等待');
  } catch (error) {
    toast(`取消失败：${error.message}`, 'err');
  }
  applyLoginState(false);
}

async function uploadAccount() {
  const text = $('auth-json-input').value.trim();
  if (!text || busy) return;
  busy = true;
  const edition = selectedEdition();
  const button = $('upload-button');
  button.disabled = true;
  try {
    JSON.parse(text); // 先做本地格式校验，再交给后端
    await api.uploadAccount($('account-name').value.trim(), text, edition);
    closeModal();
    await refresh();
    toast(`账号已导入（${edition === 'intl' ? '国际版' : '国内版'}）`);
  } catch (error) {
    toast(`导入失败：${error.message}`, 'err');
  } finally {
    busy = false;
    button.disabled = !$('auth-json-input').value.trim();
  }
}

// ─── 事件绑定 ─────────────────────────────────

document.querySelectorAll('#theme-switch button').forEach(button => {
  button.addEventListener('click', () => applyTheme(button.dataset.mode));
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('workbuddy-desktop-theme') || 'light') === 'system') applyTheme('system');
});
applyTheme(localStorage.getItem('workbuddy-desktop-theme') || 'light');

$('btn-refresh-state').addEventListener('click', () => refresh().then(() => toast('状态已刷新')));
$('btn-refresh-token').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  try {
    await api.refreshSession();
    await refresh();
    toast('✅ Token 已刷新');
  } catch (error) {
    toast(`刷新失败：${error.message}`, 'err');
  } finally {
    busy = false;
  }
});
$('btn-logout').addEventListener('click', async () => {
  if (!confirm('确定退出当前账号？退出后会清掉当前选择，可重新登录。')) return;
  if (busy) return;
  busy = true;
  try {
    await api.logout();
    await refresh();
    toast('已退出登录');
  } catch (error) {
    toast(`退出失败：${error.message}`, 'err');
  } finally {
    busy = false;
  }
});
$('btn-add-account').addEventListener('click', openModal);
$('btn-add-account-2').addEventListener('click', openModal);
$('btn-query-usage').addEventListener('click', queryAllUsage);
$('btn-checkin-all').addEventListener('click', checkinAll);

$('btn-save-key').addEventListener('click', async () => {
  const value = $('api-key-input').value.trim();
  if (!value) { toast('请输入新密钥；要关闭鉴权请使用清除按钮', 'err'); return; }
  if (busy) return;
  busy = true;
  try {
    await api.saveConfig({ apiKey: value || null });
    $('api-key-input').value = '';
    await loadConfig();
    toast(value ? '✅ API Key 已保存' : 'API Key 已清除');
  } catch (error) {
    toast(`保存失败：${error.message}`, 'err');
  } finally {
    busy = false;
  }
});
$('btn-clear-key').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  try {
    await api.saveConfig({ apiKey: null });
    $('api-key-input').value = '';
    await loadConfig();
    toast('API Key 已清除');
  } catch (error) {
    toast(`清除失败：${error.message}`, 'err');
  } finally {
    busy = false;
  }
});

$('translate-thinking-enabled').addEventListener('change', async event => {
  const enabled = event.target.checked;
  try {
    await api.saveConfig({ translateThinking: enabled });
    await loadConfig();
    toast(enabled ? '✅ 已开启思考块透传' : '已关闭思考块透传');
  } catch (error) {
    toast(`保存失败：${error.message}`, 'err');
    // 失败回滚真实状态
    const cfg = state?.config;
    if (cfg) event.target.checked = cfg.translateThinking === true;
  }
});

$('close-modal').addEventListener('click', closeModal);
$('add-modal').addEventListener('click', event => { if (event.target === $('add-modal')) closeModal(); });
$('web-login-button').addEventListener('click', startWebLogin);
$('web-login-cancel').addEventListener('click', cancelWebLogin);
$('upload-button').addEventListener('click', uploadAccount);
// 登录方式切换：只影响按钮文案与提示
document.querySelectorAll('input[name="login-mode"]').forEach(input => {
  input.addEventListener('change', syncLoginModeHint);
});
// 版本切换：国际版默认用系统浏览器（可复用已有登录态），国内版默认回到内嵌窗口
document.querySelectorAll('input[name="account-edition"]').forEach(input => {
  input.addEventListener('change', () => setLoginMode(selectedEdition() === 'intl' ? 'external' : 'embedded'));
});
$('auth-json-input').addEventListener('input', () => {
  $('upload-button').disabled = !$('auth-json-input').value.trim();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

$('account-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button) runAccountAction(button.dataset.action, button.dataset.id);
});

// 账号页两级筛选：版本 + 状态（状态数量随版本联动）
$('account-edition-filter').addEventListener('click', event => {
  const item = event.target.closest('.seg-item[data-edition]');
  if (!item) return;
  accountFilter.edition = item.dataset.edition;
  document.querySelectorAll('#account-edition-filter .seg-item').forEach(node => {
    node.classList.toggle('active', node === item);
  });
  renderAccounts();
});
$('account-status-filter').addEventListener('click', event => {
  const item = event.target.closest('.seg-item[data-status]');
  if (!item) return;
  accountFilter.status = item.dataset.status;
  document.querySelectorAll('#account-status-filter .seg-item').forEach(node => {
    node.classList.toggle('active', node === item);
  });
  renderAccounts();
});

api.onStateChanged(next => {
  if (!next?.accounts && !next?.session && !next?.health) return;
  // 合并：旧 state + 新字段。脱敏状态由词表面板自持，这里直接丢掉，避免
  // /api/session 的精简摘要（无 terms）覆盖掉完整词表。
  const { desensitize: _ignored, ...rest } = next;
  state = { ...(state || {}), ...rest };
  render();
  // 状态变更后顺带刷新一次词表，命中统计跟着更新
  void loadDesensitize();
});

// 登录进行状态由主进程推送：等待结束（成功/失败/取消）后按钮自动复位
api.onLoginState?.(payload => {
  applyLoginState(payload?.active);
  const link = $('web-login-link');
  if (link) {
    link.hidden = !payload?.authUrl;
    if (payload?.authUrl) link.href = payload.authUrl;
    else link.removeAttribute('href');
  }
});

// ─── 共享给子模块（词表面板 / 日志面板）─────────
window.wbApp = {
  esc,
  toast,
  showPage,
  get currentPage() { return currentPage; },
  updateLogsBadge,
};

// ─── 启动自动维护：主进程会拉一次临期 token 刷新 + 余额查询 ───
api.onAutoMaintained?.(({ refreshed, balances }) => {
  const count = Array.isArray(refreshed) ? refreshed.length : 0;
  const rows = Array.isArray(balances?.results) ? balances.results : [];
  for (const row of rows) {
    if (!row?.id) continue;
    usageMap.set(row.id, row.usage ? row.usage : (row.error ? String(row.error) : '余额响应为空'));
  }
  if (count || rows.length) renderAccounts();
  if (count) toast(`已自动刷新 ${count} 个临期账号的 Token，并更新积分余额`);
});

// ─── 初始化 ───────────────────────────────────

// 导航：点击切换页面，记住上次所在页
$('nav').addEventListener('click', event => {
  const item = event.target.closest('.nav-item[data-page]');
  if (item) showPage(item.dataset.page);
});
showPage(localStorage.getItem(PAGE_KEY) || 'overview', { persist: false });

refresh();

// 定时轮询：限额标记（429 + 恢复时间）与账号状态变化自动刷新；窗口隐藏时暂停
setInterval(() => { if (!document.hidden) refresh(); }, 20_000);