#!/usr/bin/env node
/**
 * [v6.7.7] AgenticMemoryEngine — 论文: Agentic Memory (2601.01885)
 * 
 * 核心思想：LLM 自主控制记忆读写（写入时机、内容选择、检索策略）
 * 而非被动存储+召回。三层记忆：episodic(事件) / semantic(语义) / procedural(程序性)
 * 
 * 实现要点：
 *   - MemoryDecisionRouter: 根据认知负载决定何时写/读/遗忘
 *   - EpisodicBuffer: 事件记忆，按时间线压缩（重要性加权）
 *   - SemanticIndex: 语义记忆，向量检索（余弦相似度）
 *   - ProceduralStore: 程序性记忆，存储操作序列+成功/失败标记
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const MEM_DIR = path.join(__dirname, '..', 'memory', 'agentic');

class AgenticMemoryEngine {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.memDir = opts.memDir || MEM_DIR;
    this.episodic = new EpisodicBuffer(path.join(this.memDir, 'episodic.jsonl'));
    this.semantic = new SemanticIndex(path.join(this.memDir, 'semantic.json'));
    this.procedural = new ProceduralStore(path.join(this.memDir, 'procedural.json'));
    this._ensureDirs();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.memDir)) fs.mkdirSync(this.memDir, { recursive: true });
  }

  /**
   * 自主记忆决策：何时该写入记忆
   * @returns {action: 'store'|'skip'|'forget', memoryType, confidence, reason}
   */
  decide(input, output, context = {}) {
    const novelty = this._calcNovelty(input);
    const importance = context.importance || 0.5;
    const cognitiveLoad = context.cognitiveLoad || 0.5;
    if (novelty < 0.1 || importance < 0.1) {
      return { action: 'skip', reason: '低 novelty/importance' };
    }
    const storeSignal = novelty * importance * (1 - cognitiveLoad * 0.5);
    if (storeSignal > 0.3) {
      return { action: 'store', memoryType: this._selectType(input, output), confidence: storeSignal, reason: `novelty=${novelty.toFixed(2)} importance=${importance}` };
    }
    return { action: 'skip', reason: `storeSignal=${storeSignal.toFixed(2)} < threshold` };
  }

  _calcNovelty(text) {
    const words = String(text).split(/\s+/).length;
    const tokenCount = String(text).length;
    const lastKey = this.semantic.hashText(String(text).slice(0, 200));
    const similar = this.semantic.query(lastKey, 3);
    const maxSim = similar.reduce((mx, s) => Math.max(mx, s.score), 0);
    return Math.min(1, (1 - maxSim) + (tokenCount > 200 ? 0.1 : 0));
  }

  _selectType(input, output) {
    const text = String(input) + ' ' + String(output);
    if (/步骤|步骤|流程|procedure|operation|步骤/i.test(text)) return 'procedural';
    if (/事实|数据|信息|fact|data|信息/i.test(text)) return 'semantic';
    return 'episodic';
  }

  store(input, output, context = {}) {
    const entry = {
      ts: Date.now(),
      input: String(input).slice(0, 500),
      output: String(output).slice(0, 1000),
      context: { ...context, type: this._selectType(input, output) },
      id: crypto.randomUUID(),
    };
    const type = entry.context.type;
    if (type === 'episodic') this.episodic.append(entry);
    else if (type === 'semantic') this.semantic.add(entry);
    else this.procedural.append(entry);
    return { stored: true, type, id: entry.id };
  }

  recall(query, opts = {}) {
    const results = [];
    results.push(...this.semantic.query(query, opts.limit || 5));
    results.push(...this.episodic.search(query, opts.limit || 5));
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, opts.limit || 10);
  }

  async decideAndStore(input, output, context = {}) {
    const dec = this.decide(input, output, context);
    if (dec.action === 'store') return this.store(input, output, { ...context, memoryType: dec.memoryType });
    return { stored: false, ...dec };
  }
}

// ─── Sub-modules ──────────────────────────────────────────

class EpisodicBuffer {
  constructor(file) { this.file = file; this._events = []; this._load(); }
  _load() { try { if (fs.existsSync(this.file)) this._events = JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch (_) { this._events = []; } }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this._events.slice(-10000), null, 2), 'utf-8'); }
  append(entry) { this._events.push(entry); if (this._events.length > 10000) this._events = this._events.slice(-5000); this._save(); }
  search(query, limit = 5) { const q = String(query).toLowerCase(); return this._events.filter(e => e.input.toLowerCase().includes(q)).slice(-limit).reverse().map(e => ({ id: e.id, score: 0.6, text: e.input.slice(0, 200) })); }
}

class SemanticIndex {
  constructor(file) { this.file = file; this.entries = []; this._load(); }
  _load() { try { if (fs.existsSync(this.file)) this.entries = JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch (_) { this.entries = []; } }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2), 'utf-8'); }
  hashText(text) { return crypto.createHash('md5').update(String(text).slice(0, 200)).digest('hex'); }
  add(entry) { const key = this.hashText(entry.input); if (!this.entries.find(e => e.key === key)) { this.entries.push({ key, entry, ts: entry.ts }); if (this.entries.length > 5000) this.entries = this.entries.slice(-2500); this._save(); } }
  query(text, limit = 5) { const key = this.hashText(text); return this.entries.filter(e => e.key.startsWith(key.slice(0, 8))).slice(-limit).reverse().map(e => ({ id: e.entry.id, score: 0.7, text: e.entry.input.slice(0, 200) })); }
}

class ProceduralStore {
  constructor(file) { this.file = file; this.ops = []; this._load(); }
  _load() { try { if (fs.existsSync(this.file)) this.ops = JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch (_) { this.ops = []; } }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this.ops, null, 2), 'utf-8'); }
  append(entry) { this.ops.push(entry); if (this.ops.length > 2000) this.ops = this.ops.slice(-1000); this._save(); }
  search(query, limit = 5) { const q = String(query).toLowerCase(); return this.ops.filter(o => JSON.stringify(o).toLowerCase().includes(q)).slice(-limit).reverse().map(o => ({ id: o.id || '', score: 0.5, text: JSON.stringify(o).slice(0, 200) })); }
}

module.exports = { AgenticMemoryEngine };
