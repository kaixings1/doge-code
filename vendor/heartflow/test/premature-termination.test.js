/**
 * test/premature-termination.test.js — 过早终止检测器测试
 */
module.exports = function ({ test }) {
  const { checkPrematureTermination } = require('../src/premature-termination.js');

  // T1: 状态陈述（过渡语）
  test('T1: 中文状态陈述 "我看看" 判定为过早终止', () => {
    const r = checkPrematureTermination('我看看');
    if (!r.isPremature) throw new Error('应判定为过早终止');
    if (r.level !== 'verify' && r.level !== 'rewrite') throw new Error('级别应为 verify/rewrite');
  });

  test('T1: 英文 "Let me look into this" 判定为过早终止', () => {
    const r = checkPrematureTermination('Let me look into this');
    if (!r.isPremature) throw new Error('应判定为过早终止');
  });

  test('T1: "好的，我检查一下" 判定为过早终止', () => {
    const r = checkPrematureTermination('好的，我检查一下');
    if (!r.isPremature) throw new Error('应判定为过早终止');
  });

  test('T1: "I will check the logs" 判定为过早终止', () => {
    const r = checkPrematureTermination('I will check the logs');
    if (!r.isPremature) throw new Error('应判定为过早终止');
  });

  // T2: 极短输出
  test('T2: 英文短句 "OK." 判定为过早终止', () => {
    const r = checkPrematureTermination('OK.');
    if (!r.isPremature) throw new Error('OK. 应判定为过早终止');
  });

  test('T2: 中文短句 "可以" 判定为过早终止', () => {
    const r = checkPrematureTermination('可以');
    if (!r.isPremature) throw new Error('"可以" 应判定为过早终止');
  });

  // 正常输出不误报
  test('正常完整回答不判定为过早终止', () => {
    const r = checkPrematureTermination('根因是连接池配置错误，第42行的 maxConnections 设成了 3。修复方案：改为 20 并加连接复用，我已更新配置并验证通过。');
    if (r.isPremature) throw new Error('完整回答不应判定为过早终止: ' + r.details);
  });

  test('英文完整回答不判定为过早终止', () => {
    const r = checkPrematureTermination('The root cause is a connection pool misconfiguration — maxConnections was set to 3 on line 42. I changed it to 20 with connection reuse and verified the fix passes all tests.');
    if (r.isPremature) throw new Error('完整回答不应判定为过早终止: ' + r.details);
  });

  // 空完成声明
  test('T4: "已完成，你可以检查一下" 判定为过早终止', () => {
    const r = checkPrematureTermination('已完成，你可以检查一下');
    if (!r.isPremature) throw new Error('空完成声明应判定为过早终止');
  });

  // 上下文强化
  test('expectedAction 上下文时状态陈述更严重', () => {
    const r1 = checkPrematureTermination('Let me look into this', { expectedAction: true });
    const r2 = checkPrematureTermination('Let me look into this', { expectedAction: false });
    if (r1.score <= r2.score) throw new Error('expectedAction 应提升分数');
  });

  // 多信号 → rewrite
  test('多信号判定为 rewrite', () => {
    // "好的" (T1) + 短 + 无结果 → 至少2信号。
    // T2（极短输出）现在只在明确的 agent 循环上下文里生效：脱离该上下文时
    // 任何短句都会被判 verify，这是误报主因（例如"他妈妈做的饭很好吃"）。
    // "好的，我看看" 本身就是 agent 循环里的过渡语，因此显式声明该上下文。
    const r = checkPrematureTermination('好的，我看看', { expectedAction: true });
    if (r.level !== 'rewrite') throw new Error('多信号应为 rewrite: ' + r.level + ' ' + r.details);
  });

  // 空输入不崩溃
  test('空输入不崩溃', () => {
    const r = checkPrematureTermination('');
    if (r.isPremature) throw new Error('空输入不应判定为过早终止');
  });
};
