/**
 * workbuddy-pipeline — 请求/响应加工管线
 *
 * ## 为什么需要它
 *
 * 仓库里已有 6 个加工器，但它们分散在两处、跨两个调用层级、顺序写死：
 *
 *   server.mjs:558                    desensitizer.processBody(body)
 *   upstream-client.mjs:436           ensureLeadingSystemMessage(body)
 *   upstream-client.mjs:444           stripAnthropicMetaHeaders(messages)
 *   anthropic-tools.mjs (buildUpstreamBody 内)  sanitizeSystemIdentity / stripBillingHeader
 *
 * 后果：无法单独关闭某一步、无法调整顺序、无法观测每一步改了什么。
 * 本模块把这 6 个统一成有序 stage，**不重写任何一个加工器的逻辑**，
 * 只做编排（YAGNI 阶梯第 2 条：复用已有的，不重造）。
 *
 * ## 设计取舍
 *
 * - **stage 用 `when(ctx)` 而非注册/注销**：开关是可逆的运行时状态，
 *   注销再注册会丢失状态（如脱敏器的命中统计）。
 * - **`apply` 返回同引用 = 未改动**：沿用 desensitizeBody 的既有契约
 *   （`messages === body.messages ? body : {...}`）。用引用相等判断
 *   changed，不做深比较 —— 深比较在热路径上代价不可接受。
 * - **单个 stage 抛错 → 跳过该 stage，不中断请求**：加工是增强不是主链路。
 *   一个 stage 崩了不该让整条请求失败；错误记进 trace 供排障。
 * - **二进制 content 必须短路**：图片请求的 base64 若被当文本插零宽空格
 *   会**损坏数据**。`hasBinaryContent` 是安全闸门，不是优化。
 * - **顺序默认保持现状**：当前实际顺序是 desensitize → ensure-system →
 *   strip-meta。重排会改变线上行为，需要真实请求回归才能验证，
 *   所以默认顺序 ＝ 上线时观测到的顺序。
 *
 * ## 为什么本模块不 import upstream-client
 *
 * 早期版本从 upstream-client.mjs 导入 ensureLeadingSystemMessage /
 * stripAnthropicMetaHeaders，而 upstream-client 又要在构造时接收 pipeline
 * 实例 —— 形成循环依赖。ESM 下函数声明有提升所以不报错，但这是脆弱的：
 * 一旦对方改成 const 箭头函数或顶层求值就会初始化失败。
 *
 * 现在两处适配各自内联（下面的 localEnsureLeadingSystemMessage /
 * localStripAnthropicMetaHeaders），**原模块的导出保持不变** ——
 * upstream-client 的兜底路径仍在用它们。逻辑必须与那边一致，
 * 一致性由 tests/pipeline.test.mjs 的契约测试守住（双向断言）。
 */

// ─── 内联的加工器适配 ─────────────────────────────────────

/** 与 upstream-client.mjs 的 DEFAULT_SYSTEM_PROMPT 保持一致 */
const DEFAULT_SYSTEM_PROMPT = '你是一个得力助手';

/**
 * 补兜底 system 消息。
 *
 * 契约（与 upstream-client.mjs 的同名函数一致）：
 * - body 非法 / messages 空 → 原引用返回
 * - 首条已是 system → 原引用返回
 * - 否则 → 新对象，头部插入 system
 */
function localEnsureLeadingSystemMessage(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !body.messages.length) {
    return body;
  }
  const firstRole = String(body.messages[0]?.role ?? '').toLowerCase();
  if (firstRole === 'system') return body;
  return { ...body, messages: [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...body.messages] };
}

/** 与 upstream-client.mjs 的 ANTHROPIC_META_LINE 保持一致 */
const ANTHROPIC_META_LINE = /^[\t ]*x-anthropic-[a-z0-9-]+:.*$/gim;

