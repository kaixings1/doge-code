#!/usr/bin/env node
/**
 * [v6.7.7] OutboundLedger — 出域台账
 * 
 * 国标要求：所有外部调用（checkOutbound）需登记台账，供资产盘点和审计追溯
 * 记录：tool name / traceId / 调用时间 / 文本摘要 / 密级 / action / reason
 * 存储：JSONL 文件 + 内存索引（启动时加载）
 */

const fs = require('fs');
const path = require('path');

const LEDGER_DIR = path.join(__dirname, '..', 'logs');
const LEDGER_FILE = path.join(LEDGER_DIR, 'outbound-ledger.jsonl');

class OutboundLedger {
  constructor(opts = {}) {
    this.file = opts.file || LEDGER_FILE;
    this._buffer = [];
    this._ensureDir();
  }

  _ensureDir() {
    const d = path.dirname(this.file);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  /**
   * 登记一条出域调用
   */
  record(entry) {
    const rec = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      traceId: entry.traceId,
      tool: entry.tool || 'unknown',
      textPreview: typeof entry.text === 'string' ? entry.text.slice(0, 120) : String(entry.text).slice(0, 120),
      classification: entry.classification || '内部',
      action: entry.action,
      reason: entry.reason || '',
      result: entry.result || '',
    };
    this._buffer.push(rec);
    fs.appendFileSync(this.file, JSON.stringify(rec) + '\n', 'utf-8');
  }

  /**
   * 查询台账
   */
  query(opts = {}) {
    const { start, end, traceId, action, tool, limit = 200 } = opts;
    const startMs = start ? new Date(start).getTime() : 0;
    const endMs = end ? new Date(end).getTime() : Date.now();
    try {
      const lines = fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean);
      const out = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.ts < startMs || obj.ts > endMs) continue;
          if (traceId && obj.traceId !== traceId) continue;
          if (action && obj.action !== action) continue;
          if (tool && obj.tool !== tool) continue;
          out.push(obj);
          if (out.length >= limit) break;
        } catch (_) { /* skip corrupt */ }
      }
      return out;
    } catch (_) { return []; }
  }

  /**
   * 统计摘要
   */
  stats(opts = {}) {
    const { start, end } = opts;
    const records = this.query({ start, end, limit: 10000 });
    const total = records.length;
    const byAction = {};
    const byTool = {};
    for (const r of records) {
      byAction[r.action] = (byAction[r.action] || 0) + 1;
      byTool[r.tool] = (byTool[r.tool] || 0) + 1;
    }
    return { total, byAction, byTool, period: { start, end } };
  }
}

module.exports = { OutboundLedger };
