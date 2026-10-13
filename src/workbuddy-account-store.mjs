/**
 * WorkBuddy 多账号存储层。
 *
 * 持久化文件 <项目根>/data/accounts.json：
 *   { currentAccountId, accounts: [{ id, name, uid, nickname, type,
 *     enterpriseId, accessToken, refreshToken, expiresAt, refreshExpiresAt,
 *     domain, tokenTail, prefixPath, endpoint, platform, edition, addedAt, updatedAt,
 *     rateLimits: { [modelId]: { status, code, resetAt, message, at } } }] }
 *
 * edition 标识账号所属版本：cn=国内版（copilot.tencent.com）、intl=国际版（www.workbuddy.ai）。
 * 端点/prefixPath/platform 在入账时按 edition 落定，token 刷新与转发都按账号记录走。
 *
 * rateLimits 记录账号×模型的限额状态（上游 429/code 6004，msg 里带 UTC+8 重置时间），
 * 供转发层自动切换账号、桌面端展示状态码与恢复时间。
 *
 * 账号来源：
 *   1. 无头登录（loginInteractive 完成 → addAccount）
 *   2. 手动上传凭证（POST /api/accounts，accessToken/refreshToken JSON）
 *   3. 旧版单账号 auth.json 迁移（importLegacySession，仅首次启动导入）
 *
 * 新增账号只在「原本没有可用当前账号」时才自动设为当前，避免添加账号打断在用账号。
 *
 * 所有读取实时走磁盘，手动编辑或外部修改下次请求即生效。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_EDITION, resolveEdition } from './workbuddy-endpoints.mjs';
import { resolveDataDir } from './workbuddy-paths.mjs';

const MAX_ACCOUNTS = 20;
const MAX_TOKEN_LENGTH = 8192;

export class AccountStoreError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AccountStoreError';
    this.statusCode = statusCode;
  }
}

function pickToken(payload, ...keys) {
  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      return payload[key].trim().replace(/^Bearer\s+/i, '');
    }
  }
  return '';
}

export function createAccountStore({
  directory = resolveDataDir(),
  log = () => {},
} = {}) {
  const filePath = join(directory, 'accounts.json');

  function load() {
    try {
      const json = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('bad root');
      return {
        currentAccountId: typeof json.currentAccountId === 'string' ? json.currentAccountId : null,
        accounts: Array.isArray(json.accounts)
          ? json.accounts.filter(item => item && typeof item === 'object' && typeof item.id === 'string')
          : [],
      };
    } catch {
      return { currentAccountId: null, accounts: [] };
    }
  }

  function save(state) {
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      throw new AccountStoreError(`账号文件保存失败: ${error.message}`, 500);
    }
  }

  function toPublicAccount(record) {
    const edition = resolveEdition(record.edition);
    return {
      id: record.id,
      name: record.name,
      uid: record.uid || '',
      nickname: record.nickname || '',
      type: record.type || 'personal',
      enterpriseId: record.enterpriseId || '',
      enterpriseName: record.enterpriseName || '',
      tokenTail: record.tokenTail || '',
      expiresAt: record.expiresAt || null,
      hasRefreshToken: Boolean(record.refreshToken),
      prefixPath: record.prefixPath ?? edition.prefixPath,
      endpoint: record.endpoint || edition.endpoint,
      edition: edition.id,
      editionLabel: edition.label,
      addedAt: record.addedAt || 0,
      updatedAt: record.updatedAt || 0,
      rateLimits: record.rateLimits || {},
      disabled: Boolean(record.disabled),
      available: !record.disabled,
    };
  }

  /**
   * 添加/更新账号。接受 session 形态（auth + account）或裸凭证形态
   * （accessToken/refreshToken，可含 uid/nickname/expiresAt/domain）。
   * edition 决定端点/prefixPath/platform 默认值（cn 国内版 / intl 国际版），
   * 显式传入的 endpoint/prefixPath/platform 优先。
   * 仅当列表原本为空时才把新账号设为当前，其余情况保留原当前账号不变，
   * 避免每添加一个账号就打断正在使用的账号。返回公开形态。
   */
  function addAccount(payload, name) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AccountStoreError('账号内容必须是 JSON 对象');
    }
    const auth = payload.auth && typeof payload.auth === 'object' ? payload.auth : payload;
    const account = payload.account && typeof payload.account === 'object' ? payload.account : {};
    const accessToken = pickToken(auth, 'accessToken', 'token', 'access_token');
    const refreshToken = pickToken(auth, 'refreshToken', 'refresh_token');
    if (!accessToken) throw new AccountStoreError('缺少 accessToken');
    if (accessToken.length > MAX_TOKEN_LENGTH || refreshToken.length > MAX_TOKEN_LENGTH) {
      throw new AccountStoreError('token 过长');
    }
    const uid = String(account.uid || payload.uid || '').trim();
    if (!uid) throw new AccountStoreError('缺少 uid（无法标识账号）');

    const state = load();
    const id = `user-${uid}`;
    const existing = state.accounts.find(item => item.id === id);
    const others = state.accounts.filter(item => item.id !== id);
    if (!existing && others.length >= MAX_ACCOUNTS) {
      throw new AccountStoreError(`最多保存 ${MAX_ACCOUNTS} 个账号`);
    }
    const edition = resolveEdition(payload.edition ?? existing?.edition ?? DEFAULT_EDITION);
    const record = {
      id,
      name: (typeof name === 'string' && name.trim() ? name.trim() : '').slice(0, 100)
        || account.nickname || payload.nickname || existing?.name
        || `账号 ${uid.slice(0, 8)}`,
      uid,
      nickname: account.nickname || payload.nickname || existing?.nickname || '',
      type: account.type || payload.type || existing?.type || 'personal',
      enterpriseId: account.enterpriseId || payload.enterpriseId || existing?.enterpriseId || '',
      enterpriseName: account.enterpriseName || payload.enterpriseName || existing?.enterpriseName || '',
      accessToken,
      refreshToken: refreshToken || existing?.refreshToken || '',
      tokenTail: accessToken.slice(-4),
      expiresAt: Number(auth.expiresAt ?? payload.expiresAt) || existing?.expiresAt || null,
      refreshExpiresAt: Number(auth.refreshExpiresAt ?? payload.refreshExpiresAt) || existing?.refreshExpiresAt || null,
      domain: auth.domain || existing?.domain || '',
      edition: edition.id,
      prefixPath: payload.prefixPath ?? existing?.prefixPath ?? edition.prefixPath,
      endpoint: payload.endpoint ?? existing?.endpoint ?? edition.endpoint,
      platform: payload.platform ?? existing?.platform ?? edition.platform,
      addedAt: existing?.addedAt || Date.now(),
      updatedAt: Date.now(),
    };
    state.accounts = [...others, record];
    // 仅在没有有效当前账号时（首次添加 / 当前账号已失效）才自动选中，
    // 后续添加账号不改变当前选择，避免打断正在使用的账号。
    const keepCurrent = state.accounts.some(item => item.id === state.currentAccountId);
    if (!keepCurrent) state.currentAccountId = id;
    save(state);
    log('[Accounts]', `✅ 账号已保存${keepCurrent ? '' : '并设为当前'}: ${record.name}（${uid.slice(0, 8)}…，${edition.label}）`);
    return toPublicAccount(record);
  }

  function removeAccount(id) {
    const state = load();
    const before = state.accounts.length;
    state.accounts = state.accounts.filter(item => item.id !== id);
    if (state.accounts.length === before) throw new AccountStoreError('账号不存在', 404);
    if (state.currentAccountId === id) state.currentAccountId = state.accounts[0]?.id || null;
    save(state);
  }

  function setCurrent(id) {
    const state = load();
    const target = state.accounts.find(item => item.id === id);
    if (!target) throw new AccountStoreError('账号不存在', 404);
    if (target.disabled) throw new AccountStoreError('账号已禁用，无法设为当前账号', 409);
    state.currentAccountId = id;
    save(state);
    return id;
  }

  /**
   * 启用/禁用账号。禁用 = 不参与任何转发/轮询/刷新（等价删除但不物理移除），
   * 数据保留，可随时恢复。禁用的是当前账号时，自动切换到第一个未禁用账号。
   */
  function setEnabled(id, enabled) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record) throw new AccountStoreError('账号不存在', 404);
    record.disabled = enabled === false;
    record.updatedAt = Date.now();
    // 禁用当前账号 → 切换到一个未禁用的账号
    if (record.disabled && state.currentAccountId === id) {
      const next = state.accounts.find(item => item.id !== id && !item.disabled);
      state.currentAccountId = next?.id || null;
    }
    // 已启用且之前是空的（全禁用后恢复）→ 若没有当前账号则选中它
    if (!record.disabled && !state.currentAccountId) state.currentAccountId = id;
    save(state);
    return toPublicAccount(record);
  }

  /** 第一个未禁用的账号 id；没有则 null。 */
  function firstEnabledId(state) {
    return state.accounts.find(item => !item.disabled)?.id || null;
  }

  function listAccounts() {
    const state = load();
    return {
      currentAccountId: state.currentAccountId,
      accounts: state.accounts.map(toPublicAccount),
    };
  }

  /**
   * 账号记录 → auth 模块会话形态（端点/prefixPath/platform 按账号的 edition 兜底）。
   */
  function sessionFromRecord(record) {
    const edition = resolveEdition(record.edition);
    return {
      endpoint: record.endpoint || edition.endpoint,
      prefixPath: record.prefixPath ?? edition.prefixPath,
      platform: record.platform || edition.platform,
      edition: edition.id,
      auth: {
        accessToken: record.accessToken,
        refreshToken: record.refreshToken || '',
        tokenType: 'Bearer',
        expiresAt: record.expiresAt || 0,
        refreshExpiresAt: record.refreshExpiresAt || 0,
        domain: record.domain || '',
      },
      account: {
        uid: record.uid,
        nickname: record.nickname,
        type: record.type,
        enterpriseId: record.enterpriseId,
        enterpriseName: record.enterpriseName,
      },
    };
  }

  /**
   * 当前账号的凭证（供请求实时取用）；没有任何账号时返回 null。
   * 返回 { id, session } —— session 为 auth 模块的会话形态。
   */
  function getCurrentEntry() {
    const state = load();
    // 当前账号被禁用/失效时，回退到第一个未禁用且有 token 的账号
    const record = state.accounts.find(item => item.id === state.currentAccountId && !item.disabled)
      || state.accounts.find(item => !item.disabled);
    if (!record?.accessToken) return null;
    return { id: record.id, session: sessionFromRecord(record) };
  }

  function getCredentialsById(id) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record?.accessToken || record.disabled) return null;
    const edition = resolveEdition(record.edition);
    return {
      id: record.id,
      name: record.name,
      uid: record.uid,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken || '',
      expiresAt: record.expiresAt || null,
      endpoint: record.endpoint || edition.endpoint,
      prefixPath: record.prefixPath ?? edition.prefixPath,
      platform: record.platform || edition.platform,
      edition: edition.id,
    };
  }

  /**
   * 指定账号的完整会话形态（供计费接口等需要 enterpriseId / domain / prefixPath
   * 的调用方使用）。账号不存在时返回 null。
   */
  function getSessionById(id) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record?.accessToken || record.disabled) return null;
    return { id: record.id, session: sessionFromRecord(record) };
  }

  /** 账号刷新成功后回写新 token。 */
  function updateAccountTokens(id, { accessToken, refreshToken, expiresAt, refreshExpiresAt }) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record) return false;
    if (accessToken) {
      record.accessToken = accessToken;
      record.tokenTail = accessToken.slice(-4);
    }
    if (refreshToken) record.refreshToken = refreshToken;
    if (Number(expiresAt) > 0) record.expiresAt = Number(expiresAt);
    if (Number(refreshExpiresAt) > 0) record.refreshExpiresAt = Number(refreshExpiresAt);
    record.updatedAt = Date.now();
    save(state);
    return true;
  }

  /**
   * 旧版单账号 auth.json 迁移：仅当 accounts.json 尚无任何账号时导入。
   */
  function importLegacySession(legacy) {
    if (!legacy?.auth?.accessToken) return null;
    const state = load();
    if (state.accounts.length) return null;
    const uid = legacy.account?.uid || '';
    if (!uid) {
      log('[Accounts]', '旧登录态缺少 uid，跳过迁移');
      return null;
    }
    return addAccount({
      auth: legacy.auth,
      account: legacy.account,
      prefixPath: legacy.prefixPath,
      endpoint: legacy.endpoint,
      platform: legacy.platform,
      edition: legacy.edition,
    }, legacy.account?.nickname);
  }

  /**
   * 记录账号对某模型的限额状态（上游 429 / code 6004）。
   * resetAt 为恢复时间戳（msg 里 "将在 YYYY-MM-DD HH:mm:ss UTC+8 重置" 解析而来），
   * 缺失时给 10 分钟兜底冷却，避免短时间内反复撞限额。
   */
  function markRateLimited(id, model, { status = 429, code, resetAt, message } = {}) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record) return null;
    const now = Date.now();
    const entry = {
      status: Number(status) || 429,
      code: code ?? null,
      resetAt: Number(resetAt) > now ? Number(resetAt) : now + 10 * 60 * 1000,
      message: String(message || '').slice(0, 300),
      at: now,
    };
    record.rateLimits = { ...(record.rateLimits || {}), [String(model || '')]: entry };
    record.updatedAt = now;
    save(state);
    return entry;
  }

  /** 清除账号对某模型的限额记录（该模型请求成功时调用） */
  function clearRateLimit(id, model) {
    const state = load();
    const record = state.accounts.find(item => item.id === id);
    if (!record?.rateLimits) return false;
    const key = String(model || '');
    if (!(key in record.rateLimits)) return false;
    delete record.rateLimits[key];
    if (!Object.keys(record.rateLimits).length) delete record.rateLimits;
    record.updatedAt = Date.now();
    save(state);
    return true;
  }

  return {
    get file() { return filePath; },
    addAccount,
    removeAccount,
    setCurrent,
    setEnabled,
    listAccounts,
    getCurrentEntry,
    getCredentialsById,
    getSessionById,
    updateAccountTokens,
    markRateLimited,
    clearRateLimit,
    importLegacySession,
    existsSync: () => existsSync(filePath),
  };
}
