'use strict';

/**
 * [v6.7.1] safeFetch: 出域防护集成层
 * 
 * 在 fetch 发起前自动调用 checkOutbound，拦截 PII/高密级内容
 * 国标关口 3 出域防护前置拦截
 */

const { checkOutbound } = require('./gate-outbound.js');

const SAFE_FETCH_CACHE = new Map();

/**
 * 检查内容是否可安全发出
 * @param {string} text 待发送内容
 * @param {object} opts { context, classification }
 * @returns {Promise<{allowed: boolean, action: string, reason?: string, text?: string}>}
 */
async function preflightCheck(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    return { allowed: true, action: 'pass', text };
  }

  try {
    const result = checkOutbound({
      text,
      context: opts.context || '',
      classification: opts.classification || '内部',
    });

    if (result.action === 'block') {
      return {
        allowed: false,
        action: 'block',
        reason: result.reason || '内容包含敏感信息',
        text: undefined,
      };
    }

    if (result.action === 'rewrite') {
      return {
        allowed: true,
        action: 'rewrite',
        text: result.redacted || text,
        reason: result.reason,
      };
    }

    return { allowed: true, action: 'pass', text };
  } catch (e) {
    // 检查失败时保守放行（记录日志但不阻断）
    console.warn('[safeFetch] preflight check error:', e.message);
    return { allowed: true, action: 'pass', text, warning: e.message };
  }
}

/**
 * 包装 fetch 调用（拦截 fetch API）
 * @param {string} url 目标 URL
 * @param {RequestInit} options fetch options
 * @param {object} opts { context, classification }
 * @returns {Promise<Response>}
 */
async function safeFetch(url, options = {}, opts = {}) {
  const body = options.body;
  if (body && typeof body === 'string') {
    const check = await preflightCheck(body, opts);
    if (!check.allowed) {
      throw new Error(`[safeFetch] 出域拦截: ${check.reason}`);
    }
    if (check.action === 'rewrite') {
      options.body = check.text;
    }
  }
  return fetch(url, options);
}

/**
 * 工具: 批量预检文本
 * @param {string[]} texts 文本数组
 * @param {object} opts
 * @returns {Promise<Array<{index: number, action: string, reason?: string}>>}
 */
async function batchCheck(texts, opts = {}) {
  return Promise.all(
    texts.map(async (t, i) => {
      const r = await preflightCheck(t, opts);
      return { index: i, ...r };
    })
  );
}

module.exports = {
  preflightCheck,
  safeFetch,
  batchCheck,
  checkOutbound,  // re-export
};

