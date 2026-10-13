/**
 * WorkBuddy 上游 LLM 客户端 — 请求头复刻 + 透明转发（JSON / SSE）
 *
 * 端点（不带 prefixPath，直接挂 {endpoint}/v2/...）：
 *   POST {endpoint}/v2/chat/completions   对话（OpenAI 兼容 body，SSE）
 *   POST {endpoint}/v2/completions        代码补全
 *   POST {endpoint}/v2/embeddings         向量
 *   POST {endpoint}/v2/images/generations 文生图
 *   POST {endpoint}/v2/videos/generations 视频生成
 *
 * 鉴权头（对齐桌面端 AuthService.buildHeaders + CLI ModelProviderImpl）：
 *   Authorization: Bearer <accessToken>
 *   X-User-Id: <uid>
 *   X-Enterprise-Id / X-Tenant-Id: <enterpriseId>   （企业账号）
 *   X-Domain: <domain>
 *   User-Agent / X-IDE-Type / X-IDE-Name / X-IDE-Version / X-Product
 *
 * 会话与链路头（CLI 会注入，这里按需复刻，便于服务端侧统计与排障）：
 *   X-Conversation-ID / X-Session-ID
 *   X-Conversation-Request-ID / X-Conversation-Message-ID
 *   X-Request-ID / X-Root-Request-ID
 *   X-Agent-Intent: craft
 *
 * 流式响应：SSE 透传，唯一改写是把上游 1-2 词一帧的 reasoning 小分片
 * 合并成大帧（见 REASONING_COALESCE_CHARS），避免客户端把思考渲染成碎块。
 * 客户端断开时通过 AbortController 取消上游请求。
 */

import { readSseFrames, writeSse } from './workbuddy-sse.mjs';
import { randomUUID } from 'node:crypto';
import { resolveEdition, userAgentForEdition } from './workbuddy-endpoints.mjs';
import { PROVIDERS, resolveProvider, loadProviderApiKey, isProviderAvailable, PROVIDER_MODELS } from './workbuddy-providers.mjs';

/**
 * 上游风控码 11128 = Illegal API invocation from an unapproved channel。
 * 实测为频率风控的临时冷却窗口：客户端失败自动重试会形成重试风暴，
 * 且拉黑期间的每次重试都会给黑名单续期。
 *
 * 处理策略（多账号优先切号，而非原地死等）：
 *  - fetch 层最多给 11128 一次短冷却重试（兜底单账号场景，让黑名单有一次
 *    自然过期的机会）；仍失败则抛出 WorkBuddyUpstreamError。
 *  - doForwardChatCompletions 的 catch 分支把 11128 与限额（429/6004）同等
 *    视为「账号不可用」，自动切换到下一个账号重发。若所有账号均 11128，
 *    说明风控是 IP/设备维度，则透传错误（此时需回退到请求体清洗）。
 */
const RATE_LIMIT_CODE = 11128;

/** 上游仅支持流式：stream:false 会返回 code=11101 */
const NON_STREAM_NOT_SUPPORTED_CODE = 11101;

/**
 * 上游要求首条消息必须是 system prompt，否则返回 400
 * （first message is not system prompt）。客户端没带 system 消息时，
 * 注入一条兜底系统消息，让纯 user 开头的请求也能正常转发。
 */
export const DEFAULT_SYSTEM_PROMPT = '你是一个得力助手';

/**
 * 首条消息不是 system 时，在头部补一条系统消息（不改原数组，返回新 body）。
 * 已经是 system 开头、messages 为空/缺失时原样返回（同一引用，便于调用方判断是否改写）——
 * 空 messages 属客户端异常输入，交给上游按原样报错，不在这里改写。
 */
export function ensureLeadingSystemMessage(body, prompt = DEFAULT_SYSTEM_PROMPT) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !body.messages.length) return body;
  const firstRole = String(body.messages[0]?.role ?? '').toLowerCase();
  if (firstRole === 'system') return body;
  return { ...body, messages: [{ role: 'system', content: prompt }, ...body.messages] };
}

/**
 * 剥离 Anthropic 内部元数据头（doge-code / Claude Code fork 会把如
 * "x-anthropic-billing-header: cc_version=...; cc_entrypoint=cli; ..." 整行塞进
 * system prompt 首部）。这类「Anthropic 客户端内部头文本混入请求体」正是上游
 * WAF 判定为 unapproved channel（11128）的最强信号之一——因为官方 WorkBuddy
 * 客户端从不会带这种 Anthropic 专属元数据。这里在转发前整行剥离。
 *
 * 只移除形如 "x-anthropic-<name>:" 开头的整行，不影响其余正常 dialogue 文本。
 * content 支持字符串或 OpenAI 多模态数组 [{type:'text',text}...]。
 * 未命中时返回原引用，便于调用方判断是否改写。
 */
