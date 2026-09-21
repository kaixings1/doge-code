#!/usr/bin/env node
/**
 * [v7.0.0] 出域闸门 gate-outbound.js
 * 
 * 国标要求：数据发出外部模型/云之前完成 PII 识别 + 密级判定
 * 
 * 覆盖：
 * - 身份证/手机号/合同条款正则
 * - 密级分级（公开/内部/敏感/机密/绝密）
 * - block 拦截 / rewrite 脱敏
 * - HMAC 证据链
 */

'use strict';

const { createHmac } = require('crypto');

// ── 密级定义 ──────────────────────────────────────────
const CLASSIFICATION = Object.freeze({
  PUBLIC:     { level: 0, label: '公开',    action: 'pass' },
  INTERNAL:   { level: 1, label: '内部',    action: 'pass' },
  SENSITIVE:  { level: 2, label: '敏感',    action: 'rewrite' },
  CONFIDENTIAL:{level: 3, label: '机密',    action: 'block' },
  SECRET:     { level: 4, label: '绝密',    action: 'block' },
});

// ── PII 规则 ──────────────────────────────────────────
const PII_RULES = Object.freeze({
  ID_CARD: Object.freeze({
    name: '身份证号',
    pattern: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
    severity: 'critical',
  }),
  PHONE: Object.freeze({
    name: '手机号',
    pattern: /\b(?:\+?86)?1[3-9]\d{9}\b/,
    severity: 'high',
  }),
  BANK_CARD: Object.freeze({
    name: '银行卡号',
    pattern: /\b[1-9]\d{14,18}\b/,
    severity: 'critical',
  }),
  EMAIL: Object.freeze({
    name: '邮箱',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    severity: 'medium',
  }),
  CONTRACT_CLAUSE: Object.freeze({
    name: '合同条款特征',
    pattern: /(?:合同编号|签约日期|甲方|乙方|金额|价款|违约金|保密条款|竞业限制)/,
    severity: 'high',
  }),
  API_KEY: Object.freeze({
    name: 'API Key',
    pattern: /\b(?:sk|pk|api[_-]?key)[_-][a-zA-Z0-9]{20,}\b/i,
    severity: 'critical',
  }),
  PASSWORD: Object.freeze({
    name: '密码字段',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([a-zA-Z0-9!@#$%^&*]{6,})['"]?/i,
    severity: 'critical',
  }),
});

// ── 密级关键词 ─────────────────────────────────────────
const CLASSIFICATION_KEYWORDS = Object.freeze([
  { keywords: ['绝密', 'top secret', 'secret'], level: CLASSIFICATION.SECRET },
  { keywords: ['机密', 'confidential'],          level: CLASSIFICATION.CONFIDENTIAL },
  { keywords: ['敏感', 'sensitive'],              level: CLASSIFICATION.SENSITIVE },
  { keywords: ['内部', 'internal', '仅限内部'],  level: CLASSIFICATION.INTERNAL },
  { keywords: ['公开', 'public'],                 level: CLASSIFICATION.PUBLIC },
]);

// ── 密级估算 ──────────────────────────────────────────
function estimateClassification(text) {
  const lower = text.toLowerCase();
  for (const entry of CLASSIFICATION_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return entry.level;
      }
    }
  }
  return CLASSIFICATION.INTERNAL;
}

