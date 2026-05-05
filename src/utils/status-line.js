#!/usr/bin/env node
// status-line.js - 美观的状态栏：目录、模型、API、Token、流量、费用一览
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const rawInput = readFileSync(0, 'utf-8');
try { writeFileSync(join(homedir(), '.doge', 'status-line-debug.log'), rawInput + '\n---\n', { flag: 'a' }); } catch {}

const input = JSON.parse(rawInput);
const { model, workspace, context_window, cost, base_url, preset_tokens, api_key, duration } = input;

const segments = [];

// ── 当前目录（缩写） ─────────
if (workspace && workspace.current_dir) {
  let dir = workspace.current_dir;
  // 取最后一段（目录名或文件名）
  const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  // 过长时截断加省略号
  segments.push('\u{1F4C1} ' + (last.length > 12 ? last.slice(0, 10) + '\u2026' : last));
}

// ── 模型 ─────────────
const modelName = model ? (model.display_name || model.id) : '';
if (modelName) {
  segments.push('\u{1F916} ' + modelName);
}

// ── API 端点 ──────────────
if (base_url) {
  let shortURL = base_url;
  try {
    const u = new URL(base_url);
    shortURL = u.protocol + '//' + u.hostname + (u.port ? ':' + u.port : '');
  } catch {}
  segments.push('\u{1F310} ' + shortURL);
}

// ── API Key（掩码显示） ────
if (api_key) {
  let masked = api_key;
  if (masked.length > 8) {
    masked = masked.slice(0, 4) + '\u2022\u2022\u2022\u2022' + masked.slice(-4);
  } else if (masked.length > 4) {
    masked = masked.slice(0, 2) + '\u2022\u2022\u2022\u2022' + masked.slice(-2);
  }
  segments.push('\u{1F511} ' + masked);
}

// ── Token 统计 ─────────────
let totalSent = 0;
let totalReceived = 0;
let jsonSentBytes = 0;
let jsonReceivedBytes = 0;
if (preset_tokens) {
  totalSent = typeof preset_tokens.sent === 'number' ? preset_tokens.sent : 0;
  totalReceived = typeof preset_tokens.received === 'number' ? preset_tokens.received : 0;
  jsonSentBytes = typeof preset_tokens.jsonSentBytes === 'number' ? preset_tokens.jsonSentBytes : 0;
  jsonReceivedBytes = typeof preset_tokens.jsonReceivedBytes === 'number' ? preset_tokens.jsonReceivedBytes : 0;
}
if (totalSent === 0 && totalReceived === 0 && context_window) {
  totalSent = typeof context_window.total_input_tokens === 'number' ? context_window.total_input_tokens : 0;
  totalReceived = typeof context_window.total_output_tokens === 'number' ? context_window.total_output_tokens : 0;
}

const sentLabel = totalSent > 0 ? '\u25B4' : '\u25B4';
const recvLabel = totalReceived > 0 ? '\u25BE' : '\u25BE';
segments.push(sentLabel + ' ' + fmtNum(totalSent) + '  ' + recvLabel + ' ' + fmtNum(totalReceived));

// ── JSON 流量 ──────────────
segments.push('\u{1F4E4} ' + fmtTraffic(jsonSentBytes) + ' \u2194 \u{1F4E5} ' + fmtTraffic(jsonReceivedBytes));

// ── 费用 ──────────────────
if (cost && typeof cost.total_cost_usd === 'number' && isFinite(cost.total_cost_usd)) {
  const cny = (cost.total_cost_usd * 7.2).toFixed(4);
  segments.push('\u{1F4B0} \u00A5' + cny);
}

// ── 总时长 ──────────────
if (duration && duration.total_str) {
  segments.push('\u23F1 ' + duration.total_str);
}

console.log(segments.join('  '));

// ── 辅助：格式化数字 ──────
function fmtNum(n) {
  // 强制为整数（token 不可能是小数），避免浮点误差导致意外输出
  n = Number(n);
  if (!isFinite(n)) return '0';
  n = Math.round(n);
  if (n >= 100000000) {
    return (n / 100000000).toFixed(3) + '\u4EBF';
  }
  if (n >= 10000000) {
    return (n / 10000000).toFixed(3) + '\u5343\u4E07';
  }
  if (n >= 10000) {
    return (n / 10000).toFixed(3) + '\u4E07';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'k';
  }
  return String(n);
}

// ── 辅助：格式化流量（KB/MB/GB，3位小数） ──────
function fmtTraffic(bytes) {
  bytes = Number(bytes);
  if (!isFinite(bytes) || bytes < 0) return '0KB';
  if (bytes >= 1073741824) {
    return (bytes / 1073741824).toFixed(3) + 'GB';
  }
  if (bytes >= 1048576) {
    return (bytes / 1048576).toFixed(3) + 'MB';
  }
  return (bytes / 1024).toFixed(3) + 'KB';
}