const ANTHROPIC_META_LINE = /^[\t ]*x-anthropic-[a-z0-9-]+:.*$/gim;
function stripTextMeta(text) {
  if (typeof text !== 'string' || !text) return text;
  if (!/x-anthropic-[a-z0-9-]+:/i.test(text)) return text;
  const next = text
    .replace(ANTHROPIC_META_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .trim();
  return next === text ? text : next;
}
export function stripAnthropicMetaHeaders(messages) {
  if (!Array.isArray(messages)) return messages;
  let touched = false;
  const next = messages.map(message => {
    if (!message || typeof message !== 'object') return message;
    const content = message.content;
    let out = content;
    if (typeof content === 'string') {
      out = stripTextMeta(content);
    } else if (Array.isArray(content)) {
      let ctouched = false;
      const cnext = content.map(block => {
        if (!block || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') return block;
        const t = stripTextMeta(block.text);
        if (t === block.text) return block;
        ctouched = true;
        return { ...block, text: t };
      });
      out = ctouched ? cnext : content;
    }
    if (out === content) return message;
    touched = true;
    return { ...message, content: out };
  });
  return touched ? next : messages;
}

/**
 * 上游限额码 6004（HTTP 429）：账号×模型维度的用量限额，
 * msg 形如 "您的使用量已超出频率限制，将在 2026-09-11 19:43:46 UTC+8 重置，
 * 您也可以切换其他模型继续使用。" —— 恢复时间只在文本里，需正则解析。
 */
const QUOTA_LIMIT_CODE = 6004;

/** 从限额提示文本解析恢复时间戳（UTC+8）；解析失败返回 0 */
export function parseQuotaResetAt(text) {
  const m = /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*UTC\+8/.exec(String(text || ''));
  if (!m) return 0;
  const at = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`);
  return Number.isFinite(at) ? at : 0;
}

/** 是否为账号限额错误（HTTP 429 或上游 code 6004） */
export function isQuotaLimitError(error) {
  if (!error) return false;
  if (Number(error.statusCode) === 429) return true;
  return Number(error.upstreamCode) === QUOTA_LIMIT_CODE;
}

/**
 * 思考（reasoning_content）帧合并阈值：上游把思考拆成 1-2 个词一帧的小分片，
 * 部分客户端按 SSE 帧渲染思考块，会把一句思考碎成几十个小块。
 * 透传时把相邻 reasoning 帧攒到 ≥ 该字符数（或遇到非 reasoning 事件/流结束）再下发，
 * 只影响分帧粒度，不改变任何内容。
 */
const REASONING_COALESCE_CHARS = 60;

function sseFrame(obj) {
  return Buffer.from(`data: ${JSON.stringify(obj)}\n\n`, 'utf8');
}

/** Abortable retry delay; always remove its listener on completion. */
function sleep(ms, controller) {
  const signal = controller?.signal;
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason || new Error('aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export class WorkBuddyUpstreamError extends Error {
  constructor(message, { statusCode, upstreamCode, body } = {}) {
    super(message);
    this.name = 'WorkBuddyUpstreamError';
    this.statusCode = statusCode;
    this.upstreamCode = upstreamCode;
    this.body = body;
  }
}

export function createWorkBuddyUpstreamClient({
  auth,
  accountStore = null,
  log = () => {},
  verbose = () => {},
  logEvent = null,
  fetchImpl = globalThis.fetch,
  transientRetryDelaysMs = [800, 2000],
  // ── 风控(11128)连坐防御的可配置项（默认关闭，保持既有行为）──
  // 方案1: wafFallbackModel — 遭遇通道级 11128 连坐时，自动改用的备用模型
  //        （如 'auto'）；空串 = 不降级，按原模型透传失败。
  wafFallbackModel = '',
  // 方案2: wafChannelBanThreshold — 连续多少个不同账号报【相同】11128 即判定
  //        通道/IP 级连坐，停止继续扫号式遍历并快速失败；0 = 关闭（保持原遍历）。
  wafChannelBanThreshold = 0,
  // 方案3: wafCooldownMs — 触发连坐熔断后的全局冷却窗口(毫秒)；窗口内直接拒绝
  //        新请求并提示稍后重试，避免反复触发加固 WAF 警觉；0 = 关闭。
  wafCooldownMs = 0,
  // ── 上游风控分类器（workbuddy-risk.mjs）：统一分类 401/402/5xx/设备验证等错误，
  //   并在冷却期内拦截同类请求，避免盲换号或重放。传入即启用。
  risk = null,
  // ── 请求加工管线（workbuddy-pipeline.mjs）：统一编排 脱敏/补system/剥元数据头
  //   等 stage。不传时回退到原有的写死两步，保持既有调用方行为不变。
  pipeline = null,
} = {}) {
  if (!auth) throw new Error('createWorkBuddyUpstreamClient 需要传入 auth 提供者');

  /** 最近一次请求的管线 trace，供上层（server.mjs）落日志用 */
  let lastPipelineTrace = null;

  /**
   * 限额账号轮换：请求遇 429/code 6004 时标记当前账号（模型级 + 恢复时间），
   * 自动切换到一个对同模型仍可用的账号重试；所有账号都被限额时才透传错误。
   * 依赖 accountStore 提供 id/状态/切换；无 store（如单账号 auth.json）时保持原行为。
   */
  // ── 通道级 11128 连坐熔断状态（跨请求共享）────────────────
  // 当连续多个账号报相同 11128，或触发冷却窗口时，记录冷却截止时间。
  // 窗口内直接拒绝新请求，避免反复触发加固 WAF 警觉。
  let wafCooldownUntil = 0;

  /** 是否处于风控冷却窗口内 */
  function inWafCooldown() {
    return wafCooldownMs > 0 && Date.now() < wafCooldownUntil;
  }

  /** 触发冷却：记录窗口，并（可选）把模型降级到备用模型。返回降级后的 model。 */
  function tripWafCooldown(model, accountCount) {
    const now = Date.now();
    wafCooldownUntil = now + (wafCooldownMs > 0 ? wafCooldownMs : 0);
    verbose('[Upstream]',
      `⚠️ 通道级风控连坐：${accountCount} 个账号对模型 ${model || '(默认)'} 均 11128，`
      + (wafCooldownMs > 0 ? `进入 ${wafCooldownMs}ms 冷却窗口` : '已停止本次扫号式轮换'));
    // 方案1：配置了备用模型时，降级到备用模型继续（不影响原请求的 model 语义由 fallback 接管）
    if (wafFallbackModel && wafFallbackModel !== model) {
      verbose('[Upstream]', `模型 ${model || '(默认)'} 触发连坐，降级改用备用模型 ${wafFallbackModel}`);
      return wafFallbackModel;
    }
    return model;
  }

  function pickNextAccount(model, triedIds) {
    if (!accountStore) return null;
    try {
      const { accounts } = accountStore.listAccounts();
      const now = Date.now();
      return accounts.find(account => {
        if (triedIds.includes(account.id)) return false;
        if (account.disabled) return false;   // 禁用的账号不参与轮询
        const limit = account.rateLimits?.[String(model || '')];
        return !(limit && Number(limit.resetAt) > now);
      }) || null;
    } catch (error) {
      verbose('[Upstream]', `账号列表读取失败: ${error.message}`);
      return null;
    }
  }

  /** 记录限额并返回可读的恢复时间文本 */
  function markAccountLimited(accountId, model, error) {
    if (!accountStore || !accountId) return '';
    const detail = error?.body ? (() => { try { return JSON.parse(error.body); } catch { return null; } })() : null;
    const message = detail?.msg || detail?.message || error?.message || '';
    const resetAt = parseQuotaResetAt(message);
    const entry = accountStore.markRateLimited(accountId, model, {
      status: error?.statusCode || 429,
      code: error?.upstreamCode ?? detail?.code ?? null,
      resetAt,
      message,
    });
    return entry?.resetAt ? new Date(entry.resetAt).toLocaleString('zh-CN', { hour12: false }) : '';
  }

  /**
   * 429 限额事件上报到运行日志（桌面端「日志」页）。
   * 结构化 data 让前端能直接展示「账号 A → 账号 B」的切换链路与恢复时间。
   */
  function reportLimitEvent({ message, level = 'warn', from, to, model, error, resetAt }) {
    if (!logEvent) return;
    const detail = error?.body ? (() => { try { return JSON.parse(error.body); } catch { return null; } })() : null;
    logEvent({
      level,
      category: 'account',
      message,
      data: {
        model: String(model || ''),
        from: from?.label || '',
        to: to?.label || '',
        status: error?.statusCode || 429,
        code: error?.upstreamCode ?? detail?.code ?? null,
        resetAt: Number(resetAt) || 0,
        resetAtText: Number(resetAt) ? new Date(resetAt).toLocaleString('zh-CN', { hour12: false }) : '',
      },
    });
  }

  function chatCompletionsUrl(session) {
    return `${session?.endpoint || auth.baseUrl}/v2/chat/completions`;
  }

  async function requireSession() {
    const session = await auth.getCurrentSession();
    if (!session?.auth?.accessToken) {
      throw new WorkBuddyUpstreamError(
        '当前没有可用登录态：先执行 node server.mjs --login，或设置 WORKBUDDY_TOKEN',
        { statusCode: 401 },
      );
    }
    return session;
  }

  /**
   * 客户端身份 + 鉴权 + 会话追踪头。
   * requestId 用于把同一轮对话串起来，便于上游排障。
   * 身份（UA / X-IDE-* / X-Product）按账号版本区分：国内版 WorkBuddy、国际版 WorkBuddy AI。
   */
  function buildHeaders(session, { accept, requestId, conversationId } = {}) {
    const id = requestId || randomUUID();
    const e = resolveEdition(session?.edition);
    const headers = {
      'Content-Type': 'application/json',
      // 完整三段 UA（含 CLI 扩展段）：与桌面客户端一致，服务端按此识别通道
      'User-Agent': userAgentForEdition(e.id),
      // 客户端身份头：服务端按此做客户端识别与白名单校验
      'X-IDE-Type': e.uaPlatform,
      'X-IDE-Name': e.productName,
      'X-IDE-Version': e.clientVersion,
      'X-Product': e.productName,
      'X-Agent-Intent': 'craft',
      // 会话追踪
      'X-Request-ID': id,
      'X-Conversation-Request-ID': id,
      'X-Conversation-ID': conversationId || id,
      'X-Session-ID': conversationId || id,
      ...auth.buildAuthHeaders(session),
    };
    if (accept) headers.Accept = accept;
    return headers;
  }

  /**
   * 把管线 trace 格式化成一行可读文本。
   *
   * 只输出「改了的 step」+ 耗时，跳过未命中的 —— verbose 日志要能一眼看出
   * 这次请求到底被动过哪里，全量罗列会把信号淹没。
   */
  function formatPipelineTrace(piped) {
    const parts = [];
    for (const step of piped.trace) {
      if (step.error) {
        parts.push(`${step.name}!${step.error}`);
      } else if (step.changed) {
        const info = step.info ? `(${Object.entries(step.info).map(([k, v]) => `${k}=${v}`).join(',')})` : '';
        parts.push(`${step.name}${info}`);
      }
    }
    return parts.length ? `命中 [${parts.join(' → ')}]` : '运行但无改动';
  }

  async function buildRequestInit({ body, signal, accept, requestId, conversationId }) {
    const session = await requireSession();
    return {
      session,
      init: {
        method: 'POST',
        headers: buildHeaders(session, { accept, requestId, conversationId }),
        body: JSON.stringify(body),
        signal,
      },
    };
  }

  /** 读取上游错误响应为文本，尽量解析出 { code, message } */
  async function readUpstreamError(response) {
    const text = await response.text().catch(() => '');
    let code;
    let message = text.slice(0, 500);
    try {
      const payload = text ? JSON.parse(text) : null;
      code = payload?.code;
      message = payload?.message || payload?.msg || payload?.error?.message || message;
    } catch { /* 非 JSON，保留原文 */ }
    return { code, message, body: text };
  }

  /** Only retry rejected chat requests before any response data has been accepted.
   * Never replay a stream, a network-ambiguous request, or a generation job.
   * The HTTP boundary owns the single final failure log; this layer logs attempts only.
   */
  /** 11128 不在此 layer 原地重试：黑名单每次重试都会续期，且应优先切换到
   * 其他账号。这里一律立即抛出 WorkBuddyUpstreamError，
   * 由 doForwardChatCompletions 的账号轮换接手。仅对服务器端 5xx 做有限
   * transient 重试。 */
  async function requestWithWafRetry(url, init, controller, { requestMeta, retryTransient = false } = {}) {
    let transientRetries = 0;
    for (;;) {
      controller?.signal?.throwIfAborted();
      if (requestMeta) requestMeta.attempts++;
      const response = await fetchImpl(url, init);
      if (response.ok) return response;
      const detail = await readUpstreamError(response);
      let delay;
      let reason;
      if (retryTransient && [500, 502, 503, 504].includes(response.status)
        && Number(detail.code) !== RATE_LIMIT_CODE && Number(detail.code) !== QUOTA_LIMIT_CODE
        && transientRetries < transientRetryDelaysMs.length) {
        delay = Math.max(0, Number(transientRetryDelaysMs[transientRetries++]) || 0);
        reason = `上游暂时不可用 HTTP ${response.status}`;
      }
      if (delay !== undefined) {
        if (requestMeta) requestMeta.retryCount++;
        const message = `${reason}，${delay}ms 后重试（尚非最终失败）：${detail.message}`;
        if (logEvent) logEvent({ level: 'warn', category: 'upstream', message,
          data: { ...requestMeta, outcome: 'retry', status: response.status, delayMs: delay } });
        else log('[Upstream]', message);
        await sleep(delay, controller);
        continue;
      }
      throw new WorkBuddyUpstreamError(
        `上游返回 ${response.status}: ${detail.message}`,
        { statusCode: response.status, upstreamCode: detail.code, body: detail.body },
      );
    }
  }

  // Reserve the queue slot before awaiting. Three simultaneous identical requests must
  // remain serial; timing out a waiter must never let it bypass an active request.
  const inFlight = new Map();
  function waitForTurn(previous, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason || new Error('aborted')); };
      signal.addEventListener('abort', abort, { once: true });
      previous.then(() => { signal.removeEventListener('abort', abort); resolve(); }, reject);
      if (signal.aborted) abort();
    });
  }

  async function forwardChatCompletions({ req, res, body, controller, dedupeKey, requestMeta, transformChunk }) {
    requestMeta ||= { requestId: randomUUID(), model: body.model || '', attempts: 0, retryCount: 0 };
    if (!dedupeKey) {
      controller.signal.throwIfAborted();
      return doForwardChatCompletions({ req, res, body, controller, requestMeta, transformChunk });
    }
    const previous = inFlight.get(dedupeKey) || Promise.resolve();
    let release;
    const slot = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => slot);
    inFlight.set(dedupeKey, tail);
    void tail.then(() => { if (inFlight.get(dedupeKey) === tail) inFlight.delete(dedupeKey); });
    try {
      await waitForTurn(previous, controller.signal);
      controller.signal.throwIfAborted();
      return await doForwardChatCompletions({ req, res, body, controller, requestMeta, transformChunk });
    } finally { release(); }
  }

  async function doForwardChatCompletions({ req, res, body, controller, requestMeta, transformChunk }) {
    const stream = body.stream === true;
    // 无论客户端要不要流式，上游都必须以 stream:true 请求
    let upstreamBody = { ...body, stream: true };

    // ── 请求加工管线 ────────────────────────────────────────
    // 原先这里写死两步（ensureLeadingSystemMessage + stripAnthropicMetaHeaders），
    // 而 desensitize 在更外层 server.mjs 里 —— 顺序不可调、无法单独关闭、
    // 每步改了什么也看不到。现在统一交给 pipeline：
    //   · 顺序由 DEFAULT_STAGE_ORDER 决定（刻意保持原线上顺序，见 pipeline.mjs）
    //   · 单个 stage 可用 WORKBUDDY_PIPELINE_DISABLE 关闭
    //   · 每步结果进 trace，供 server 层落结构化日志
    //
    // 未注入 pipeline 时（单测直接构造 client）回退到原两步实现 ——
    // createWorkBuddyUpstreamClient 的既有调用方无需改动即可工作。
    if (pipeline) {
      const piped = pipeline.run(upstreamBody, {
        phase: 'request',
        model: upstreamBody.model || '',
        requestId: requestMeta?.requestId || '',
      });
      upstreamBody = piped.changed ? piped.body : upstreamBody;
      if (piped.changed) {
        verbose('[Pipeline]', formatPipelineTrace(piped));
      }
      if (piped.traceTruncated) {
        verbose('[Pipeline]', 'trace 已达上限，后续 stage 仍有执行但未记录');
      }
      lastPipelineTrace = piped.trace;
    } else {
      // 兜底：未注入管线时的原始行为
      // 上游要求首条消息是 system prompt：客户端没带时补一条兜底系统消息
      const withSystem = ensureLeadingSystemMessage(upstreamBody);
      if (withSystem !== upstreamBody) {
        upstreamBody = withSystem;
        verbose('[Upstream]', `首条消息非 system，已注入系统消息：${DEFAULT_SYSTEM_PROMPT}`);
      }
      // 剥离 doge-code / Claude Code fork 误塞进 system 的 Anthropic 内部元数据头
      // （如 "x-anthropic-billing-header: cc_version=..."）。官方 WorkBuddy 客户端
      // 不带这类 Anthropic 专属头，保留它会触发上游 WAF 的 11128（unapproved channel）。
      const strippedMessages = stripAnthropicMetaHeaders(upstreamBody.messages);
      if (strippedMessages !== upstreamBody.messages) {
        upstreamBody = { ...upstreamBody, messages: strippedMessages };
        verbose('[Upstream]', '已剥离 Anthropic 内部元数据头（x-anthropic-*）');
      }
    }

    let model = body.model || '';
    const { provider, rawModelId } = resolveProvider(model);
    const triedIds = [];
    let response = null;

    // 外部 provider 路由：不走 WorkBuddy session 鉴权，直接用 API key
    if (provider.id !== 'workbuddy') {
      const apiKey = loadProviderApiKey(provider);
      if (!apiKey) {
        throw new WorkBuddyUpstreamError(
          `外部模型 "${model}" 需要配置 ${provider.apiKeyEnv} 环境变量`,
          { statusCode: 401 },
        );
      }
      const url = `${provider.baseUrl}/v1/chat/completions`;
      const id = requestMeta.requestId || randomUUID();
      const init = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(provider.id === 'openrouter' ? { 'HTTP-Referer': 'http://localhost:3065', 'X-Title': 'WorkBuddy Proxy' } : {}),
        },
        body: JSON.stringify({ ...upstreamBody, model: rawModelId }),
        signal: controller.signal,
      };
      if (stream) init.headers.Accept = 'text/event-stream';
      verbose('[Upstream]', `POST ${url} model=${rawModelId} provider=${provider.id} stream=${stream}`);
      const startedAt = Date.now();
      response = await requestWithWafRetry(url, init, controller, { requestMeta, retryTransient: true });
    } else {
      // 方案3：处于风控冷却窗口时，直接拒绝新请求（fallback 重试在循环内 continue，不经过此处）
      if (inWafCooldown()) {
        throw new WorkBuddyUpstreamError(
          `上游正处于风控冷却窗口（11128 连坐），请稍后重试（${Math.ceil((wafCooldownUntil - Date.now()) / 1000)}s 后恢复）`,
          { statusCode: 429, upstreamCode: RATE_LIMIT_CODE },
        );
      }
      // WorkBuddy 原生路由（含限额轮换）
      let session = null;
      // 方案2：连续多少个账号报相同 11128（通道级连坐判定）
      let consecutiveWaf = 0;
      for (;;) {
        const accountId = accountStore?.getCurrentEntry()?.id ?? null;
        // 请求前风控检查：命中活跃限制（如 401 登录失效 / 402 额度耗尽 / 5xx 区域冷却）
        // 直接拦截，避免对已知不可用账号或区域盲换号、重放。
        if (risk) {
          try {
            risk.check(session?.edition || 'cn', accountId, '/v2/chat/completions');
          } catch (riskErr) {
            verbose('[Risk]', `拦截请求：${riskErr.message}`);
            throw new WorkBuddyUpstreamError(riskErr.message, {
              statusCode: riskErr.statusCode || 429,
              upstreamCode: riskErr.risk?.upstream_code ?? null,
              risk: riskErr.risk,
            });
          }
        }
        const { session: currentSession, init } = await buildRequestInit({
          body: upstreamBody,
          signal: controller.signal,
          accept: 'text/event-stream',
          requestId: requestMeta.requestId,
        });
        session = currentSession;
        const url = chatCompletionsUrl(session);
        verbose('[Upstream]',
          `POST ${url} model=${model || '(默认)'} stream=${stream} uid=${session.account?.uid || '-'} `
          + `msgs=${Array.isArray(body.messages) ? body.messages.length : '?'} ua=${init.headers['User-Agent']}`);
        // 请求体结构摘要（仅 --verbose）：对比「curl 极简 body」vs「Claude Code 复杂 body」
        // 便于定位为何 curl 过、doge-code 被 11128 拦。
        {
          try {
            const msgs = Array.isArray(upstreamBody?.messages) ? upstreamBody.messages : [];
            const roles = {};
            let firstText = '';
            for (const m of msgs) {
              roles[m?.role || '?'] = (roles[m?.role || '?'] || 0) + 1;
              if (!firstText) {
                const c = m?.content;
                firstText = (typeof c === 'string' ? c : Array.isArray(c)
                  ? c.map(b => (b && b.type === 'text' ? b.text : '')).join('') : '').slice(0, 80);
              }
            }
            const topKeys = Object.keys(upstreamBody || {}).filter(k => k !== 'messages' && k !== 'model' && k !== 'stream');
            verbose('[Upstream]',
              `body 摘要: roles=${JSON.stringify(roles)} tools=${Array.isArray(upstreamBody?.tools) ? upstreamBody.tools.length : 0} `
              + `fields=${topKeys.length ? topKeys.join(',') : '(仅基础)'} firstText="${firstText}"`);
          } catch (e) { /* 摘要记录失败不影响主流程 */ }
        }

        const startedAt = Date.now();
        try {
          response = await requestWithWafRetry(url, init, controller, { requestMeta, retryTransient: true });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!(error instanceof WorkBuddyUpstreamError)) {
            throw new WorkBuddyUpstreamError(`上游请求失败: ${error.message}`, { statusCode: 502 });
          }
          // 账号不可用（限额 429/code 6004，或风控 11128）：标记后切换其他账号；
          // 全部账号均不可用时透传错误。11128 不写入 rateLimits（无明确恢复时间），
          // 仅依赖 triedIds 防重复回选。
          const isRate = Number(error.upstreamCode) === RATE_LIMIT_CODE;
          // 11128 诊断：首次触发时记录请求体摘要，定位「curl 过 / Claude Code 被拦」的内容差异
          // （仅记一次，避免 12 账号扫号时刷屏）
          if (isRate && !requestMeta.wafBodyLogged) {
            requestMeta.wafBodyLogged = true;
            try {
              const msgs = Array.isArray(upstreamBody?.messages) ? upstreamBody.messages : [];
              const roles = {};
              let sample = '';
              for (const m of msgs) {
                roles[m?.role || '?'] = (roles[m?.role || '?'] || 0) + 1;
                if (!sample) {
                  const c = m?.content;
                  const text = typeof c === 'string' ? c : Array.isArray(c)
                    ? c.map(b => (b && b.type === 'text' ? b.text : '')).join('')
                    : '';
                  sample = text.slice(0, 200);
                }
              }
              const bodyInfo = JSON.stringify({
                model, roles, tools: Array.isArray(upstreamBody?.tools) ? upstreamBody.tools.length : 0,
                stream: upstreamBody?.stream,
                firstSample: sample,
              });
              const msg = `11128 请求体诊断: ${bodyInfo}`;
              if (logEvent) logEvent({ level: 'warn', category: 'upstream', message: msg });
              else verbose('[Upstream]', msg);
            } catch (e) { /* 诊断记录失败不影响主流程 */ }
          }
          if (accountId && (isQuotaLimitError(error) || isRate) && !triedIds.includes(accountId)) {
            triedIds.push(accountId);
            let resetText = '';
            let limitEntry = null;
            if (!isRate) {
              resetText = markAccountLimited(accountId, model, error);
              limitEntry = accountStore?.listAccounts?.().accounts
                .find(item => item.id === accountId)?.rateLimits?.[String(model || '')];
            }
            // 方案2：风控连坐计数。连续 wafChannelBanThreshold 个账号报相同 11128，
            // 判定为通道/IP 级连坐，停止扫号式遍历（避免加固 WAF 警觉）。
            if (isRate) consecutiveWaf++;
            const channelBanHit = isRate
              && wafChannelBanThreshold > 0
              && consecutiveWaf >= wafChannelBanThreshold;
            if (channelBanHit) {
              const fallback = tripWafCooldown(model, triedIds.length);
              if (fallback && fallback !== model) {
                // 方案1：配置了备用模型 → 降级改用并重启轮换（同账号以新模型重试）
                model = fallback;
                upstreamBody = { ...upstreamBody, model: fallback };
                consecutiveWaf = 0;
                triedIds.length = 0;
                verbose('[Upstream]', `连坐达阈值，模型降级为 ${fallback}，重置轮换重试`);
                continue;
              }
              // 无备用模型或已降级：停止扫号，透传（兼熔断冷却）
              error.message = `${error.message}（通道级风控连坐，停止扫号；`
                + `${wafCooldownMs > 0 ? `进入 ${Math.round(wafCooldownMs / 1000)}s 冷却窗口` : '请稍后重试'}）`;
              throw error;
            }
            const next = pickNextAccount(model, triedIds);
            const fromLabel = session.account?.nickname || accountId;
            // 明确区分：风控 11128 带上游原文 message 自证；用量限额带恢复时间
            const reasonText = isRate
              ? `触发风控 (11128)：${error.message}`
              : `对模型 ${model || '(默认)'} 已限额`;
            if (next) {
              log('[Upstream]',
                `⚠️ 账号 ${fromLabel} ${reasonText}`
                + `${resetText ? `（${resetText} 恢复）` : ''}，自动切换 → ${next.nickname || next.id}`);
              reportLimitEvent({
                message: `账号「${fromLabel}」${reasonText}`
                  + `${resetText ? `（${resetText} 恢复）` : ''}，自动切换 → 「${next.nickname || next.id}」`,
                from: { label: fromLabel },
                to: { label: next.nickname || next.id },
                model,
                error,
                resetAt: limitEntry?.resetAt,
              });
              requestMeta.retryCount++;
              accountStore.setCurrent(next.id);
              continue;
            }
            error.message = `${error.message}（${isRate ? '所有账号均触发风控 (11128)' : `所有账号对模型 ${model} 均已限额`}）`;
            reportLimitEvent({
              level: 'warn',
              message: `${isRate ? `所有账号均触发风控 (11128)：${error.message}` : `模型 ${model || '(默认)'} 在所有账号均已限额`}，无法继续转发（尝试过 ${triedIds.length} 个账号）`,
              from: { label: fromLabel },
              model,
              error,
              resetAt: limitEntry?.resetAt,
            });
          }
          // 风控分类器：把未被既有 11128/429 轮换逻辑接手的错误（401/402/5xx/
          // 设备验证/权限拒绝等）登记为带 scope 的退避限制，冷却期内拦截同类请求。
          // 跳过 isRate(11128) 与 isQuotaLimitError(429/6004) —— 这两类已由上面轮换逻辑管理。
          if (risk && !isRate && !isQuotaLimitError(error)) {
            const detail = error.body ? (() => { try { return JSON.parse(error.body); } catch { return null; } })() : null;
            const msg = detail?.msg || detail?.message || error.message || '';
            const code = error.upstreamCode ?? detail?.code ?? null;
            const riskErr = risk.observe(error.statusCode, code, msg, {
              region: session?.edition || 'cn',
              accountId,
              path: '/v2/chat/completions',
              headers: { get: () => null },
            });
            if (riskErr) {
              riskErr.message = `${error.message}（风控分类：${riskErr.risk?.kind}，冷却期内拦截同类请求）`;
              // 继承原始错误的上游码与响应体，避免丢失错误细节
              riskErr.upstreamCode = error.upstreamCode ?? null;
              riskErr.body = error.body ?? null;
              throw riskErr;
            }
          }
          throw error;
        }
      // 请求成功：该账号对该模型的限额标记（如有）已失效，清除
      if (accountId && accountStore) {
        const hadLimit = accountStore.listAccounts().accounts
          .find(item => item.id === accountId)?.rateLimits?.[String(model || '')];
        accountStore.clearRateLimit(accountId, model);
        // 仅当之前确实处于限额状态才记一条，避免每次成功请求都刷日志
        if (hadLimit) {
          reportLimitEvent({
            level: 'info',
            message: `账号「${session.account?.nickname || accountId}」对模型 ${model || '(默认)'} 已恢复可用`,
            to: { label: session.account?.nickname || accountId },
            model,
          });
        }
      }
      verbose('[Upstream]', `上游响应 HTTP ${response.status}（${Date.now() - startedAt}ms）`);
      // 成功后清除该 (region,account,path) 下的可自动恢复限制，避免永久冷却。
      if (risk && accountId) {
        risk.clearOnSuccess(session?.edition || 'cn', accountId, '/v2/chat/completions');
      }
      break;
    }
  }

  if (stream) {
      // Anthropic 流式：handleAnthropicRequest 已发送 headers，不再重复写
      if (!transformChunk) {
        res.writeHead(response.status, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
      }
      await pipeSse(response.body, res, controller, transformChunk);
      return;
    }

    // 非流式但调用方需要自定义转换（如 Anthropic 适配）：逐帧喂给 transformChunk 收集，
    // 由调用方折叠成目标格式并写 res，本函数不写 res。
    if (transformChunk) {
      for await (const frame of readSseFrames(response.body, controller)) {
        if (frame.done) break;
        transformChunk(frame.chunk);
      }
      return;
    }

    const completion = await aggregateSseCompletion(response, controller);
    verbose('[Upstream]',
      `聚合完成: chunks=${completion._chunkCount} `
      + `content=${completion.choices[0].message.content?.length || 0} 字符 `
      + `finish=${completion.choices[0].finish_reason}`);
    const { _chunkCount, ...clean } = completion;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(clean));
    return clean;
  }

  /**
   * 读取上游 SSE 流并聚合为完整的 OpenAI chat.completion 结构。
   * 拼接 delta.content / delta.reasoning_content，按 index 合并 tool_calls，
   * usage 取最后一次出现（上游在末尾 chunk 下发）。
   */
  async function aggregateSseCompletion(response, controller) {
    let id = '', model = '', created = 0, role = '';
    let content = '', reasoning = '', finish = '';
    let usage = null, chunkCount = 0;
    const toolCalls = new Map();

    const handleChunk = chunk => {
      if (!chunk || typeof chunk !== 'object') return;
      if (chunk.error) {
        throw new WorkBuddyUpstreamError(chunk.error.message || '上游流式返回错误', { statusCode: 502 });
      }
      chunkCount++;
      id = chunk.id || id;
      model = chunk.model || model;
      created = chunk.created || created;
      if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const delta = choice.delta || {};
      role = delta.role || role;
      if (typeof delta.content === 'string') content += delta.content;
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
      if (choice.finish_reason) finish = choice.finish_reason;
      for (const tc of delta.tool_calls || []) {
        const i = Number.isInteger(tc.index) ? tc.index : 0;
        const cur = toolCalls.get(i) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) cur.id = tc.id;
        if (tc.type) cur.type = tc.type;
        if (tc.function?.name) cur.function.name += tc.function.name;
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
        toolCalls.set(i, cur);
      }
    };

    for await (const frame of readSseFrames(response.body, controller)) {
      if (frame.done) break;
      handleChunk(frame.chunk);
    }

    const message = { role: role || 'assistant', content };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls.size) message.tool_calls = [...toolCalls.values()];
    return {
      id: id || `wb-agg-${Date.now()}`,
      object: 'chat.completion',
      created: created || Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: finish || 'stop' }],
      usage,
      _chunkCount: chunkCount,
    };
  }

  /** SSE 透传：思考小分片合并后推给客户端，其余事件原样；客户端断开时取消上游 */
  async function pipeSse(upstreamBody, res, controller, transformChunk = null) {
    let reasoning = '';
    let template = null;
    const flushReasoning = async () => {
      if (!reasoning) return;
      const chunk = { ...template, choices: [{ ...template.choices[0], delta: { reasoning_content: reasoning } }] };
      reasoning = '';
      await writeSse(res, sseFrame(chunk), controller);
    };
    for await (const frame of readSseFrames(upstreamBody, controller)) {
      if (frame.done) break;
      const chunk = frame.chunk;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      const onlyReasoning = chunk.choices?.length === 1 && (choice.index ?? 0) === 0
        && !choice.finish_reason && !chunk.usage && !choice.logprobs && delta
        && Object.keys(delta).length === 1 && typeof delta.reasoning_content === 'string';
      if (onlyReasoning) {
        template = chunk;
        reasoning += delta.reasoning_content;
        if (reasoning.length >= REASONING_COALESCE_CHARS) await flushReasoning();
      } else {
        await flushReasoning();
        if (transformChunk) {
          const events = transformChunk(chunk);
          if (Array.isArray(events)) {
            for (const event of events) {
              await writeAnthropicSse(res, event, controller);
            }
            continue; // 已写入 Anthropic 格式，跳过原始 OpenAI 写入
          }
        }
        await writeSse(res, sseFrame(chunk), controller);
      }
    }
    await flushReasoning();
    // Anthropic 流式：结尾事件由外层 handleAnthropicRequest 的 onFinish 发送
    if (!transformChunk) {
      await writeSse(res, 'data: [DONE]\n\n', controller);
      res.end();
    }
  }

  /** Anthropic SSE 格式写入（event: xxx\ndata: json\n\n） */
  async function writeAnthropicSse(res, event, controller) {
    const eventName = event.event || 'message';
    const data = JSON.stringify(event.data);
    const text = `event: ${eventName}\ndata: ${data}\n\n`;
    await writeSse(res, Buffer.from(text, 'utf8'), controller);
  }

  /** 代码补全 / embeddings / 图像 / 视频 复用同一转发逻辑 */
  async function forwardJsonEndpoint({ path, req, res, body, controller, requestMeta }) {
    // 与聊天路径一致地过一遍加工管线。
    //
    // 现状说明：补全/向量/图像/视频这四类请求用 `prompt` / `input` / 无文本字段，
    // 而现有 stage 都只认 `messages` —— 因此当前这一步对它们多数是空转。
    // 接入的意义是语义统一（所有上游请求都经同一条加工链）与为将来铺路：
    // 一旦新增处理 prompt 的 stage，这里自动生效，不必再改一遍转发层。
    let outbound = body;
    if (pipeline) {
      const piped = pipeline.run(outbound, {
        phase: 'request',
        model: body?.model || '',
        requestId: requestMeta?.requestId || '',
        endpoint: path,
      });
      outbound = piped.changed ? piped.body : outbound;
      if (piped.changed) verbose('[Pipeline]', formatPipelineTrace(piped));
      lastPipelineTrace = piped.trace;
    }
    const { session, init } = await buildRequestInit({ body: outbound, signal: controller.signal, requestId: requestMeta?.requestId });
    const url = `${session?.endpoint || auth.baseUrl}${path}`;
    verbose('[Upstream]', `POST ${url}`);
    let response;
    try {
      response = await requestWithWafRetry(url, init, controller, { requestMeta });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof WorkBuddyUpstreamError) throw error;
      throw new WorkBuddyUpstreamError(`上游请求失败: ${error.message}`, { statusCode: 502 });
    }
    const payload = await response.text();
    res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  }

  async function getConfigSummary() {
    const session = await auth.getCurrentSession().catch(error => ({ authError: error }));
    if (!session) {
      return {
        configured: false,
        baseUrl: auth.baseUrl,
        unavailableReason: '尚未登录（node server.mjs --login）',
      };
    }
    if (session.authError) {
      return {
        configured: false,
        baseUrl: auth.baseUrl,
        unavailableReason: `登录态不可用: ${session.authError.message}`,
        currentAccountId: session.authError.upstreamCode,
      };
    }
    const expiresAt = Number(session.auth?.expiresAt) || 0;
    return {
      configured: true,
      baseUrl: session.endpoint || auth.baseUrl,
      authApiBase: `${auth.baseUrl}/v2${auth.prefixPath}`,
      chatApiUrl: `${auth.baseUrl}/v2/chat/completions`,
      authSource: session.auth?.refreshToken ? 'auth.json（可自动刷新）' : '环境变量/静态 token',
      currentAccountId: session.account?.uid || null,
      tokenExpiresAt: expiresAt || null,
      canRefresh: !!session.auth?.refreshToken,
      providers: Object.entries(PROVIDERS)
        .filter(([, p]) => p.id !== 'workbuddy')
        .map(([, p]) => ({
          id: p.id,
          label: p.label,
          prefix: p.prefix,
          configured: isProviderAvailable(p),
          modelCount: PROVIDER_MODELS[p.id]?.length || 0,
        })),
    };
  }

  return {
    chatCompletionsUrl,
    forwardChatCompletions,
    /**
     * 最近一次请求的加工管线 trace（可能为 null）。
     *
     * 用途：server.mjs 在请求结束后读它落结构化日志。刻意用「读最近一次」
     * 而非在返回值里传递 —— forwardChatCompletions 直接写 res，没有返回
     * 结构化结果的通道，改造它返回值的改动面远大于收益。
     *
     * ⚠️ 并发下会被后一个请求覆盖。仅用于日志（丢掉一条 trace 无所谓），
     * 不可用于业务判断。
     */
    lastPipelineTrace: () => lastPipelineTrace,
    forwardCompletions: opts => forwardJsonEndpoint({ ...opts, path: '/v2/completions' }),
    forwardEmbeddings: opts => forwardJsonEndpoint({ ...opts, path: '/v2/embeddings' }),
    forwardImageGenerations: opts => forwardJsonEndpoint({ ...opts, path: '/v2/images/generations' }),
    forwardVideoGenerations: opts => forwardJsonEndpoint({ ...opts, path: '/v2/videos/generations' }),
    getConfigSummary,
    NON_STREAM_NOT_SUPPORTED_CODE,
  };
}
