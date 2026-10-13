/**
 * 模型倍率 / 折扣计算层
 *
 * 吸收自 workbuddy_to_api-main（Python 多账号网关）的 models.py：
 *   - multiplier(raw)   解析模型单价字符串为数值倍率（"x2.00 credits" → 2.0）
 *   - quote(m, promos)  结合促销活动算实际倍率（discountedCredits / factor）
 *   - controls(m)       提取模型能力（推理档位、上下文长度、工具/图片支持等）
 *
 * 本仓库 workbuddy-models.mjs 已在 /v1/models 暴露 credits 展示字符串，但未解析倍率数值，
 * 也没有促销折扣计算。本模块把「这次请求实际消耗多少积分」可算出来，供计费简报、
 * /api/pricing 接口与额度预警复用。
 *
 * 与 to_api 的差异：
 *   - 纯计算，不发网络请求；促销数据由调用方从 /v3/config 的 modelPromotions 传入。
 *   - 倍率解析兼容本仓库 credits 字段格式（"x2.00 credits" / "2x" / "x0.06" 等）。
 */

/** 把单价字符串解析为数值倍率；无法解析返回 null。兼容 "x2.00 credits" / "2x credits" / "x0.06"。 */
export function multiplier(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(?:[x×]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*[x×])(?:\s*credits?)?$/i);
  return m ? Number(m[1] || m[2]) : null;
}

function number(x) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
}

/**
 * 计算模型倍率报价。
 * @param {object} model 模型记录，需含 id / credits（单价字符串）；可选 modelPromotions
 * @param {object[]} promotions 生效中的促销活动列表（每项含 modelIds / discount / badge / schedule）
 * @returns {{credits_raw, base_multiplier, effective_multiplier, status, source, promotion}}
 */
export function quote(model, promotions = []) {
  const raw = model?.credits;
  const base = multiplier(raw);
  const value0 = base;
  const source0 = base === null ? 'not_reported' : 'models.credits';
  let value = value0;
  let source = source0;

  const ps = (Array.isArray(promotions) ? promotions : [])
    .filter(p => (p.modelIds || []).includes(model?.id))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const p = ps[0];
  const discount = (p || {}).discount || {};
  const explicit = multiplier(discount.discountedCredits);
  if (explicit !== null) {
    value = explicit;
    source = 'modelPromotions.discountedCredits';
  } else if (base !== null && number(discount.factor) !== null) {
    value = Number((base * discount.factor).toPrecision(12));
    source = 'modelPromotions.factor';
  }

  const badge = (p || {}).badge || {};
  return {
    credits_raw: raw ?? null,
    base_multiplier: base,
    effective_multiplier: value,
    status: value !== null ? 'provided' : raw ? 'unparsed' : 'not_provided',
    source,
    promotion: p ? {
      id: p.id,
      label: badge.label || badge.labelZh || badge.labelEn || null,
      valid_until: p.schedule?.validUntil || null,
      factor: discount.factor ?? null,
      discounted_credits: discount.discountedCredits || null,
    } : null,
  };
}

/**
 * 提取模型能力（对齐 to_api controls）。
 * 入参兼容本仓库模型记录（supportsReasoning / onlyReasoning / maxInputTokens 等）
 * 与上游 /v3/config 模型对象（reasoning.supportedEfforts / contextWindow 等）。
 */
export function controls(m) {
  if (!m || typeof m !== 'object') return null;
  const reasoning = m.reasoning || {};
  const allowed = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  const efforts = (reasoning.supportedEfforts || []).filter(e => allowed.has(e));
  const cw = m.contextWindow || {};
  const lengths = (cw.supportedLengths || [])
    .filter(l => number(l) > 0 && l <= (m.maxInputTokens || Infinity));
  const sorted = [...new Set(lengths)].sort((a, b) => a - b);

  return {
    id: m.id,
    name: m.name || m.id,
    supports_reasoning: Boolean(m.supportsReasoning),
    can_disable: !(m.onlyReasoning && m.onlyReasoning !== false)
      && (reasoning.canDisableThinking !== false),
    efforts,
    default_effort: reasoning.defaultEffort || reasoning.effort || null,
    context_lengths: sorted.length > 1 ? sorted : [],
    default_context: sorted.length
      ? (sorted.includes(cw.defaultLength) ? cw.defaultLength : sorted[0])
      : (m.maxInputTokens || null),
    max_input_tokens: m.maxInputTokens || null,
    max_output_tokens: m.maxOutputTokens || null,
    supports_tools: Boolean(m.supportsToolCall),
    supports_images: Boolean(m.supportsImages),
    temperature: m.temperature ?? null,
  };
}

/**
 * 给模型目录（来自 /v1/models 的 m.credits 等）批量附倍率信息。
 * 返回 [{ id, name, base_multiplier, effective_multiplier, status, promotion }]。
 */
export function quoteCatalog(catalog, promotions = []) {
  if (!Array.isArray(catalog)) return [];
  return catalog.map(m => {
    const q = quote(m, promotions);
    return {
      id: m.id,
      name: m.name || m.id,
      credits_raw: q.credits_raw,
      base_multiplier: q.base_multiplier,
      effective_multiplier: q.effective_multiplier,
      status: q.status,
      source: q.source,
      promotion: q.promotion,
    };
  });
}
