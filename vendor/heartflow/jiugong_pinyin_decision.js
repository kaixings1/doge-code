#!/usr/bin/env node
/**
 * jiugong_pinyin_decision.js
 * 九宫数码拼音输入法 — 心虫决策分析
 */
const { HeartFlow } = require('/root/.hermes/skills/ai/mark-heartflow-skill/src/core/heartflow.js');
const fs = require('fs');

function showHeader() {
  console.log('='.repeat(60));
  console.log('  九宫数码拼音输入法 · 心虫决策');
  console.log('='.repeat(60));
}

function showSchemes() {
  console.log(`
【候选方案】

方案A：经典 T9 + AI 预测
- 键位：2=abc / 3=def / 4=ghi / 5=jkl / 6=mno / 7=pqrs / 8=tuv / 9=wxyz
- 特点：用户零学习成本，依赖 AI 预测消歧
- 平均码长：2.8 码/字
- 重码率：高（依赖预测）

方案B：声母归组 + 韵母数字码
- 键位：1=bpmf / 2=dt / 3=nl / 4=gkh / 5=jqx / 6=zhchshr / 7=zcs / 8=yw / 9=韵母
- 特点：声母按发音部位分组，韵母用数字索引
- 平均码长：2-3 码/字
- 重码率：中

方案C：首字母 + 韵母编码
- 键位：声母首字母直接按 T9，韵母单独编码为数字
- 特点：保留拼音直觉，韵母压缩为 1-2 位数字
- 平均码长：2-3 码/字
- 重码率：低
`);
}

async function main() {
  showHeader();
  showSchemes();

  const hf = new HeartFlow({ dataDir: '/root/.hermes/skills/ai/mark-heartflow-skill/data', silent: true });
  hf.start();

  const task = `
用户需要设计一个基于 9 个数字键的拼音输入法。
请从以下三个方案中选择最优方案，并说明理由：
A：经典 T9 + AI 预测（零学习，高重码）
B：声母归组 + 韵母数字码（中学习，中重码）
C：首字母 + 韵母编码（保留拼音直觉，低重码）
评估维度：学习成本、输入效率、重码率、实现难度、用户体验。
`;

  console.log('>>> 心虫分析中...');
  const rThink = await hf.think(task);
  console.log('\n【心虫分析结论】');
  console.log('置信度:', rThink.output.meta.confidence);
  console.log('任务类型:', rThink.output.meta.taskType);
  console.log('结论:', rThink.output.conclusion);

  console.log('\n>>> 心虫决策中...');
  const rDecide = await hf.dispatch('decision.decide', {
    task,
    options: [
      {
        label: '方案A：经典T9+AI预测',
        feasibility: 0.9,
        consequence_value: 0.7,
        risk: 0.3,
        confidence: 0.8,
        promotes_upgrade: true,
        promotes_truth: true
      },
      {
        label: '方案B：声母归组+韵母数字码',
        feasibility: 0.7,
        consequence_value: 0.8,
        risk: 0.4,
        confidence: 0.7,
        promotes_upgrade: true,
        promotes_truth: true
      },
      {
        label: '方案C：首字母+韵母编码',
        feasibility: 0.6,
        consequence_value: 0.9,
        risk: 0.5,
        confidence: 0.75,
        promotes_upgrade: true,
        promotes_truth: true
      }
    ],
    constraints: { minFeasibility: 0.5 }
  });

  console.log('\n【心虫决策结果】');
  const reasoning = rDecide.reasoning || JSON.stringify(rDecide);
  console.log(reasoning);

  let chosen = '未明确选出';
  const match = reasoning.match(/Selected:\s*"([^"]+)"/);
  if (match) chosen = match[1];

  console.log(`\n>>> 心虫选中: ${chosen}`);

  const result = {
    analysis: {
      confidence: rThink.output.meta.confidence,
      task_type: rThink.output.meta.taskType,
      conclusion: rThink.output.conclusion
    },
    decision: {
      reasoning: reasoning.slice(0, 2000),
      chosen
    }
  };

  const outPath = '/root/jiugong-input/decision.json';
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n决策结果已保存: ${outPath}`);
}

main().catch(err => {
  console.error('运行失败:', err);
  process.exit(1);
});
