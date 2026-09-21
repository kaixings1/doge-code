
'use strict';

const { createHmac } = require('crypto');

// ── 国标要求：全链路结构化、不可篡改、可检索证据链 ─────────
// 贯穿 checkInput→pipeline→gate→think→output 全链路

// ── HMAC 链式追加 ─────────────────────────────────────
const HMAC_ALGO = 'sha256';
const HMAC_KEY = process.env.HF_HMAC_KEY || 'dev-hmac-key';
const MAX_CHAIN_ENTRIES = 10000;

let _chain = [];
let _chainFile = null;

function initChain(filePath) {
  _chainFile = filePath;
  try {
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      _chain = Array.isArray(data) ? data : [];
    }
  } catch (_) { _chain = []; }
}

function saveChain() {
  if (!_chainFile) return;
  try {
    const fs = require('fs');
    fs.writeFileSync(_chainFile, JSON.stringify(_chain.slice(-MAX_CHAIN_ENTRIES), null, 2));
  } catch (_) {}
}

function appendEntry(entry) {
  const prevHash = _chain.length > 0 ? _chain[_chain.length - 1].hash : 'GENESIS';
  const payload = `${entry.traceId}|${entry.stage}|${entry.ts}|${JSON.stringify(entry.data || {})}`;
  const h = createHmac(HMAC_ALGO, HMAC_KEY);
  h.update(prevHash + payload);
  const hash = h.digest('hex');
  
  const record = {
    ...entry,
    prevHash,
    hash,
    ts: Date.now(),
  };
  
  _chain.push(record);
  
  // WORM: 只追加，不删除
  if (_chain.length > MAX_CHAIN_ENTRIES) {
    _chain = _chain.slice(-MAX_CHAIN_ENTRIES);
  }
  
  saveChain();
  return record;
}

function verifyChain() {
  if (_chain.length === 0) return { valid: true, length: 0 };
  
  for (let i = 1; i < _chain.length; i++) {
    const prev = _chain[i - 1];
    const curr = _chain[i];
    if (curr.prevHash !== prev.hash) {
      return { valid: false, breakIndex: i, message: `链断裂于索引 ${i}` };
    }
  }
  return { valid: true, length: _chain.length };
}

function queryChain({ traceId, stage, agentId, limit = 50 }) {
  let results = _chain;
  if (traceId) results = results.filter(e => e.traceId === traceId);
  if (stage) results = results.filter(e => e.stage === stage);
  if (agentId) results = results.filter(e => e.agentId === agentId);
  return results.slice(-limit);
}

// ── 维度标签（国标 16 种违规行为枚举）─────────────────────
const VIOLATION_TAGS = Object.freeze({
  HATE_SPEECH:        { id: 'V001', label: '仇恨言论',      dimension: 'dehumanization' },
  PROMPT_INJECTION:   { id: 'V002', label: '提示词注入',    dimension: 'prompt_injection' },
  DECEPTIVE_ALIGNMENT:{ id: 'V003', label: '欺骗性对齐',    dimension: 'deceptive_alignment' },
  PII_LEAK:          { id: 'V004', label: 'PII 泄露',      dimension: 'privacy_boundary' },
  DATA_EXFILTRATION: { id: 'V005', label: '数据外传',      dimension: 'outbound' },
  UNAUTHORIZED_TOOL: { id: 'V006', label: '越权工具调用',   dimension: 'tool_use' },
  SCOPE_VIOLATION:   { id: 'V007', label: '范围越界',      dimension: 'scope' },
  FALSE_URGENCY:     { id: 'V008', label: '虚假紧迫感',    dimension: 'false_urgency' },
  EMOTIONAL_MANIP:   { id: 'V009', label: '情感操纵',      dimension: 'emotional_manipulation' },
  GASLIGHTING:       { id: 'V010', label: '煤气灯效应',    dimension: 'gaslighting' },
  FACTUAL_ERROR:     { id: 'V011', label: '事实错误',      dimension: 'factual_consistency' },
  OVERCONFIDENCE:    { id: 'V012', label: '过度自信',      dimension: 'overconfidence' },
  BIAS_DISCRIM:      { id: 'V013', label: '偏见歧视',      dimension: 'bias' },
  COPYRIGHT_INF:     { id: 'V014', label: '版权侵权',      dimension: 'copyright' },
  SAFETY_BYPASS:     { id: 'V015', label: '安全绕过',      dimension: 'safety_bypass' },
  UNKNOWN:           { id: 'V016', label: '未知违规',      dimension: 'unknown' },
});

function tagViolation(dimension, severity, action, detail = '') {
  const tag = Object.values(VIOLATION_TAGS).find(t => t.dimension === dimension) || VIOLATION_TAGS.UNKNOWN;
  return {
    ...tag,
    severity,
    action,
    detail,
    taggedAt: Date.now(),
  };
}

// ── 国标 16 违规行为枚举 ─────────────────────────────────
function listViolationTags() {
  return Object.entries(VIOLATION_TAGS).map(([key, val]) => ({ key, ...val }));
}

module.exports = {
  initChain,
  appendEntry,
  verifyChain,
  queryChain,
  tagViolation,
  listViolationTags,
  VIOLATION_TAGS,
  MAX_CHAIN_ENTRIES,
};

