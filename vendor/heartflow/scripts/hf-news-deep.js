const { HeartFlow } = require('../src/core/heartflow.js');
const gate = require('../src/gate.js');
const { readFileSync } = require('fs');
const brief = JSON.parse(readFileSync('/tmp/hf-news-brief.json', 'utf8'));

(async () => {
  const hf = new HeartFlow({ dataDir: './data', silent: true });
  hf.start();
  await new Promise(r => setTimeout(r, 3500));

  // Build a concise analysis brief for HeartFlow
  const text = [
    `主题：${brief.topic}`,
    '',
    '一、特朗普/中期选举',
    ...brief.signals[0].items.map((x,i)=>`${i+1}. ${x}`),
    '',
    '二、美国宏观/政策',
    ...brief.signals[1].items.map((x,i)=>`${i+1}. ${x}`),
    '',
    '三、材料/供应链',
    ...brief.signals[2].items.map((x,i)=>`${i+1}. ${x}`),
    '',
    '四、地缘扰动',
    ...brief.signals[3].items.map((x,i)=>`${i+1}. ${x}`),
    '',
    '五、当前市场共识',
    brief.current_consensus,
    '',
    '请心虫做三件事：',
    '1. 评估上述四组信号的真可靠度与因果链是否成立；',
    '2. 判断“二选一”式尾部风险定价是否过度简化；',
    '3. 给出对材料后续走势的三种情景与触发条件。'
  ].join('\n');

  // 1) think() deep analysis
  const r = await hf.think(text);
  console.log('=== think() analysis ===');
  console.log(JSON.stringify({
    confidence: r.output?.meta?.confidence,
    conclusion: r.output?.conclusion,
    synthesis: r.synthesis,
    metaCalibration: r.metaCalibration,
    blindSpotAnalysis: r.blindSpotAnalysis
  }, null, 2));

  // 2) gate check on the think() output conclusion
  const draft = [
    '深度分析草稿：',
    r.output?.conclusion || '',
    '',
    '综合判断：',
    r.synthesis?.conclusion || '',
    '',
    '主要风险点：',
    ...(r.output?.warnings || []).map(w => `- ${w}`),
    ...(r.blindSpotAnalysis?.confidence?.assertions || []).slice(0,5).map(a => `- ${a.text}`)
  ].join('\n');

  const g = gate.checkOutput(draft);
  console.log('\n=== checkOutput on draft ===');
  console.log(JSON.stringify({
    gate: g.gate,
    verdict: g.verdict,
    overallScore: g.overallScore,
    findings: (g.findings || []).slice(0, 8)
  }, null, 2));

  // 3) decision.decide on material strategy
  const dec = hf.dispatch('decision.decide', {
    task: '基于当前宏观与地缘信号，材料后续走势的最优应对策略',
    options: [
      { label: '锁价长单', feasibility: 0.7, consequence_value: 0.8, risk: 0.3, confidence: 0.6, promotes_upgrade: true, promotes_truth: true },
      { label: '按需采购，维持低库存', feasibility: 0.8, consequence_value: 0.6, risk: 0.5, confidence: 0.7, promotes_upgrade: true, promotes_truth: true },
      { label: '加大战略备货', feasibility: 0.5, consequence_value: 0.9, risk: 0.7, confidence: 0.5, promotes_upgrade: true, promotes_truth: true },
      { label: '不做预判，保持观望', feasibility: 0.9, consequence_value: 0.4, risk: 0.2, confidence: 0.8, promotes_upgrade: true, promotes_truth: true }
    ],
    constraints: { minFeasibility: 0.4 }
  });
  console.log('\n=== decision.decide ===');
  console.log(JSON.stringify({
    chosen: dec.chosen,
    reasoning: dec.reasoning,
    composite_score: dec.composite_score,
    confidence: dec.confidence
  }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
