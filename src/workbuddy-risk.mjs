/**
 * 上游风控分类器
 *
 * 吸收自 workbuddy_to_api-main（Python 多账号网关）的 models.py:Risk。
 *
 * 本仓库上游客户端（workbuddy-upstream-client.mjs）已处理 11128 连坐熔断与
 * 429/code 6004 账号级限额轮换，但对以下错误类型缺少「统一分类 + 带 scope 的
 * 退避冷却 + 冷却期内拦截」机制：
 *
 *   - 401 登录态失效（该账号需重新登录）
 *   - 402 积分/额度耗尽（账号级，应冷却而非反复重放）
 *   - 设备验证 / 验证码 / 人机验证（风控，盲换号无意义）
 *   - 5xx 上游不可用（区域级，应短冷却避免雪崩）
 *   - IP 受限 / 企业额度 / 权限拒绝 等
 *
 * Risk 把每次上游错误分类为一个带 scope（global / region / account / operation）
 * 的限制条目，记录退避截止时间；冷却期内 check() 直接拦截同类请求，避免盲目
 * 换号或重放。退避随连续失败指数增长（封顶），成功或手动恢复后清除。
 *
 * 与 to_api 的差异：
 *   - 持久化复用本仓库 accountStore（data/accounts.json 同级 risk-state 文件由本模块自管）。
 *   - 错误载体用本仓库 WorkBuddyUpstreamError（含 statusCode / upstreamCode / message）。
 *   - 不实现 to_api 的登录/刷新/巡检流程，只做「错误分类与冷却调度」。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveDataDir } from './workbuddy-paths.mjs';

/**
 * 把上游错误码/状态/文案分类为具体限制类型。返回 null 表示不归类为限制。
 *
 * 与 CrossLink（HotRiceNoodles/CrossLink, docs/routing-and-failover.md）的错误分类对照：
 *   CrossLink 二分法 —— Persistent（quota/billing/无效 key：一次即开长冷却，重试无意义）vs
 *   Transient（rate limit/5xx/超时：累积到阈值才开短冷却）。
 *   本模块用 scope + 不同 delay 实现了等价语义：
 *     - quota_exhausted(402, 60s) / login_required(401, 30s) ≈ Persistent（长冷却，不盲重试）
 *     - rate_limited(429, 60s) / upstream_unavailable(5xx, 5s) ≈ Transient（短冷却，可被重试吸收）
 *   不重造 CrossLink 的 DB 规则表 / 熔断半开探活 —— 本仓库 upstream-client 已有 retryTransient
 *   重试，且 scope 退避冷却已覆盖同等语义；维持现有契约不动。
 */
function classify(status, code, message) {
  const codeStr = String(code ?? '');
  const text = `${codeStr} ${message || ''}`;
  const lower = text.toLowerCase();

  if (codeStr === '11128' && /unapproved channel/i.test(lower)) {
    return { kind: 'channel_not_allowed', scope: 'request', manual: false, delay: 0, status };
  }
  if (codeStr === '10081') {
    return { kind: 'ip_restricted', scope: 'global', status: 403 };
  }
  if (codeStr === 'E0010458' || codeStr === 'E0010459') {
    return { kind: 'enterprise_quota', scope: 'operation', status: 403 };
  }
  if (/captcha|turing|device.?token|device.?verification|risk.?control|验证码|人机验证|风控/.test(lower)) {
    return { kind: 'device_verification', scope: 'global', status: 403 };
  }
  if (status === 401 || codeStr === '401') {
    return { kind: 'login_required', scope: 'account', manual: false, delay: 30_000, status: 401 };
  }
  if (status === 429 || codeStr === '429' || /rate_limit|too_many_requests/.test(lower)) {
    return { kind: 'rate_limited', scope: 'region', manual: false, delay: 60_000, status: 429 };
  }
  if (status === 402 || /insufficient_quota|quota_exceeded|insufficient_credits/.test(lower)) {
    return { kind: 'quota_exhausted', scope: 'account', manual: false, delay: 60_000, status: 402 };
  }
  if (status === 403 || codeStr === '403') {
    return { kind: 'permission_denied', scope: 'account', status: 403 };
  }
  if (status >= 500) {
    return { kind: 'upstream_unavailable', scope: 'region', manual: false, delay: 5_000, status: 503 };
  }
  return null;
}

export class RiskStoreError extends Error {}

