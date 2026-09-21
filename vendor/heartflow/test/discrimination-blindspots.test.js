/**
 * discrimination-blindspots.test.js — 三个盲区修复验证
 *
 * 盲区1: unsupported_claim 英文研究引用共现变体（"According to X study, N%"）
 * 盲区2: pseudo_causal 模糊来源+精确倍数豁免过宽（"According to a study, reduced by 3.2x"）
 * 盲区3: soft_deflection 倒装变体（"I could be wrong, but the data clearly shows"）
 *
 * 不 mock，直接 require index.js 跑真实判别路径。
 */

const path = require('path');
const idx = require('../src/index.js');

module.exports = function ({ test, assertEqual, assertTrue, assertDefined }) {

  // ─── 盲区1: unsupported_claim 英文共现规则 ─────────────────────
  test('盲区1: 模糊来源+精确数字共现应判无依据', () => {
    const r = idx.checkUnsupportedClaim('According to a 2023 study, the model accuracy improved by 23.5% on the test set');
    assertDefined(r, 'returned null');
    assertTrue(r.count > 0, '应命中共现规则 (count>0)');
    assertTrue(r.score > 0, '模糊来源编造模板不应豁免 (score>0)，实际=' + r.score);
  });

  test('盲区1对照: 具体来源+保留语应豁免', () => {
    const r = idx.checkUnsupportedClaim('A 2024 Harvard study (Smith et al., Nature) found the method reduces error by 3.2x, but generalization remains to be verified on larger datasets');
    assertDefined(r, 'returned null');
    // 有具体机构(Harvard/Nature)+年份+保留语 → 诚实学术表述，不判
    assertTrue(r.score === 0, '诚实学术表述应豁免 (score=0)，实际=' + r.score);
  });

  // ─── 盲区2: pseudo_causal 模糊来源豁免收紧 ─────────────────────
  test('盲区2: 模糊来源+精确倍数应判 verify 级', () => {
    const d = idx.discriminate('According to a study, error rates were reduced by 3.2x compared to baseline');
    const f = d.findings.find(x => x.dimension === 'pseudo_causal');
    assertDefined(f, 'pseudo_causal finding 应出现');
    assertTrue(f.severity >= 40, '模糊来源(无arxiv/DOI)不应降到40以下，实际=' + f.severity);
    assertTrue(d.gate && d.gate.action === 'verify', 'gate 应为 verify，实际=' + (d.gate && d.gate.action));
  });

  test('盲区2对照: 具体来源(arxiv)应降分豁免', () => {
    const d = idx.discriminate('According to arXiv:2401.12345, error rates were reduced by 3.2x');
    const f = d.findings.find(x => x.dimension === 'pseudo_causal');
    // 有具体可验证来源 → 降分或豁免
    assertTrue(!f || f.severity <= 40, '具体来源应降分(<=40)，实际=' + (f ? f.severity : 'none'));
  });

  // ─── 盲区3: soft_deflection 倒装变体 ───────────────────────────
  test('盲区3: 英文倒装变体(先让步后结论)', () => {
    const d = idx.discriminate('I could be wrong, but the data clearly shows the method works');
    const f = d.findings.find(x => x.dimension === 'soft_deflection');
    assertDefined(f, 'soft_deflection finding 应出现(英文倒装变体)');
    assertTrue(f.severity >= 40, '应命中，实际=' + f.severity);
  });

  test('盲区3对照: 中文倒装变体', () => {
    const d = idx.discriminate('我可能判断有误，但数据显示实际效果是有的');
    const f = d.findings.find(x => x.dimension === 'soft_deflection');
    assertDefined(f, 'soft_deflection finding 应出现(中文倒装变体)');
    assertTrue(f.severity >= 40, '应命中，实际=' + f.severity);
  });

  // ─── 回归: 正常文本不误判 ─────────────────────────────────────
  test('回归: 正常学术表述不应误判为伪因果/软话术', () => {
    const d = idx.discriminate('The model achieved 91.2% accuracy on the test set, which is competitive with prior work.');
    const pc = d.findings.find(x => x.dimension === 'pseudo_causal');
    const sd = d.findings.find(x => x.dimension === 'soft_deflection');
    assertTrue(!pc, '正常精确数字不应判伪因果');
    assertTrue(!sd, '正常表述不应判软话术');
  });
};
