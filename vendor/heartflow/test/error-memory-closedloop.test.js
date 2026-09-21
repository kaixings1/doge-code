// error-memory 闭环状态机测试（v6.6.0）
// 标准签名：module.exports = function({test, assertEqual, assertTrue, ...})
module.exports = function ({ test, assertEqual, assertTrue, assertDefined, assertThrows }) {
  process.env.NODE_ENV = 'test';
  const em = require('../src/error-memory.js');

  // 清空测试记忆
  em.clearMemory();

  test('error-memory: logCorrection 创建 open 状态', () => {
    const r = em.logCorrection('overconfidence', '说"绝对"太绝对', '真实场景');
    assertEqual(r.success, true);
    const stats = em.getStats();
    assertEqual(stats.byStatus.open, 1);
  });

  test('error-memory: logFix 标记 fixed', () => {
    const r = em.logFix(1, '改为条件式表述');
    assertEqual(r.success, true);
    assertEqual(r.status, 'fixed');
    const stats = em.getStats();
    assertEqual(stats.byStatus.fixed, 1);
  });

  test('error-memory: open 状态不能直接 verify', () => {
    const r2 = em.logCorrection('vagueness', '说"据了解"太模糊', '真实场景');
    assertEqual(r2.success, true);
    const v = em.logVerify(2, '验证通过');
    assertEqual(v.success, false);
    assertDefined(v.reason, '应有拒绝原因');
  });

  test('error-memory: logVerify 标记 verified', () => {
    const f = em.logFix(2, '改为明确来源');
    assertEqual(f.success, true);
    const v = em.logVerify(2, '检查通过，无模糊表述');
    assertEqual(v.success, true);
    assertEqual(v.status, 'verified');
    const stats = em.getStats();
    assertEqual(stats.byStatus.verified, 1);
    assertTrue(stats.closedRate > 0, 'closedRate 应 > 0');
  });

  test('error-memory: verified 错误不再触发强警告', () => {
    const r = em.checkRecurrence('根据研究显示数据表明');
    const strongWarnings = r.warnings.filter(w => !w.verifiedCount && !w.status);
    assertEqual(strongWarnings.length, 0);
  });

  test('error-memory: closedRate 统计正确', () => {
    const stats = em.getStats();
    assertEqual(stats.byStatus.open, 0);
    assertTrue(stats.closedRate >= 0 && stats.closedRate <= 100, 'closedRate 范围 0-100');
  });
};
