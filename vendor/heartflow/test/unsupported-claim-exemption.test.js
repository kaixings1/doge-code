// 无依据断言豁免 + 完美错误高权重组合 + 健康焦虑操控 回归测试（2026-08-09）
module.exports = function ({ test }) {
  const m = require('../src/index.js');
  const pe = require('../src/perfect-error.js');
  const gate = require('../src/gate.js');

  // 1. 无依据断言：诚实学术表述应豁免（论文+测试集+保留语）
  test('unsupported_claim: 学术谨慎表述豁免', async () => {
    const r = m.checkUnsupportedClaim('论文指出该方法的准确率在测试集上达到91.2%，但泛化性仍需验证');
    if (r.score !== 0) throw new Error(`期望豁免 score=0，实际 ${r.score}`);
  });

  // 2. 无依据断言：模糊来源+因果主张不豁免（编造研究模板）
  test('unsupported_claim: 根据+因果主张仍拦截', async () => {
    const r = m.checkUnsupportedClaim('根据哈佛大学最新研究，每天只睡4小时的人平均寿命延长10年，但还需更多数据验证。');
    if (r.score === 0) throw new Error('因果主张不应豁免');
  });

  // 3. 无依据断言：公开权威来源豁免
  test('unsupported_claim: 公开数据来源豁免', async () => {
    const r = m.checkUnsupportedClaim('根据公开数据，2024年中国新能源汽车销量约1286万辆，同比增长35.5%。');
    if (r.score !== 0) throw new Error(`期望豁免 score=0，实际 ${r.score}`);
  });

  // 4. 完美错误：伪权威+假精确组合 → rewrite（即使只有2信号）
  test('perfect_error: 伪权威+假精确组合升级 rewrite', () => {
    const r = pe.checkPerfectError('著名专家张教授研究指出，喝这个水就能根治所有慢性病，有效率高达99.7%。');
    if (r.level !== 'rewrite') throw new Error(`期望 level=rewrite，实际 ${r.level}`);
  });

  // 5. 情绪操控：健康焦虑式道德绑架（不买X=不爱惜健康）
  test('emotional_manipulation: 健康焦虑式道德绑架', () => {
    const r = m.checkEmotionalManipulation('如果你不买我们的产品，就是不爱惜自己的健康。');
    if (r.count === 0) throw new Error('健康焦虑操控应被检测到');
  });

  // 6. gate 端到端：正常年报数据 pass
  test('gate: 年报数据来源 pass', async () => {
    const r = await gate.checkOutput('报告显示，2024年公司营收增长15%，数据来自年报审计。');
    if (r.gate.action !== 'pass') throw new Error(`期望 pass，实际 ${r.gate.action}`);
  });

  // 7. gate 端到端：有样本调查 pass
  test('gate: 有样本调查 pass', async () => {
    const r = await gate.checkOutput('我们调查了1000名用户，满意度达到87.3%，样本覆盖全国主要城市。');
    if (r.gate.action !== 'pass') throw new Error(`期望 pass，实际 ${r.gate.action}`);
  });

  // 8. gate 端到端：伪权威产品宣传 rewrite
  test('gate: 伪权威+假精确 rewrite', async () => {
    const r = await gate.checkOutput('著名专家张教授研究指出，喝这个水就能根治所有慢性病，有效率高达99.7%。');
    if (r.gate.action !== 'rewrite') throw new Error(`期望 rewrite，实际 ${r.gate.action}`);
  });
};
