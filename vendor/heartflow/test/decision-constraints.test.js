/**
 * decision-constraints.test.js — v6.7.11 decision upgrade TDD
 * 覆盖 HeartFlowDecision.decide() 的约束过滤/排序/抗风险行为
 */
'use strict';
const assert = require('assert');
const { HeartFlowDecision } = require('../src/core/decision.js');

module.exports = function ({ test }) {
  test('决策: minFeasibility 过滤掉不可行选项', () => {
    const d = new HeartFlowDecision(null);
    const r = d.decide({
      task: '选方案',
      options: [
        { id: 'a', label: '可行方案', feasibility: 0.9, consequence_value: 0.6, risk: 0.3, confidence: 0.8 },
        { id: 'b', label: '不可行方案', feasibility: 0.2, consequence_value: 0.9, risk: 0.4, confidence: 0.9 },
      ],
      constraints: { minFeasibility: 0.5 },
    });
    assert.strictEqual(r.chosen, 'a', '应过滤掉 feasibility<0.5 的选项');
  });

  test('决策: maxRisk 过滤掉高风险选项', () => {
    const d = new HeartFlowDecision(null);
    const r = d.decide({
      task: '选方案',
      options: [
        { id: 'a', label: '高风险方案', feasibility: 0.9, consequence_value: 0.9, risk: 0.9, confidence: 0.9 },
        { id: 'b', label: '低风险方案', feasibility: 0.7, consequence_value: 0.5, risk: 0.2, confidence: 0.8 },
      ],
      constraints: { maxRisk: 0.5 },
    });
    assert.strictEqual(r.chosen, 'b', '应过滤掉 risk>0.5 的选项');
  });

  test('决策: 组合约束选择可行且风险可接受的中间路径', () => {
    const d = new HeartFlowDecision(null);
    const r = d.decide({
      task: '选方案',
      options: [
        { id: 'a', label: '激进方案', feasibility: 0.4, consequence_value: 0.9, risk: 0.8, confidence: 0.9 },
        { id: 'b', label: '保守方案', feasibility: 0.6, consequence_value: 0.4, risk: 0.1, confidence: 0.7 },
        { id: 'c', label: '平衡方案', feasibility: 0.85, consequence_value: 0.7, risk: 0.3, confidence: 0.8 },
      ],
      constraints: { minFeasibility: 0.5, maxRisk: 0.5 },
    });
    assert.strictEqual(r.chosen, 'c', '应选择满足约束且评分最高的选项');
  });

  test('决策: 全部不满足约束时应拒绝选择', () => {
    const d = new HeartFlowDecision(null);
    const r = d.decide({
      task: '选方案',
      options: [
        { id: 'a', label: '太激进', feasibility: 0.1, consequence_value: 0.9, risk: 0.9, confidence: 0.9 },
      ],
      constraints: { minFeasibility: 0.7, maxRisk: 0.3 },
    });
    assert.strictEqual(r.chosen, null, '无可行选项时应返回 null');
  });
};
