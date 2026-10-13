/**
 * WorkBuddy 多账号管理路由（REST 风格 /api/accounts）
 *
 *   GET    /api/accounts                账号列表（含当前账号标记）
 *   POST   /api/accounts                手动添加账号（accessToken/refreshToken JSON）
 *   POST   /api/accounts/current        切换当前账号 { id }
 *   POST   /api/accounts/refresh        刷新指定（或当前）账号的 token { id? }
 *   GET    /api/accounts/usage          批量查询各账号积分/额度
 *   POST   /api/accounts/checkin        批量/单个签到 { id? }
 *   POST   /api/accounts/enabled        启用/禁用账号 { id, enabled }
 *   DELETE /api/accounts/<id>           删除账号
 *
 * tryHandle 返回 true 表示请求已被处理，否则交给后续路由。
 */

import { AccountStoreError } from './workbuddy-account-store.mjs';
import { WorkBuddyAuthError } from './workbuddy-auth.mjs';

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export function setupAccountRoutes({
  store,
  auth,
  billing,
  log = () => {},
  verbose = () => {},
  checkApiKey = () => true,
  unauthorized = (_res) => {},
  readRawBody,
}) {
  async function refreshById(id) {
    const creds = store.getCredentialsById(id);
    if (!creds) throw new AccountStoreError('账号不存在', 404);
    if (!creds.refreshToken) {
      throw new AccountStoreError(`账号 ${creds.name} 没有 refreshToken，无法刷新`);
    }
    // 按账号自己的端点续期（国内版 / 国际版不同站点）
    const nextAuth = await auth.refreshSession({
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
    }, auth.makeContext({
      endpoint: creds.endpoint,
      prefixPath: creds.prefixPath,
      platform: creds.platform,
      edition: creds.edition,
    }));
    if (!nextAuth?.accessToken) throw new WorkBuddyAuthError('token 刷新响应缺少 accessToken');
    store.updateAccountTokens(id, {
      accessToken: nextAuth.accessToken,
      refreshToken: nextAuth.refreshToken,
      expiresAt: nextAuth.expiresAt,
      refreshExpiresAt: nextAuth.refreshExpiresAt,
    });
    log('[Accounts]', `✅ 账号 token 已刷新: ${creds.name}（${creds.uid.slice(0, 8)}…）`);
  }

  function errorStatus(error) {
    if (error instanceof AccountStoreError) return error.statusCode || 400;
    if (error instanceof WorkBuddyAuthError) {
      return Number.isInteger(error.statusCode) ? error.statusCode : 502;
    }
    return 500;
  }

  /** 目标账号集合：给 id 就只取该账号，否则取全部可用账号 */
  function resolveTargets(id) {
    const snapshot = store.listAccounts();
    if (typeof id === 'string' && id) {
      const found = snapshot.accounts.filter(account => account.id === id);
      if (!found.length) throw new AccountStoreError('账号不存在', 404);
      return found;
    }
    return snapshot.accounts.filter(account => account.available !== false);
  }

  /** 国际版没有签到活动，签到相关操作一律排除该版本账号 */
  function supportsCheckin(account) {
    return account.edition !== 'intl';
  }

  /**
   * 签到目标集合：批量时只取国内版账号（国际版无此功能，直接跳过而不是报错）；
   * 指定单个账号时若为国际版则明确报错，避免用户误以为签到失败是网络问题。
   */
  function resolveCheckinTargets(id) {
    const targets = resolveTargets(id);
    if (typeof id === 'string' && id) {
      if (!supportsCheckin(targets[0])) {
        throw new AccountStoreError('国际版账号暂不支持签到', 400);
      }
      return { targets, skipped: 0 };
    }
    const eligible = targets.filter(supportsCheckin);
    return { targets: eligible, skipped: targets.length - eligible.length };
  }

  /**
   * 单个账号的积分查询。token 失效时刷新后重试一次；
   * 任何失败都收敛为 { error } 而不是抛出，保证批量查询不被单个账号拖垮。
   */
  async function queryUsageFor(account) {
    try {
      let entry = store.getSessionById(account.id);
      if (!entry) return { id: account.id, usage: null, error: '没有可用凭证' };
      try {
        const usage = await billing.queryCreditsSummary({ session: entry.session });
        return { id: account.id, name: account.name, usage, error: null };
      } catch (error) {
        // 401 说明 token 被服务端拒绝而非临期：刷新后重试一次
        if (error?.statusCode !== 401) throw error;
        const creds = store.getCredentialsById(account.id);
        if (!creds?.refreshToken) throw error;
        await refreshById(account.id);
        entry = store.getSessionById(account.id);
        if (!entry) throw error;
        const usage = await billing.queryCreditsSummary({ session: entry.session });
        return { id: account.id, name: account.name, usage, error: null };
      }
    } catch (error) {
      verbose('[Accounts]', `账号 ${account.id} 积分查询失败: ${error.message}`);
      return {
        id: account.id,
        name: account.name,
        usage: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 单个账号签到。已签到（非 0 code）不算错误，原样返回结果 */
  async function checkinFor(account) {
    try {
      const entry = store.getSessionById(account.id);
      if (!entry) return { id: account.id, name: account.name, claim: null, error: '没有可用凭证' };
      const claim = await billing.claimDailyCheckin({ session: entry.session });
      log('[Accounts]',
        `账号 ${account.name}: 签到${claim.success ? '成功' : `未领取（${claim.msg}）`}`);
      return { id: account.id, name: account.name, claim, error: null };
    } catch (error) {
      verbose('[Accounts]', `账号 ${account.id} 签到失败: ${error.message}`);
      return {
        id: account.id,
        name: account.name,
        claim: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function tryHandle(req, res, path) {
    if (path !== '/api/accounts' && !path.startsWith('/api/accounts/')) return false;
    if (!checkApiKey(req)) { unauthorized(res); return true; }

    try {
      // 账号列表
      if (req.method === 'GET' && path === '/api/accounts') {
        sendJson(res, 200, { success: true, data: store.listAccounts() });
        return true;
      }

      // 批量查询各账号积分（并发，单账号失败不影响其他）
      if (req.method === 'GET' && path === '/api/accounts/usage') {
        if (!billing) throw new AccountStoreError('积分模块未启用', 503);
        const targets = resolveTargets(null);
        const results = await Promise.all(targets.map(queryUsageFor));
        sendJson(res, 200, { success: true, data: { results } });
        return true;
      }

      // 手动添加账号
      if (req.method === 'POST' && path === '/api/accounts') {
        const raw = (await readRawBody(req)).toString('utf8') || '{}';
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new AccountStoreError('上传内容不是有效 JSON');
        }
        const account = store.addAccount(payload);
        sendJson(res, 200, { success: true, data: { account, list: store.listAccounts() } });
        return true;
      }

      // 切换当前账号
      if (req.method === 'POST' && path === '/api/accounts/current') {
        const raw = (await readRawBody(req)).toString('utf8') || '{}';
        const { id } = JSON.parse(raw || '{}');
        if (typeof id !== 'string' || !id) throw new AccountStoreError('缺少账号 id');
        store.setCurrent(id);
        sendJson(res, 200, { success: true, data: { currentAccountId: id, list: store.listAccounts() } });
        return true;
      }

      // 刷新指定（缺省当前）账号 token
      if (req.method === 'POST' && path === '/api/accounts/refresh') {
        const raw = (await readRawBody(req)).toString('utf8') || '{}';
        const parsed = JSON.parse(raw || '{}');
        let id = typeof parsed?.id === 'string' ? parsed.id : null;
        if (!id) {
          const entry = store.getCurrentEntry();
          if (!entry) throw new AccountStoreError('当前没有可用账号');
          id = entry.id;
        }
        verbose('[Accounts]', `刷新账号 token: ${id}`);
        await refreshById(id);
        sendJson(res, 200, { success: true, data: { refreshedId: id, list: store.listAccounts() } });
        return true;
      }

      // 批量/单个签到（国际版账号无签到活动，不参与）
      if (req.method === 'POST' && path === '/api/accounts/checkin') {
        if (!billing) throw new AccountStoreError('积分模块未启用', 503);
        const raw = (await readRawBody(req)).toString('utf8') || '{}';
        const parsed = JSON.parse(raw || '{}');
        const id = typeof parsed?.id === 'string' ? parsed.id : null;
        const { targets, skipped } = resolveCheckinTargets(id);
        // 串行签到：避免多账号同时打上游触发 11128 风控
        const results = [];
        for (const account of targets) results.push(await checkinFor(account));
        const succeeded = results.filter(r => r.claim?.success).length;
        if (skipped) log('[Accounts]', `已跳过 ${skipped} 个国际版账号（该版本无签到活动）`);
        log('[Accounts]', `签到完成: ${succeeded}/${results.length} 个账号成功领取`);
        sendJson(res, 200, { success: true, data: { results, succeeded, total: results.length, skipped } });
        return true;
      }

      // 启用 / 禁用账号（禁用后不参与转发/轮询/签到/刷新，等价删除但可恢复）
      if (req.method === 'POST' && path === '/api/accounts/enabled') {
        const raw = (await readRawBody(req)).toString('utf8') || '{}';
        const parsed = JSON.parse(raw || '{}');
        if (typeof parsed?.id !== 'string' || !parsed.id) throw new AccountStoreError('缺少账号 id');
        const account = store.setEnabled(parsed.id, parsed.enabled !== false);
        log('[Accounts]', `账号 ${account.name} 已${account.disabled ? '禁用' : '启用'}`);
        sendJson(res, 200, { success: true, data: { account, list: store.listAccounts() } });
        return true;
      }

      // 删除账号
      if (req.method === 'DELETE' && path.startsWith('/api/accounts/')) {
        const id = decodeURIComponent(path.slice('/api/accounts/'.length));
        if (!id) throw new AccountStoreError('缺少账号 id');
        store.removeAccount(id);
        sendJson(res, 200, { success: true, data: { list: store.listAccounts() } });
        return true;
      }

      sendJson(res, 404, { success: false, error: `Not found: ${req.method} ${path}` });
      return true;
    } catch (error) {
      log('[Accounts]', `❌ ${error.message}`);
      sendJson(res, errorStatus(error), { success: false, error: error.message });
      return true;
    }
  }

  return { tryHandle };
}
