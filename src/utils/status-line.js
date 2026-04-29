#!/usr/bin/env node
// status-line.js - 显示当前API配置和Token统计
// 从标准输入接收JSON（model / version / context_window / cost / base_url / preset_tokens / api_key / api_model 等）
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// 读取标准输入
const rawInput = readFileSync(0, 'utf-8');
// DOGE 调试：记录收到的原始数据
try { writeFileSync(join(homedir(), '.doge', 'status-line-debug.log'), rawInput + '\n---\n', { flag: 'a' }); } catch {}

const input = JSON.parse(rawInput);
const { model, version, context_window, cost, base_url, preset_tokens, api_key, api_model } = input;

// 构建状态栏文本
const lines = [];

// 版本号和模型
if (version && model) {
  lines.push('v' + version + ' \u00b7 ' + (model.display_name || model.id));
}

// baseURL - 从输入参数的 base_url 获取
if (base_url) {
  // 缩短显示：只保留协议+主机+端口
  let shortURL = base_url;
  try {
    const u = new URL(base_url);
    shortURL = u.protocol + '//' + u.host;
  } catch {}
  lines.push(shortURL);
}

// 当前使用的模型
if (api_model) {
  lines.push(api_model);
}

// API Key（带掩码）
if (api_key) {
  let masked = api_key;
  if (masked.length > 8) {
    masked = masked.slice(0, 4) + '****' + masked.slice(-4);
  } else if (masked.length > 4) {
    masked = masked.slice(0, 2) + '****' + masked.slice(-2);
  }
  lines.push(masked);
}

// Token 统计：优先使用 preset_tokens（跨会话持久化累计值），
// 若不存在则回退到当前会话的 context_window
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
// 回退：没有预设 tokens 时使用当前会话值
if (totalSent === 0 && totalReceived === 0 && context_window) {
  totalSent = typeof context_window.total_input_tokens === 'number' ? context_window.total_input_tokens : 0;
  totalReceived = typeof context_window.total_output_tokens === 'number' ? context_window.total_output_tokens : 0;
}

// 使用 token 数显示（输入 ↑ / 输出 ↓）
if (totalSent > 0 || totalReceived > 0) {
  lines.push('\u2191' + totalSent + ' \u00b7 \u2193' + totalReceived);
}

// JSON 数据包字节数显示（可选）
if (jsonSentBytes > 0 || jsonReceivedBytes > 0) {
  const sentKB = (jsonSentBytes / 1024).toFixed(1);
  const recvKB = (jsonReceivedBytes / 1024).toFixed(1);
  lines.push('JSON\u2191' + sentKB + 'KB \u00b7 \u2193' + recvKB + 'KB');
}

// 显示总共花费（美元转人民币）
if (cost && typeof cost.total_cost_usd === 'number') {
  lines.push('\u00a5' + (cost.total_cost_usd * 7.2).toFixed(4));
}

console.log(lines.join(' \u00b7 '));