export function createRiskController({
  dataDir = resolveDataDir(),
  log = () => {},
  verbose = () => {},
} = {}) {
  const filePath = join(dataDir, 'risk-state.json');
  let entries = [];

  function load() {
    try {
      const json = JSON.parse(readFileSync(filePath, 'utf8'));
      if (Array.isArray(json?.entries)) entries = json.entries.filter(e => e && typeof e === 'object');
    } catch {
      entries = [];
    }
  }

  function save() {
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(filePath, JSON.stringify({ version: 1, entries }, null, 2), 'utf8');
    } catch (error) {
      verbose('[Risk]', `风控状态持久化失败: ${error.message}`);
    }
  }

  load();

  function now() {
    return Date.now();
  }

  function active(e) {
    return !e.resolved_at && (e.manual || (e.retry_at || 0) > now());
  }

  /** 判断限制 e 是否作用于 (region, account, path) 这一请求。 */
  function matches(e, region, accountId, path) {
    if (e.scope === 'request') return false;
    if (e.kind === 'quota_exhausted' && path && !/\/chat\//.test(path) && !/\/daily-checkin$/.test(path)) return false;
    if (e.kind === 'login_required' && !accountId && path && /\/auth\//.test(path) && !/\/refresh/.test(path)) return false;
    if (e.scope === 'global') return true;
    if (e.region && e.region !== region) return false;
    if (e.scope === 'account') return !e.account_id || e.account_id === accountId;
    if (e.scope === 'operation') return e.path === path;
    return true;
  }

  /** 请求前检查：命中活跃限制则抛出带风险元数据的错误。
   *  注意：upstream_unavailable（5xx 区域暂时不可用）不在此拦截——它是暂时的，
   *  本仓库 upstream-client 已有 retryTransient 重试，强行拦截反而降低可用性、
   *  并会让 SSE 流请求（头已发无法改码）在请求前被拒，破坏既有契约。它仅作观测记录。 */
  function check(region, accountId, path) {
    for (const e of entries) {
      if (active(e) && matches(e, region, accountId, path)) {
        if (e.kind === 'upstream_unavailable') continue;
        const err = new Error(e.action || '上游暂时限制请求');
        err.name = 'RiskError';
        err.statusCode = e.status || 429;
        err.risk = e;
        throw err;
      }
    }
  }

  /**
   * 请求后观察上游错误：分类并登记限制（带指数退避）。
   * 返回 RiskError（含 risk 元数据）或 null（非限制类错误）。
   */
  function observe(status, code, message, { region, accountId, path, headers = {} } = {}) {
    const cls = classify(status, code, message);
    if (!cls) return null;

    const retryAt = now() + (cls.delay || 0);
    const old = entries.find(
      e => active(e) && e.kind === cls.kind && e.region === region && e.account_id === accountId,
    );
    const count = (old?.count || 0) + 1;
    // 指数退避：随连续失败翻倍，封顶（5xx 60s，其余 900s）
    let delay = cls.delay || 0;
    if (!cls.manual) {
      delay = Math.min(
        delay * 2 ** Math.min(count - 1, 10),
        cls.kind === 'upstream_unavailable' ? 60_000 : 900_000,
      );
    }
    try {
      if (headers && typeof headers.get === 'function') {
        const ra = Number(headers.get('Retry-After'));
        if (ra > 0) delay = Math.max(delay, ra * 1000);
      }
    } catch { /* 非标准头容器 */ }

    const entry = {
      id: old?.id || randomBytes(8).toString('hex'),
      kind: cls.kind,
      scope: cls.scope,
      manual: Boolean(cls.manual),
      region: region || null,
      account_id: accountId || null,
      path: path || null,
      status: status || cls.status,
      retry_at: now() + delay,
      count,
      action: cls.manual
        ? '请在官方渠道处理账号限制后手动恢复。'
        : '上游暂时限制请求，冷却期间不换号或重放请求。',
      upstream_code: code ?? null,
      request_id: typeof headers?.get === 'function' ? headers.get('X-Request-ID') || null : null,
      updated_at: new Date().toISOString(),
    };
    if (cls.kind === 'channel_not_allowed') {
      entry.action = '上游拒绝本次请求（11128: unapproved channel）。原因尚未定位；不自动重放、不换号，也不据此封锁整个区域。';
    }

    if (old) {
      const idx = entries.indexOf(old);
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    save();

    // 透传上游原始 statusCode（严格保留既有契约：500→500、SSE 200→200），
    // 不在 observe 阶段改写。仅当原始码缺失时用该类型的语义码兜底。
    const passthroughStatus = Number(status) >= 100 ? Number(status) : (cls.status || 503);
    const err = new Error(entry.action);
    err.name = 'RiskError';
    err.statusCode = passthroughStatus;
    err.risk = entry;
    if (cls.manual) err.manual = true;
    log('[Risk]', `分类为 ${cls.kind}（scope=${cls.scope}, 冷却 ${(delay / 1000).toFixed(0)}s）: ${message?.slice(0, 120) ?? ''}`);
    return err;
  }

  /** 手动恢复：确认官方问题已解决后清除限制。 */
  function resume(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.resolved_at = new Date().toISOString();
    save();
    return true;
  }

  /** 校验并恢复：成功请求后调用，清除该 (region,account,path) 下的可自动恢复限制。 */
  function clearOnSuccess(region, accountId, path) {
    let changed = false;
    for (const e of entries) {
      if (e.manual) continue;
      if (e.kind === 'channel_not_allowed') continue; // 11128 非真限制，不随成功清除
      if (matches(e, region, accountId, path) && !e.resolved_at) {
        e.resolved_at = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) save();
  }

  function list() {
    return entries.filter(active);
  }

  return {
    filePath,
    check,
    observe,
    resume,
    clearOnSuccess,
    list,
    load,
  };
}

export { classify };
