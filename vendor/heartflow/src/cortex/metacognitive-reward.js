#!/usr/bin/env node
/**
 * [v6.7.7] MetacognitiveReward — 论文: Metacognition as Reward (2605.23384)
 * 
 * 核心思想：将 LLM 的自我评估（"我对这个答案有多自信？"）作为训练信号
 * 不依赖外部标注，内建奖励模型：高置信 + 正确 = 高奖励；低置信 + 错误 = 低奖励
 * 
 * 实现要点：
 *   - ConfidenceEstimator: 从输出文本/thoughtChain 提取置信度分数
 *   - OutcomeVerifier: 验证输出质量（事实一致性/逻辑/完整性）
 *   - RewardComputer: 综合置信度和验证结果计算奖励值
 *   - LearningBuffer: 积累经验数据，供自愈 RL 采样
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const BUFFER_DIR = path.join(__dirname, '..', 'memory', 'metacognition');

class MetacognitiveReward {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.bufferDir = opts.bufferDir || BUFFER_DIR;
    this.bufferFile = path.join(this.bufferDir, 'experience-buffer.jsonl');
    this.statsFile = path.join(this.bufferDir, 'reward-stats.json');
    this._ensureDir();
    this._loadStats();
  }

  _ensureDir() { if (!fs.existsSync(this.bufferDir)) fs.mkdirSync(this.bufferDir, { recursive: true }); }
  _loadStats() { try { if (fs.existsSync(this.statsFile)) Object.assign(this, JSON.parse(fs.readFileSync(this.statsFile, 'utf-8'))); } catch (_) { this.stats = { total: 0, avgReward: 0.5, avgConfidence: 0.5, avgQuality: 0.5 }; } }
  _saveStats() { fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2), 'utf-8'); }

  /**
   * 主入口：评估输出质量 + 计算奖励
   * @returns {reward: -1~1, confidence: 0~1, quality: 0~1, verdict: 'excellent'|'good'|'acceptable'|'poor'}
   */
  evaluate(output, context = {}) {
    const confidence = this._estimateConfidence(output, context);
    const quality = this._verifyOutput(output, context);
    const reward = this._computeReward(confidence, quality);
    const verdict = this._verdict(reward);
    this._recordExperience(output, { confidence, quality, reward, verdict, context });
    return { reward: Math.round(reward * 100) / 100, confidence, quality, verdict };
  }

  _estimateConfidence(output, ctx) {
    const text = String(output);
    const len = text.length;
    const hedgeWords = (text.match(/可能|大概|也许|似乎|或许|uncertain|might|maybe|perhaps|probably/gi) || []).length;
    const certaintyWords = (text.match(/确定|一定|显然|明确|certain|definitely|clearly|obviously/gi) || []).length;
    const hasCites = (/来源|引用|文献|reference|source|据[^。]*[显示说]/i.test(text));
    const base = Math.min(1, len / 500);
    const hedgePenalty = hedgeWords * 0.05;
    const certaintyBonus = certaintyWords * 0.05;
    const citeBonus = hasCites ? 0.15 : 0;
    let score = base + citeBonus + certaintyBonus - hedgePenalty;
    if (ctx.selfFeedback?.items?.length) {
      const lowConf = ctx.selfFeedback.items.filter(i => i.type === 'low_confidence').length;
      score -= lowConf * 0.1;
    }
    return Math.max(0, Math.min(1, score));
  }

  _verifyOutput(output, ctx) {
    try {
      if (this.hf && this.hf.discriminate && this.hf.discriminate.dimensions) {
        const dims = this.hf.discriminate.dimensions;
        if (dims.length > 0) {
          const scores = dims.map(d => typeof d === 'object' ? (d.score || 0) : 0);
          const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
          const maxBad = Math.max(0, ...scores.map(s => Math.max(0, 1 - s)));
          return Math.max(0, 1 - avg * 0.5 - maxBad * 0.5);
        }
      }
    } catch (_) { /* fallback */ }
    return 0.6; // neutral
  }

  _computeReward(confidence, quality) {
    if (confidence > 0.7 && quality > 0.7) return 0.9;
    if (confidence > 0.5 && quality > 0.5) return 0.6;
    if (confidence < 0.3 || quality < 0.3) return 0.2;
    return 0.4;
  }

  _verdict(reward) {
    if (reward >= 0.8) return 'excellent';
    if (reward >= 0.6) return 'good';
    if (reward >= 0.4) return 'acceptable';
    return 'poor';
  }

  _recordExperience(output, data) {
    this.stats.total++;
    this.stats.avgReward = (this.stats.avgReward * (this.stats.total - 1) + data.reward) / this.stats.total;
    this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.total - 1) + data.confidence) / this.stats.total;
    this.stats.avgQuality = (this.stats.avgQuality * (this.stats.total - 1) + data.quality) / this.stats.total;
    try {
      const rec = { ts: Date.now(), outputPreview: String(output).slice(0, 200), ...data };
      fs.appendFileSync(this.bufferFile, JSON.stringify(rec) + '\n', 'utf-8');
    } catch (_) { /* ignore */ }
    this._saveStats();
  }
}

module.exports = { MetacognitiveReward };