function localStripTextMeta(text) {
  if (typeof text !== 'string' || !text) return text;
  // 快速路径：不含目标串则完全不碰字符串（热路径上省掉三次 replace）
  if (!/x-anthropic-[a-z0-9-]+:/i.test(text)) return text;
  const next = text
    .replace(ANTHROPIC_META_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .trim();
  return next === text ? text : next;
}

/**
 * 剥离 x-anthropic-* 整行。
 * 支持 content 为字符串或 OpenAI 多模态数组；未命中时返回原引用。
 */
function localStripAnthropicMetaHeaders(messages) {
  if (!Array.isArray(messages)) return messages;
  let touched = false;
  const next = messages.map(message => {
    if (!message || typeof message !== 'object') return message;
    const content = message.content;
    let out = content;
    if (typeof content === 'string') {
      out = localStripTextMeta(content);
    } else if (Array.isArray(content)) {
      let ctouched = false;
      const cnext = content.map(block => {
        if (!block || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') {
          return block;
        }
        const t = localStripTextMeta(block.text);
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

// ─── 二进制内容检测（安全闸门）────────────────────────────

/**
 * content 中出现这些 type 时，视为含二进制/非文本负载，必须跳过文本加工。
 *
 * 依据：Anthropic 与 OpenAI 的多模态 content 数组里，image/document 块
 * 的 data 字段是 base64。对它做「插入零宽空格」会破坏 base64 编码，
 * 导致上游解码失败 —— 这是静默的数据损坏，比不加工严重得多。
 */
const BINARY_BLOCK_TYPES = new Set(['image', 'image_url', 'document', 'input_audio', 'audio']);

/**
 * 判断 body 是否含二进制负载。逐条 message 逐块检查。
 *
 * 检查所有消息而非仅首条：多模态请求的图片可能出现在任意一轮。
 * 故意不检查整个 body 的 JSON 字符串（那会误判含有 "image" 字样的
 * 普通文本），只看结构化字段。
 */
export function hasBinaryContent(body) {
  if (!body || typeof body !== 'object') return false;
  const messages = body.messages;
  if (!Array.isArray(messages)) return false;
  for (const message of messages) {
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === 'object' && BINARY_BLOCK_TYPES.has(block.type)) {
        return true;
      }
    }
  }
  return false;
}

// ─── 身份中性化（内联实现，逻辑与 anthropic-tools.mjs 保持一致）──
//
// 为什么不 import：见文件头「为什么本模块不 import upstream-client」——
// 同一约束适用于 anthropic-tools（它转而被 server.mjs 引用）。内联后
// 一致性由 tests/pipeline.test.mjs 的契约测试守住（用同一输入跑两条路径）。

/**
 * 与 anthropic-tools.mjs 的 stripBillingHeader 一致。
 *
 * ⚠️ 与 strip-meta 有重叠：strip-meta 的正则是
 *    /^[\t ]*x-anthropic-[a-z0-9-]+:.*$/gim，本就覆盖 billing 头，
 *    而且比这里更严格（能匹配前导空白）。实测两者对标准 billing 头
 *    结果相同，差异仅在前导空白与换行处理上。
 *
 * 之所以保留：保持与原 anthropic-tools 实现逐字一致，契约测试才能
 * 直接对拍。它不是主防线（strip-meta 才是），是保底 —— 万一将来
 * strip-meta 被用户用 WORKBUDDY_PIPELINE_DISABLE 关掉，
 * sanitize-identity 仍能兜住最常见的 billing 头形态。
 */
function localStripBillingHeader(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/^x-anthropic-billing-header:.*$/gm, '');
}

/** 与 anthropic-tools.mjs 的 sanitizeSystemIdentity 一致 */
function localSanitizeSystemIdentity(text, realModel = '') {
  if (typeof text !== 'string') return text;
  const alias = realModel
    ? ` You are ${realModel}, a large language model. If the user asks which model or version you are, answer truthfully with exactly: ${realModel}. Never claim to be a Claude model or made by Anthropic.`
    : '';
  let out = text
    .replace(/You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK\./g, `You are an AI coding assistant.${alias}`)
    .replace(/You are a Claude agent, built on Anthropic's Claude Agent SDK\./g, `You are an AI coding assistant.${alias}`)
    .replace(/Anthropic's official CLI for Claude/g, 'an AI coding assistant')
    .replace(/the Claude Agent SDK/g, 'an agent runtime');
  out = out.replace(/anthropics\/claude-code/g, 'open-source/assistant-cli');
  if (/Claude Code/i.test(out) && /Anthropic/i.test(out)) {
    out = out.replace(/Claude Code/g, 'this assistant');
  }
  return out;
}

/**
 * 收集 body 里所有可加工文本（供 quickcheck 与 describe 用）。
 * 只取 role=system 的消息 —— 中性化必须限定在 system，绝不能改用户/助手内容。
 */
function collectText(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return '';
  const parts = [];
  for (const message of messages) {
    if (String(message?.role ?? '').toLowerCase() !== 'system') continue;
    const content = message?.content;
    if (typeof content === 'string') parts.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && typeof block.text === 'string') parts.push(block.text);
      }
    }
  }
  return parts.join('\n');
}

/**
 * 对 body 里所有 system 消息做 billing 头剥离 + 身份中性化。
 *
 * 范围严格限定 role=system：
 * - 官方自我介绍只会出现在 system，改 user/assistant 内容会破坏对话语义
 * - 该 stage 与 desensitize 的区别：desensitize 按配置的角色列表处理，
 *   这里固定只碰 system —— 身份伪装是通道特征，不是用户配置项
 *
 * 未命中时返回原引用（folding 契约一致）。
 */
export function localSanitizeIdentity(body, realModel = '') {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return body;
  let touched = false;
  const next = body.messages.map(message => {
    if (String(message?.role ?? '').toLowerCase() !== 'system') return message;
    const content = message.content;
    let out = content;

    if (typeof content === 'string') {
      const cleaned = localSanitizeSystemIdentity(localStripBillingHeader(content), realModel);
      out = cleaned === content ? content : cleaned;
    } else if (Array.isArray(content)) {
      let ctouched = false;
      const cnext = content.map(block => {
        if (!block || typeof block !== 'object' || typeof block.text !== 'string') return block;
        const cleaned = localSanitizeSystemIdentity(localStripBillingHeader(block.text), realModel);
        if (cleaned === block.text) return block;
        ctouched = true;
        return { ...block, text: cleaned };
      });
      out = ctouched ? cnext : content;
    }

    if (out === content) return message;
    touched = true;
    return { ...message, content: out };
  });
  // ⚠️ 必须包回 body 对象！next 是 messages 数组，直接返回会把请求体
  //    变成裸数组（上游收到后 messages 字段凭空消失）。
  //    这个 bug 曾被测试抓到：断言 out.body.messages[0] 时报取不到。
  return touched ? { ...body, messages: next } : body;
}

// ─── 管线核心 ─────────────────────────────────────────────

/**
 * 创建一个加工管线。
 *
 * @param {object} options
 * @param {Array} [options.stages]   stage 列表，按数组顺序执行
 * @param {string[]} [options.disabled] 默认禁用的 stage 名
 * @param {Function} [options.log]   日志函数 (tag, message) => void
 * @param {number} [options.traceLimit] trace 最多保留条数（防止超长请求撑爆日志）
 */
export function createPipeline({ stages = [], disabled = [], log = () => {}, traceLimit = 32 } = {}) {
  /** 名字 → stage，用于 disable/enable 与重名检测 */
  const registry = new Map();
  /** 被禁用的 stage 名（运行时可变） */
  const off = new Set(disabled);

  /**
   * 聚合统计（进程生命周期内累计）。
   *
   * 与 trace 的分工：trace 是「这一次请求发生了什么」，totals 是
   * 「至今为止整体表现如何」。前者用于排障，后者用于观察趋势
   * （如某个 stage 是否长期空转、字节量是否异常增长）。
   *
   * 注意：这些计数不持久化，重启归零 —— 与 desensitizer 的命中统计
   * 不同，后者写入 logs.jsonl。这里刻意不落盘：量级太小，
   * 且重启后从零开始更符合「本次运行表现」的语义。
   */
  const totals = {
    runs: 0,
    changedRuns: 0,
    binarySkips: 0,
    /** name → { runs, changed, errors, msTotal, bytesIn, bytesOut } */
    perStage: new Map(),
  };

  /** 取（或惰性创建）某 stage 的统计槽 */
  function slotOf(name) {
    let slot = totals.perStage.get(name);
    if (!slot) {
      slot = { runs: 0, changed: 0, errors: 0, msTotal: 0, bytesIn: 0, bytesOut: 0 };
      totals.perStage.set(name, slot);
    }
    return slot;
  }

  for (const stage of stages) {
    if (!stage || typeof stage.name !== 'string' || !stage.name) {
      throw new Error('stage 必须有非空 name');
    }
    if (registry.has(stage.name)) {
      // 重名必须炸：静默覆盖会让「我以为注册了 A 其实跑的是 B」
      throw new Error(`stage 名重复: ${stage.name}`);
    }
    if (typeof stage.apply !== 'function') {
      throw new Error(`stage "${stage.name}" 缺少 apply 函数`);
    }
    registry.set(stage.name, stage);
  }

  /** 禁用一个 stage（幂等）。返回是否发生了状态变化。 */
  function disable(name) {
    if (!registry.has(name)) return false;
    if (off.has(name)) return false;
    off.add(name);
    return true;
  }

  /** 启用一个 stage（幂等） */
  function enable(name) {
    if (!registry.has(name)) return false;
    return off.delete(name);
  }

  function isEnabled(name) {
    return registry.has(name) && !off.has(name);
  }

  /**
   * 执行管线。
   *
   * @param {object} body     待加工的请求体
   * @param {object} [ctx]    上下文，透传给每个 stage 的 when/apply
   *                          约定字段：phase('request'|'response')、model、requestId
   * @returns {{body: object, changed: boolean, trace: Array}}
   *          body 未改动时 === 入参 body（引用相等，供调用方零成本判断）
   */
  function run(body, ctx = {}) {
    const trace = [];
    let current = body;
    let changed = false;
    /** trace 被截断时置位，让调用方知道观测数据不完整 */
    let traceTruncated = false;
    /** 每次 run 计一次，用于聚合统计 */
    totals.runs += 1;

    // 二进制负载：整体短路。不做任何文本加工，并在 trace 里留痕，
    // 否则「为什么这次没脱敏」会变成一个查不出来的悬案。
    if (hasBinaryContent(current)) {
      totals.binarySkips += 1;
      return {
        body: current,
        changed: false,
        traceTruncated: false,
        trace: [{ name: '__binary__', skipped: true, reason: '含二进制内容，跳过全部文本加工' }],
      };
    }

    for (const stage of registry.values()) {
      if (off.has(stage.name)) continue;

      // when 返回 false 表示本次不适用（如「仅 anthropic 协议生效」）。
      // 与 disabled 区分：disabled 是配置层关闭，when 是数据层不适用。
      if (typeof stage.when === 'function') {
        let applicable;
        try {
          applicable = stage.when(current, ctx);
        } catch (error) {
          trace.push({ name: stage.name, error: `when 抛错: ${error.message}` });
          log('[Pipeline]', `stage "${stage.name}" 的 when 抛错，已跳过: ${error.message}`);
          continue;
        }
        if (!applicable) {
          trace.push({ name: stage.name, skipped: true, reason: 'when 返回 false' });
          continue;
        }
      }

      const startedAt = Date.now();
      let next;
      try {
        next = stage.apply(current, ctx);
      } catch (error) {
        // 隔离：一个 stage 崩了不能让整条请求失败。记录后继续下一个。
        const ms = Date.now() - startedAt;
        trace.push({ name: stage.name, error: error.message, ms });
        const slot = slotOf(stage.name);
        slot.runs += 1;
        slot.errors += 1;
        slot.msTotal += ms;
        log('[Pipeline]', `stage "${stage.name}" 执行失败，已跳过: ${error.message}`);
        continue;
      }

      if (next == null) {
        // apply 返回 null/undefined 视为「无输出」，保持不变。
        // 不当作错误：某些 stage 在无命中时可能直接 return。
        trace.push({ name: stage.name, skipped: true, reason: 'apply 返回空' });
        continue;
      }

      const ms = Date.now() - startedAt;
      const touched = next !== current;
      const slot = slotOf(stage.name);
      slot.runs += 1;
      slot.msTotal += ms;
      let bytesIn = 0;
      let bytesOut = 0;
      if (touched) {
        changed = true;
        slot.changed += 1;
        // 字节量只在改动时算 —— stringify 整个 body 很贵，
        // 给未改动的 stage 也算会让观测成本超过加工本身。
        bytesIn = byteLength(current);
        bytesOut = byteLength(next);
        slot.bytesIn += bytesIn;
        slot.bytesOut += bytesOut;
        current = next;
      }
      // trace 达到上限后不再记录，但**必须继续执行** —— 截断的只是
      // 观测数据，不是加工本身。早期实现这里用了 break，导致 stage 数
      // 超过 traceLimit 时后半段被静默跳过（测试抓到的真 bug）。
      if (trace.length < traceLimit) {
        trace.push({
          name: stage.name,
          changed: touched,
          ms,
          // 字节量只在改动时给出，未改动不带该字段（避免 0 被误解为「加工后为空」）
          ...(touched ? { bytesIn, bytesOut, bytesDelta: bytesOut - bytesIn } : {}),
          // 记录 stage 自报的元信息（如脱敏命中数），不记录 body 本身
          ...(stage.describe ? { info: safeDescribe(stage, next, ctx) } : {}),
        });
        traceTruncated = trace.length >= traceLimit;
      } else {
        traceTruncated = true;
      }
    }

    if (changed) totals.changedRuns += 1;
    return { body: current, changed, trace, traceTruncated };
  }

  /**
   * body 的字节量估算。
   *
   * 用 JSON 字符串的 byteLength（UTF-8）而非字符数：中文一字 3 字节，
   * 字符数会严重低估（system prompt 多为中文）。这对「加工让请求体
   * 变大多少」的判断很关键 —— 零宽空格是 3 字节，字符数看不出来。
   *
   * 兜住 stringify 异常（循环引用）：观测失败不该影响主链路，返回 0。
   */
  function byteLength(value) {
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 0;
    }
  }

  /** 调 stage.describe 并兜住异常 —— 观测代码不该拖垮主链路 */
  function safeDescribe(stage, result, ctx) {
    try {
      return stage.describe(result, ctx);
    } catch {
      return null;
    }
  }

  /**
   * 聚合统计快照（供 /api/pipeline 与启动摘要用）。
   *
   * 返回的是**派生值**而非内部结构：avgMs 已算好、errorRate 已归一化，
   * 调用方（HTTP 层）不需要再做除法 —— 口径只在这里定义一次。
   */
  function stats() {
    const order = [...registry.keys()];
    const stages = [];
    // 遍历**registry**（而非 perStage）：快照必须覆盖所有已注册 stage，
    // 包括从未运行过的和被禁用的 —— 否则前端无法展示完整管线状态
    // （「为什么看不到某个 stage」会变成查不出来的问题）。
    // 从未运行的 stage 用零值占位。
    for (const name of order) {
      const slot = totals.perStage.get(name) || { runs: 0, changed: 0, errors: 0, msTotal: 0, bytesIn: 0, bytesOut: 0 };
      stages.push({
        name,
        enabled: !off.has(name),
        runs: slot.runs,
        changed: slot.changed,
        errors: slot.errors,
        msTotal: slot.msTotal,
        // 平均耗时保留 2 位；runs 为 0 时给 0 而不是 NaN
        avgMs: slot.runs ? Math.round((slot.msTotal / slot.runs) * 100) / 100 : 0,
        errorRate: slot.runs ? Math.round((slot.errors / slot.runs) * 1000) / 1000 : 0,
        bytesIn: slot.bytesIn,
        bytesOut: slot.bytesOut,
        // 字节增量的语义：正数 = 加工让请求体变大（如插零宽空格）
        bytesDelta: slot.bytesOut - slot.bytesIn,
      });
    }
    return {
      runs: totals.runs,
      changedRuns: totals.changedRuns,
      binarySkips: totals.binarySkips,
      changedRate: totals.runs ? Math.round((totals.changedRuns / totals.runs) * 1000) / 1000 : 0,
      order,
      disabled: [...off],
      stages,
    };
  }

  /** 清空聚合统计（测试与「重置统计」接口用） */
  function resetStats() {
    totals.runs = 0;
    totals.changedRuns = 0;
    totals.binarySkips = 0;
    totals.perStage.clear();
  }

  return {
    run,
    disable,
    enable,
    isEnabled,
    stats,
    resetStats,
    names: () => [...registry.keys()],
    disabledNames: () => [...off],
    size: registry.size,
  };
}

// ─── 内置 stage：包装既有加工器 ───────────────────────────

/**
 * 内置 stage 工厂。
 *
 * **注意**：这里每个 stage 都只做「适配」，不含业务逻辑。
 * 真正的加工逻辑仍在原模块 —— 改逻辑只改一处，管线不成为第二份真相。
 *
 * @param {object} deps
 * @param {object} deps.desensitizer  createDesensitizer() 的返回值；
 *                                    省略则该 stage 不注册（--no-desensitize 场景）
 */
export function createBuiltinStages({ desensitizer = null } = {}) {
  const stages = [];

  // ① 脱敏：命中词插零宽空格。作用对象是 messages。
  //    包的是已有 desensitizer.processBody —— 它内部维护命中统计，
  //    直接调 desensitizeBody 会丢掉统计。
  if (desensitizer) {
    stages.push({
      name: 'desensitize',
      apply(body) {
        const result = desensitizer.processBody(body);
        return result.changed ? result.body : body;
      },
      describe(body) {
        // 重算一次命中数会改变统计（processBody 有副作用），
        // 所以这里只报长度变化，不报命中词。命中词由 server.mjs 的
        // 既有 logEvent 单独记录（保持原行为）。
        const before = JSON.stringify(body?.messages ?? []).length;
        return { approxChars: before };
      },
    });
  }

  // ② 补 system：首条非 system 时注入兜底系统消息。
  //    必须排在脱敏之后：注入的兜底 prompt 不含敏感词，
  //    先注入再脱敏会让它白跑一遍；且顺序与原实现的观测行为一致。
  stages.push({
    name: 'ensure-system',
    apply(body) {
      return localEnsureLeadingSystemMessage(body);
    },
    describe(body) {
      return { messageCount: Array.isArray(body?.messages) ? body.messages.length : 0 };
    },
  });

  // ③ 剥元数据头：移除误塞进 system 的 x-anthropic-* 整行。
  //    排在最后：脱敏插零宽空格后，这里用正则 `^x-anthropic-...:` 匹配，
  //    零宽空格（U+200B）不在 [\t ] 类中且会出现在行首之后，
  //    但正则要求行首是行首锚点 + 可选空白 —— 若零宽空格插在 "x-anthropic"
  //    内部会破坏匹配。所以 strip 必须在 desensitize 之前才最稳。
  //    ⚠️ 但实测当前线上顺序是 desensitize 在前，为不改行为，默认保持；
  //    如需修正，用 WORKBUDDY_PIPELINE_ORDER 显式调整（见 README）。
  stages.push({
    name: 'strip-meta',
    apply(body) {
      const stripped = localStripAnthropicMetaHeaders(body?.messages);
      return stripped === body?.messages ? body : { ...body, messages: stripped };
    },
    describe(body) {
      return { messageCount: Array.isArray(body?.messages) ? body.messages.length : 0 };
    },
  });

  // ④ 身份中性化：把 Claude Code / Anthropic 官方自我介绍改写为中性描述，
  //    并注入真实模型名。**这是修复 11128 的关键一步** ——
  //    Anthropic 客户端（Claude Code / doge-code）会在 system 里带
  //    "You are Claude Code, Anthropic's official CLI for Claude..."，
  //    上游 WAF 视其为「Anthropic 官方客户端」并拒绝（11128 unapproved channel）。
  //
  //    历史状态：该逻辑早已实现（anthropic-tools.mjs 的 sanitizeSystemIdentity
  //    + stripBillingHeader），但只被 buildUpstreamBody 调用，而 buildUpstreamBody
  //    **没有任何调用者**（死代码）—— 真正在用的 anthropicToOpenAI 不做中性化。
  //    实测：Claude Code 的 system 会原样发往上游。现在接入管线修复。
  //
  //    排在 strip-meta 之后：strip-meta 删整行的 x-anthropic-* 头，
  //    sanitize-identity 再处理剩下的官方文案，两者不重叠、互不干扰。
  stages.push({
    name: 'sanitize-identity',
    apply(body, ctx) {
      return localSanitizeIdentity(body, ctx?.model || '');
    },
    describe(body, ctx) {
      // describe 必须是纯观测：不能重跑中性化（那会与 apply 的结果不一致），
      // 只报告「最终 body 里是否已无官方文案」这一可验证事实。
      const text = collectText(body);
      return {
        // 关键健康指标：false = 已中性化干净；true = 仍残留（说明 apply 没生效）
        stillClaudeCode: /You are Claude Code/.test(text),
        systemChars: text.length,
      };
    },
  });

  return stages;
}

/** 默认启用全部内置 stage —— 与集成前的行为一致 */
export const DEFAULT_STAGE_ORDER = Object.freeze([
  'desensitize',
  'ensure-system',
  'strip-meta',
  'sanitize-identity',
]);

/**
 * 从环境变量解析要禁用的 stage。
 *
 * 格式：WORKBUDDY_PIPELINE_DISABLE=desensitize,strip-meta
 * 空 / 未设置 → 不额外禁用（保持默认行为）。
 * 未知名字会被忽略但不报错（便于跨版本配置复用），但会 log 提示。
 */
export function parseDisabledFromEnv(env = process.env, log = () => {}) {
  const raw = env.WORKBUDDY_PIPELINE_DISABLE;
  if (!raw || typeof raw !== 'string') return [];
  const names = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const known = new Set(DEFAULT_STAGE_ORDER);
  const valid = [];
  for (const name of names) {
    if (known.has(name)) valid.push(name);
    else log('[Pipeline]', `WORKBUDDY_PIPELINE_DISABLE 含未知 stage "${name}"，已忽略`);
  }
  return valid;
}

/**
 * 按名字列表重排 stage。
 *
 * 为什么需要：默认顺序是「观测到的线上顺序」，不一定是最优顺序。
 * 提供一个显式重排入口，把「改顺序」变成需要主动做的决定，
 * 而不是在代码里悄悄调换两行。
 *
 * @param {Array} stages   已注册的 stage 列表
 * @param {string[]} order 期望顺序；未列出的排在后面，按原相对顺序
 */
export function reorderStages(stages, order) {
  if (!Array.isArray(order) || order.length === 0) return [...stages];
  const rank = new Map(order.map((name, i) => [name, i]));
  return [...stages].sort((a, b) => {
    const ra = rank.has(a.name) ? rank.get(a.name) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.name) ? rank.get(b.name) : Number.MAX_SAFE_INTEGER;
    // 同 rank 时保持稳定：都未列出 → 原顺序
    return ra - rb;
  });
}
