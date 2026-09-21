/**
 * check-confidence-calibration.test.js — v6.7.11 TDD
 * 覆盖 checkConfidenceCalibration 的营销/绝对化新增分支
 */
const { checkConfidenceCalibration } = require('../src/index.js');

module.exports = function ({ test, assertTrue, assertFalse }) {
  test('superlativeSubjectiveZH: 最+主观形容词触发', () => {
    const r = checkConfidenceCalibration('2026年最安静、也最有分量的AI项目。');
    assertTrue(r.issues.some(i => i.detail && i.detail.includes('superlative subjective')), '应命中主观绝对化');
  });

  test('marketingOverclaimZH: 营销过度声称触发', () => {
    const cases = ['这是行业领先的解决方案。', '这个模型是顶级技术。', '天花板级别的产品。'];
    for (const text of cases) {
      const r = checkConfidenceCalibration(text);
      assertTrue(r.issues.some(i => i.detail && i.detail.includes('marketing overclaim')), `营销声称应命中: ${text}`);
    }
  });

  test('absoluteSolutionZH: 绝对化解决方案触发', () => {
    const cases = ['完美解决所有问题。', '彻底消除任何风险。', '完全安全可靠。'];
    for (const text of cases) {
      const r = checkConfidenceCalibration(text);
      assertTrue(r.issues.some(i => i.detail && i.detail.includes('absolute solution')), `绝对化方案应命中: ${text}`);
    }
  });

  test('边界: 正常陈述不触发新增 confidence finding', () => {
    const r = checkConfidenceCalibration('根据2024年公开财报，该公司营收同比增长12%。');
    assertFalse(r.issues.some(i => i.detail && i.detail.includes('superlative subjective')), '正常陈述不应触发主观绝对化');
    assertFalse(r.issues.some(i => i.detail && i.detail.includes('marketing overclaim')), '正常陈述不应触发营销声称');
    assertFalse(r.issues.some(i => i.detail && i.detail.includes('absolute solution')), '正常陈述不应触发绝对化方案');
  });
};
