#!/usr/bin/env node
/**
 * [v6.7.7] ExecutableReasoning — 论文: Think it, Run it (2604.27096)
 * 
 * 核心思想：思维链 → 结构化可执行计划 → 验证闭环
 * 三步：1) parseThoughtChain() 从 thoughtChain 提取步骤；2) buildPlan() 结构化；3) executeAndVerify() 执行+验证
 * 
 * 实现要点：
 *   - PlanStep: step / action / expected / verification 四元组
 *   - ExecutionResult: success / failedStep / output / durationMs
 *   - 支持 sequential（顺序）和 parallel（并行）执行
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('../utils/safe-fs');

const PLAN_DIR = path.join(__dirname, '..', 'data', 'plans');

class ExecutableReasoning {
  constructor(hf, opts = {}) {
    this.hf = hf;
    this.planDir = opts.planDir || PLAN_DIR;
    this._ensureDir();
  }

  _ensureDir() { if (!fs.existsSync(this.planDir)) fs.mkdirSync(this.planDir, { recursive: true }); }

  /**
   * 从 thoughtChain/raw output 提取可执行步骤
   * @returns {PlanStep[]}
   */
  parseThoughtChain(raw, thoughtChain = null) {
    const text = String(raw);
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const steps = [];
    let stepNum = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(步骤|Step|步骤\s*\d|[0-9]+[.、)] )/i.test(trimmed) || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        stepNum++;
        steps.push({
          id: `step_${stepNum}`,
          description: trimmed.replace(/^[-*\s]+/, ''),
          action: 'execute',
          expected: '',
          verification: 'verify_output',
          status: 'pending',
        });
      }
    }
    if (steps.length === 0) {
      steps.push({
        id: 'step_1', description: text.slice(0, 200), action: 'execute', expected: '', verification: 'verify_output', status: 'pending',
      });
    }
    return steps;
  }

  /**
   * 将步骤构建为可执行计划
   */
  buildPlan(steps, opts = {}) {
    const mode = opts.mode || 'sequential'; // sequential | parallel
    return {
      id: crypto.randomUUID().slice(0, 8),
      steps,
      mode,
      createdAt: Date.now(),
      status: 'draft',
    };
  }

  /**
   * 执行计划并验证（同步模拟，真实执行交给 executor）
   */
  executeAndVerify(plan, opts = {}) {
    const start = Date.now();
    const results = [];
    const steps = plan.steps || [];
    for (const step of steps) {
      try {
        const output = this._mockExecute(step, opts);
        const passed = this._verifyStep(step, output);
        results.push({ stepId: step.id, status: passed ? 'success' : 'failed', output: String(output).slice(0, 300), durationMs: 10 });
        if (!passed && plan.mode === 'sequential') break;
      } catch (e) {
        results.push({ stepId: step.id, status: 'error', error: e.message, durationMs: 0 });
      }
    }
    const allPassed = results.every(r => r.status === 'success');
    return {
      planId: plan.id,
      success: allPassed,
      results,
      durationMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    };
  }

  _mockExecute(step, opts) {
    if (this.hf && this.hf.thoughtChain) {
      try {
        return this.hf.thoughtChain.run(step.description).then(r => r?.output?.conclusion || 'executed');
      } catch (_) { /* fallback */ }
    }
    return `executed: ${step.description}`;
  }

  _verifyStep(step, output) {
    if (!step.expected) return true;
    const text = String(output);
    return text.toLowerCase().includes(String(step.expected).toLowerCase());
  }

  /**
   * 端到端：从 raw thoughtChain 到 verify 结果
   */
  endToEnd(raw, opts = {}) {
    const steps = this.parseThoughtChain(raw);
    const plan = this.buildPlan(steps, opts);
    return this.executeAndVerify(plan, opts);
  }
}

module.exports = { ExecutableReasoning };
