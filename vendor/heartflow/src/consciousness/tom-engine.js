#!/usr/bin/env node
/**
 * [v6.7.7] ToMEngine — 论文: Theater of Mind (2604.08206)
 * 
 * 核心思想：多智能体心理理论（Theory of Mind）推理
 * 为每个 agent 建立心智模型：belief / desire / intention / emotion
 * 支持：心智状态归因、意图预测、情绪传染、多方博弈模拟
 * 
 * 实现要点：
 *   - MentalState: belief + desire + intention + emotion + knowledge
 *   - AgentModel: 存储每个 agent 的心智模型
 *   - ToMPredictor: 根据心智模型预测行为
 *   - EmotionContagion: 情绪传染计算
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const TOM_DIR = path.join(__dirname, '..', 'data', 'tom');

class ToMEngine {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.dataDir = opts.dataDir || TOM_DIR;
    this.agents = new Map(); // agentId -> AgentModel
    this._ensureDir();
    this._load();
  }

  _ensureDir() { if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true }); }
  _load() { try { if (fs.existsSync(path.join(this.dataDir, 'agents.json'))) this.agents = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(this.dataDir, 'agents.json'), 'utf-8')))); } catch (_) { this.agents = new Map(); } }
  _save() { fs.writeFileSync(path.join(this.dataDir, 'agents.json'), JSON.stringify(Object.fromEntries(this.agents), null, 2), 'utf-8'); }

  /**
   * 为 agent 建模心智状态
   */
  modelAgent(agentId, observations) {
    const obs = Array.isArray(observations) ? observations : [observations];
    const state = {
      agentId,
      belief: this._inferBelief(obs),
      desire: this._inferDesire(obs),
      intention: this._inferIntention(obs),
      emotion: this._inferEmotion(obs),
      knowledge: this._extractKnowledge(obs),
      updatedAt: Date.now(),
    };
    this.agents.set(agentId, { ...(this.agents.get(agentId) || {}), ...state });
    this._save();
    return state;
  }

  _inferBelief(obs) {
    const texts = obs.map(String).join(' ');
    const beliefs = [];
    const beliefMarkers = [/认为|相信|觉得|以为|think|believe|feel that/i, /知道|了解|意识到|know|aware/i, /希望|想要|期待|want|wish|hope/i];
    for (const m of beliefMarkers) {
      const hit = texts.match(m);
      if (hit) beliefs.push({ type: m.source.slice(0, 40), snippet: hit[0].slice(0, 80) });
    }
    return beliefs;
  }

  _inferDesire(obs) {
    const texts = obs.map(String).join(' ');
    const desires = [];
    const desireMarkers = [/希望|想要|期待|渴望|need|want|wish|desire/i, /避免|不要|不愿|不希望|avoid|dont want/i];
    for (const m of desireMarkers) {
      const hit = texts.match(m);
      if (hit) desires.push({ type: m.source.slice(0, 40), snippet: hit[0].slice(0, 80) });
    }
    return desires;
  }

  _inferIntention(obs) {
    const texts = obs.map(String).join(' ');
    const markers = [/计划|准备|打算|going to|plan to|intend/i, /将|会|将要|will\/shall/i];
    for (const m of markers) {
      const hit = texts.match(m);
      if (hit) return { plan: hit[0].slice(0, 100), confidence: 0.6 };
    }
    return { plan: 'unknown', confidence: 0.1 };
  }

  _inferEmotion(obs) {
    const texts = obs.map(String).join(' ');
    const emotionMap = {
      joy: [/开心|高兴|兴奋|快乐|happy|excited|joy/i],
      anger: [/愤怒|生气|恼火|angry|furious/i],
      fear: [/担心|害怕|恐惧|afraid|fear|worried/i],
      sad: [/悲伤|难过|失望|sad|disappointed/i],
    };
    for (const [emo, patterns] of Object.entries(emotionMap)) {
      for (const p of patterns) {
        if (p.test(texts)) return { primary: emo, intensity: 0.7 };
      }
    }
    return { primary: 'neutral', intensity: 0.5 };
  }

  _extractKnowledge(obs) {
    const all = obs.map(String).join(' ');
    return { facts: (all.match(/[^。，,.!?。！？\n]{10,}/g) || []).slice(0, 5).map(s => s.slice(0, 80)) };
  }

  /**
   * 预测 agent 行为
   */
  predict(agentId, context = {}) {
    const model = this.agents.get(agentId);
    if (!model) return { prediction: 'unknown', confidence: 0, reason: 'no model' };
    const { intention, desire, emotion } = model;
    const prediction = {
      likelyAction: intention.plan || 'unknown',
      motivation: desire.map(d => d.snippet).join('; '),
      emotionalState: emotion.primary,
      confidence: Math.min(1, (intention.confidence || 0) + 0.2),
    };
    return prediction;
  }

  /**
   * 情绪传染
   */
  contagion(agentIds, context = {}) {
    const results = {};
    for (const id of agentIds) {
      const model = this.agents.get(id);
      if (model) {
        const avg = (model.emotion?.intensity || 0.5);
        results[id] = { emotion: model.emotion, spreadFactor: avg * 0.8 };
      }
    }
    return results;
  }
}

module.exports = { ToMEngine };
