#!/usr/bin/env node
/**
 * [v6.7.7] EvolutionarySearch — 论文: Bidirectional Evolution Search (2605.28814)
 * 
 * 核心思想：双向进化搜索
 *   前向：现有方案 → 变异 → 评估 → 选择
 *   反向：目标约束 → 倒推可行方案 → 验证
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const EVO_DIR = path.join(__dirname, '..', 'data', 'evolution');

class EvolutionarySearch {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.dataDir = opts.dataDir || EVO_DIR;
    this.popSize = opts.popSize || 20;
    this.generations = opts.generations || 10;
    this.mutationRate = opts.mutationRate || 0.2;
    this._ensureDir();
  }

  _ensureDir() { if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true }); }

  initPopulation(searchSpace) {
    const pop = [];
    for (let i = 0; i < this.popSize; i++) pop.push(this._sample(searchSpace));
    return pop;
  }

  _sample(space) {
    const sample = {};
    for (const [k, v] of Object.entries(space)) {
      if (typeof v === 'object' && v.type === 'range') {
        sample[k] = v.min + Math.random() * (v.max - v.min);
        if (v.step) sample[k] = Math.round(sample[k] / v.step) * v.step;
      } else if (typeof v === 'object' && v.type === 'choice') {
        sample[k] = v.options[Math.floor(Math.random() * v.options.length)];
      } else { sample[k] = v; }
    }
    return sample;
  }

  forward(population, fitnessFn, generations = this.generations) {
    let pop = [...population];
    const history = [];
    for (let g = 0; g < generations; g++) {
      const scored = pop.map(c => ({ candidate: c, score: fitnessFn(c) }));
      scored.sort((a, b) => b.score - a.score);
      const topK = scored.slice(0, Math.max(2, Math.floor(this.popSize * 0.3)));
      const offspring = this._crossover(topK.map(s => s.candidate), this.popSize - topK.length);
      const mutated = offspring.map(c => this._mutate(c));
      pop = [...topK.map(s => s.candidate), ...mutated];
      history.push({ generation: g + 1, bestScore: scored[0].score, avgScore: scored.reduce((s, x) => s + x.score, 0) / scored.length });
    }
    return { finalPopulation: pop, history };
  }

  backward(target, constraintFn, searchSpace, iterations = 10) {
    const results = [];
    for (let i = 0; i < iterations; i++) {
      const candidate = this._sample(searchSpace);
      if (constraintFn(candidate)) {
        const score = this._evaluateFit(candidate, target);
        results.push({ candidate, score, valid: true });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
  }

  _mutate(candidate) {
    const mutated = { ...candidate };
    for (const k of Object.keys(mutated)) {
      if (Math.random() < this.mutationRate) {
        const v = mutated[k];
        if (typeof v === 'number') mutated[k] = v + (Math.random() - 0.5) * v * 0.1;
        else if (typeof v === 'string') mutated[k] = v + (Math.random() > 0.5 ? '+' : '-');
      }
    }
    return mutated;
  }

  _crossover(parents, count) {
    const offspring = [];
    while (offspring.length < count) {
      const p1 = parents[Math.floor(Math.random() * parents.length)];
      const p2 = parents[Math.floor(Math.random() * parents.length)];
      const child = {};
      for (const k of Object.keys(p1)) child[k] = Math.random() > 0.5 ? p1[k] : p2[k];
      offspring.push(child);
    }
    return offspring;
  }

  _evaluateFit(candidate, target) {
    let score = 0;
    for (const [k, v] of Object.entries(target)) {
      if (candidate[k] !== undefined) {
        const diff = typeof v === 'number' ? Math.abs(candidate[k] - v) : (candidate[k] === v ? 0 : 1);
        score += 1 / (1 + diff);
      }
    }
    return score / Object.keys(target).length;
  }
}

module.exports = { EvolutionarySearch };
