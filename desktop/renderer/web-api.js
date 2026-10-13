/* Browser-only transport for the existing management views. Credentials stay in this tab. */
(() => {
  if (window.workbuddyDesktop) {
    window.workbuddyAPI = window.workbuddyDesktop;
    return;
  }
  const $ = id => document.getElementById(id);
  const KEY_STORAGE = 'workbuddy-web-api-key';
  let key = '';
  try { key = sessionStorage.getItem(KEY_STORAGE) || ''; } catch { /* private browsing */ }
  let authPending = null;
  const stateListeners = new Set();
  const loginListeners = new Set();
  let activeLogin = null;

  function setKey(next) {
    key = next || '';
    try {
      if (key) sessionStorage.setItem(KEY_STORAGE, key);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch { /* the in-memory key still works */ }
  }

  function askForKey() {
    if (authPending) return authPending.promise;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    authPending = { promise, resolve, reject };
    $('web-auth-modal').classList.add('open');
    $('web-auth-error').textContent = '';
    $('web-auth-key').value = '';
    $('web-auth-key').focus();
    return promise;
  }

  async function fetchResponse(path, options = {}, retryAuth = true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response;
    try {
      response = await fetch(path, {
        ...options,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'X-API-Key': key } : {}),
          ...options.headers,
        },
        signal: controller.signal,
      });
      if (response.ok) return await response.text();
      const error = await response.json().catch(() => null);
      if (response.status === 401 && error?.error?.type === 'invalid_api_key' && retryAuth) {
        clearTimeout(timeout);
        setKey('');
        await askForKey();
        return fetchResponse(path, options, false);
      }
      throw new Error(error?.error?.message || (typeof error?.error === 'string' ? error.error : '') || `HTTP ${response.status}`);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('管理请求超时，请检查代理服务是否仍在运行');
      if (error instanceof TypeError) throw new Error('无法连接代理服务，请确认服务已启动，再刷新页面');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function request(path, method = 'GET', body) {
    const text = await fetchResponse(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const payload = text ? JSON.parse(text) : null;
    if (payload?.success === false) throw new Error(payload.error?.message || payload.error || '请求失败');
    return Object.prototype.hasOwnProperty.call(payload || {}, 'data') ? payload.data : payload;
  }

  async function publishState() {
    const next = await request('/api/session');
    for (const listener of stateListeners) listener(next);
    return next;
  }
  async function mutate(path, method = 'POST', body = {}) {
    await request(path, method, body);
    return publishState();
  }
  function notifyLogin() {
    const value = activeLogin
      ? { active: true, mode: 'external', edition: activeLogin.edition, authUrl: activeLogin.authUrl || null }
      : { active: false };
    for (const listener of loginListeners) listener(value);
  }

  function allowedLoginUrl(raw) {
    const url = new URL(raw);
    const allowed = ['tencent.com', 'workbuddy.cn', 'workbuddy.ai', 'codebuddy.cn', 'codebuddy.ai', 'qq.com', 'wechat.com'];
    if (url.protocol !== 'https:' || url.username || url.password
      || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error('登录服务返回了非官方 HTTPS 地址，已阻止打开');
    }
    return url.href;
  }

  async function cancelLogin() {
    const current = activeLogin;
    if (!current) return { canceled: false };
    current.canceled = true;
    // Do not discard a start request still in flight: its eventual state must be canceled too.
    if (current.state) await request('/api/session/login/cancel', 'POST', { state: current.state });
    if (activeLogin === current) activeLogin = null;
    notifyLogin();
    return { canceled: true };
  }

  async function startLogin(edition) {
    if (activeLogin) throw new Error('请先完成或取消当前登录');
    const current = { edition: edition === 'intl' ? 'intl' : 'cn', canceled: false, state: null, authUrl: null };
    activeLogin = current;
    // Open synchronously from the user's click, before awaiting the API, to avoid popup blockers.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    notifyLogin();
    let complete = false;
    try {
      const started = await request('/api/session/login/start', 'POST', { edition: current.edition });
      if (!started?.state || !started?.authUrl) throw new Error('登录服务未返回有效登录链接');
      current.state = started.state;
      if (current.canceled) {
        await request('/api/session/login/cancel', 'POST', { state: current.state });
        return { canceled: true };
      }
      current.authUrl = allowedLoginUrl(started.authUrl);
      notifyLogin();
      if (popup && !popup.closed) popup.location.replace(current.authUrl);
      // A manual link is also shown, so blocking a popup never prevents login.
      const deadline = Date.now() + 5 * 60_000;
      while (!current.canceled && Date.now() < deadline) {
        const progress = await request(`/api/session/login/wait?state=${encodeURIComponent(current.state)}`);
        if (current.canceled) return { canceled: true };
        if (progress?.error) throw new Error(progress.error);
        if (progress?.done) {
          complete = true;
          await publishState();
          return { ok: true };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (current.canceled) return { canceled: true };
      throw new Error('等待登录超过 5 分钟，请重新发起登录');
    } catch (error) {
      if (current.canceled) return { canceled: true };
      throw error;
    } finally {
      if (!complete && current.state) {
        await request('/api/session/login/cancel', 'POST', { state: current.state }).catch(() => {});
      }
      try { popup?.close(); } catch { /* isolated login tab */ }
      if (activeLogin === current) activeLogin = null;
      notifyLogin();
    }
  }

  window.workbuddyAPI = {
    isWeb: true,
    baseUrl: window.location.origin,
    getState: () => request('/api/session'),
    startLogin,
    getLoginState: async () => ({ active: Boolean(activeLogin), mode: 'external', authUrl: activeLogin?.authUrl }),
    cancelLogin,
    onLoginState: callback => { loginListeners.add(callback); return () => loginListeners.delete(callback); },
    onStateChanged: callback => { stateListeners.add(callback); return () => stateListeners.delete(callback); },
    refreshSession: () => mutate('/api/session/refresh'),
    logout: () => mutate('/api/session/logout'),
    getConfig: () => request('/api/config'),
    saveConfig: async payload => {
      const result = await request('/api/config', 'POST', payload);
      if (Object.prototype.hasOwnProperty.call(payload, 'apiKey')) setKey(payload.apiKey);
      return result;
    },
    switchAccount: id => mutate('/api/accounts/current', 'POST', { id }),
    setAccountEnabled: (id, enabled) => mutate('/api/accounts/enabled', 'POST', { id, enabled }),
    refreshAccountToken: id => mutate('/api/accounts/refresh', 'POST', id ? { id } : {}),
    removeAccount: id => mutate(`/api/accounts/${encodeURIComponent(id)}`, 'DELETE'),
    uploadAccount: (name, text, edition) => {
      if (typeof text !== 'string' || !text.trim() || text.length > 256 * 1024) throw new Error('账号内容为空或超过 256KB');
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('登录态必须是 JSON 对象');
      return mutate('/api/accounts', 'POST', { ...parsed, name: name.trim().slice(0, 100), edition: edition === 'intl' ? 'intl' : 'cn' });
    },
    getUsage: () => request('/api/usage'),
    getCheckinStatus: () => request('/api/checkin/status'),
    claimCheckin: () => request('/api/checkin', 'POST', {}),
    getAllBalances: () => request('/api/accounts/usage'),
    checkinAllAccounts: id => request('/api/accounts/checkin', 'POST', id ? { id } : {}),
    getDesensitize: () => request('/api/desensitize'),
    setDesensitizeEnabled: enabled => request('/api/desensitize/enabled', 'POST', { enabled }),
    setDesensitizeRoles: roles => request('/api/desensitize/roles', 'POST', { roles }),
    saveDesensitizeTerms: terms => request('/api/desensitize/terms', 'PUT', { terms }),
    addDesensitizeTerms: terms => request('/api/desensitize/terms', 'POST', { terms }),
    removeDesensitizeTerm: term => request('/api/desensitize/terms', 'DELETE', { terms: [term] }),
    resetDesensitizeTerms: () => request('/api/desensitize/reset', 'POST', {}),
    resetDesensitizeStats: () => request('/api/desensitize/stats/reset', 'POST', {}),
    getPipeline: () => request('/api/pipeline'),
    // 参数名用 enabled（true=启用），与面板的开关勾选状态一致；
    // 后端接口吃的是 disabled，这里翻转后送出，避免调用方记反语义。
    setPipelineStage: (stage, enabled) => request('/api/pipeline/disable', 'POST', { stage, disabled: enabled !== true }),
    resetPipelineStats: () => request('/api/pipeline/reset', 'POST', {}),
    getLogs: query => request(`/api/logs${query ? `?${query}` : ''}`),
    getLogStats: () => request('/api/logs/stats'),
    clearLogs: () => request('/api/logs', 'DELETE'),
    exportLogs: async () => {
      const text = await fetchResponse('/api/logs/download');
      const count = text.trim() ? text.trim().split('\n').length : 0;
      if (!count) return { count: 0 };
      const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson;charset=utf-8' }));
      const link = document.createElement('a');
      const file = `workbuddy-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
      link.href = url;
      link.download = file;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return { count, file };
    },
  };

  $('web-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('web-auth-connect');
    button.disabled = true;
    try {
      const candidate = $('web-auth-key').value.trim();
      if (!candidate) throw new Error('请输入当前网关 API Key');
      const response = await fetch('/api/config', { headers: { 'X-API-Key': candidate }, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'API Key 不正确，请重试' : `验证失败：HTTP ${response.status}`);
      setKey(candidate);
      $('web-auth-key').value = '';
      $('web-auth-modal').classList.remove('open');
      const pending = authPending;
      authPending = null;
      pending?.resolve();
    } catch (error) { $('web-auth-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('web-auth-cancel').addEventListener('click', () => {
    $('web-auth-modal').classList.remove('open');
    const pending = authPending;
    authPending = null;
    pending?.reject(new Error('未连接：需要网关 API Key'));
  });
  $('web-connect').addEventListener('click', () => { void askForKey().then(publishState).catch(() => {}); });
})();