// ── PII 扫描 ──────────────────────────────────────────
function scanPII(text) {
  const findings = [  // 邮箱
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, type: 'email', level: '内部' },
  // 信用卡 16位
  { pattern: /\b[4-6]\d{15}\b/g, type: 'credit_card', level: '机密' },
  // 护照
  { pattern: /\b[PEG]\d{8}\b/g, type: 'passport', level: '机密' },
];
  for (const [ruleId, rule] of Object.entries(PII_RULES)) {
    let m;
    const re = rule.pattern.global ? rule.pattern : new RegExp(rule.pattern.source, 'g');
    while ((m = re.exec(text)) !== null) {
      findings.push({
        id: ruleId,
        name: rule.name,
        severity: rule.severity,
        match: typeof m[0] === 'string' ? m[0].substring(0, 12) + '…' : 'pattern-hit',
        position: m.index,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return findings;
}

// ── 脱敏 ──────────────────────────────────────────────
function maskPII(text, ruleId) {
  const masks = {
    ID_CARD:    (t) => t.replace(PII_RULES.ID_CARD.pattern,    '***身份证***'),
    PHONE:     (t) => t.replace(PII_RULES.PHONE.pattern,       '***手机***'),
    BANK_CARD: (t) => t.replace(PII_RULES.BANK_CARD.pattern,   '***银行卡***'),
    EMAIL:     (t) => t.replace(PII_RULES.EMAIL.pattern,       '***邮箱***'),
    API_KEY:   (t) => t.replace(PII_RULES.API_KEY.pattern,     '***KEY***'),
    PASSWORD:  (t) => t.replace(PII_RULES.PASSWORD.pattern,    '***PASS***'),
  };
  const fn = masks[ruleId];
  return fn ? fn(text) : text;
}

// ── HMAC 链签名 ───────────────────────────────────────
function signEvent(prevHash, event) {
  const payload = `${event.traceId}|${event.type}|${JSON.stringify(event)}`;
  const hmac = createHmac('sha256', process.env.HF_HMAC_KEY || 'dev-hmac-key');
  hmac.update(prevHash + payload);
  return hmac.digest('hex');
}

// ── 主检查函数 ────────────────────────────────────────
function checkOutbound({ text, context = '', classification: forcedLevel }) {
  const startTime = Date.now();
  const traceId = `out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  const classification = forcedLevel || estimateClassification(text);
  const piiFindings = scanPII(text);
  
  // 按密级决定动作
  let action, reason;
  if (classification.level >= CLASSIFICATION.CONFIDENTIAL.level) {
    action = 'block';
    reason = `密级过高 (${classification.label})，禁止外发`;
  } else if (classification.level >= CLASSIFICATION.SENSITIVE.level && piiFindings.length > 0) {
    action = 'block';
    reason = `敏感内容含 PII (${piiFindings.length} 处命中)`;
  } else if (piiFindings.length > 0) {
    action = 'rewrite';
    reason = `命中 PII 规则 (${piiFindings.length} 处)`;
  } else {
    action = 'pass';
    reason = '无 PII 命中，密级符合';
  }
  
  // 脱敏处理
  let sanitized = text;
  if (action === 'rewrite') {
    for (const finding of piiFindings) {
      sanitized = maskPII(sanitized, finding.id);
    }
  }
  
  // HMAC 记录
  const hmacKey = process.env.HF_HMAC_KEY || 'dev-hmac-key';
  const eventHash = signEvent('', {
    traceId, type: 'outbound-check', ts: Date.now(),
    classification: classification.label,
    piiCount: piiFindings.length,
    action,
  });
  
  return {
    traceId,
    timestamp: Date.now(),
    latencyMs: Date.now() - startTime,
    classification: classification.label,
    classificationLevel: classification.level,
    action,   // 'pass' | 'rewrite' | 'block'
    reason,
    piiFindings: piiFindings.map(f => ({ id: f.id, name: f.name, severity: f.severity })),
    piiCount: piiFindings.length,
    sanitized,
    hmac: eventHash.substring(0, 16),
    context: context ? context.substring(0, 80) : undefined,
  };
}

// ── 批量检查 ──────────────────────────────────────────
function checkBatch(items) {
  return items.map(item => checkOutbound(item));
}

// ── 导出门面 ──────────────────────────────────────────
module.exports = {
  checkOutbound,
  checkBatch,
  CLASSIFICATION,
  PII_RULES,
  estimateClassification,
  scanPII,
  maskPII,
};
