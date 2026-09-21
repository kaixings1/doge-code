#!/usr/bin/env node
/**
 * [v6.7.7] DebateEngine — 论文: Heterogeneous Debate (2603.27404)
 * 
 * 核心思想：多智能体辩论——异构角色（支持者/反对者/主持人）交替发言
 * 通过结构化辩论提升复杂决策质量
 * 
 * 实现要点：
 *   - DebateRole: proponent / opponent / moderator / synthesizer
 *   - DebateRound: 每轮发言（角色 / 论据 / 证据 / 置信度）
 *   - DebateSession: 整场辩论（主题 / 角色配置 / 轮次 / 结论）
 *   - 支持人工干预：主持人可要求澄清、重新投票
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const DEBATE_DIR = path.join(__dirname, '..', 'data', 'debates');

const ROLES = Object.freeze({
  PROPONENT: { id: 'proponent', label: '支持者', description: '为命题辩护' },
  OPPONENT: { id: 'opponent', label: '反对者', description: '质疑命题' },
  MODERATOR: { id: 'moderator', label: '主持人', description: '引导流程，提炼共识' },
  SYNTHESIZER: { id: 'synthesizer', label: '综合者', description: '整合各方论据' },
});

class DebateEngine {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.dataDir = opts.dataDir || DEBATE_DIR;
    this._ensureDir();
  }

  _ensureDir() { if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true }); }

  /**
   * 启动新辩论
   */
  createSession(topic, opts = {}) {
    const roles = opts.roles || [ROLES.PROPONENT, ROLES.OPPONENT, ROLES.MODERATOR];
    const maxRounds = opts.maxRounds || 6;
    const session = {
      id: crypto.randomUUID().slice(0, 8),
      topic: String(topic).slice(0, 200),
      roles,
      maxRounds,
      rounds: [],
      status: 'active',
      createdAt: Date.now(),
    };
    this._saveSession(session);
    return session;
  }

  /**
   * 添加一轮发言
   */
  addRound(sessionId, roleId, argument, evidence = []) {
    const session = this._loadSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'active') throw new Error(`Session ${sessionId} is ${session.status}`);

    const round = {
      roundNum: session.rounds.length + 1,
      role: roleId,
      argument: String(argument).slice(0, 2000),
      evidence: evidence.slice(0, 10),
      confidence: this._estimateConfidence(argument),
      timestamp: Date.now(),
    };
    session.rounds.push(round);
    this._saveSession(session);
    return round;
  }

  _estimateConfidence(text) {
    const words = String(text).split(/\s+/).length;
    const hasEvidence = (/[\[\{]|http|https|引用|来源|reference|source/i.test(text));
    let score = Math.min(1, words / 200);
    if (hasEvidence) score += 0.2;
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 主持人总结
   */
  summarize(sessionId) {
    const session = this._loadSession(sessionId);
    if (!session) return { error: 'session not found' };
    const rounds = session.rounds;
    const roleSummary = {};
    for (const r of rounds) {
      if (!roleSummary[r.role]) roleSummary[r.role] = { rounds: 0, totalConfidence: 0 };
      roleSummary[r.role].rounds++;
      roleSummary[r.role].totalConfidence += r.confidence;
    }
    for (const k of Object.keys(roleSummary)) {
      roleSummary[k].avgConfidence = roleSummary[k].totalConfidence / roleSummary[k].rounds;
    }
    return {
      sessionId,
      topic: session.topic,
      totalRounds: rounds.length,
      status: session.status,
      byRole: roleSummary,
      conclusion: session.status === 'concluded' ? session.conclusion : null,
    };
  }

  /**
   * 结束辩论并综合结论
   */
  conclude(sessionId, conclusion) {
    const session = this._loadSession(sessionId);
    if (!session) return { error: 'session not found' };
    session.status = 'concluded';
    session.conclusion = String(conclusion).slice(0, 1000);
    session.concludedAt = Date.now();
    this._saveSession(session);
    return { concluded: true, conclusion: session.conclusion };
  }

  _saveSession(s) { fs.writeFileSync(path.join(this.dataDir, s.id + '.json'), JSON.stringify(s, null, 2), 'utf-8'); }
  _loadSession(id) { try { return JSON.parse(fs.readFileSync(path.join(this.dataDir, id + '.json'), 'utf-8')); } catch (_) { return null; } }
}

module.exports = { DebateEngine, ROLES };
